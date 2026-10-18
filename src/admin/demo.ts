import { QUESTS } from '@/data/quests';
import type { Dashboard } from './types';

/** Générateur pseudo-aléatoire déterministe pour des données de démonstration stables. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PSEUDOS = [
  'Léa',
  'Malik',
  'Hugo',
  'Camille',
  'Inès',
  'Noah',
  'Jade',
  'Louis',
  'Emma',
  'Gabriel',
  'Chloé',
  'Adam',
];

/** Tableau de bord fictif (affiché tant que le serveur n'est pas branché). */
export function demoDashboard(days = 30): Dashboard {
  const rand = rng(42);
  const now = Date.now();
  const dayMs = 86_400_000;
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const daily = Array.from({ length: days }, (_, i) => {
    const t = now - (days - 1 - i) * dayMs;
    const growth = 1 + i / 6;
    const newPlayers = Math.round((8 + rand() * 10) * growth);
    return {
      day: dayOf(t),
      newPlayers,
      activePlayers: Math.round(newPlayers * (2.2 + rand()) + i * 4),
      sessions: Math.round(newPlayers * 7 + i * 9),
      avgPlayMinPerActive: 14 + rand() * 9,
    };
  });
  const cohorts = daily.map((d, i) => {
    const age = days - 1 - i;
    const r = (offset: number, base: number) => (age >= offset ? Math.max(0, base + (rand() - 0.5) * 0.08) : null);
    return {
      day: d.day,
      size: d.newPlayers,
      d1: r(1, 0.42),
      d3: r(3, 0.28),
      d7: r(7, 0.19),
      d14: r(14, 0.13),
      d30: r(30, 0.08),
    };
  });
  const players = daily.reduce((n, d) => n + d.newPlayers, 0);
  const levelDistribution = Array.from({ length: 22 }, (_, i) => ({
    level: i + 1,
    count: Math.round(players * 0.2 * Math.exp(-i / 4) * (0.8 + rand() * 0.4)),
  }));
  let ratio = 0.95;
  const questFunnel = QUESTS.map((q) => {
    ratio *= 0.83 + rand() * 0.1;
    return { id: q.id, title: q.title, completed: Math.round(players * ratio), ratio };
  });
  const recentPlayers = Array.from({ length: 12 }, (_, i) => ({
    id: `demo-${i}`,
    pseudo: PSEUDOS[i] ?? `Joueur ${i}`,
    level: Math.max(1, Math.round(22 - i * 1.6 + rand() * 3)),
    population: Math.round(2000 - i * 140),
    createdAt: now - (i + 3) * dayMs,
    lastSeenAt: now - i * 47 * 60_000,
    activeDays: Math.max(1, 14 - i),
    banned: false,
    suspicious: i === 7 ? 2 : 0,
  }));
  const avg = (key: 'd1' | 'd7' | 'd30') => {
    const values = cohorts.map((c) => c[key]).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const last = daily.at(-1);
  return {
    generatedAt: now,
    totals: {
      players,
      newToday: last?.newPlayers ?? 0,
      dau: last?.activePlayers ?? 0,
      wau: Math.round((last?.activePlayers ?? 0) * 2.6),
      mau: Math.round((last?.activePlayers ?? 0) * 5.1),
      avgSessionMin: 7.8,
      sessionsPerActiveDay: 3.1,
      retentionD1: avg('d1'),
      retentionD7: avg('d7'),
      retentionD30: avg('d30'),
    },
    daily,
    cohorts,
    levelDistribution,
    levelPace: [5, 10, 15, 20, 25].map((level, i) => ({
      level,
      players: Math.round(players * 0.5 * Math.exp(-i / 1.5)),
      medianDays: [0.3, 2.9, 8.5, 12.6, 16.1][i] ?? 0,
    })),
    questFunnel,
    platforms: [
      { platform: 'ios', count: 1240 },
      { platform: 'web-ios', count: 310 },
      { platform: 'web-android', count: 280 },
      { platform: 'web', count: 190 },
    ],
    recentPlayers,
    reports: [
      {
        id: 'r1',
        reporter: 'Jade',
        targetId: 'demo-9',
        target: 'Gabriel',
        reason: 'pseudo',
        createdAt: now - 3_600_000,
      },
    ],
  } as unknown as Dashboard;
}
