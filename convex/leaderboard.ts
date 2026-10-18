import { v } from 'convex/values';
import { query } from './_generated/server';
import { publicProfile, requirePlayer } from './lib/util';

/** Classement par niveau (XP) ou par population. */
export const top = query({
  args: { token: v.string(), by: v.union(v.literal('level'), v.literal('population')) },
  handler: async (ctx, { token, by }) => {
    const me = await requirePlayer(ctx, token);
    const rows = await ctx.db
      .query('players')
      .withIndex(by === 'level' ? 'by_xp' : 'by_population')
      .order('desc')
      .take(120);
    const ranked = rows.filter((p) => !p.banned).slice(0, 100);
    const myIndex = ranked.findIndex((p) => p._id === me._id);
    let myRank: number | null = myIndex >= 0 ? myIndex + 1 : null;
    if (myRank === null) {
      // Au-delà du top 100 : rang approximatif (joueurs devant moi).
      const value = by === 'level' ? me.xp : me.population;
      const ahead = await ctx.db
        .query('players')
        .withIndex(by === 'level' ? 'by_xp' : 'by_population', (q) =>
          by === 'level' ? q.gt('xp', value) : q.gt('population', value),
        )
        .take(10_000);
      myRank = ahead.length + 1;
    }
    return { rows: ranked.map(publicProfile), myRank, me: publicProfile(me) };
  },
});
