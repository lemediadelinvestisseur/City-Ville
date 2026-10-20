import { v } from 'convex/values';
import { findItemDef } from '../src/data/items';
import { SOCIAL, communityGoal, weekOf } from '../src/data/social';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { fail, isBlockedEitherWay, publicProfile, requirePlayer } from './lib/util';
import { linkOf } from './neighbors';

/**
 * Échanges entre voisins et vie du quartier : demandes de produits, « J'aime »
 * pour le concours de la plus belle ville, défi de quartier de la semaine.
 * Les produits eux-mêmes restent dans les villes (calculées sur les appareils) :
 * le serveur ne fait que compter ce qui a été donné et reçu.
 */

async function openRequest(ctx: QueryCtx, playerId: Id<'players'>): Promise<Doc<'requests'> | null> {
  const latest = await ctx.db
    .query('requests')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .order('desc')
    .first();
  if (!latest) return null;
  // Une demande reste visible tant qu'elle n'est ni expirée, ni remplie et récupérée.
  if (latest.expiresAt <= Date.now() && latest.claimed >= latest.received) return null;
  if (latest.received >= latest.qty && latest.claimed >= latest.received) return null;
  return latest;
}

function requestView(request: Doc<'requests'>) {
  return {
    id: request._id,
    item: request.item,
    qty: request.qty,
    received: request.received,
    toClaim: request.received - request.claimed,
    expiresAt: request.expiresAt,
  };
}

/** Ma demande en cours (et ce que les voisins m'ont déjà envoyé). */
export const myRequest = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const request = await openRequest(ctx, me._id);
    return request ? requestView(request) : null;
  },
});

/** Demande un produit à ses voisins (une demande à la fois, 48 h). */
export const createRequest = mutation({
  args: { token: v.string(), item: v.string(), qty: v.number() },
  handler: async (ctx, { token, item, qty }) => {
    const me = await requirePlayer(ctx, token);
    if (me.banned) fail('banned');
    if (!findItemDef(item) || !Number.isInteger(qty)) fail('invalidText');
    if (qty < SOCIAL.requestMinQty || qty > SOCIAL.requestMaxQty) fail('invalidText');
    const current = await openRequest(ctx, me._id);
    if (current && current.expiresAt > Date.now() && current.received < current.qty) fail('limit');
    const now = Date.now();
    await ctx.db.insert('requests', {
      playerId: me._id,
      item,
      qty,
      received: 0,
      claimed: 0,
      createdAt: now,
      expiresAt: now + SOCIAL.requestDurationMs,
    });
    return { ok: true };
  },
});

/** Récupère ce que les voisins ont envoyé depuis la dernière fois. */
export const claimRequest = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const request = await openRequest(ctx, me._id);
    if (!request) return { item: null, qty: 0 };
    const qty = request.received - request.claimed;
    if (qty > 0) await ctx.db.patch(request._id, { claimed: request.received });
    return { item: request.item, qty };
  },
});

/** Demandes ouvertes de mes voisins. */
export const neighborRequests = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const links = await ctx.db
      .query('neighbors')
      .withIndex('by_player', (q) => q.eq('playerId', me._id))
      .take(100);
    const rows = [];
    const now = Date.now();
    for (const link of links) {
      const other = await ctx.db.get(link.neighborId);
      if (!other || other.banned) continue;
      const request = await openRequest(ctx, other._id);
      if (!request || request.expiresAt <= now || request.received >= request.qty) continue;
      rows.push({ ...requestView(request), profile: publicProfile(other) });
    }
    return rows;
  },
});

/** Envoie des produits à un voisin pour sa demande (le client les a déjà retirés de sa ville). */
export const giveToRequest = mutation({
  args: { token: v.string(), requestId: v.id('requests'), qty: v.number() },
  handler: async (ctx, { token, requestId, qty }) => {
    const me = await requirePlayer(ctx, token);
    if (me.banned) fail('banned');
    const request = await ctx.db.get(requestId);
    if (!request || request.expiresAt <= Date.now()) fail('notFound');
    if (request.playerId === me._id) fail('forbidden');
    const linked = (await linkOf(ctx, me._id, request.playerId)) ?? (await linkOf(ctx, request.playerId, me._id));
    if (!linked) fail('notFound');
    if (await isBlockedEitherWay(ctx, me._id, request.playerId)) fail('blocked');
    const left = request.qty - request.received;
    if (!Number.isInteger(qty) || qty <= 0 || qty > left) fail('limit');
    await ctx.db.patch(request._id, { received: request.received + qty });
    return { item: request.item, qty };
  },
});

// ———————————————————————————— Concours de la plus belle ville ————————————————————————————

async function likeCount(ctx: QueryCtx, playerId: Id<'players'>, week: string): Promise<Doc<'likeCounts'> | null> {
  return ctx.db
    .query('likeCounts')
    .withIndex('by_player_week', (q) => q.eq('playerId', playerId).eq('week', week))
    .unique();
}

/** « J'aime » pour une ville visitée : un par ville et par semaine. */
export const like = mutation({
  args: { token: v.string(), playerId: v.id('players') },
  handler: async (ctx, { token, playerId }) => {
    const me = await requirePlayer(ctx, token);
    if (me.banned) fail('banned');
    if (playerId === me._id) fail('forbidden');
    const other = await ctx.db.get(playerId);
    if (!other || other.banned) fail('notFound');
    const week = weekOf(Date.now());
    const existing = await ctx.db
      .query('likes')
      .withIndex('by_from_to_week', (q) => q.eq('fromId', me._id).eq('toId', playerId).eq('week', week))
      .first();
    if (existing) fail('alreadyHelped');
    await ctx.db.insert('likes', { fromId: me._id, toId: playerId, week });
    const count = await likeCount(ctx, playerId, week);
    if (count) await ctx.db.patch(count._id, { count: count.count + 1 });
    else await ctx.db.insert('likeCounts', { playerId, week, count: 1 });
    return { likes: (count?.count ?? 0) + 1 };
  },
});

/** « J'aime » d'une ville cette semaine, et si je lui en ai déjà donné un. */
export const likeStatus = query({
  args: { token: v.string(), playerId: v.id('players') },
  handler: async (ctx, { token, playerId }) => {
    const me = await requirePlayer(ctx, token);
    const week = weekOf(Date.now());
    const mine = await ctx.db
      .query('likes')
      .withIndex('by_from_to_week', (q) => q.eq('fromId', me._id).eq('toId', playerId).eq('week', week))
      .first();
    return { likes: (await likeCount(ctx, playerId, week))?.count ?? 0, liked: mine !== null };
  },
});

/** Classement des plus belles villes de la semaine. */
export const prettiest = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const week = weekOf(Date.now());
    const counts = await ctx.db
      .query('likeCounts')
      .withIndex('by_week_count', (q) => q.eq('week', week))
      .order('desc')
      .take(60);
    const rows = [];
    for (const count of counts) {
      const player = await ctx.db.get(count.playerId);
      if (!player || player.banned) continue;
      rows.push({ ...publicProfile(player), likes: count.count });
      if (rows.length >= 50) break;
    }
    const myIndex = rows.findIndex((r) => r.id === me._id);
    return {
      rows,
      myRank: myIndex >= 0 ? myIndex + 1 : null,
      myLikes: (await likeCount(ctx, me._id, week))?.count ?? 0,
    };
  },
});

// ———————————————————————————— Défi de quartier ————————————————————————————

async function weekDoc(ctx: QueryCtx, week: string): Promise<Doc<'communityWeeks'> | null> {
  return ctx.db
    .query('communityWeeks')
    .withIndex('by_week', (q) => q.eq('week', week))
    .unique();
}

async function contribution(
  ctx: QueryCtx,
  week: string,
  playerId: Id<'players'>,
): Promise<Doc<'communityContributions'> | null> {
  return ctx.db
    .query('communityContributions')
    .withIndex('by_week_player', (q) => q.eq('week', week).eq('playerId', playerId))
    .unique();
}

/** Avancement du défi de la semaine. */
export const community = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const week = weekOf(Date.now());
    const doc = await weekDoc(ctx, week);
    const mine = await contribution(ctx, week, me._id);
    const total = doc?.total ?? 0;
    const goal = communityGoal(doc?.contributors ?? 0);
    return {
      week,
      total,
      goal,
      mine: mine?.amount ?? 0,
      claimable: total >= goal && (mine?.amount ?? 0) > 0 && !mine?.claimed,
      claimed: mine?.claimed ?? false,
    };
  },
});

/** Ajoute des récoltes au défi (plafonné par joueur). */
export const contribute = mutation({
  args: { token: v.string(), amount: v.number() },
  handler: async (ctx, { token, amount }) => {
    const me = await requirePlayer(ctx, token);
    if (me.banned || !Number.isInteger(amount) || amount <= 0) return { ok: false };
    const week = weekOf(Date.now());
    const mine = await contribution(ctx, week, me._id);
    const before = mine?.amount ?? 0;
    const added = Math.min(amount, 200, SOCIAL.communityMaxPerPlayer - before);
    if (added <= 0) return { ok: true };
    if (mine) await ctx.db.patch(mine._id, { amount: before + added });
    else await ctx.db.insert('communityContributions', { week, playerId: me._id, amount: added, claimed: false });
    const doc = await weekDoc(ctx, week);
    if (doc) await ctx.db.patch(doc._id, { total: doc.total + added, contributors: doc.contributors + (mine ? 0 : 1) });
    else await ctx.db.insert('communityWeeks', { week, total: added, contributors: 1 });
    return { ok: true };
  },
});

/** Récompense du défi réussi (une fois par semaine, pour ceux qui y ont participé). */
export const claimCommunity = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const week = weekOf(Date.now());
    const doc = await weekDoc(ctx, week);
    const mine = await contribution(ctx, week, me._id);
    if (!doc || !mine || mine.claimed || doc.total < communityGoal(doc.contributors)) fail('notFound');
    await ctx.db.patch(mine._id, { claimed: true });
    return { ok: true };
  },
});
