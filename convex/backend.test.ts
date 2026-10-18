// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../src/core/newGame';
import { serialize } from '../src/core/save';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

const token = (n: number) => `device-secret-${String(n).padStart(4, '0')}-${'x'.repeat(24)}`;

async function newPlayer(t: ReturnType<typeof convexTest>, n: number, pseudo: string) {
  const { playerId } = await t.mutation(api.players.register, {
    token: token(n),
    pseudo,
    cityName: `Ville de ${pseudo}`,
    platform: 'web',
  });
  return { playerId, token: token(n) };
}

function saveWithXp(xp: number, level: number): string {
  const state = createNewGame(Date.now());
  state.xp = xp;
  state.level = level;
  return serialize(state, Date.now());
}

describe('comptes', () => {
  it('crée un compte avec un pseudo unique (sans casse ni accents)', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    expect(await t.query(api.players.me, { token: lea.token })).toMatchObject({ pseudo: 'Léa', level: 1 });
    await expect(newPlayer(t, 2, 'LEA')).rejects.toThrow(/pseudoTaken/);
    await expect(newPlayer(t, 3, 'admin')).rejects.toThrow(/pseudoInvalid/);
    expect(await t.query(api.players.pseudoAvailable, { pseudo: 'lea' })).toMatchObject({ available: false });
    expect(await t.query(api.players.pseudoAvailable, { pseudo: 'Paul' })).toMatchObject({ available: true });
  });

  it('refuse une clé inconnue', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.players.me, { token: token(99) })).rejects.toThrow(/unauthorized/);
  });

  it('transfère la ville sur un nouvel appareil avec un code à usage unique', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const { code } = await t.mutation(api.players.createTransferCode, { token: lea.token });
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await t.mutation(api.players.redeemTransferCode, { code: code.toLowerCase(), token: token(2), platform: 'ios' });
    expect(await t.query(api.players.me, { token: token(2) })).toMatchObject({ pseudo: 'Léa' });
    await expect(
      t.mutation(api.players.redeemTransferCode, { code, token: token(3), platform: 'ios' }),
    ).rejects.toThrow(/invalidCode/);
  });

  it('supprime le compte et toutes ses données', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(api.neighbors.add, { token: lea.token, neighborId: paul.playerId });
    await t.mutation(api.saves.push, { token: lea.token, baseRevision: 0, data: saveWithXp(10, 1) });
    await t.mutation(api.players.deleteAccount, { token: lea.token });
    await expect(t.query(api.players.me, { token: lea.token })).rejects.toThrow(/unauthorized/);
    expect(await t.query(api.neighbors.list, { token: paul.token })).toEqual([]);
    const leftovers = await t.run(async (ctx) => ({
      saves: (await ctx.db.query('saves').collect()).length,
      links: (await ctx.db.query('neighbors').collect()).length,
    }));
    expect(leftovers).toEqual({ saves: 0, links: 0 });
    // Le pseudo redevient libre.
    await newPlayer(t, 3, 'Léa');
  });
});

describe('sauvegarde en ligne', () => {
  it('enregistre, relit et détecte les conflits entre appareils', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    expect(await t.query(api.saves.pull, { token: lea.token })).toBeNull();
    const first = await t.mutation(api.saves.push, { token: lea.token, baseRevision: 0, data: saveWithXp(50, 2) });
    expect(first).toEqual({ ok: true, revision: 1 });
    const stale = await t.mutation(api.saves.push, { token: lea.token, baseRevision: 0, data: saveWithXp(60, 2) });
    expect(stale).toMatchObject({ ok: false, conflict: { revision: 1 } });
    const forced = await t.mutation(api.saves.push, {
      token: lea.token,
      baseRevision: 0,
      data: saveWithXp(60, 2),
      force: true,
    });
    expect(forced).toEqual({ ok: true, revision: 2 });
    const pulled = await t.query(api.saves.pull, { token: lea.token });
    expect(pulled?.revision).toBe(2);
    expect(await t.query(api.players.me, { token: lea.token })).toMatchObject({ level: 2, population: 30 });
  });

  it('refuse les sauvegardes illisibles', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    await expect(
      t.mutation(api.saves.push, { token: lea.token, baseRevision: 0, data: '{"version":3,"state":{}}' }),
    ).rejects.toThrow(/invalidSave/);
  });

  it('signale une progression invraisemblable sans la bloquer', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    await t.mutation(api.saves.push, { token: lea.token, baseRevision: 0, data: saveWithXp(90_000, 40) });
    const suspicious = await t.run(async (ctx) => (await ctx.db.query('players').first())?.suspicious);
    expect(suspicious).toBe(1);
  });
});

describe('voisins', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('devient voisins, visite et aide une fois par jour', async () => {
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(api.saves.push, { token: paul.token, baseRevision: 0, data: saveWithXp(100, 3) });
    const suggestions = await t.query(api.neighbors.suggestions, { token: lea.token });
    expect(suggestions.map((p) => p.pseudo)).toEqual(['Paul']);
    expect((await t.query(api.neighbors.search, { token: lea.token, text: 'pa' })).map((p) => p.pseudo)).toEqual([
      'Paul',
    ]);
    await t.mutation(api.neighbors.add, { token: lea.token, neighborId: paul.playerId });
    expect((await t.query(api.neighbors.list, { token: paul.token })).map((p) => p.pseudo)).toEqual(['Léa']);
    const visit = await t.query(api.neighbors.visit, { token: lea.token, playerId: paul.playerId });
    expect(visit).toMatchObject({ isNeighbor: true, helpedToday: false, profile: { level: 3 } });
    expect(visit.data).toContain('"xp":100');

    await t.mutation(api.neighbors.help, { token: lea.token, neighborId: paul.playerId });
    await expect(t.mutation(api.neighbors.help, { token: lea.token, neighborId: paul.playerId })).rejects.toThrow(
      /alreadyHelped/,
    );
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    await t.mutation(api.neighbors.help, { token: lea.token, neighborId: paul.playerId });
    expect(await t.mutation(api.neighbors.claimHelps, { token: paul.token })).toEqual({ count: 2, helpers: ['Léa'] });
    expect(await t.mutation(api.neighbors.claimHelps, { token: paul.token })).toEqual({ count: 0, helpers: [] });
  });

  it('bloquer retire le voisin et empêche la visite', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(api.neighbors.add, { token: lea.token, neighborId: paul.playerId });
    await t.mutation(api.moderation.block, { token: paul.token, playerId: lea.playerId });
    expect(await t.query(api.neighbors.list, { token: lea.token })).toEqual([]);
    await expect(t.query(api.neighbors.visit, { token: lea.token, playerId: paul.playerId })).rejects.toThrow(
      /blocked/,
    );
    await expect(t.mutation(api.neighbors.add, { token: lea.token, neighborId: paul.playerId })).rejects.toThrow(
      /blocked/,
    );
  });
});

describe('classement', () => {
  it('classe par XP et par population, sans les joueurs bannis', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    const zoe = await newPlayer(t, 3, 'Zoé');
    await t.mutation(api.saves.push, { token: paul.token, baseRevision: 0, data: saveWithXp(500, 5) });
    await t.mutation(api.saves.push, { token: zoe.token, baseRevision: 0, data: saveWithXp(300, 4) });
    const board = await t.query(api.leaderboard.top, { token: lea.token, by: 'level' });
    expect(board.rows.map((r) => r.pseudo)).toEqual(['Paul', 'Zoé', 'Léa']);
    expect(board.myRank).toBe(3);
    await t.run(async (ctx) => ctx.db.patch(paul.playerId, { banned: true }));
    const after = await t.query(api.leaderboard.top, { token: lea.token, by: 'level' });
    expect(after.rows.map((r) => r.pseudo)).toEqual(['Zoé', 'Léa']);
  });
});

describe('admin', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_KEY', 'cle-admin-de-test-tres-longue');
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('refuse l’accès sans la bonne clé', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.dashboard, { key: 'mauvaise' })).rejects.toThrow(/forbidden/);
  });

  it('calcule audience, rétention et temps de jeu', async () => {
    vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    // Jour 0 : deux sessions de 10 min.
    for (const p of [lea, paul])
      await t.mutation(api.stats.ping, { token: p.token, clientSessionId: `s-${p.token}`, platform: 'web' });
    // L'appli envoie un signal chaque minute pendant la partie.
    for (let minute = 1; minute <= 10; minute++) {
      vi.setSystemTime(new Date(Date.parse('2026-10-10T09:00:00Z') + minute * 60_000));
      for (const p of [lea, paul]) {
        await t.mutation(api.stats.ping, { token: p.token, clientSessionId: `s-${p.token}`, platform: 'web' });
      }
    }
    await t.mutation(api.stats.track, { token: lea.token, events: [{ type: 'quest', name: 'welcome' }] });
    // Jour 1 : seule Léa revient.
    vi.setSystemTime(new Date('2026-10-11T20:00:00Z'));
    await t.mutation(api.stats.ping, { token: lea.token, clientSessionId: 'lendemain', platform: 'ios' });
    vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
    const board = await t.query(api.admin.dashboard, { key: 'cle-admin-de-test-tres-longue', days: 7 });
    expect(board.totals).toMatchObject({ players: 2, wau: 2, retentionD1: 0.5 });
    const day0 = board.daily.find((d) => d.day === '2026-10-10');
    expect(day0).toMatchObject({ newPlayers: 2, activePlayers: 2, sessions: 2 });
    expect(day0?.avgPlayMinPerActive).toBeCloseTo(10);
    expect(board.cohorts[0]).toMatchObject({ day: '2026-10-10', size: 2, d1: 0.5 });
    expect(board.questFunnel[0]).toMatchObject({ id: 'welcome', completed: 1, ratio: 0.5 });
    expect(board.platforms).toEqual(expect.arrayContaining([{ platform: 'ios', count: 1 }]));
  });
});
