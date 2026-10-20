/**
 * Types du modèle de jeu. Ce module (comme tout `src/core`) est pur :
 * aucune dépendance au rendu (Phaser) ni au DOM, ce qui le rend testable
 * et réutilisable côté serveur plus tard (validation anti-triche).
 */

import type { ItemBag } from '@/data/items';

export type { ItemBag };

export type Currency = 'coins' | 'cash' | 'energy';
export type RewardKind = Currency | 'xp';

export type Cost = Partial<Record<Currency, number>>;
/** Gain : monnaies, XP et éventuellement des produits. */
export type Reward = Partial<Record<RewardKind, number>> & { items?: ItemBag };

export interface Size {
  w: number;
  d: number;
}

export interface Requirements {
  level?: number;
  population?: number;
}

export type BuildingCategory =
  | 'house'
  | 'business'
  | 'community'
  | 'storage'
  | 'farm'
  | 'port'
  | 'ranch'
  | 'workshop'
  | 'station'
  | 'decoration'
  | 'road'
  | 'rail';

/** Nature du sol d'une case. */
export type Terrain = 'grass' | 'sand' | 'water' | 'rock';

interface BaseDef {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  size: Size;
  cost: Cost;
  requires?: Requirements;
  /** XP gagnée quand la construction est terminée (inaugurée). */
  xp: number;
  /** Durée du chantier en secondes. 0 = construit immédiatement. */
  buildSec: number;
  /** Peut être vendu en mode édition (défaut : oui). */
  sellable?: boolean;
  /** Visible dans le menu de construction (défaut : oui). */
  inShop?: boolean;
  /** Plusieurs placements d'affilée (routes, champs, décorations). */
  repeatPlacement?: boolean;
  /**
   * 'shore' : doit toucher l'eau (ports, phare) ; 'bridge' : enjambe le bras de mer d'une rive à l'autre.
   * 'rail' : doit longer la voie ferrée (gare). Par défaut : terre ferme.
   */
  placement?: 'land' | 'shore' | 'bridge' | 'rail';
}

export interface HouseDef extends BaseDef {
  category: 'house';
  population: number;
  rent: { coins: number; xp: number; intervalSec: number };
}

export interface BusinessDef extends BaseDef {
  category: 'business';
  /** Produits livrés à chaque approvisionnement. */
  inputs: ItemBag;
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

/** Port de pêche : se pose au bord de l'eau et envoie un bateau en expédition. */
export interface PortDef extends BaseDef {
  category: 'port';
  /** Niveau du bateau : détermine les expéditions possibles. */
  boatTier: number;
}

/** Élevage (on nourrit les bêtes) ou atelier (on transforme des produits) : productions de src/data/recipes.ts. */
export interface ProducerDef extends BaseDef {
  category: 'ranch' | 'workshop';
}

/** Gare : se pose le long de la voie ferrée et expédie des marchandises par le train. */
export interface StationDef extends BaseDef {
  category: 'station';
}

/** Voie ferrée (posée par la carte, ni achetée ni vendue). */
export interface RailDef extends BaseDef {
  category: 'rail';
}

export interface DecorationDef extends BaseDef {
  category: 'decoration';
  /** Bonus (%) appliqué aux loyers et recettes des bâtiments dans le rayon (en cases). */
  bonus: { percent: number; radius: number };
}

export interface RoadDef extends BaseDef {
  category: 'road';
}

export type BuildingDef =
  | HouseDef
  | BusinessDef
  | CommunityDef
  | StorageDef
  | FarmDef
  | PortDef
  | ProducerDef
  | StationDef
  | DecorationDef
  | RoadDef
  | RailDef;

export interface CropDef {
  id: string;
  name: string;
  growSec: number;
  cost: number;
  /** Produits récoltés (le produit porte l'identifiant de la culture). */
  amount: number;
  xp: number;
  requires?: Requirements;
}

/** Expédition de pêche (même principe qu'une culture, pour les ports). */
export interface TripDef {
  id: string;
  name: string;
  durationSec: number;
  /** Coût en pièces (carburant, appâts). */
  cost: number;
  /** Poisson rapporté. */
  amount: number;
  xp: number;
  /** Niveau de bateau minimal. */
  boatTier: number;
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
  /** Chantier en cours : début et fin (horodatages). */
  construction?: { startedAt: number; endsAt: number };
  /** Présente dès le début de la partie (ville de départ, forêt). */
  starter?: boolean;
  /** Améliorations obtenues (0 à 3 étoiles). */
  stars?: number;
  /** Amélioration en cours vers l'étoile suivante : début et fin (horodatages). */
  upgrade?: { startedAt: number; endsAt: number };
  house?: { readyAt: number };
  /** `readyAt` nul : le commerce attend des marchandises. */
  business?: { readyAt: number | null; suppliedAt: number | null };
  farm?: { cropId: string | null; plantedAt: number; readyAt: number };
  /** `tripId` nul : le bateau est à quai. */
  port?: { tripId: string | null; startedAt: number; readyAt: number };
  /** `recipeId` nul : rien en cours (élevage, atelier). */
  producer?: { recipeId: string | null; startedAt: number; readyAt: number };
  /** `reward` nul : le train attend en gare ; sinon il livre une commande et revient avec la récompense. */
  station?: { reward: Reward | null; startedAt: number; readyAt: number };
}

/** Une commande : des produits à livrer contre une récompense. */
export interface Order {
  items: ItemBag;
  reward: Reward;
  done: boolean;
  /** Grosse commande livrée par le train (la récompense arrive à son retour). */
  train: boolean;
}

export interface OrdersState {
  /** Jour des commandes (AAAA-MM-JJ, heure locale) ; vide tant qu'elles ne sont pas débloquées. */
  day: string;
  list: Order[];
  bonus: Reward;
  bonusClaimed: boolean;
}

/** Visiteur de passage : il demande un produit et repart au bout de quelques heures. */
export interface Visitor {
  kind: 'tourist' | 'chef' | 'trucker' | 'grandma';
  item: string;
  qty: number;
  reward: Reward;
  arrivedAt: number;
  leavesAt: number;
}

export interface QuestProgress {
  id: string;
  /** Compteur par tâche (les tâches « atteindre X » sont calculées à la volée). */
  counts: number[];
  startedAt: number;
}

/** Un défi du jour tiré au sort. */
export interface DailyTask {
  type: string;
  target: number;
  count: number;
  reward: Reward;
  claimed: boolean;
}

export interface DailyState {
  /** Jour des défis (AAAA-MM-JJ, heure locale de l'appareil) ; vide tant qu'ils ne sont pas débloqués. */
  day: string;
  tasks: DailyTask[];
  bonus: Reward;
  bonusClaimed: boolean;
}

export interface GameState {
  version: number;
  createdAt: number;
  cityName: string;
  coins: number;
  cash: number;
  xp: number;
  level: number;
  /** Produits dans l'entrepôt. */
  inventory: ItemBag;
  energy: number;
  /** Ouvriers : nombre de chantiers (constructions, améliorations) menés en même temps. */
  workers: number;
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
  daily: DailyState;
  /** Récompense de connexion : dernier jour réclamé (AAAA-MM-JJ, heure locale) et série en cours. */
  loginStreak: { lastDay: string | null; streak: number };
  /** Dernier repas servi à la ville : jusqu'à quand elle est rassasiée et combien de familles d'aliments. */
  meals: { lastAt: number; fedUntil: number; variety: number };
  orders: OrdersState;
  /** Coffre de la mairie : il se remplit depuis `since`. */
  chest: { since: number };
  visitor: Visitor | null;
  nextVisitorAt: number;
  /** Roue de la chance : tours utilisés et tours offerts (coups de main) pour le jour donné. */
  wheel: { day: string; used: number; extra: number };
}

export type FailReason =
  | 'notEnoughCoins'
  | 'notEnoughCash'
  | 'notEnoughEnergy'
  | 'levelLocked'
  | 'populationLocked'
  | 'populationCap'
  | 'blocked'
  | 'outOfBounds'
  | 'locked'
  | 'notReady'
  | 'storageFull'
  | 'limitReached'
  | 'maxStars'
  | 'invalid'
  | 'notSellable'
  | 'alreadyOwned'
  | 'energyFull'
  | 'onWater'
  | 'needsWater'
  | 'bridgeSpan'
  | 'needsBridge'
  | 'onMountain'
  | 'needsRoad'
  | 'needsRail'
  | 'noWorker'
  | 'notEnoughItems'
  | 'noFood'
  | 'empty';

export type Result<T = object> =
  ({ ok: true } & T) | { ok: false; reason: FailReason; missing?: number; /** Produit qui manque. */ item?: string };

/** Action principale déclenchée par un toucher sur une construction. */
export type PrimaryAction =
  | { type: 'waitBuild'; readyAt: number }
  | { type: 'finishBuild' }
  | { type: 'waitUpgrade'; readyAt: number }
  | { type: 'finishUpgrade' }
  | { type: 'collectRent' }
  | { type: 'waitRent'; readyAt: number }
  | { type: 'plant' }
  | { type: 'waitCrop'; readyAt: number }
  | { type: 'harvest' }
  | { type: 'supply' }
  | { type: 'waitCustomers'; readyAt: number }
  | { type: 'collectBusiness' }
  | { type: 'sendBoat' }
  | { type: 'waitBoat'; readyAt: number }
  | { type: 'unloadBoat' }
  | { type: 'startProduction' }
  | { type: 'waitProduction'; readyAt: number }
  | { type: 'collectProduction' }
  | { type: 'townHall' }
  | { type: 'sendTrain' }
  | { type: 'waitTrain'; readyAt: number }
  | { type: 'unloadTrain' }
  | { type: 'needsRoad' }
  | { type: 'info' };

/** Filtre sur un type de construction : identifiant précis ou catégorie. */
export interface DefFilter {
  defId?: string;
  category?: BuildingCategory;
}

export type QuestTask =
  | ({ type: 'place' | 'build' | 'supply' | 'collectBusiness' | 'collectRent'; count: number } & DefFilter)
  | { type: 'plant' | 'harvest'; count: number; cropId?: string }
  | { type: 'sendBoat' | 'unloadBoat'; count: number }
  | { type: 'sendTrain' | 'unloadTrain' | 'feedCity' | 'deliverOrder'; count: number }
  | { type: 'produce' | 'collectProduction'; count: number; recipeId?: string }
  | { type: 'expand'; count: number }
  | ({ type: 'upgrade'; count: number } & DefFilter)
  | { type: 'helpNeighbor' | 'visitNeighbor' | 'marketSell' | 'marketBuy'; count: number }
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
  | { type: 'sendBoat'; tripId: string }
  | { type: 'unloadBoat'; tripId: string }
  | { type: 'sendTrain' }
  | { type: 'unloadTrain' }
  | { type: 'produce'; recipeId: string }
  | { type: 'collectProduction'; recipeId: string }
  | { type: 'feedCity'; variety: number }
  | { type: 'deliverOrder'; train: boolean }
  | { type: 'sellItems'; item: string; qty: number }
  | { type: 'visitor' }
  | { type: 'spin' }
  | { type: 'collectChest' }
  | { type: 'expand' }
  | { type: 'upgrade'; defId: string; category: BuildingCategory; stars: number }
  | { type: 'helpNeighbor' }
  | { type: 'visitNeighbor' }
  | { type: 'marketSell' }
  | { type: 'marketBuy' }
  | { type: 'loginReward' };
