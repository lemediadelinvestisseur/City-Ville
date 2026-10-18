import { v } from 'convex/values';
import { CHAT, MUTE_MINUTES, cleanChatText, isChannel } from '../src/core/chat';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type QueryCtx } from './_generated/server';
import { fail, requirePlayer, requireStaff } from './lib/util';

/** Annonces de l'équipe affichées en fenêtre pendant… */
const ANNOUNCEMENT_TTL_MS = 14 * 86_400_000;

function checkChannel(channel: string): void {
  if (!isChannel(channel)) fail('forbidden');
}

/** Joueurs que je ne dois pas voir (bloqués par moi ou qui m'ont bloqué). */
async function hiddenFor(ctx: QueryCtx, me: Id<'players'>): Promise<Set<Id<'players'>>> {
  const hidden = new Set<Id<'players'>>();
  for (const b of await ctx.db
    .query('blocks')
    .withIndex('by_player', (q) => q.eq('playerId', me))
    .collect())
    hidden.add(b.blockedId);
  for (const b of await ctx.db
    .query('blocks')
    .withIndex('by_blocked', (q) => q.eq('blockedId', me))
    .collect())
    hidden.add(b.playerId);
  return hidden;
}

function canWrite(player: Doc<'players'>, now: number): boolean {
  return !player.banned && player.level >= CHAT.minLevel && (player.mutedUntil ?? 0) <= now;
}

/** Derniers messages d'un salon (temps réel), sans les joueurs bloqués ou bannis. */
export const list = query({
  args: { token: v.string(), channel: v.string() },
  handler: async (ctx, { token, channel }) => {
    const me = await requirePlayer(ctx, token);
    checkChannel(channel);
    const now = Date.now();
    const hidden = await hiddenFor(ctx, me._id);
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_channel', (q) => q.eq('channel', channel))
      .order('desc')
      .take(CHAT.pageSize * 2);
    const authors = new Map<Id<'players'>, Doc<'players'> | null>();
    const messages = [];
    for (const m of recent) {
      if (m.deleted || hidden.has(m.playerId)) continue;
      if (!authors.has(m.playerId)) authors.set(m.playerId, await ctx.db.get(m.playerId));
      const author = authors.get(m.playerId);
      if (!author || (author.banned && m.kind !== 'announcement')) continue;
      messages.push({
        id: m._id,
        playerId: m.playerId,
        pseudo: m.pseudo,
        role: m.role ?? null,
        level: m.level,
        text: m.text,
        createdAt: m.createdAt,
        kind: m.kind,
        mine: m.playerId === me._id,
      });
      if (messages.length >= CHAT.pageSize) break;
    }
    return {
      messages: messages.reverse(),
      mutedUntil: (me.mutedUntil ?? 0) > now ? (me.mutedUntil ?? null) : null,
      canWrite: canWrite(me, now),
      canModerate: !me.banned && (me.role === 'admin' || me.role === 'moderator'),
    };
  },
});

/**
 * Signal léger (abonnement permanent) : date du dernier message de chaque salon
 * et de la dernière annonce, pour afficher une pastille sans charger le chat.
 */
export const pulse = query({
  args: { token: v.string(), channels: v.array(v.string()) },
  handler: async (ctx, { token, channels }) => {
    await requirePlayer(ctx, token);
    const latest: Array<{ channel: string; at: number }> = [];
    for (const channel of channels.slice(0, 4)) {
      checkChannel(channel);
      const last = await ctx.db
        .query('chatMessages')
        .withIndex('by_channel', (q) => q.eq('channel', channel))
        .order('desc')
        .first();
      latest.push({ channel, at: last?.createdAt ?? 0 });
    }
    const announcement = await ctx.db
      .query('chatMessages')
      .withIndex('by_kind', (q) => q.eq('kind', 'announcement'))
      .order('desc')
      .take(20);
    const visible = announcement.find((a) => !a.deleted && channels.includes(a.channel));
    return { latest, announcementAt: visible?.createdAt ?? 0 };
  },
});

/** Annonces récentes de l'équipe destinées à ces salons (monde ou langue du joueur). */
export const announcements = query({
  args: { token: v.string(), channels: v.array(v.string()) },
  handler: async (ctx, { token, channels }) => {
    await requirePlayer(ctx, token);
    const since = Date.now() - ANNOUNCEMENT_TTL_MS;
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_kind', (q) => q.eq('kind', 'announcement').gte('createdAt', since))
      .order('desc')
      .take(20);
    return recent
      .filter((a) => !a.deleted && channels.includes(a.channel))
      .slice(0, 5)
      .map((a) => ({ id: a._id, text: a.text, createdAt: a.createdAt, pseudo: a.pseudo }));
  },
});

export const send = mutation({
  args: { token: v.string(), channel: v.string(), text: v.string() },
  handler: async (ctx, { token, channel, text }) => {
    const me = await requirePlayer(ctx, token);
    checkChannel(channel);
    const now = Date.now();
    if (me.banned) fail('banned');
    if ((me.mutedUntil ?? 0) > now) fail('muted');
    if (me.level < CHAT.minLevel) fail('forbidden');
    const clean = cleanChatText(text);
    if (!clean || /^[*\s]+$/.test(clean)) fail('invalidText');
    const mine = await ctx.db
      .query('chatMessages')
      .withIndex('by_player', (q) => q.eq('playerId', me._id))
      .order('desc')
      .take(CHAT.maxPerMinute);
    const last = mine[0];
    if (last && now - last.createdAt < CHAT.minIntervalMs) fail('limit');
    if (last && last.text === clean && now - last.createdAt < 60_000) fail('limit');
    if (mine.length >= CHAT.maxPerMinute && now - (mine.at(-1)?.createdAt ?? 0) < 60_000) fail('limit');
    const id = await ctx.db.insert('chatMessages', {
      channel,
      playerId: me._id,
      pseudo: me.pseudo,
      role: me.role,
      level: me.level,
      text: clean,
      createdAt: now,
      kind: 'message',
    });
    return { id };
  },
});

/** Retire un message : son auteur, ou l'équipe de modération (les annonces : l'administrateur seul). */
export const remove = mutation({
  args: { token: v.string(), messageId: v.id('chatMessages') },
  handler: async (ctx, { token, messageId }) => {
    const me = await requirePlayer(ctx, token);
    const message = await ctx.db.get(messageId);
    if (!message) fail('notFound');
    const staff = !me.banned && (me.role === 'admin' || me.role === 'moderator');
    const allowed =
      message.kind === 'announcement' ? me.role === 'admin' && !me.banned : message.playerId === me._id || staff;
    if (!allowed) fail('forbidden');
    await ctx.db.patch(message._id, { deleted: true });
    return { ok: true };
  },
});

/** Rend un joueur muet dans le chat (modérateurs et administrateur). */
export const mute = mutation({
  args: { token: v.string(), playerId: v.id('players'), minutes: v.number() },
  handler: async (ctx, { token, playerId, minutes }) => {
    const me = await requireStaff(ctx, token);
    if (!MUTE_MINUTES.some((m) => m === minutes) && minutes !== 0) fail('forbidden');
    const target = await ctx.db.get(playerId);
    if (!target) fail('notFound');
    if (target._id === me._id || target.role) fail('forbidden');
    await ctx.db.patch(target._id, { mutedUntil: minutes ? Date.now() + minutes * 60_000 : undefined });
    return { pseudo: target.pseudo };
  },
});

/** Signale un message (examiné dans l'interface admin). */
export const report = mutation({
  args: { token: v.string(), messageId: v.id('chatMessages') },
  handler: async (ctx, { token, messageId }) => {
    const me = await requirePlayer(ctx, token);
    const message = await ctx.db.get(messageId);
    if (!message || message.kind !== 'message') fail('notFound');
    if (message.playerId === me._id) fail('forbidden');
    const recent = await ctx.db
      .query('reports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', me._id))
      .order('desc')
      .take(20);
    if (recent.some((r) => r.messageId === messageId)) return { ok: true };
    if (recent.filter((r) => Date.now() - r.createdAt < 3_600_000).length >= 10) fail('limit');
    await ctx.db.insert('reports', {
      reporterId: me._id,
      targetId: message.playerId,
      reason: `chat : « ${message.text.slice(0, 150)} »`,
      createdAt: Date.now(),
      resolved: false,
      messageId,
    });
    return { ok: true };
  },
});

/** Efface les messages trop anciens (tâche planifiée quotidienne, voir crons.ts). */
export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query('chatMessages')
      .withIndex('by_createdAt', (q) => q.lt('createdAt', Date.now() - CHAT.retentionMs))
      .take(1000);
    for (const message of old) {
      const reports = await ctx.db
        .query('reports')
        .withIndex('by_target', (q) => q.eq('targetId', message.playerId))
        .collect();
      for (const r of reports) if (r.messageId === message._id) await ctx.db.patch(r._id, { messageId: undefined });
      await ctx.db.delete(message._id);
    }
    return { deleted: old.length };
  },
});
