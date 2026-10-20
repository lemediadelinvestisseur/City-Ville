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
 * joueur simulé (src/core/simulation.ts, 4 connexions par jour, un seul ouvrier) : niveau 10
 * vers le 3e jour, niveau 20 vers le 12e, niveau 30 vers le 22e. Un vrai joueur,
 * moins assidu, y arrive en trois semaines environ. Au-delà de la table,
 * chaque niveau coûte 12 % de plus.
 */
const XP_TABLE: readonly number[] = [
  0, 0, 15, 55, 120, 210, 400, 570, 760, 1000, 1250, 1600, 2200, 2950, 4000, 5300, 6750, 8150, 9650, 11050, 12750,
  14600, 16900, 19150, 21400, 23800, 26300, 29000, 31800, 35050, 38850,
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

/**
 * Améliorations ★ des bâtiments. Chaque étoile coûte une fraction du prix
 * d'achat : à gain égal, améliorer revient un peu moins cher que racheter le
 * même bâtiment (sans prendre de place ni compter dans la limite).
 */
export const UPGRADE = {
  maxStars: 3,
  /** Niveau du joueur requis pour la 1re, 2e et 3e étoile. */
  levels: [6, 12, 20],
  /** Part du prix d'achat (en pièces) pour la 1re, 2e et 3e étoile. */
  costRatio: [0.2, 0.3, 0.4],
  /** Durée du chantier : part de la durée de construction (au moins une minute). */
  durationRatio: [0.4, 0.6, 0.8],
  minDurationSec: 60,
} as const;

/** Gain par étoile, selon la catégorie (+25 % = 0.25). */
export const UPGRADE_GAIN = {
  /** Habitants et loyer. */
  house: 0.25,
  /** Recette d'un commerce. */
  business: 0.3,
  /** Plafond de population d'un service. */
  community: 0.2,
  /** Capacité d'un entrepôt. */
  storage: 0.3,
  /** Réduction de la durée des expéditions de pêche. */
  port: 0.15,
} as const;

export type UpgradableCategory = keyof typeof UPGRADE_GAIN;

/** Coût de la prochaine étoile (`stars` : étoiles déjà obtenues). */
export function upgradeCost(price: number, stars: number): { coins: number; goods: number } {
  const ratio = UPGRADE.costRatio[stars] ?? 0;
  const coins = Math.round((price * ratio) / 10) * 10;
  return { coins, goods: Math.min(300, Math.max(5, Math.round(coins / 100))) };
}

/**
 * Nombre maximal d'exemplaires d'un même bâtiment, selon le niveau du joueur
 * (null : illimité). Pousse à diversifier sa ville et à améliorer ses bâtiments.
 */
export function buildLimit(category: string, level: number): number | null {
  switch (category) {
    case 'house':
      return 4 + Math.floor(level / 3);
    case 'business':
      return 2 + Math.floor(level / 8);
    case 'community':
      return 1 + Math.floor(level / 10);
    case 'storage':
      return 1 + Math.floor(level / 6);
    case 'port':
      return 1 + Math.floor(level / 10);
    case 'farm':
      return 8 + level;
    default:
      return null;
  }
}

/**
 * Récompense de connexion quotidienne : une série de 7 jours qui repart au
 * jour 1 si l'on manque une journée. Les pièces suivent le niveau.
 */
export const LOGIN_STREAK_DAYS = 7;

export function loginReward(day: number, level: number): { coins: number; xp: number; cash?: number } {
  const d = Math.min(Math.max(1, day), LOGIN_STREAK_DAYS);
  const coins = Math.round(((100 + level * 40) * (1 + (d - 1) * 0.5)) / 10) * 10;
  const xp = 5 + d * 5;
  return d === LOGIN_STREAK_DAYS ? { coins, xp, cash: 3 } : { coins, xp };
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
