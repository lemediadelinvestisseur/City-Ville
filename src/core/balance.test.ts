import { describe, expect, it } from 'vitest';
import { CONTENT_LEVEL } from '@/data/balance';
import { simulate } from './simulation';

describe('équilibrage (joueur simulé, 4 connexions par jour)', () => {
  const result = simulate({ days: 25 });
  const day = (level: number) => (result.levelAtHour[level] ?? Infinity) / 24;

  it('fait découvrir le jeu rapidement', () => {
    expect(day(5)).toBeLessThan(0.5);
    expect(day(10)).toBeGreaterThan(1);
    expect(day(10)).toBeLessThan(4);
  });

  it(`atteint le niveau ${CONTENT_LEVEL} en deux à trois semaines`, () => {
    expect(day(20)).toBeGreaterThan(6);
    expect(day(CONTENT_LEVEL)).toBeGreaterThan(14);
    expect(day(CONTENT_LEVEL)).toBeLessThan(24);
  });

  it('ralentit au fil des niveaux', () => {
    expect(day(30) - day(25)).toBeGreaterThan(day(10) - day(5));
  });
});
