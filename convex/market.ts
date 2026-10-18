import { v } from 'convex/values';
import { MARKET, checkListing, sellerIncome } from '../src/data/market';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { fail, isBlockedEitherWay, requirePlayer } from './lib/util';

function mine(listing: Doc<'listings'>, now: number) {
  const expired = listing.status === 'open' && listing.expiresAt <= now;
  return {
    id: listing._id,
    qty: listing.qty,
    unitPrice: listing.unitPrice,
    createdAt: listing.createdAt,
    expiresAt: listing.expiresAt,
    status: expired ? ('expired' as const) : listing.status,
    income: listing.status === 'sold' ? sellerIncome(listing.qty, listing.unitPrice) : 0,
  };
}

/** Offres des autres joueurs (les moins chères d'abord) et mes lots. */
export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const now = Date.now();
    const open = await ctx.db
      .query('listings')
      .withIndex('by_status_price', (q) => q.eq('status', 'open'))
      .take(300);
    const offers = [];
    for (const listing of open) {
      if (listing.sellerId === me._id || listing.expiresAt <= now) continue;
      const seller = await ctx.db.get(listing.sellerId);
      if (!seller || seller.banned) continue;
      if (await isBlockedEitherWay(ctx, me._id, seller._id)) continue;
      offers.push({
        id: listing._id,
        qty: listing.qty,
        unitPrice: listing.unitPrice,
        seller: seller.pseudo,
        expiresAt: listing.expiresAt,
      });
      if (offers.length >= 50) break;
    }
    const own = await ctx.db
      .query('listings')
      .withIndex('by_seller', (q) => q.eq('sellerId', me._id).eq('settled', false))
      .collect();
    return { offers, mine: own.map((l) => mine(l, now)) };
  },
});

/** Mise en vente : le client a déjà mis les marchandises de côté. */
export const create = mutation({
  args: { token: v.string(), qty: v.number(), unitPrice: v.number() },
  handler: async (ctx, { token, qty, unitPrice }) => {
    const me = await requirePlayer(ctx, token);
    if (me.banned) fail('banned');
    if (me.level < MARKET.minLevel) fail('forbidden');
    if (checkListing(qty, unitPrice)) fail('invalidSave');
    const open = await ctx.db
      .query('listings')
      .withIndex('by_seller', (q) => q.eq('sellerId', me._id).eq('settled', false))
      .collect();
    if (open.filter((l) => l.status === 'open').length >= MARKET.maxListings) fail('limit');
    const now = Date.now();
    const id = await ctx.db.insert('listings', {
      sellerId: me._id,
      qty,
      unitPrice,
      createdAt: now,
      expiresAt: now + MARKET.durationMs,
      status: 'open',
      settled: false,
    });
    return { id };
  },
});

/** Achat d'un lot : un seul acheteur possible (transaction atomique). */
export const buy = mutation({
  args: { token: v.string(), listingId: v.id('listings') },
  handler: async (ctx, { token, listingId }) => {
    const me = await requirePlayer(ctx, token);
    if (me.banned) fail('banned');
    if (me.level < MARKET.minLevel) fail('forbidden');
    const listing = await ctx.db.get(listingId);
    const now = Date.now();
    if (!listing || listing.status !== 'open' || listing.expiresAt <= now) fail('notFound');
    if (listing.sellerId === me._id) fail('forbidden');
    if (await isBlockedEitherWay(ctx, me._id, listing.sellerId)) fail('blocked');
    await ctx.db.patch(listing._id, { status: 'sold', buyerId: me._id, soldAt: now });
    return { qty: listing.qty, total: listing.qty * listing.unitPrice };
  },
});

/** Retire un lot encore en vente : les marchandises reviennent au vendeur. */
export const cancel = mutation({
  args: { token: v.string(), listingId: v.id('listings') },
  handler: async (ctx, { token, listingId }) => {
    const me = await requirePlayer(ctx, token);
    const listing = await ctx.db.get(listingId);
    if (!listing || listing.sellerId !== me._id || listing.status !== 'open' || listing.settled) fail('notFound');
    await ctx.db.patch(listing._id, { status: 'cancelled', settled: true });
    return { goods: listing.qty };
  },
});

/** Encaisse les ventes et récupère les lots expirés. */
export const settle = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const now = Date.now();
    const pending = await ctx.db
      .query('listings')
      .withIndex('by_seller', (q) => q.eq('sellerId', me._id).eq('settled', false))
      .collect();
    let coins = 0;
    let goods = 0;
    let sold = 0;
    for (const listing of pending) {
      if (listing.status === 'sold') {
        coins += sellerIncome(listing.qty, listing.unitPrice);
        sold++;
        await ctx.db.patch(listing._id, { settled: true });
      } else if (listing.status === 'open' && listing.expiresAt <= now) {
        goods += listing.qty;
        await ctx.db.patch(listing._id, { status: 'expired', settled: true });
      }
    }
    return { coins, goods, sold };
  },
});
