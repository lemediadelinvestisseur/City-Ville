import { v } from 'convex/values';
import { pseudoKey } from '../src/core/pseudo';
import { internalMutation, mutation, query } from './_generated/server';
import { fail, requireAdmin } from './lib/util';

/**
 * Désigne LE compte administrateur (par son pseudo) et retire ce rôle à tout
 * autre compte : il n'y a jamais qu'un seul administrateur.
 *
 * Fonction interne : elle ne peut être appelée ni par le jeu ni par l'interface
 * admin, seulement par le propriétaire du déploiement Convex, en ligne de commande :
 *   npx convex run roles:setOwner '{"pseudo":"MonPseudo"}'          (développement)
 *   npx convex run --prod roles:setOwner '{"pseudo":"MonPseudo"}'   (production)
 */
export const setOwner = internalMutation({
  args: { pseudo: v.string() },
  handler: async (ctx, { pseudo }) => {
    const owner = await ctx.db
      .query('players')
      .withIndex('by_pseudoKey', (q) => q.eq('pseudoKey', pseudoKey(pseudo)))
      .first();
    if (!owner) fail('notFound');
    const admins = await ctx.db
      .query('players')
      .withIndex('by_role', (q) => q.eq('role', 'admin'))
      .collect();
    for (const other of admins) if (other._id !== owner._id) await ctx.db.patch(other._id, { role: undefined });
    await ctx.db.patch(owner._id, { role: 'admin', banned: false });
    return { admin: owner.pseudo, demoted: admins.filter((a) => a._id !== owner._id).map((a) => a.pseudo) };
  },
});

/** Retire le rôle d'administrateur (en ligne de commande uniquement, comme setOwner). */
export const clearOwner = internalMutation({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query('players')
      .withIndex('by_role', (q) => q.eq('role', 'admin'))
      .collect();
    for (const admin of admins) await ctx.db.patch(admin._id, { role: undefined });
    return { demoted: admins.map((a) => a.pseudo) };
  },
});

/** Équipe actuelle (administrateur et modérateurs). */
export const team = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdmin(ctx, token);
    const staff = [
      ...(await ctx.db
        .query('players')
        .withIndex('by_role', (q) => q.eq('role', 'admin'))
        .collect()),
      ...(await ctx.db
        .query('players')
        .withIndex('by_role', (q) => q.eq('role', 'moderator'))
        .collect()),
    ];
    return staff.map((p) => ({ id: p._id, pseudo: p.pseudo, role: p.role ?? null, lastSeenAt: p.lastSeenAt }));
  },
});

/**
 * Nomme ou retire un modérateur (il pourra supprimer des messages du chat et
 * rendre muets des joueurs, sans accès à l'interface admin ni aux données).
 */
export const setModerator = mutation({
  args: { token: v.string(), pseudo: v.string(), moderator: v.boolean() },
  handler: async (ctx, { token, pseudo, moderator }) => {
    await requireAdmin(ctx, token);
    const target = await ctx.db
      .query('players')
      .withIndex('by_pseudoKey', (q) => q.eq('pseudoKey', pseudoKey(pseudo)))
      .first();
    if (!target) fail('notFound');
    if (target.role === 'admin') fail('forbidden');
    await ctx.db.patch(target._id, { role: moderator ? 'moderator' : undefined });
    return { pseudo: target.pseudo };
  },
});
