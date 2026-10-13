/**
 * Types du modèle de jeu. Ce module (comme tout `src/core`) est pur :
 * aucune dépendance au rendu (Phaser) ni au DOM, ce qui le rend testable
 * et réutilisable côté serveur plus tard (validation anti-triche).
 */

export type Currency = 'coins' | 'cash' | 'goods' | 'energy';
export type RewardKind = Currency | 'xp';

export type Cost = Partial<Record<Currency, number>>;
export type Reward = Partial<Record<RewardKind, number>>;

export interface Size {
  w: number;
  d: number;
}

export interface Requirements {
  level?: number;
  population?: number;
}

export type BuildingCategory = 'house' | 'business' | 'community' | 'storage' | 'farm' | 'decoration' | 'road';

interface BaseDef {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  size: Size;
  cost: Cost;
  requires?: Requirements;
  /** XP gagnée à l'achat. */
  xp: number;
  /** Nombre de coups de marteau (1 énergie chacun) pour terminer le chantier. 0 = immédiat. */
  buildSteps: number;
  /** Peut être vendu en mode édition (défaut : oui). */
  sellable?: boolean;
  /** Visible dans le menu de construction (défaut : oui). */
  inShop?: boolean;
  /** Plusieurs placements d'affilée (routes, champs, décorations). */
  repeatPlacement?: boolean;
}

export interface HouseDef extends BaseDef {
  category: 'house';
  population: number;
  rent: { coins: number; xp: number; intervalSec: number };
}

export interface BusinessDef extends BaseDef {
  category: 'business';
  supplyGoods: number;
  customers: number;
  serveSec: number;
  payout: { coins: number; xp: number };
}

export interface CommunityDef extends BaseDef {
  category: 'community';
  popCap: number;
}

export interface StorageDef extends BaseDef {
  category: 'storage';
  goodsCap: number;
}

export interface FarmDef extends BaseDef {
  category: 'farm';
}

export interface DecorationDef extends BaseDef {
  category: 'decoration';
  /** Bonus (%) appliqué aux loyers et recettes des bâtiments dans le rayon (en cases). */
  bonus: { percent: number; radius: number };
}

export interface RoadDef extends BaseDef {
  category: 'road';
}

export type BuildingDef = HouseDef | BusinessDef | CommunityDef | StorageDef | FarmDef | DecorationDef | RoadDef;

export interface CropDef {
  id: string;
  name: string;
  growSec: number;
  cost: number;
  goods: number;
  xp: number;
  requires?: Requirements;
}

/** Une construction posée sur la carte. */
export interface Entity {
  id: number;
  defId: string;
  /** Case nord (x et y minimaux) de l'emprise. */
  x: number;
  y: number;
  /** Chantier terminé. */
  built: boolean;
  /** Coups de marteau déjà donnés. */
  buildProgress: number;
  /** Présente dès le début de la partie (ville de départ, forêt). */
  starter?: boolean;
  house?: { readyAt: number };
  /** `readyAt` nul : le commerce attend des marchandises. */
  business?: { readyAt: number | null; suppliedAt: number | null };
  farm?: { cropId: string | null; plantedAt: number; readyAt: number };
}

export interface QuestProgress {
  id: string;
  /** Compteur par tâche (les tâches « atteindre X » sont calculées à la volée). */
  counts: number[];
  startedAt: number;
}

export interface GameState {
  version: number;
  createdAt: number;
  cityName: string;
  coins: number;
  cash: number;
  xp: number;
  level: number;
  goods: number;
  energy: number;
  /** Instant de référence pour la régénération d'énergie. */
  energyUpdatedAt: number;
  entities: Entity[];
  nextEntityId: number;
  /** Zones débloquées, au format "cx,cy". */
  unlockedChunks: string[];
  expansionsBought: number;
  quests: {
    active: QuestProgress[];
    completed: string[];
  };
  /** Achats uniques déjà effectués (packs de démarrage…). */
  oneTimePurchases: string[];
  stats: Record<string, number>;
  tutorial: { introSeen: boolean };
}

export type FailReason =
  | 'notEnoughCoins'
  | 'notEnoughCash'
  | 'notEnoughGoods'
  | 'notEnoughEnergy'
  | 'levelLocked'
  | 'populationLocked'
  | 'populationCap'
  | 'blocked'
  | 'outOfBounds'
  | 'locked'
  | 'notReady'
  | 'storageFull'
  | 'invalid'
  | 'notSellable'
  | 'alreadyOwned';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: FailReason; missing?: number };

/** Action principale déclenchée par un toucher sur une construction. */
export type PrimaryAction =
  | { type: 'build' }
  | { type: 'collectRent' }
  | { type: 'waitRent'; readyAt: number }
  | { type: 'plant' }
  | { type: 'waitCrop'; readyAt: number }
  | { type: 'harvest' }
  | { type: 'supply' }
  | { type: 'waitCustomers'; readyAt: number }
  | { type: 'collectBusiness' }
  | { type: 'info' };

/** Filtre sur un type de construction : identifiant précis ou catégorie. */
export interface DefFilter {
  defId?: string;
  category?: BuildingCategory;
}

export type QuestTask =
  | ({ type: 'place' | 'build' | 'supply' | 'collectBusiness' | 'collectRent'; count: number } & DefFilter)
  | { type: 'plant' | 'harvest'; count: number; cropId?: string }
  | { type: 'expand'; count: number }
  | { type: 'population' | 'level'; target: number };

export interface QuestDef {
  id: string;
  title: string;
  /** Texte d'introduction de la conseillère. */
  intro: string;
  /** Libellé de chaque tâche (même ordre que `tasks`). */
  labels: string[];
  tasks: QuestTask[];
  reward: Reward;
  requires?: { quests?: string[]; level?: number };
  /** Icône affichée dans la colonne des objectifs. */
  icon: string;
}

/** Évènements « métier » utilisés par les objectifs et les statistiques. */
export type GameplayEvent =
  | { type: 'place'; defId: string; category: BuildingCategory }
  | { type: 'build'; defId: string; category: BuildingCategory }
  | { type: 'collectRent'; defId: string }
  | { type: 'plant'; cropId: string }
  | { type: 'harvest'; cropId: string }
  | { type: 'supply'; defId: string }
  | { type: 'collectBusiness'; defId: string }
  | { type: 'expand' };
