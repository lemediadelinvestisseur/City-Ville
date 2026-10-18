import { v } from 'convex/values';
import { QUESTS } from '../src/data/quests';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { dayOf, fail } from './lib/util';

const DAY_MS = 86_400_000;

/**
 * Accès admin : clé secrète `ADMIN_KEY` définie dans les variables
 * d'environnement du déploiement Convex (jamais dans le code).
 */
function requireAdmin(key: string): void {
  const expected = process.env.ADMIN_KEY;
  if (!expected || expected.length < 16 || key !== expected) fail('forbidden');
}

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
  args: { key: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { key, days = 30 }) => {
    requireAdmin(key);
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
      })),
      reports: reports.map((r) => ({
        id: r._id,
        reporter: pseudoOf.get(r.reporterId) ?? '?',
        targetId: r.targetId,
        target: pseudoOf.get(r.targetId) ?? '?',
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    };
  },
});

export const setBanned = mutation({
  args: { key: v.string(), playerId: v.id('players'), banned: v.boolean() },
  handler: async (ctx, { key, playerId, banned }) => {
    requireAdmin(key);
    await ctx.db.patch(playerId, { banned });
  },
});

export const resolveReport = mutation({
  args: { key: v.string(), reportId: v.id('reports') },
  handler: async (ctx, { key, reportId }) => {
    requireAdmin(key);
    await ctx.db.patch(reportId, { resolved: true });
  },
});

/** Remplace un pseudo inapproprié par « Maire » suivi d'un numéro. */
export const resetPseudo = mutation({
  args: { key: v.string(), playerId: v.id('players') },
  handler: async (ctx, { key, playerId }) => {
    requireAdmin(key);
    const pseudo = `Maire ${String(playerId).slice(-5)}`;
    await ctx.db.patch(playerId, { pseudo, pseudoKey: pseudo.toLowerCase() });
  },
});
