import { describe, expect, it } from 'vitest';
import { CYCLE_MS, dayNightAt } from './dayNight';

const MIN = 60_000;

describe('cycle jour/nuit', () => {
  it('enchaîne 20 min de jour, 2 de crépuscule, 6 de nuit et 2 d’aube', () => {
    const start = CYCLE_MS * 1000;
    expect(CYCLE_MS).toBe(30 * MIN);
    expect(dayNightAt(start + 5 * MIN, 'cycle')).toMatchObject({ phase: 'day', darkness: 0 });
    const dusk = dayNightAt(start + 21 * MIN, 'cycle');
    expect(dusk.phase).toBe('dusk');
    expect(dusk.darkness).toBeCloseTo(0.5);
    expect(dusk.twilight).toBeCloseTo(1);
    expect(dayNightAt(start + 25 * MIN, 'cycle')).toMatchObject({ phase: 'night', darkness: 1 });
    expect(dayNightAt(start + 29 * MIN, 'cycle').phase).toBe('dawn');
    expect(dayNightAt(start + 5 * MIN, 'cycle').nextChangeAt).toBe(start + 20 * MIN);
  });

  it('suit l’heure locale en mode « heure réelle »', () => {
    expect(dayNightAt(0, 'real', 14).phase).toBe('day');
    expect(dayNightAt(0, 'real', 20.5).phase).toBe('dusk');
    expect(dayNightAt(0, 'real', 23).phase).toBe('night');
    expect(dayNightAt(0, 'real', 3).phase).toBe('night');
    expect(dayNightAt(0, 'real', 6.5).phase).toBe('dawn');
    expect(dayNightAt(0, 'real', 23).nextChangeAt).toBe(7 * 3_600_000);
  });

  it('reste de jour quand la nuit est désactivée', () => {
    expect(dayNightAt(25 * MIN, 'off')).toMatchObject({ phase: 'day', darkness: 0 });
  });
});
