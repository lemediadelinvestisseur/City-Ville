import { v } from 'convex/values';
import { Game } from '../src/core/game';
import { deserialize } from '../src/core/save';
import { mutation, query } from './_generated/server';
import { fail, requirePlayer } from './lib/util';

/** Taille maximale d'une sauvegarde (un document Convex est limité à 1 Mo). */
export const MAX_SAVE_CHARS = 800_000;

/** Gain d'XP au-delà duquel une sauvegarde est signalée comme suspecte. */
function suspiciousXpGain(gain: number, elapsedMs: number): boolean {
  return gain > 2000 + (elapsedMs / 3_600_000) * 3000;
}

/** Dernière sauvegarde en ligne du joueur (ou null s'il n'en a pas). */
export const pull = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    const save = await ctx.db
      .query('saves')
      .withIndex('by_player', (q) => q.eq('playerId', player._id))
      .unique();
    return save ? { revision: save.revision, savedAt: save.savedAt, data: save.data } : null;
  },
});

/**
 * Enregistre la ville. `baseRevision` est la révision sur laquelle l'appareil
 * a travaillé : si une autre a été enregistrée entre-temps (autre appareil),
 * rien n'est écrasé et le client choisit quelle version garder.
 */
export const push = mutation({
  args: { token: v.string(), baseRevision: v.number(), data: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { token, baseRevision, data, force }) => {
    const player = await requirePlayer(ctx, token);
    if (data.length > MAX_SAVE_CHARS) fail('tooLarge');
    const state = deserialize(data);
    if (!state) fail('invalidSave');
    const existing = await ctx.db
      .query('saves')
      .withIndex('by_player', (q) => q.eq('playerId', player._id))
      .unique();
    const current = existing?.revision ?? 0;
    if (current !== baseRevision && !force) {
      return { ok: false as const, conflict: { revision: current, savedAt: existing?.savedAt ?? 0 } };
    }
    const now = Date.now();
    const population = new Game(state, { now: () => now }).derived().population;
    const revision = current + 1;
    if (existing) await ctx.db.patch(existing._id, { revision, savedAt: now, data });
    else await ctx.db.insert('saves', { playerId: player._id, revision, savedAt: now, data });

    const elapsed = existing ? now - existing.savedAt : now - player.createdAt;
    const suspicious = suspiciousXpGain(state.xp - player.xp, elapsed)
      ? (player.suspicious ?? 0) + 1
      : player.suspicious;
    await ctx.db.patch(player._id, {
      level: state.level,
      xp: state.xp,
      population,
      cityName: state.cityName.slice(0, 40),
      lastSeenAt: now,
      suspicious,
    });
    return { ok: true as const, revision };
  },
});
