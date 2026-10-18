import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { dayOf, requirePlayer } from './lib/util';

/** Une session se termine après 5 minutes sans signal de l'appli. */
export const SESSION_GAP_MS = 5 * 60 * 1000;

/**
 * Signal envoyé régulièrement (toutes les minutes) par l'appli au premier plan :
 * mesure les sessions et le temps de jeu.
 */
export const ping = mutation({
  args: { token: v.string(), clientSessionId: v.string(), platform: v.string() },
  handler: async (ctx, { token, clientSessionId, platform }) => {
    const player = await requirePlayer(ctx, token);
    const now = Date.now();
    await ctx.db.patch(player._id, { lastSeenAt: now });
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_client', (q) => q.eq('clientSessionId', clientSessionId))
      .first();
    if (session && session.playerId === player._id && now - session.lastSeenAt < SESSION_GAP_MS) {
      await ctx.db.patch(session._id, { lastSeenAt: now });
      return;
    }
    await ctx.db.insert('sessions', {
      playerId: player._id,
      clientSessionId: clientSessionId.slice(0, 64),
      startedAt: now,
      lastSeenAt: now,
      day: dayOf(now),
      platform: platform.slice(0, 20),
    });
  },
});

/** Évènements de progression (objectifs terminés, niveaux atteints…), par lots. */
export const track = mutation({
  args: { token: v.string(), events: v.array(v.object({ type: v.string(), name: v.string() })) },
  handler: async (ctx, { token, events }) => {
    const player = await requirePlayer(ctx, token);
    const now = Date.now();
    for (const event of events.slice(0, 20)) {
      await ctx.db.insert('events', {
        playerId: player._id,
        type: event.type.slice(0, 32),
        name: event.name.slice(0, 64),
        at: now,
      });
    }
  },
});
