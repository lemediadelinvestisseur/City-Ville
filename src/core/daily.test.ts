import { describe, expect, it } from 'vitest';
import { DAILY_MIN_LEVEL, DAILY_TASK_COUNT } from '@/data/daily';
import { getCropDef } from '@/data/crops';
import { Game, type Clock, type ReadyItem } from './game';
import { createNewGame } from './newGame';
import { outOfQuietHours, planReminders, REMINDER_KINDS, type ReminderKind } from './reminders';
import { deserialize, serialize } from './save';

class FakeClock implements Clock {
  // Un mardi à 10 h, heure locale.
  constructor(public t = new Date(2026, 9, 20, 10, 0, 0).getTime()) {}
  now(): number {
    return this.t;
  }
  advance(sec: number): void {
    this.t += sec * 1000;
  }
}

function setup(level = 1): { game: Game; clock: FakeClock } {
  const clock = new FakeClock();
  const state = createNewGame(clock.now());
  state.level = level;
  const game = new Game(state, clock);
  return { game, clock };
}

const allKinds = Object.fromEntries(REMINDER_KINDS.map((k) => [k, true])) as Record<ReminderKind, boolean>;

describe('défis du jour', () => {
  it('apparaissent au niveau requis, trois par jour, stables pour la journée', () => {
    expect(setup(1).game.dailyInfo().available).toBe(false);
    const { game, clock } = setup(DAILY_MIN_LEVEL);
    const info = game.dailyInfo();
    expect(info.available).toBe(true);
    expect(info.tasks).toHaveLength(DAILY_TASK_COUNT);
    expect(new Set(info.tasks.map((t) => t.type)).size).toBe(DAILY_TASK_COUNT);
    // Pas de commerce ni de port : pas de défi qui en demande.
    expect(info.tasks.every((t) => ['harvest', 'plant', 'collectRent'].includes(t.type))).toBe(true);
    const reloaded = new Game(deserialize(serialize(game.state, clock.now()))!, clock);
    expect(reloaded.dailyInfo().tasks).toEqual(info.tasks);
    expect(info.resetsAt).toBe(new Date(2026, 9, 21).getTime());
  });

  it('avancent avec les actions, se réclament puis donnent un bonus', () => {
    const { game } = setup(DAILY_MIN_LEVEL);
    const completed: number[] = [];
    game.events.on('dailyCompleted', ({ index }) => completed.push(index));
    // Défis remplis artificiellement sauf le premier, qu'on remplit en jouant.
    const tasks = game.state.daily.tasks;
    for (const task of tasks.slice(1)) task.count = task.target;
    const first = tasks[0]!;
    first.type = 'harvest';
    first.target = 2;
    expect(game.claimDaily(0)).toMatchObject({ ok: false, reason: 'notReady' });
    for (const plot of game.state.entities.filter((e) => e.farm?.cropId).slice(0, 2)) game.harvest(plot.id);
    expect(completed).toEqual([0]);
    expect(game.dailyInfo().claimable).toBe(3);
    expect(game.claimDailyBonus()).toMatchObject({ ok: false, reason: 'notReady' });
    const coins = game.state.coins;
    for (let i = 0; i < 3; i++) expect(game.claimDaily(i).ok).toBe(true);
    expect(game.state.coins).toBe(coins + 3 * (first.reward.coins ?? 0));
    expect(game.claimDaily(0)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(game.dailyInfo().claimable).toBe(1);
    const cash = game.state.cash;
    expect(game.claimDailyBonus().ok).toBe(true);
    expect(game.state.cash).toBe(cash + (game.state.daily.bonus.cash ?? 0));
    expect(game.dailyInfo().claimable).toBe(0);
  });

  it('se renouvellent le lendemain', () => {
    const { game, clock } = setup(DAILY_MIN_LEVEL);
    const before = game.state.daily.day;
    let refreshed = 0;
    game.events.on('dailyRefreshed', () => refreshed++);
    clock.advance(14 * 3600);
    game.tick();
    expect(game.state.daily.day).not.toBe(before);
    expect(refreshed).toBe(1);
    expect(game.dailyInfo().tasks.every((t) => t.count === 0 && !t.claimed)).toBe(true);
  });
});

describe('attentes terminées', () => {
  it('signale chaque culture mûre une seule fois', () => {
    const { game, clock } = setup();
    const ready: ReadyItem[] = [];
    game.events.on('ready', ({ items }) => ready.push(...items));
    const plot = game.state.entities.find((e) => e.farm?.cropId)!;
    game.harvest(plot.id);
    game.plant(plot.id, 'wheat');
    game.tick();
    expect(ready).toEqual([]);
    clock.advance(getCropDef('wheat').growSec);
    game.tick();
    game.tick();
    expect(ready).toEqual([{ entityId: plot.id, kind: 'crop', at: clock.now() }]);
  });
});

describe('rappels', () => {
  it('regroupe les cultures prêtes ensemble et respecte les catégories', () => {
    const { game, clock } = setup();
    const plots = game.state.entities.filter((e) => e.farm?.cropId);
    for (const plot of plots) {
      game.harvest(plot.id);
      game.plant(plot.id, 'wheat');
      clock.advance(60);
    }
    const reminders = planReminders(game, clock.now(), { kinds: allKinds, quietHours: false });
    const crops = reminders.filter((r) => r.kind === 'crop');
    expect(crops).toHaveLength(1);
    expect(crops[0]).toMatchObject({ count: plots.length, cropId: 'wheat' });
    const none = planReminders(game, clock.now(), { kinds: { ...allKinds, crop: false }, quietHours: false });
    expect(none.some((r) => r.kind === 'crop')).toBe(false);
  });

  it('décale les rappels de la nuit à 8 h', () => {
    const night = new Date(2026, 9, 20, 23, 30).getTime();
    expect(outOfQuietHours(night)).toBe(new Date(2026, 9, 21, 8, 0).getTime());
    const early = new Date(2026, 9, 21, 5, 0).getTime();
    expect(outOfQuietHours(early)).toBe(new Date(2026, 9, 21, 8, 0).getTime());
    const day = new Date(2026, 9, 21, 14, 0).getTime();
    expect(outOfQuietHours(day)).toBe(day);
  });

  it('annonce l’énergie pleine et les nouveaux défis du lendemain', () => {
    const { game, clock } = setup(DAILY_MIN_LEVEL);
    game.state.energy = 0;
    const reminders = planReminders(game, clock.now(), { kinds: allKinds, quietHours: true });
    expect(reminders.find((r) => r.kind === 'energy')?.at).toBeGreaterThan(clock.now());
    expect(reminders.find((r) => r.kind === 'daily')?.at).toBe(new Date(2026, 9, 21, 9, 0).getTime());
  });
});
