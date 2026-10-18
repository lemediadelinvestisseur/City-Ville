import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { dayOf, fail, isBlockedEitherWay, publicProfile, requirePlayer } from './lib/util';

export const MAX_NEIGHBORS = 100;

async function linkOf(ctx: QueryCtx, playerId: Id<'players'>, neighborId: Id<'players'>) {
  return ctx.db
    .query('neighbors')
    .withIndex('by_pair', (q) => q.eq('playerId', playerId).eq('neighborId', neighborId))
    .first();
}

async function helpedToday(ctx: QueryCtx, fromId: Id<'players'>, toId: Id<'players'>): Promise<boolean> {
  const help = await ctx.db
    .query('helps')
    .withIndex('by_from_to_day', (q) => q.eq('fromId', fromId).eq('toId', toId).eq('day', dayOf(Date.now())))
    .first();
  return help !== null;
}

/** Mes voisins, avec la possibilité de les aider aujourd'hui. */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const links = await ctx.db
      .query('neighbors')
      .withIndex('by_player', (q) => q.eq('playerId', me._id))
      .order('desc')
      .take(MAX_NEIGHBORS);
    const result = [];
    for (const link of links) {
      const other = await ctx.db.get(link.neighborId);
      if (!other || other.banned) continue;
      result.push({ ...publicProfile(other), helpedToday: await helpedToday(ctx, me._id, other._id) });
    }
    return result;
  },
});

/** Joueurs récemment actifs, pour se faire de nouveaux voisins. */
export const suggestions = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const recent = await ctx.db.query('players').withIndex('by_lastSeen').order('desc').take(60);
    const result = [];
    for (const other of recent) {
      if (other._id === me._id || other.banned) continue;
      if (await linkOf(ctx, me._id, other._id)) continue;
      if (await isBlockedEitherWay(ctx, me._id, other._id)) continue;
      result.push(publicProfile(other));
      if (result.length >= 12) break;
    }
    return result;
  },
});

/** Recherche par pseudo (début du pseudo, sans casse ni accents). */
export const search = query({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, { token, text }) => {
    const me = await requirePlayer(ctx, token);
    const key = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (key.length < 2) return [];
    const found = await ctx.db
      .query('players')
      .withIndex('by_pseudoKey', (q) => q.gte('pseudoKey', key).lt('pseudoKey', `${key}￿`))
      .take(10);
    return found.filter((p) => p._id !== me._id && !p.banned).map(publicProfile);
  },
});

/** Devenir voisins (lien réciproque). */
export const add = mutation({
  args: { token: v.string(), neighborId: v.id('players') },
  handler: async (ctx, { token, neighborId }) => {
    const me = await requirePlayer(ctx, token);
    const other = await ctx.db.get(neighborId);
    if (!other || other._id === me._id || other.banned) fail('notFound');
    if (await isBlockedEitherWay(ctx, me._id, other._id)) fail('blocked');
    if (await linkOf(ctx, me._id, other._id)) return { ok: true };
    const mine = await ctx.db
      .query('neighbors')
      .withIndex('by_player', (q) => q.eq('playerId', me._id))
      .take(MAX_NEIGHBORS);
    if (mine.length >= MAX_NEIGHBORS) fail('limit');
    const now = Date.now();
    await ctx.db.insert('neighbors', { playerId: me._id, neighborId: other._id, createdAt: now });
    if (!(await linkOf(ctx, other._id, me._id))) {
      await ctx.db.insert('neighbors', { playerId: other._id, neighborId: me._id, createdAt: now });
    }
    return { ok: true };
  },
});

export const remove = mutation({
  args: { token: v.string(), neighborId: v.id('players') },
  handler: async (ctx, { token, neighborId }) => {
    const me = await requirePlayer(ctx, token);
    for (const link of [await linkOf(ctx, me._id, neighborId), await linkOf(ctx, neighborId, me._id)]) {
      if (link) await ctx.db.delete(link._id);
    }
    return { ok: true };
  },
});

/** Visite (lecture seule) de la ville d'un autre joueur. */
export const visit = query({
  args: { token: v.string(), playerId: v.id('players') },
  handler: async (ctx, { token, playerId }) => {
    const me = await requirePlayer(ctx, token);
    const other = await ctx.db.get(playerId);
    if (!other || other.banned) fail('notFound');
    if (await isBlockedEitherWay(ctx, me._id, other._id)) fail('blocked');
    const save = await ctx.db
      .query('saves')
      .withIndex('by_player', (q) => q.eq('playerId', other._id))
      .unique();
    const isNeighbor = (await linkOf(ctx, me._id, other._id)) !== null;
    return {
      profile: publicProfile(other),
      data: save?.data ?? null,
      isNeighbor,
      helpedToday: isNeighbor ? await helpedToday(ctx, me._id, other._id) : false,
    };
  },
});

/** Coup de main quotidien à un voisin : récompense pour les deux. */
export const help = mutation({
  args: { token: v.string(), neighborId: v.id('players') },
  handler: async (ctx, { token, neighborId }) => {
    const me = await requirePlayer(ctx, token);
    if (!(await linkOf(ctx, me._id, neighborId))) fail('notFound');
    if (await helpedToday(ctx, me._id, neighborId)) fail('alreadyHelped');
    const now = Date.now();
    await ctx.db.insert('helps', { fromId: me._id, toId: neighborId, day: dayOf(now), createdAt: now, claimed: false });
    return { ok: true };
  },
});

/** Récupère les coups de main reçus depuis la dernière fois. */
export const claimHelps = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const pending = await ctx.db
      .query('helps')
      .withIndex('by_to_claimed', (q) => q.eq('toId', me._id).eq('claimed', false))
      .take(200);
    const helpers = new Set<string>();
    for (const help of pending) {
      await ctx.db.patch(help._id, { claimed: true });
      const from: Doc<'players'> | null = await ctx.db.get(help.fromId);
      if (from) helpers.add(from.pseudo);
    }
    return { count: pending.length, helpers: [...helpers].slice(0, 5) };
  },
});
