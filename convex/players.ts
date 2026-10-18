import { v } from 'convex/values';
import { normalizePseudo, pseudoKey, validatePseudo } from '../src/core/pseudo';
import { isLanguage } from '../src/data/languages';
import type { Id, TableNames } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { dayOf, fail, publicProfile, requirePlayer, sha256 } from './lib/util';

const TRANSFER_TTL_MS = 24 * 3600 * 1000;
const TRANSFER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function checkPseudoFree(ctx: MutationCtx, pseudo: string, self?: Id<'players'>): Promise<string> {
  const clean = normalizePseudo(pseudo);
  if (validatePseudo(clean)) fail('pseudoInvalid');
  const existing = await ctx.db
    .query('players')
    .withIndex('by_pseudoKey', (q) => q.eq('pseudoKey', pseudoKey(clean)))
    .first();
  if (existing && existing._id !== self) fail('pseudoTaken');
  return clean;
}

/** Le pseudo est-il libre ? (vérification en direct pendant la saisie) */
export const pseudoAvailable = query({
  args: { pseudo: v.string() },
  handler: async (ctx, { pseudo }) => {
    const error = validatePseudo(pseudo);
    if (error) return { available: false, error };
    const existing = await ctx.db
      .query('players')
      .withIndex('by_pseudoKey', (q) => q.eq('pseudoKey', pseudoKey(pseudo)))
      .first();
    return { available: existing === null, error: existing ? ('taken' as const) : null };
  },
});

/** Crée le compte : le client fournit une clé secrète aléatoire qu'il garde sur l'appareil. */
export const register = mutation({
  args: {
    token: v.string(),
    pseudo: v.string(),
    cityName: v.string(),
    platform: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, { token, pseudo, cityName, platform, language }) => {
    if (token.length < 32 || token.length > 128) fail('unauthorized');
    const tokenHash = await sha256(token);
    const known = await ctx.db
      .query('devices')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (known) fail('forbidden');
    const clean = await checkPseudoFree(ctx, pseudo);
    const now = Date.now();
    const playerId = await ctx.db.insert('players', {
      pseudo: clean,
      pseudoKey: pseudoKey(clean),
      cityName: cityName.slice(0, 40) || 'Ma ville',
      level: 1,
      xp: 0,
      population: 0,
      createdAt: now,
      createdDay: dayOf(now),
      lastSeenAt: now,
      language: isLanguage(language) ? language : undefined,
    });
    await ctx.db.insert('devices', { playerId, tokenHash, createdAt: now, platform: platform.slice(0, 20) });
    return { playerId };
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    return {
      ...publicProfile(player),
      banned: player.banned === true,
      role: player.role ?? null,
      language: player.language ?? null,
      mutedUntil: player.mutedUntil ?? null,
    };
  },
});

/** Langue choisie dans les réglages (statistiques, salon de chat, annonces ciblées). */
export const setLanguage = mutation({
  args: { token: v.string(), language: v.string() },
  handler: async (ctx, { token, language }) => {
    const player = await requirePlayer(ctx, token);
    if (!isLanguage(language)) fail('forbidden');
    await ctx.db.patch(player._id, { language });
  },
});

/** Déconnecte cet appareil : sa clé secrète est oubliée par le serveur. */
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (token.length < 32) return;
    const tokenHash = await sha256(token);
    const device = await ctx.db
      .query('devices')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (device) await ctx.db.delete(device._id);
  },
});

export const rename = mutation({
  args: { token: v.string(), pseudo: v.string() },
  handler: async (ctx, { token, pseudo }) => {
    const player = await requirePlayer(ctx, token);
    if (player.banned) fail('banned');
    const clean = await checkPseudoFree(ctx, pseudo, player._id);
    await ctx.db.patch(player._id, { pseudo: clean, pseudoKey: pseudoKey(clean) });
    return { pseudo: clean };
  },
});

/** Code à usage unique (valable 24 h) pour retrouver sa ville sur un autre appareil. */
export const createTransferCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    for (const old of await ctx.db
      .query('transferCodes')
      .withIndex('by_player', (q) => q.eq('playerId', player._id))
      .collect()) {
      await ctx.db.delete(old._id);
    }
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const raw = [...bytes].map((b) => TRANSFER_ALPHABET[b % TRANSFER_ALPHABET.length]).join('');
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const expiresAt = Date.now() + TRANSFER_TTL_MS;
    await ctx.db.insert('transferCodes', { playerId: player._id, codeHash: await sha256(raw), expiresAt });
    return { code, expiresAt };
  },
});

/** Associe un nouvel appareil (nouvelle clé) au compte du code de transfert. */
export const redeemTransferCode = mutation({
  args: { code: v.string(), token: v.string(), platform: v.string() },
  handler: async (ctx, { code, token, platform }) => {
    if (token.length < 32 || token.length > 128) fail('unauthorized');
    const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codeHash = await sha256(raw);
    const entry = await ctx.db
      .query('transferCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', codeHash))
      .first();
    if (!entry || entry.expiresAt < Date.now()) fail('invalidCode');
    await ctx.db.delete(entry._id);
    const tokenHash = await sha256(token);
    await ctx.db.insert('devices', {
      playerId: entry.playerId,
      tokenHash,
      createdAt: Date.now(),
      platform: platform.slice(0, 20),
    });
    return { playerId: entry.playerId };
  },
});

/** Suppression définitive du compte et de toutes ses données (exigence de l'App Store). */
export const deleteAccount = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    await deletePlayerData(ctx, player._id);
    return { ok: true };
  },
});

export async function deletePlayerData(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const docs: Array<{ _id: Id<TableNames> }> = [
    ...(await ctx.db
      .query('devices')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('transferCodes')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('saves')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('blocks')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('blocks')
      .withIndex('by_blocked', (q) => q.eq('blockedId', playerId))
      .collect()),
    ...(await ctx.db
      .query('events')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('sessions')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('helps')
      .withIndex('by_from', (q) => q.eq('fromId', playerId))
      .collect()),
    ...(await ctx.db
      .query('helps')
      .withIndex('by_to_claimed', (q) => q.eq('toId', playerId))
      .collect()),
    ...(await ctx.db
      .query('reports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', playerId))
      .collect()),
    ...(await ctx.db
      .query('reports')
      .withIndex('by_target', (q) => q.eq('targetId', playerId))
      .collect()),
    ...(await ctx.db
      .query('neighbors')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('neighbors')
      .withIndex('by_neighbor', (q) => q.eq('neighborId', playerId))
      .collect()),
    ...(await ctx.db
      .query('listings')
      .withIndex('by_seller', (q) => q.eq('sellerId', playerId))
      .collect()),
    ...(await ctx.db
      .query('chatMessages')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .collect()),
  ];
  for (const doc of docs) await ctx.db.delete(doc._id);
  await ctx.db.delete(playerId);
}
