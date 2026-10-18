/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */
import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server';
import type * as admin from '../admin.js';
import type * as leaderboard from '../leaderboard.js';
import type * as lib_util from '../lib/util.js';
import type * as market from '../market.js';
import type * as moderation from '../moderation.js';
import type * as neighbors from '../neighbors.js';
import type * as players from '../players.js';
import type * as saves from '../saves.js';
import type * as stats from '../stats.js';

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  leaderboard: typeof leaderboard;
  'lib/util': typeof lib_util;
  market: typeof market;
  moderation: typeof moderation;
  neighbors: typeof neighbors;
  players: typeof players;
  saves: typeof saves;
  stats: typeof stats;
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, 'public'>>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, 'internal'>>;
