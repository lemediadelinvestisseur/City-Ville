import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/** Codes d'erreur renvoyés au client (traduits dans l'interface). */
export type ApiError =
  | 'unauthorized'
  | 'pseudoTaken'
  | 'pseudoInvalid'
  | 'notFound'
  | 'conflict'
  | 'tooLarge'
  | 'invalidSave'
  | 'alreadyHelped'
  | 'blocked'
  | 'limit'
  | 'banned'
  | 'invalidCode'
  | 'forbidden';

export function fail(code: ApiError): never {
  throw new ConvexError(code);
}

/** Jour UTC (AAAA-MM-JJ). */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Joueur authentifié par la clé secrète de son appareil. */
export async function requirePlayer(ctx: QueryCtx | MutationCtx, token: string): Promise<Doc<'players'>> {
  if (token.length < 32) fail('unauthorized');
  const tokenHash = await sha256(token);
  const device = await ctx.db
    .query('devices')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .unique();
  if (!device) fail('unauthorized');
  const player = await ctx.db.get(device.playerId);
  if (!player) fail('unauthorized');
  return player;
}

export async function isBlockedEitherWay(
  ctx: QueryCtx | MutationCtx,
  a: Id<'players'>,
  b: Id<'players'>,
): Promise<boolean> {
  const ab = await ctx.db
    .query('blocks')
    .withIndex('by_pair', (q) => q.eq('playerId', a).eq('blockedId', b))
    .first();
  if (ab) return true;
  const ba = await ctx.db
    .query('blocks')
    .withIndex('by_pair', (q) => q.eq('playerId', b).eq('blockedId', a))
    .first();
  return ba !== null;
}

/** Fiche publique d'un joueur (ce que les autres voient). */
export function publicProfile(player: Doc<'players'>) {
  return {
    id: player._id,
    pseudo: player.pseudo,
    cityName: player.cityName,
    level: player.level,
    population: player.population,
    lastSeenAt: player.lastSeenAt,
  };
}
