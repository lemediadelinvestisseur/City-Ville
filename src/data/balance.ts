/**
 * Équilibrage global. La progression vise le niveau 30 en environ trois
 * semaines pour un joueur qui se connecte quelques fois par jour : la courbe
 * d'XP ci-dessous est calibrée par le simulateur (src/core/balance.test.ts).
 */

/** Taille de la carte en cases (carré). */
export const MAP_SIZE = 40;
/** Taille d'une zone d'agrandissement en cases. */
export const CHUNK_SIZE = 8;
/** Zones débloquées au départ (bloc central 3 × 3). */
export const STARTING_CHUNKS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 1],
  [3, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [1, 3],
  [2, 3],
  [3, 3],
];

export const START_RESOURCES = {
  coins: 3000,
  cash: 5,
  goods: 40,
  energy: 16,
} as const;

/** Une unité d'énergie toutes les N secondes. */
export const ENERGY_REGEN_SEC = 180;
export const ENERGY_PER_ACTION = 1;

export function energyMaxForLevel(level: number): number {
  return Math.min(60, 15 + level);
}

/** Capacité de stockage de marchandises sans bâtiment de stockage. */
export const BASE_GOODS_CAP = 100;
/** Plafond de population sans bâtiment communautaire. */
export const BASE_POP_CAP = 0;

export const MAX_LEVEL = 50;
/** Dernier niveau pour lequel du contenu est prévu. */
export const CONTENT_LEVEL = 30;

/**
 * XP cumulée pour atteindre chaque niveau (index = niveau). Calibrée avec le
 * joueur simulé (src/core/simulation.ts, 4 connexions par jour) : niveau 10
 * vers le 2e jour, niveau 20 vers le 9e, niveau 30 vers le 19e. Un vrai joueur,
 * moins assidu, y arrive en trois semaines environ. Au-delà de la table,
 * chaque niveau coûte 12 % de plus.
 */
const XP_TABLE: readonly number[] = [
  0, 0, 15, 55, 120, 210, 400, 570, 760, 1100, 1350, 1850, 2500, 3100, 3800, 4700, 5350, 6000, 6650, 7400, 8100, 8900,
  9700, 10500, 11350, 12200, 13100, 14050, 15000, 16000, 17000,
];

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const last = XP_TABLE.length - 1;
  if (level <= last) return XP_TABLE[level] ?? 0;
  const base = XP_TABLE[last] ?? 0;
  const step = base - (XP_TABLE[last - 1] ?? 0);
  let total = base;
  let inc = step;
  for (let l = last + 1; l <= level; l++) {
    inc = Math.round(inc * 1.12);
    total += inc;
  }
  return total;
}

export function levelUpReward(newLevel: number): { coins: number; cash: number } {
  return { coins: Math.round((100 * newLevel * (1 + newLevel / 10)) / 10) * 10, cash: newLevel % 5 === 0 ? 3 : 1 };
}

/** Bonus maximal cumulé des décorations (%). */
export const MAX_DECORATION_BONUS = 50;

/** Part du prix en pièces remboursée à la vente. */
export const SELL_REFUND_RATIO = 0.2;

/** Coût en cash pour terminer immédiatement une attente : croît moins vite que la durée. */
export function speedUpCashCost(remainingSec: number): number {
  const minutes = Math.max(0, remainingSec) / 60;
  return Math.max(1, Math.ceil(0.8 * Math.sqrt(minutes)));
}

/** Coût et niveau requis du n-ième agrandissement (n commence à 0). */
export function expansionPrice(n: number): { coins: number; level: number } {
  const coins = Math.round((2000 * Math.pow(1.7, n)) / 100) * 100;
  return { coins, level: Math.min(CONTENT_LEVEL, 3 + 2 * n) };
}
