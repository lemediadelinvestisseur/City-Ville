// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../src/core/newGame';
import { serialize } from '../src/core/save';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

const token = (n: number) => `device-secret-${String(n).padStart(4, '0')}-${'x'.repeat(24)}`;

async function newPlayer(t: ReturnType<typeof convexTest>, n: number, pseudo: string) {
  const { playerId } = await t.mutation(api.players.register, {
    token: token(n),
    pseudo,
    cityName: `Ville de ${pseudo}`,
    platform: 'web',
    language: 'fr',
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
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('refuse l’accès à tout autre compte que l’administrateur', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    await expect(t.query(api.admin.dashboard, { token: lea.token })).rejects.toThrow(/forbidden/);
    await expect(t.query(api.admin.dashboard, { token: token(99) })).rejects.toThrow(/unauthorized/);
  });

  it('calcule audience, rétention et temps de jeu', async () => {
    vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(internal.roles.setOwner, { pseudo: 'lea' });
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
    const board = await t.query(api.admin.dashboard, { token: lea.token, days: 7 });
    expect(board.totals).toMatchObject({ players: 2, wau: 2, retentionD1: 0.5 });
    const day0 = board.daily.find((d) => d.day === '2026-10-10');
    expect(day0).toMatchObject({ newPlayers: 2, activePlayers: 2, sessions: 2 });
    expect(day0?.avgPlayMinPerActive).toBeCloseTo(10);
    expect(board.cohorts[0]).toMatchObject({ day: '2026-10-10', size: 2, d1: 0.5 });
    expect(board.questFunnel[0]).toMatchObject({ id: 'welcome', completed: 1, ratio: 0.5 });
    expect(board.platforms).toEqual(expect.arrayContaining([{ platform: 'ios', count: 1 }]));
    expect(board.languages).toEqual([{ language: 'fr', count: 2 }]);
  });
});

describe('rôles', () => {
  it('un seul administrateur, désigné en ligne de commande', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(internal.roles.setOwner, { pseudo: 'Léa' });
    expect(await t.query(api.admin.whoami, { token: lea.token })).toEqual({ pseudo: 'Léa', role: 'admin' });
    expect(await t.query(api.players.me, { token: lea.token })).toMatchObject({ role: 'admin' });
    // Désigner un autre compte retire le rôle au précédent.
    const result = await t.mutation(internal.roles.setOwner, { pseudo: 'paul' });
    expect(result).toEqual({ admin: 'Paul', demoted: ['Léa'] });
    await expect(t.query(api.admin.whoami, { token: lea.token })).rejects.toThrow(/forbidden/);
    expect(await t.query(api.admin.whoami, { token: paul.token })).toMatchObject({ pseudo: 'Paul' });
    await t.mutation(internal.roles.clearOwner, {});
    await expect(t.query(api.admin.whoami, { token: paul.token })).rejects.toThrow(/forbidden/);
  });

  it('les modérateurs n’ont pas accès aux données ; un compte banni perd ses droits', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(internal.roles.setOwner, { pseudo: 'Léa' });
    await t.mutation(api.roles.setModerator, { token: lea.token, pseudo: 'paul', moderator: true });
    expect((await t.query(api.roles.team, { token: lea.token })).map((p) => [p.pseudo, p.role])).toEqual([
      ['Léa', 'admin'],
      ['Paul', 'moderator'],
    ]);
    await expect(t.query(api.admin.dashboard, { token: paul.token })).rejects.toThrow(/forbidden/);
    await expect(
      t.mutation(api.roles.setModerator, { token: paul.token, pseudo: 'Léa', moderator: false }),
    ).rejects.toThrow(/forbidden/);
    await t.run(async (ctx) => ctx.db.patch(lea.playerId, { banned: true }));
    await expect(t.query(api.admin.whoami, { token: lea.token })).rejects.toThrow(/forbidden/);
  });

  it('se déconnecter oublie la clé de l’appareil', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    await t.mutation(api.players.logout, { token: lea.token });
    await expect(t.query(api.players.me, { token: lea.token })).rejects.toThrow(/unauthorized/);
  });
});

describe('chat', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  async function chatter(t: ReturnType<typeof convexTest>, n: number, pseudo: string) {
    const p = await newPlayer(t, n, pseudo);
    await t.mutation(api.saves.push, { token: p.token, baseRevision: 0, data: saveWithXp(100, 3) });
    return p;
  }
  const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

  it('envoie, nettoie et liste les messages d’un salon', async () => {
    const t = convexTest(schema, modules);
    const lea = await chatter(t, 1, 'Léa');
    const paul = await chatter(t, 2, 'Paul');
    await t.mutation(api.chat.send, { token: lea.token, channel: 'world', text: '  Bonjour   tout le monde ! ' });
    later(5000);
    await t.mutation(api.chat.send, { token: paul.token, channel: 'world', text: 'Va sur www.arnaque.com connard' });
    later(5000);
    await t.mutation(api.chat.send, { token: paul.token, channel: 'lang:fr', text: 'Salut les francophones' });
    const feed = await t.query(api.chat.list, { token: lea.token, channel: 'world' });
    expect(feed.messages.map((m) => [m.pseudo, m.text, m.mine])).toEqual([
      ['Léa', 'Bonjour tout le monde !', true],
      ['Paul', 'Va sur *** *******', false],
    ]);
    expect(feed).toMatchObject({ canWrite: true, canModerate: false, mutedUntil: null });
    const pulse = await t.query(api.chat.pulse, { token: lea.token, channels: ['world', 'lang:fr'] });
    expect(pulse.latest.map((l) => l.at > 0)).toEqual([true, true]);
    await expect(t.mutation(api.chat.send, { token: lea.token, channel: 'lang:xx', text: 'Salut' })).rejects.toThrow(
      /forbidden/,
    );
  });

  it('limite la cadence, exige le niveau 2 et masque les joueurs bloqués', async () => {
    const t = convexTest(schema, modules);
    const lea = await chatter(t, 1, 'Léa');
    const paul = await chatter(t, 2, 'Paul');
    const novice = await newPlayer(t, 3, 'Novice');
    await expect(t.mutation(api.chat.send, { token: novice.token, channel: 'world', text: 'Hello' })).rejects.toThrow(
      /forbidden/,
    );
    await t.mutation(api.chat.send, { token: lea.token, channel: 'world', text: 'Un' });
    await expect(t.mutation(api.chat.send, { token: lea.token, channel: 'world', text: 'Deux' })).rejects.toThrow(
      /limit/,
    );
    later(4000);
    await t.mutation(api.chat.send, { token: lea.token, channel: 'world', text: 'Deux' });
    await t.mutation(api.moderation.block, { token: paul.token, playerId: lea.playerId });
    expect((await t.query(api.chat.list, { token: paul.token, channel: 'world' })).messages).toEqual([]);
  });

  it('modération : suppression, mise en sourdine et signalement', async () => {
    const t = convexTest(schema, modules);
    const lea = await chatter(t, 1, 'Léa');
    const paul = await chatter(t, 2, 'Paul');
    const zoe = await chatter(t, 3, 'Zoé');
    await t.mutation(internal.roles.setOwner, { pseudo: 'Léa' });
    await t.mutation(api.roles.setModerator, { token: lea.token, pseudo: 'Zoé', moderator: true });
    const { id } = await t.mutation(api.chat.send, { token: paul.token, channel: 'world', text: 'Message gênant' });
    await t.mutation(api.chat.report, { token: lea.token, messageId: id });
    await expect(t.mutation(api.chat.remove, { token: lea.token, messageId: id })).resolves.toEqual({ ok: true });
    expect((await t.query(api.chat.list, { token: paul.token, channel: 'world' })).messages).toEqual([]);
    // Un joueur ne peut pas rendre muet ; une modératrice si.
    await expect(t.mutation(api.chat.mute, { token: paul.token, playerId: zoe.playerId, minutes: 60 })).rejects.toThrow(
      /forbidden/,
    );
    await t.mutation(api.chat.mute, { token: zoe.token, playerId: paul.playerId, minutes: 60 });
    later(10_000);
    await expect(t.mutation(api.chat.send, { token: paul.token, channel: 'world', text: 'Re' })).rejects.toThrow(
      /muted/,
    );
    await expect(t.mutation(api.chat.mute, { token: zoe.token, playerId: lea.playerId, minutes: 60 })).rejects.toThrow(
      /forbidden/,
    );
    later(3_600_000);
    await t.mutation(api.chat.send, { token: paul.token, channel: 'world', text: 'Je serai sage' });
    const board = await t.query(api.admin.dashboard, { token: lea.token });
    expect(board.reports).toEqual([expect.objectContaining({ target: 'Paul', messageId: id })]);
  });

  it('annonces de l’équipe, ciblées par langue', async () => {
    const t = convexTest(schema, modules);
    const lea = await chatter(t, 1, 'Léa');
    const paul = await chatter(t, 2, 'Paul');
    await expect(t.mutation(api.admin.announce, { token: paul.token, text: 'Faux message' })).rejects.toThrow(
      /forbidden/,
    );
    await t.mutation(internal.roles.setOwner, { pseudo: 'Léa' });
    await t.mutation(api.admin.announce, { token: lea.token, text: 'Mise à jour ce soir !' });
    later(1000);
    await t.mutation(api.admin.announce, { token: lea.token, text: 'Only in English', language: 'en' });
    const forFrench = await t.query(api.chat.announcements, { token: paul.token, channels: ['world', 'lang:fr'] });
    expect(forFrench.map((a) => a.text)).toEqual(['Mise à jour ce soir !']);
    const forEnglish = await t.query(api.chat.announcements, { token: paul.token, channels: ['world', 'lang:en'] });
    expect(forEnglish.map((a) => a.text)).toEqual(['Only in English', 'Mise à jour ce soir !']);
    const pulse = await t.query(api.chat.pulse, { token: paul.token, channels: ['world', 'lang:fr'] });
    expect(pulse.announcementAt).toBe(Date.parse('2026-10-18T10:00:00Z'));
  });
});

describe('marché', () => {
  async function seller(t: ReturnType<typeof convexTest>, n: number, pseudo: string, level: number) {
    const p = await newPlayer(t, n, pseudo);
    await t.mutation(api.saves.push, { token: p.token, baseRevision: 0, data: saveWithXp(level * 100, level) });
    return p;
  }

  it('vend un lot une seule fois et verse la recette moins la taxe', async () => {
    const t = convexTest(schema, modules);
    const lea = await seller(t, 1, 'Léa', 6);
    const paul = await seller(t, 2, 'Paul', 6);
    const zoe = await seller(t, 3, 'Zoé', 6);
    const { id } = await t.mutation(api.market.create, { token: lea.token, item: 'wheat', qty: 100, unitPrice: 4 });
    const seen = await t.query(api.market.overview, { token: paul.token });
    expect(seen.offers).toEqual([expect.objectContaining({ qty: 100, unitPrice: 4, seller: 'Léa' })]);
    expect(await t.mutation(api.market.buy, { token: paul.token, listingId: id })).toEqual({
      item: 'wheat',
      qty: 100,
      total: 400,
    });
    await expect(t.mutation(api.market.buy, { token: zoe.token, listingId: id })).rejects.toThrow(/notFound/);
    expect((await t.query(api.market.overview, { token: lea.token })).mine[0]).toMatchObject({
      status: 'sold',
      income: 360,
    });
    expect(await t.mutation(api.market.settle, { token: lea.token })).toEqual({ coins: 360, items: {}, sold: 1 });
    expect(await t.mutation(api.market.settle, { token: lea.token })).toEqual({ coins: 0, items: {}, sold: 0 });
  });

  it('applique les limites (niveau, lot, nombre de lots) et rend les invendus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    const t = convexTest(schema, modules);
    const novice = await seller(t, 1, 'Novice', 2);
    const lea = await seller(t, 2, 'Léa', 8);
    await expect(
      t.mutation(api.market.create, { token: novice.token, item: 'wheat', qty: 50, unitPrice: 2 }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.mutation(api.market.create, { token: lea.token, item: 'wheat', qty: 5, unitPrice: 2 }),
    ).rejects.toThrow();
    for (let i = 0; i < 5; i++)
      await t.mutation(api.market.create, { token: lea.token, item: 'wheat', qty: 20, unitPrice: 2 });
    await expect(
      t.mutation(api.market.create, { token: lea.token, item: 'wheat', qty: 20, unitPrice: 2 }),
    ).rejects.toThrow(/limit/);
    const [first] = (await t.query(api.market.overview, { token: lea.token })).mine;
    expect(await t.mutation(api.market.cancel, { token: lea.token, listingId: first!.id })).toEqual({
      item: 'wheat',
      qty: 20,
    });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    expect(await t.mutation(api.market.settle, { token: lea.token })).toEqual({
      coins: 0,
      items: { wheat: 80 },
      sold: 0,
    });
    vi.useRealTimers();
  });
});

describe('notifications Web Push', () => {
  const subscription = { endpoint: 'https://web.push.apple.com/abc123', p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) };

  it('programme les rappels de l’appareil et remplace la liste précédente', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    const soon = Date.now() + 60_000;
    const items = [
      { at: soon, title: 'City Ville', body: 'Vos fraises sont prêtes !' },
      { at: soon + 60_000, title: 'City Ville', body: 'Le train est rentré !' },
      { at: Date.now() - 1000, title: 'City Ville', body: 'Déjà passé' },
    ];
    expect(await t.mutation(api.push.schedule, { token: lea.token, subscription, items })).toEqual({ scheduled: 2 });
    expect(await t.mutation(api.push.schedule, { token: lea.token, subscription, items: items.slice(0, 1) })).toEqual({
      scheduled: 1,
    });
    const jobs = await t.run((ctx) => ctx.db.query('pushJobs').collect());
    expect(jobs.map((j) => j.body)).toEqual(['Vos fraises sont prêtes !']);
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled.filter((f) => f.state.kind === 'pending')).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query('pushSubscriptions').collect())).toHaveLength(1);
    await t.mutation(api.push.unsubscribe, { token: lea.token, endpoint: subscription.endpoint });
    expect(await t.run((ctx) => ctx.db.query('pushJobs').collect())).toHaveLength(0);
  });

  it('refuse une adresse qui n’est pas un service d’envoi de notifications', async () => {
    const t = convexTest(schema, modules);
    const lea = await newPlayer(t, 1, 'Léa');
    await expect(
      t.mutation(api.push.schedule, {
        token: lea.token,
        subscription: { ...subscription, endpoint: 'https://exemple.fr/piege' },
        items: [],
      }),
    ).rejects.toThrow(/invalidText/);
  });
});

describe('page de confidentialité', () => {
  it('est servie en HTML sur /confidentialite', async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch('/confidentialite', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Politique de confidentialité');
    expect(html).toContain('Supprimer mon compte');
  });
});

describe('vie du quartier', () => {
  async function neighbors(t: ReturnType<typeof convexTest>) {
    const lea = await newPlayer(t, 1, 'Léa');
    const paul = await newPlayer(t, 2, 'Paul');
    await t.mutation(api.neighbors.add, { token: lea.token, neighborId: paul.playerId });
    return { lea, paul };
  }

  it('demande un produit aux voisins et récupère ce qu’ils envoient', async () => {
    const t = convexTest(schema, modules);
    const { lea, paul } = await neighbors(t);
    await t.mutation(api.social.createRequest, { token: lea.token, item: 'milk', qty: 20 });
    await expect(t.mutation(api.social.createRequest, { token: lea.token, item: 'eggs', qty: 10 })).rejects.toThrow(
      /limit/,
    );
    const requests = await t.query(api.social.neighborRequests, { token: paul.token });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ item: 'milk', qty: 20, received: 0 });
    await t.mutation(api.social.giveToRequest, { token: paul.token, requestId: requests[0]!.id, qty: 15 });
    await expect(
      t.mutation(api.social.giveToRequest, { token: paul.token, requestId: requests[0]!.id, qty: 10 }),
    ).rejects.toThrow(/limit/);
    expect(await t.mutation(api.social.claimRequest, { token: lea.token })).toEqual({ item: 'milk', qty: 15 });
    expect(await t.mutation(api.social.claimRequest, { token: lea.token })).toEqual({ item: 'milk', qty: 0 });
  });

  it('compte les « J’aime » une fois par ville et par semaine', async () => {
    const t = convexTest(schema, modules);
    const { lea, paul } = await neighbors(t);
    expect(await t.mutation(api.social.like, { token: paul.token, playerId: lea.playerId })).toEqual({ likes: 1 });
    await expect(t.mutation(api.social.like, { token: paul.token, playerId: lea.playerId })).rejects.toThrow(
      /alreadyHelped/,
    );
    const ranking = await t.query(api.social.prettiest, { token: lea.token });
    expect(ranking).toMatchObject({ myRank: 1, myLikes: 1 });
  });

  it('réussit le défi de quartier ensemble', async () => {
    const t = convexTest(schema, modules);
    const { lea, paul } = await neighbors(t);
    await t.mutation(api.social.contribute, { token: lea.token, amount: 200 });
    await t.mutation(api.social.contribute, { token: paul.token, amount: 150 });
    expect(await t.query(api.social.community, { token: lea.token })).toMatchObject({ claimable: true, goal: 300 });
    await t.mutation(api.social.claimCommunity, { token: lea.token });
    await expect(t.mutation(api.social.claimCommunity, { token: lea.token })).rejects.toThrow(/notFound/);
  });
});
