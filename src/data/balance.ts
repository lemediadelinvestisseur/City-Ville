/**
 * Équilibrage global. Les durées sont volontairement courtes pour le prototype
 * afin de pouvoir tester toute la boucle de jeu en quelques minutes.
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
  energy: 12,
} as const;

/** Une unité d'énergie toutes les N secondes. */
export const ENERGY_REGEN_SEC = 120;
export const ENERGY_PER_ACTION = 1;

export function energyMaxForLevel(level: number): number {
  return Math.min(30, 12 + (level - 1));
}

/** Capacité de stockage de marchandises sans bâtiment de stockage. */
export const BASE_GOODS_CAP = 100;
/** Plafond de population sans bâtiment communautaire. */
export const BASE_POP_CAP = 0;

/** XP cumulée nécessaire pour atteindre le niveau `level`. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const raw = 15 * Math.pow(level - 1, 1.9);
  return Math.round(raw / 5) * 5;
}

export const MAX_LEVEL = 50;

export function levelUpReward(newLevel: number): { coins: number; cash: number } {
  return { coins: 100 * newLevel, cash: 1 };
}

/** Bonus maximal cumulé des décorations (%). */
export const MAX_DECORATION_BONUS = 50;

/** Part du prix en pièces remboursée à la vente. */
export const SELL_REFUND_RATIO = 0.2;

/** Accélération : 1 cash par tranche de 10 minutes restantes (minimum 1). */
export const SPEEDUP_SEC_PER_CASH = 600;

/** Coût et niveau requis du n-ième agrandissement (n commence à 0). */
export function expansionPrice(n: number): { coins: number; level: number } {
  const coins = Math.round((2000 * Math.pow(2.2, n)) / 100) * 100;
  return { coins, level: Math.min(MAX_LEVEL, 3 + 2 * n) };
}
