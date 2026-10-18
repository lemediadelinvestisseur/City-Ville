import type { BuildingCategory, Reward } from '@/core/types';

/**
 * Défis du jour : chaque jour (minuit, heure de l'appareil), trois tâches
 * tirées au sort parmi celles accessibles au joueur, avec une récompense
 * chacune et un bonus quand les trois sont réclamées.
 */

/** Niveau à partir duquel les défis du jour apparaissent (après le tout début du tutoriel). */
export const DAILY_MIN_LEVEL = 3;
export const DAILY_TASK_COUNT = 3;

/** Actions comptées par les défis (évènements « métier » du jeu). */
export type DailyTaskType =
  | 'harvest'
  | 'plant'
  | 'collectRent'
  | 'supply'
  | 'collectBusiness'
  | 'sendBoat'
  | 'unloadBoat'
  | 'helpNeighbor'
  | 'build';

export interface DailyTemplate {
  type: DailyTaskType;
  minLevel: number;
  /** Il faut au moins une construction terminée de cette catégorie. */
  needs?: BuildingCategory;
  /** Nombre d'actions demandé selon le niveau. */
  target: (level: number) => number;
}

const between = (min: number, max: number, value: number) => Math.max(min, Math.min(max, Math.round(value)));

export const DAILY_TEMPLATES: readonly DailyTemplate[] = [
  { type: 'harvest', minLevel: 1, target: (l) => between(4, 20, 3 + l / 2) },
  { type: 'plant', minLevel: 1, target: (l) => between(4, 20, 3 + l / 2) },
  { type: 'collectRent', minLevel: 1, target: (l) => between(6, 30, 5 + l) },
  { type: 'supply', minLevel: 3, needs: 'business', target: (l) => between(2, 10, 1 + l / 4) },
  { type: 'collectBusiness', minLevel: 3, needs: 'business', target: (l) => between(2, 10, 1 + l / 4) },
  { type: 'build', minLevel: 4, target: (l) => between(1, 3, l / 10) },
  { type: 'helpNeighbor', minLevel: 4, target: (l) => between(1, 3, l / 8) },
  { type: 'sendBoat', minLevel: 6, needs: 'port', target: (l) => between(1, 3, l / 10) },
  { type: 'unloadBoat', minLevel: 6, needs: 'port', target: (l) => between(1, 3, l / 10) },
];

/** Récompense d'un défi, fixée au moment du tirage. */
export function dailyTaskReward(level: number): Reward {
  return { coins: 60 + level * 30, xp: 5 + Math.floor(level / 2) };
}

/** Bonus des trois défis réclamés. */
export function dailyBonusReward(level: number): Reward {
  return { cash: level >= 15 ? 2 : 1, xp: 10 + level };
}
