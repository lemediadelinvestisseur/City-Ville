'use node';

import { v } from 'convex/values';
import webpush from 'web-push';
import { internal } from './_generated/api';
import { action, internalAction } from './_generated/server';
import { PRIVACY_CONTACT } from './privacy';

/** Envoi des notifications Web Push (bibliothèque Node : chiffrement et signature VAPID). */

/** Une notification non distribuée dans les 6 heures (téléphone éteint) n'a plus d'intérêt. */
const TTL_SEC = 6 * 3600;

export const send = internalAction({
  args: { jobId: v.id('pushJobs') },
  handler: async (ctx, { jobId }) => {
    const data = await ctx.runQuery(internal.push.jobData, { jobId });
    if (!data) return;
    webpush.setVapidDetails(`mailto:${PRIVACY_CONTACT}`, data.keys.publicKey, data.keys.privateKey);
    const payload = JSON.stringify({ title: data.title, body: data.body });
    const gone: string[] = [];
    for (const subscription of data.subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload, { TTL: TTL_SEC });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 / 410 : l'abonnement n'existe plus (appli désinstallée, autorisation retirée).
        if (status === 404 || status === 410) gone.push(subscription.endpoint);
        else console.warn('Envoi Web Push impossible', status);
      }
    }
    await ctx.runMutation(internal.push.jobDone, { jobId, gone });
  },
});

/** Clé publique VAPID à donner au navigateur ; la paire est créée au premier appel. */
export const publicKey = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const existing = await ctx.runQuery(internal.push.vapidKeys, {});
    if (existing) return existing.publicKey;
    const keys = webpush.generateVAPIDKeys();
    return await ctx.runMutation(internal.push.saveVapidKeys, keys);
  },
});
