/**
 * Équilibrage global. La progression vise le niveau 30 en environ trois
 * semaines pour un joueur qui se connecte quelques fois par jour : la courbe
 * d'XP ci-dessous est calibrée par le simulateur (src/core/balance.test.ts).
 */

/** Taille de la carte en cases : deux rives séparées par un bras de mer. */
export const MAP_W = 128;
export const MAP_H = 96;
/** Largeur du bras de mer (en cases). */
export const CHANNEL_WIDTH = 4;
/** Premières zones de la rive est (colonne de zones) et niveau pour y accéder. */
export const EAST_CHUNK_X = 4;
export const EAST_SHORE_LEVEL = 15;
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
 * vers le 2e jour, niveau 20 vers le 11e, niveau 30 vers le 21e. Un vrai joueur,
 * moins assidu, y arrive en trois semaines environ. Au-delà de la table,
 * chaque niveau coûte 12 % de plus.
 */
const XP_TABLE: readonly number[] = [
  0, 0, 15, 55, 120, 210, 400, 570, 760, 1100, 1350, 1850, 2500, 3100, 3800, 4700, 5450, 6250, 7050, 7900, 8800, 9700,
  10650, 11650, 12700, 13750, 14850, 16000, 17150, 18350, 19600,
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

/** Récompense de celui qui aide un voisin (une fois par voisin et par jour). */
export function helpGivenReward(level: number): { coins: number; xp: number } {
  return { coins: 20 + level * 10, xp: 2 };
}

/** Récompense par coup de main reçu d'un voisin. */
export function helpReceivedReward(level: number): { coins: number; xp: number } {
  return { coins: 30 + level * 15, xp: 1 };
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
export function expansionPrice(distance: number, bought: number): { coins: number; level: number } {
  // Plus la zone est loin de la ville de départ, plus elle est chère et tardive ;
  // chaque achat renchérit aussi un peu les suivants.
  const d = Math.max(1, distance);
  const coins = Math.round((1500 * Math.pow(1.45, d - 1) * (1 + 0.08 * bought)) / 100) * 100;
  return { coins, level: Math.min(CONTENT_LEVEL, 1 + 2 * d + Math.floor(bought / 4)) };
}

/** Distance (en zones) entre une zone et la ville de départ. */
export function chunkDistance(cx: number, cy: number): number {
  let best = Infinity;
  for (const [sx, sy] of STARTING_CHUNKS) best = Math.min(best, Math.max(Math.abs(cx - sx), Math.abs(cy - sy)));
  return best;
}
