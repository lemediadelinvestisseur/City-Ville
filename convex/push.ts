import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, type MutationCtx } from './_generated/server';
import { fail, requirePlayer } from './lib/util';

/**
 * Notifications Web Push : l'appareil envoie la liste de ses prochains rappels
 * (calculée par le jeu), le serveur les envoie à l'heure dite, même quand le
 * jeu est fermé. Chaque envoi remplace la liste précédente.
 */

/** Comme sur iOS : seuls les rappels les plus proches sont gardés. */
export const MAX_PUSH_JOBS = 24;
const MAX_DELAY_MS = 30 * 86_400_000;

/**
 * Services d'envoi des navigateurs : le serveur ne contacte jamais une autre
 * adresse (une adresse arbitraire en ferait un relais vers n'importe quel site).
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export async function cancelPushJobs(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const jobs = await ctx.db
    .query('pushJobs')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .collect();
  for (const job of jobs) {
    if (job.scheduledId) await ctx.scheduler.cancel(job.scheduledId);
    await ctx.db.delete(job._id);
  }
}

const subscriptionArg = v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() });

/** Enregistre l'abonnement de l'appareil et remplace les rappels programmés du joueur. */
export const schedule = mutation({
  args: {
    token: v.string(),
    subscription: subscriptionArg,
    items: v.array(v.object({ at: v.number(), title: v.string(), body: v.string() })),
  },
  handler: async (ctx, { token, subscription, items }) => {
    const player = await requirePlayer(ctx, token);
    const { endpoint, p256dh, auth } = subscription;
    if (!isPushEndpoint(endpoint) || p256dh.length > 200 || auth.length > 100) fail('invalidText');
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    // Un appareil passé à un autre compte (code de transfert) change de propriétaire.
    if (existing) await ctx.db.patch(existing._id, { playerId: player._id, p256dh, auth });
    else
      await ctx.db.insert('pushSubscriptions', { playerId: player._id, endpoint, p256dh, auth, createdAt: Date.now() });

    await cancelPushJobs(ctx, player._id);
    const now = Date.now();
    const kept = items
      .filter((item) => item.at > now && item.at < now + MAX_DELAY_MS)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_PUSH_JOBS);
    for (const item of kept) {
      const title = item.title.slice(0, 80);
      const body = item.body.slice(0, 300);
      const jobId = await ctx.db.insert('pushJobs', { playerId: player._id, at: item.at, title, body });
      const scheduledId = await ctx.scheduler.runAt(item.at, internal.pushNode.send, { jobId });
      await ctx.db.patch(jobId, { scheduledId });
    }
    return { scheduled: kept.length };
  },
});

/** Notifications désactivées sur cet appareil : on oublie son abonnement. */
export const unsubscribe = mutation({
  args: { token: v.string(), endpoint: v.string() },
  handler: async (ctx, { token, endpoint }) => {
    const player = await requirePlayer(ctx, token);
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    if (existing && existing.playerId === player._id) await ctx.db.delete(existing._id);
    const left = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_player', (q) => q.eq('playerId', player._id))
      .first();
    if (!left) await cancelPushJobs(ctx, player._id);
    return { ok: true };
  },
});

/** Ce qu'il faut pour envoyer un rappel : son texte, les appareils du joueur et les clés. */
export const jobData = internalQuery({
  args: { jobId: v.id('pushJobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const subscriptions = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_player', (q) => q.eq('playerId', job.playerId))
      .collect();
    const keys = await ctx.db.query('pushKeys').first();
    if (!keys) return null;
    return {
      title: job.title,
      body: job.body,
      keys: { publicKey: keys.publicKey, privateKey: keys.privateKey },
      subscriptions: subscriptions.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
    };
  },
});

/** Rappel envoyé : on l'efface, ainsi que les abonnements expirés (désinstallation, refus). */
export const jobDone = internalMutation({
  args: { jobId: v.id('pushJobs'), gone: v.array(v.string()) },
  handler: async (ctx, { jobId, gone }) => {
    if (await ctx.db.get(jobId)) await ctx.db.delete(jobId);
    for (const endpoint of gone) {
      const sub = await ctx.db
        .query('pushSubscriptions')
        .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
        .unique();
      if (sub) await ctx.db.delete(sub._id);
    }
  },
});

export const vapidKeys = internalQuery({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query('pushKeys').first();
    return keys ? { publicKey: keys.publicKey } : null;
  },
});

/** Garde la première paire de clés créée (deux créations simultanées : la seconde est ignorée). */
export const saveVapidKeys = internalMutation({
  args: { publicKey: v.string(), privateKey: v.string() },
  handler: async (ctx, keys) => {
    const existing = await ctx.db.query('pushKeys').first();
    if (existing) return existing.publicKey;
    await ctx.db.insert('pushKeys', keys);
    return keys.publicKey;
  },
});
