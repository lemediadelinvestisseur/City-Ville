import { v } from 'convex/values';
import { CHAT, cleanChatText } from '../src/core/chat';
import { isLanguage } from '../src/data/languages';
import { QUESTS } from '../src/data/quests';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { dayOf, fail, requireAdmin } from './lib/util';

const DAY_MS = 86_400_000;

/*
 * Accès admin : réservé au compte qui a le rôle « admin » (un seul, désigné en
 * ligne de commande avec `roles:setOwner`, voir convex/roles.ts). Chaque
 * fonction reçoit la clé secrète de l'appareil de ce compte.
 */

/** Qui est connecté à l'interface admin (refusé si ce n'est pas l'administrateur). */
export const whoami = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdmin(ctx, token);
    return { pseudo: admin.pseudo, role: admin.role ?? null };
  },
});

function addDays(day: string, n: number): string {
  return dayOf(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
}

function daysBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) result.push(d);
  return result;
}

/**
 * Tableau de bord : audience, rétention, temps de jeu, progression.
 * Calculé à la volée (suffisant pour quelques milliers de joueurs ; au-delà,
 * on agrégera chaque nuit avec une tâche planifiée).
 */
export const dashboard = query({
  args: { token: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { token, days = 30 }) => {
    await requireAdmin(ctx, token);
    const now = Date.now();
    const today = dayOf(now);
    const range = Math.max(7, Math.min(90, days));
    const firstDay = addDays(today, -(range - 1));
    const since = Date.parse(`${firstDay}T00:00:00Z`);

    const players = await ctx.db.query('players').take(50_000);
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_started', (q) => q.gte('startedAt', since))
      .take(200_000);
    const events = await ctx.db
      .query('events')
      .withIndex('by_at', (q) => q.gte('at', since))
      .take(200_000);

    // ——— Activité par jour ———
    const dayList = daysBetween(firstDay, today);
    const activeByDay = new Map<string, Set<Id<'players'>>>();
    const playMsByDay = new Map<string, number>();
    const sessionsByDay = new Map<string, number>();
    const activeDaysByPlayer = new Map<Id<'players'>, Set<string>>();
    const platforms = new Map<string, number>();
    let totalSessionMs = 0;
    for (const s of sessions) {
      const length = Math.max(0, s.lastSeenAt - s.startedAt);
      totalSessionMs += length;
      if (!activeByDay.has(s.day)) activeByDay.set(s.day, new Set());
      activeByDay.get(s.day)?.add(s.playerId);
      playMsByDay.set(s.day, (playMsByDay.get(s.day) ?? 0) + length);
      sessionsByDay.set(s.day, (sessionsByDay.get(s.day) ?? 0) + 1);
      if (!activeDaysByPlayer.has(s.playerId)) activeDaysByPlayer.set(s.playerId, new Set());
      activeDaysByPlayer.get(s.playerId)?.add(s.day);
      platforms.set(s.platform, (platforms.get(s.platform) ?? 0) + 1);
    }
    const newByDay = new Map<string, Doc<'players'>[]>();
    for (const p of players) {
      if (p.createdDay < firstDay) continue;
      if (!newByDay.has(p.createdDay)) newByDay.set(p.createdDay, []);
      newByDay.get(p.createdDay)?.push(p);
    }
    const daily = dayList.map((day) => {
      const active = activeByDay.get(day)?.size ?? 0;
      return {
        day,
        newPlayers: newByDay.get(day)?.length ?? 0,
        activePlayers: active,
        sessions: sessionsByDay.get(day) ?? 0,
        avgPlayMinPerActive: active ? (playMsByDay.get(day) ?? 0) / active / 60_000 : 0,
      };
    });

    // ——— Rétention par cohorte (jour d'inscription) ———
    const retained = (cohort: Doc<'players'>[], day: string, offset: number) => {
      const target = addDays(day, offset);
      if (target > today) return null;
      const back = cohort.filter((p) => activeDaysByPlayer.get(p._id)?.has(target)).length;
      return cohort.length ? back / cohort.length : null;
    };
    const cohorts = dayList
      .filter((day) => (newByDay.get(day)?.length ?? 0) > 0)
      .map((day) => {
        const cohort = newByDay.get(day) ?? [];
        return {
          day,
          size: cohort.length,
          d1: retained(cohort, day, 1),
          d3: retained(cohort, day, 3),
          d7: retained(cohort, day, 7),
          d14: retained(cohort, day, 14),
          d30: retained(cohort, day, 30),
        };
      });
    const average = (key: 'd1' | 'd7' | 'd30') => {
      let weight = 0;
      let sum = 0;
      for (const c of cohorts) {
        const value = c[key];
        if (value === null) continue;
        sum += value * c.size;
        weight += c.size;
      }
      return weight ? sum / weight : null;
    };

    // ——— Progression ———
    const levels = new Map<number, number>();
    for (const p of players) if (!p.banned) levels.set(p.level, (levels.get(p.level) ?? 0) + 1);
    const levelDistribution = [...levels.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, count]) => ({ level, count }));

    // Temps réel (en jours depuis l'inscription) pour atteindre chaque niveau.
    const createdAt = new Map(players.map((p) => [p._id, p.createdAt]));
    const levelTimes = new Map<number, number[]>();
    const questCounts = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'level') {
        const level = Number(e.name);
        const start = createdAt.get(e.playerId);
        if (!start || !Number.isFinite(level)) continue;
        if (!levelTimes.has(level)) levelTimes.set(level, []);
        levelTimes.get(level)?.push((e.at - start) / DAY_MS);
      } else if (e.type === 'quest') {
        questCounts.set(e.name, (questCounts.get(e.name) ?? 0) + 1);
      }
    }
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const levelPace = [...levelTimes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, values]) => ({ level, players: values.length, medianDays: median(values) }));
    const newPlayers = players.filter((p) => p.createdAt >= since).length;
    const questFunnel = QUESTS.map((q) => ({
      id: q.id,
      title: q.title,
      completed: questCounts.get(q.id) ?? 0,
      ratio: newPlayers ? (questCounts.get(q.id) ?? 0) / newPlayers : 0,
    }));

    // ——— Listes ———
    const recent = [...players].sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, 50);
    const reports = await ctx.db
      .query('reports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .order('desc')
      .take(50);
    const pseudoOf = new Map(players.map((p) => [p._id, p.pseudo]));
    const languages = new Map<string, number>();
    for (const p of players) {
      if (p.banned) continue;
      const code = p.language ?? '?';
      languages.set(code, (languages.get(code) ?? 0) + 1);
    }
    const chatToday = await ctx.db
      .query('chatMessages')
      .withIndex('by_createdAt', (q) => q.gte('createdAt', Date.parse(`${today}T00:00:00Z`)))
      .take(10_000);

    const dau = activeByDay.get(today)?.size ?? 0;
    const lastWeek = new Set<Id<'players'>>();
    const lastMonth = new Set<Id<'players'>>();
    for (const s of sessions) {
      if (s.startedAt >= now - 7 * DAY_MS) lastWeek.add(s.playerId);
      if (s.startedAt >= now - 30 * DAY_MS) lastMonth.add(s.playerId);
    }
    return {
      generatedAt: now,
      totals: {
        players: players.length,
        newToday: newByDay.get(today)?.length ?? 0,
        dau,
        wau: lastWeek.size,
        mau: lastMonth.size,
        avgSessionMin: sessions.length ? totalSessionMs / sessions.length / 60_000 : 0,
        sessionsPerActiveDay:
          [...activeByDay.values()].reduce((n, set) => n + set.size, 0) > 0
            ? sessions.length / [...activeByDay.values()].reduce((n, set) => n + set.size, 0)
            : 0,
        retentionD1: average('d1'),
        retentionD7: average('d7'),
        retentionD30: average('d30'),
      },
      daily,
      cohorts,
      levelDistribution,
      levelPace,
      questFunnel,
      platforms: [...platforms.entries()].map(([platform, count]) => ({ platform, count })),
      languages: [...languages.entries()].sort((a, b) => b[1] - a[1]).map(([language, count]) => ({ language, count })),
      chat: {
        messagesToday: chatToday.filter((m) => m.kind === 'message').length,
        authorsToday: new Set(chatToday.map((m) => m.playerId)).size,
      },
      recentPlayers: recent.map((p) => ({
        id: p._id,
        pseudo: p.pseudo,
        level: p.level,
        population: p.population,
        createdAt: p.createdAt,
        lastSeenAt: p.lastSeenAt,
        activeDays: activeDaysByPlayer.get(p._id)?.size ?? 0,
        banned: p.banned === true,
        suspicious: p.suspicious ?? 0,
        role: p.role ?? null,
        language: p.language ?? null,
      })),
      reports: reports.map((r) => ({
        id: r._id,
        reporter: pseudoOf.get(r.reporterId) ?? '?',
        targetId: r.targetId,
        target: pseudoOf.get(r.targetId) ?? '?',
        reason: r.reason,
        createdAt: r.createdAt,
        messageId: r.messageId ?? null,
      })),
    };
  },
});

export const setBanned = mutation({
  args: { token: v.string(), playerId: v.id('players'), banned: v.boolean() },
  handler: async (ctx, { token, playerId, banned }) => {
    const admin = await requireAdmin(ctx, token);
    if (playerId === admin._id) fail('forbidden');
    await ctx.db.patch(playerId, { banned });
  },
});

export const resolveReport = mutation({
  args: { token: v.string(), reportId: v.id('reports') },
  handler: async (ctx, { token, reportId }) => {
    await requireAdmin(ctx, token);
    await ctx.db.patch(reportId, { resolved: true });
  },
});

/** Remplace un pseudo inapproprié par « Maire » suivi d'un numéro. */
export const resetPseudo = mutation({
  args: { token: v.string(), playerId: v.id('players') },
  handler: async (ctx, { token, playerId }) => {
    await requireAdmin(ctx, token);
    const pseudo = `Maire ${String(playerId).slice(-5)}`;
    await ctx.db.patch(playerId, { pseudo, pseudoKey: pseudo.toLowerCase() });
  },
});

/**
 * Annonce de l'équipe : affichée en fenêtre à tous les joueurs concernés (à leur
 * prochaine connexion ou tout de suite s'ils jouent) et mise en avant dans le chat.
 * Sans langue : tout le monde ; avec une langue : les joueurs qui jouent dans cette langue.
 */
export const announce = mutation({
  args: { token: v.string(), text: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, { token, text, language }) => {
    const admin = await requireAdmin(ctx, token);
    if (language !== undefined && !isLanguage(language)) fail('forbidden');
    const clean = cleanChatText(text);
    if (!clean) fail('invalidText');
    await ctx.db.insert('chatMessages', {
      channel: language ? `lang:${language}` : 'world',
      playerId: admin._id,
      pseudo: admin.pseudo,
      role: 'admin',
      level: admin.level,
      text: clean,
      createdAt: Date.now(),
      kind: 'announcement',
    });
  },
});

/** Derniers messages du chat, tous salons confondus (modération). */
export const recentChat = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdmin(ctx, token);
    const messages = await ctx.db.query('chatMessages').withIndex('by_createdAt').order('desc').take(CHAT.pageSize);
    return messages.map((m) => ({
      id: m._id,
      channel: m.channel,
      playerId: m.playerId,
      pseudo: m.pseudo,
      role: m.role ?? null,
      text: m.text,
      createdAt: m.createdAt,
      kind: m.kind,
      deleted: m.deleted === true,
    }));
  },
});
