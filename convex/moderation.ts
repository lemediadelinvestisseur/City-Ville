import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { fail, requirePlayer } from './lib/util';

export const REPORT_REASONS = ['pseudo', 'ville', 'autre'] as const;

/** Bloquer un joueur : il disparaît des voisins, suggestions et visites (dans les deux sens). */
export const block = mutation({
  args: { token: v.string(), playerId: v.id('players') },
  handler: async (ctx, { token, playerId }) => {
    const me = await requirePlayer(ctx, token);
    if (playerId === me._id) fail('forbidden');
    const existing = await ctx.db
      .query('blocks')
      .withIndex('by_pair', (q) => q.eq('playerId', me._id).eq('blockedId', playerId))
      .first();
    if (!existing) await ctx.db.insert('blocks', { playerId: me._id, blockedId: playerId });
    for (const [a, b] of [
      [me._id, playerId],
      [playerId, me._id],
    ] as const) {
      const link = await ctx.db
        .query('neighbors')
        .withIndex('by_pair', (q) => q.eq('playerId', a).eq('neighborId', b))
        .first();
      if (link) await ctx.db.delete(link._id);
    }
    return { ok: true };
  },
});

export const unblock = mutation({
  args: { token: v.string(), playerId: v.id('players') },
  handler: async (ctx, { token, playerId }) => {
    const me = await requirePlayer(ctx, token);
    const existing = await ctx.db
      .query('blocks')
      .withIndex('by_pair', (q) => q.eq('playerId', me._id).eq('blockedId', playerId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const blockedList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const blocks = await ctx.db
      .query('blocks')
      .withIndex('by_player', (q) => q.eq('playerId', me._id))
      .collect();
    const result = [];
    for (const block of blocks) {
      const other = await ctx.db.get(block.blockedId);
      if (other) result.push({ id: other._id, pseudo: other.pseudo });
    }
    return result;
  },
});

/** Signaler un pseudo ou une ville inappropriés (examiné dans l'interface admin). */
export const report = mutation({
  args: { token: v.string(), playerId: v.id('players'), reason: v.string() },
  handler: async (ctx, { token, playerId, reason }) => {
    const me = await requirePlayer(ctx, token);
    if (playerId === me._id) fail('forbidden');
    const target = await ctx.db.get(playerId);
    if (!target) fail('notFound');
    const recent = await ctx.db
      .query('reports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', me._id))
      .order('desc')
      .take(20);
    if (recent.some((r) => r.targetId === playerId && !r.resolved)) return { ok: true };
    if (recent.filter((r) => Date.now() - r.createdAt < 3_600_000).length >= 10) fail('limit');
    await ctx.db.insert('reports', {
      reporterId: me._id,
      targetId: playerId,
      reason: reason.slice(0, 200),
      createdAt: Date.now(),
      resolved: false,
    });
    return { ok: true };
  },
});
