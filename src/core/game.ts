import {
  BASE_GOODS_CAP,
  BASE_POP_CAP,
  ENERGY_PER_ACTION,
  EAST_SHORE_LEVEL,
  chunkDistance,
  ENERGY_REGEN_SEC,
  MAX_DECORATION_BONUS,
  MAX_LEVEL,
  SELL_REFUND_RATIO,
  UPGRADE,
  UPGRADE_GAIN,
  buildLimit,
  upgradeCost,
  type UpgradableCategory,
  energyMaxForLevel,
  expansionPrice,
  loginReward,
  LOGIN_STREAK_DAYS,
  helpGivenReward,
  helpReceivedReward,
  levelUpReward,
  speedUpCashCost,
  xpForLevel,
} from '@/data/balance';
import { BUILDINGS, getBuildingDef, needsRoad } from '@/data/buildings';
import { CROPS, SHIPMENTS, TRIPS, getCropDef, getShipmentDef, getTripDef } from '@/data/crops';
import { DAILY_MIN_LEVEL } from '@/data/daily';
import { MARKET } from '@/data/market';
import { findCashOffer, findStoreProduct } from '@/data/products';
import { QUESTS, getQuestDef } from '@/data/quests';
import { sceneryOf } from '@/data/scenery';
import { chunkHasLand, chunkHasMountain, isEastChunk, isWater, terrainAt } from '@/data/terrain';
import { dailyMatches, drawDaily, localDay, nextLocalMidnight } from './daily';
import { Emitter } from './emitter';
import { CHUNKS_X, CHUNKS_Y, OccupancyGrid, chunkKey, chunkOf, footprintDistance, inBounds } from './grid';
import { initBuiltState } from './newGame';
import type {
  BuildingDef,
  Cost,
  Currency,
  Entity,
  FailReason,
  GameState,
  GameplayEvent,
  PrimaryAction,
  QuestDef,
  QuestProgress,
  QuestTask,
  Requirements,
  Result,
  Reward,
} from './types';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface GameEvents {
  /** Un changement quelconque (sauvegarde, rafraîchissement de l'interface). */
  change: undefined;
  entityAdded: Entity;
  entityRemoved: Entity;
  entityUpdated: Entity;
  entityMoved: Entity;
  reward: { entityId: number | null; reward: Reward };
  levelUp: { level: number; reward: Reward; unlocked: string[] };
  constructionComplete: Entity;
  questStarted: { questId: string };
  questProgress: { questId: string };
  questCompleted: { questId: string; reward: Reward };
  expanded: { cx: number; cy: number };
  upgradeStarted: Entity;
  upgradeComplete: Entity;
  gameplay: GameplayEvent;
  /** Des attentes viennent de se terminer (cultures mûres, chantiers finis…). */
  ready: { items: ReadyItem[] };
  /** Nouveaux défis du jour tirés. */
  dailyRefreshed: undefined;
  /** Un défi du jour vient d'être rempli (récompense à réclamer). */
  dailyCompleted: { index: number };
  dailyClaimed: { index: number | 'bonus'; reward: Reward };
}

/** Ce qui peut devenir « prêt » avec le temps (notifications, messages en jeu). */
export type ReadyKind = 'build' | 'crop' | 'boat' | 'train' | 'business';

export interface ReadyItem {
  entityId: number;
  kind: ReadyKind;
  at: number;
}

export interface DailyInfo {
  available: boolean;
  tasks: Array<{ type: string; target: number; count: number; reward: Reward; claimed: boolean; done: boolean }>;
  bonus: Reward;
  bonusClaimed: boolean;
  /** Défis remplis dont la récompense n'est pas encore réclamée (bonus compris). */
  claimable: number;
  resetsAt: number;
}

/** Prime en pièces versée à l'inauguration d'un bâtiment. */
export function inaugurationBonus(def: BuildingDef): number {
  return Math.round((def.cost.coins ?? 0) * 0.05);
}

/** État de la récompense quotidienne pour un jour donné. */
export interface LoginRewardStatus {
  /** La récompense du jour peut être réclamée. */
  available: boolean;
  /** Jour de la série (1 à 7) réclamable aujourd'hui, ou déjà réclamé. */
  day: number;
  reward: Reward;
}

/** Jour précédent (AAAA-MM-JJ), calculé en UTC pour ignorer les changements d'heure. */
export function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** État de l'amélioration d'une construction. */
export type UpgradeInfo =
  /** Ce bâtiment ne s'améliore pas (route, décoration, champ…). */
  | { status: 'none' }
  | { status: 'max'; stars: number }
  | { status: 'working'; stars: number; endsAt: number }
  | {
      status: 'available';
      stars: number;
      cost: { coins: number; goods: number };
      level: number;
      durationSec: number;
      reason: FailReason | null;
      missing?: number;
    };

const isUpgradable = (category: string): category is UpgradableCategory => category in UPGRADE_GAIN;

export interface Derived {
  population: number;
  /** Population en comptant les habitations en chantier. */
  populationProjected: number;
  popCap: number;
  goodsCap: number;
  energyMax: number;
  /** Chantiers en cours (constructions et améliorations) : un ouvrier chacun. */
  busyWorkers: number;
  /** Fin du chantier le plus proche, ou null. */
  nextWorkerFreeAt: number | null;
}

/** Ouvriers : occupés (chantiers en cours) sur le total. */
export interface WorkersInfo {
  busy: number;
  total: number;
  /** Fin du chantier le plus proche (un ouvrier se libère), ou null. */
  nextFreeAt: number | null;
}

export type ExpansionInfo =
  | { status: 'unlocked' }
  | { status: 'unavailable' }
  | { status: 'purchasable'; coins: number; level: number; reason: FailReason | null };

const fail = (reason: FailReason, missing?: number): { ok: false; reason: FailReason; missing?: number } =>
  missing === undefined ? { ok: false, reason } : { ok: false, reason, missing };

const CURRENCY_REASON: Record<Currency, FailReason> = {
  coins: 'notEnoughCoins',
  cash: 'notEnoughCash',
  goods: 'notEnoughGoods',
  energy: 'notEnoughEnergy',
};

/**
 * Le moteur de règles. Toutes les modifications de l'état passent par ici,
 * ce qui garantit la cohérence et permet d'émettre les évènements utiles au rendu.
 */
export class Game {
  readonly events = new Emitter<GameEvents>();
  private readonly grid = new OccupancyGrid();
  private readonly byId = new Map<number, Entity>();
  private unlocked = new Set<string>();
  private derivedCache: Derived | null = null;
  /** Dernier contrôle des attentes terminées (voir `tick`). */
  private lastReadyCheck: number;

  constructor(
    public readonly state: GameState,
    private readonly clock: Clock = systemClock,
  ) {
    this.lastReadyCheck = clock.now();
    this.rebuildIndexes();
    this.regenEnergy();
    this.syncQuests();
    this.refreshDaily();
  }

  now(): number {
    return this.clock.now();
  }

  // ———————————————————————————— Index ————————————————————————————

  private rebuildIndexes(): void {
    this.grid.clear();
    this.byId.clear();
    for (const entity of this.state.entities) {
      this.byId.set(entity.id, entity);
      this.grid.fill(entity.x, entity.y, getBuildingDef(entity.defId).size, entity.id);
    }
    this.unlocked = new Set(this.state.unlockedChunks);
    this.derivedCache = null;
  }

  // ———————————————————————————— Lecture ————————————————————————————

  derived(): Derived {
    if (this.derivedCache) return this.derivedCache;
    let population = 0;
    let populationProjected = 0;
    let popCap = BASE_POP_CAP;
    let goodsCap = BASE_GOODS_CAP;
    let busyWorkers = 0;
    let nextWorkerFreeAt: number | null = null;
    for (const entity of this.state.entities) {
      const def = getBuildingDef(entity.defId);
      const worksEndAt = !entity.built ? entity.construction?.endsAt : entity.upgrade?.endsAt;
      if (worksEndAt !== undefined) {
        busyWorkers++;
        if (nextWorkerFreeAt === null || worksEndAt < nextWorkerFreeAt) nextWorkerFreeAt = worksEndAt;
      }
      // Un bâtiment sans route ne fonctionne pas (ni habitants, ni service, ni stockage).
      const active = entity.built && this.isConnected(entity);
      if (def.category === 'house') {
        // Une amélioration en cours compte déjà dans la population prévue.
        populationProjected += this.housePopulation(entity, entity.upgrade ? 1 : 0);
        if (active) population += this.housePopulation(entity);
      } else if (active && def.category === 'community') {
        popCap += Math.round(def.popCap * this.upgradeFactor(entity));
      } else if (active && def.category === 'storage') {
        goodsCap += Math.round(def.goodsCap * this.upgradeFactor(entity));
      }
    }
    this.derivedCache = {
      population,
      populationProjected,
      popCap,
      goodsCap,
      energyMax: energyMaxForLevel(this.state.level),
      busyWorkers,
      nextWorkerFreeAt,
    };
    return this.derivedCache;
  }

  /** Prochaine unité d'énergie (timestamp) ou null si l'énergie est pleine. */
  nextEnergyAt(): number | null {
    if (this.state.energy >= this.derived().energyMax) return null;
    return this.state.energyUpdatedAt + ENERGY_REGEN_SEC * 1000;
  }

  xpProgress(): { level: number; current: number; needed: number; ratio: number } {
    const { level, xp } = this.state;
    if (level >= MAX_LEVEL) return { level, current: 0, needed: 0, ratio: 1 };
    const base = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const current = xp - base;
    const needed = next - base;
    return { level, current, needed, ratio: Math.max(0, Math.min(1, current / needed)) };
  }

  getEntity(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  entityAt(x: number, y: number): Entity | undefined {
    const id = this.grid.get(x, y);
    return id ? this.byId.get(id) : undefined;
  }

  isRoad(x: number, y: number): boolean {
    const entity = this.entityAt(x, y);
    return entity !== undefined && (entity.defId === 'road' || entity.defId === 'bridge');
  }

  isRail(x: number, y: number): boolean {
    return this.entityAt(x, y)?.defId === 'rail';
  }

  /** Vrai si une case voisine (en croix) de l'emprise vérifie `test`. */
  private touches(x: number, y: number, w: number, d: number, test: (x: number, y: number) => boolean): boolean {
    for (let i = 0; i < w; i++) if (test(x + i, y - 1) || test(x + i, y + d)) return true;
    for (let j = 0; j < d; j++) if (test(x - 1, y + j) || test(x + w, y + j)) return true;
    return false;
  }

  /**
   * Le bâtiment est-il relié à une route (une case de route contre son emprise) ?
   * Toujours vrai pour ce qui n'en a pas besoin (champs, décorations…) et pour la
   * ville de départ, raccordée d'office.
   */
  isConnected(entity: Entity): boolean {
    const def = getBuildingDef(entity.defId);
    if (!needsRoad(def) || entity.starter) return true;
    return this.touches(entity.x, entity.y, def.size.w, def.size.d, (x, y) => this.isRoad(x, y));
  }

  /** Une construction de ce type serait-elle reliée à une route à cet endroit ? */
  wouldConnect(def: BuildingDef, x: number, y: number): boolean {
    return !needsRoad(def) || this.touches(x, y, def.size.w, def.size.d, (rx, ry) => this.isRoad(rx, ry));
  }

  workersInfo(): WorkersInfo {
    const { busyWorkers, nextWorkerFreeAt } = this.derived();
    return { busy: busyWorkers, total: this.state.workers, nextFreeAt: nextWorkerFreeAt };
  }

  private hasFreeWorker(): boolean {
    const { busy, total } = this.workersInfo();
    return busy < total;
  }

  /** Un pont terminé relie-t-il les deux rives ? */
  hasBridge(): boolean {
    return this.state.entities.some((e) => e.built && getBuildingDef(e.defId).placement === 'bridge');
  }

  isChunkUnlocked(cx: number, cy: number): boolean {
    return this.unlocked.has(chunkKey(cx, cy));
  }

  isTileUnlocked(x: number, y: number): boolean {
    if (!inBounds(x, y)) return false;
    const { cx, cy } = chunkOf(x, y);
    return this.isChunkUnlocked(cx, cy);
  }

  canAfford(cost: Cost): boolean {
    return this.missingFor(cost) === null;
  }

  private missingFor(cost: Cost): { currency: Currency; missing: number } | null {
    for (const currency of ['coins', 'cash', 'goods', 'energy'] as const) {
      const amount = cost[currency] ?? 0;
      if (amount > this.state[currency]) return { currency, missing: amount - this.state[currency] };
    }
    return null;
  }

  checkRequirements(requires: Requirements | undefined): FailReason | null {
    if (!requires) return null;
    if (requires.level !== undefined && this.state.level < requires.level) return 'levelLocked';
    if (requires.population !== undefined && this.derived().population < requires.population) {
      return 'populationLocked';
    }
    return null;
  }

  /** Vérifie l'emplacement uniquement (pas le coût). */
  checkPlacement(def: BuildingDef, x: number, y: number, ignoreId = 0): FailReason | null {
    if (!inBounds(x, y) || !inBounds(x + def.size.w - 1, y + def.size.d - 1)) return 'outOfBounds';
    if (def.placement === 'bridge') return this.checkBridge(def, x, y, ignoreId);
    for (let dy = 0; dy < def.size.d; dy++) {
      for (let dx = 0; dx < def.size.w; dx++) {
        const terrain = terrainAt(x + dx, y + dy);
        if (terrain === 'water') return 'onWater';
        if (terrain === 'rock') return 'onMountain';
        if (!this.isTileUnlocked(x + dx, y + dy)) return 'locked';
      }
    }
    if (!this.grid.isFree(x, y, def.size, ignoreId)) return 'blocked';
    if (def.placement === 'shore' && !this.touchesWater(x, y, def.size.w, def.size.d)) return 'needsWater';
    if (def.placement === 'rail' && !this.touches(x, y, def.size.w, def.size.d, (rx, ry) => this.isRail(rx, ry))) {
      return 'needsRail';
    }
    return null;
  }

  /**
   * Un pont (emprise orientée est-ouest) recouvre uniquement de l'eau et touche
   * la terre à ses deux extrémités ; seule la rive ouest doit être débloquée.
   */
  private checkBridge(def: BuildingDef, x: number, y: number, ignoreId: number): FailReason | null {
    for (let dy = 0; dy < def.size.d; dy++) {
      for (let dx = 0; dx < def.size.w; dx++) if (!isWater(x + dx, y + dy)) return 'bridgeSpan';
      if (isWater(x - 1, y + dy) || isWater(x + def.size.w, y + dy)) return 'bridgeSpan';
      if (!this.isTileUnlocked(x - 1, y + dy)) return 'locked';
    }
    if (!this.grid.isFree(x, y, def.size, ignoreId)) return 'blocked';
    return null;
  }

  /** Vrai si une case voisine (en croix) de l'emprise est de l'eau. */
  touchesWater(x: number, y: number, w: number, d: number): boolean {
    return this.touches(x, y, w, d, isWater);
  }

  /** Raison pour laquelle un achat est impossible (hors emplacement), ou null. */
  checkPurchase(def: BuildingDef): Result<object> {
    const requirement = this.checkRequirements(def.requires);
    if (requirement) return fail(requirement);
    const limit = this.buildLimitFor(def);
    if (limit !== null && this.countOf(def.id) >= limit) return fail('limitReached');
    if (def.category === 'house') {
      const { populationProjected, popCap } = this.derived();
      if (populationProjected + def.population > popCap) return fail('populationCap');
    }
    const missing = this.missingFor(def.cost);
    if (missing) return fail(CURRENCY_REASON[missing.currency], missing.missing);
    // Un chantier à minuteur occupe un ouvrier jusqu'à l'inauguration.
    if (def.buildSec > 0 && !this.hasFreeWorker()) return fail('noWorker');
    return { ok: true };
  }

  decorationBonus(entity: Entity): number {
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'house' && def.category !== 'business') return 0;
    let bonus = 0;
    const target = { x: entity.x, y: entity.y, size: def.size };
    for (const other of this.state.entities) {
      const otherDef = getBuildingDef(other.defId);
      if (otherDef.category !== 'decoration' || !other.built) continue;
      const distance = footprintDistance(target, { x: other.x, y: other.y, size: otherDef.size });
      if (distance <= otherDef.bonus.radius) bonus += otherDef.bonus.percent;
    }
    return Math.min(MAX_DECORATION_BONUS, bonus);
  }

  private withBonus(entity: Entity, coins: number): number {
    return Math.round(coins * (1 + this.decorationBonus(entity) / 100));
  }

  rentFor(entity: Entity): { coins: number; xp: number } {
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'house') return { coins: 0, xp: 0 };
    return { coins: this.withBonus(entity, def.rent.coins * this.upgradeFactor(entity)), xp: def.rent.xp };
  }

  payoutFor(entity: Entity): { coins: number; xp: number } {
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'business') return { coins: 0, xp: 0 };
    return { coins: this.withBonus(entity, def.payout.coins * this.upgradeFactor(entity)), xp: def.payout.xp };
  }

  /** Clients servis (affichage) pour un commerce en activité. */
  customersServed(entity: Entity): { served: number; total: number } {
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'business' || !entity.business) return { served: 0, total: 0 };
    const { readyAt, suppliedAt } = entity.business;
    if (readyAt === null || suppliedAt === null) return { served: 0, total: def.customers };
    const span = Math.max(1, readyAt - suppliedAt);
    const ratio = Math.max(0, Math.min(1, (this.now() - suppliedAt) / span));
    return { served: Math.floor(def.customers * ratio), total: def.customers };
  }

  primaryAction(entity: Entity): PrimaryAction {
    const now = this.now();
    if (!entity.built) {
      const endsAt = entity.construction?.endsAt ?? now;
      return now >= endsAt ? { type: 'finishBuild' } : { type: 'waitBuild', readyAt: endsAt };
    }
    if (entity.upgrade) {
      const { endsAt } = entity.upgrade;
      return now >= endsAt ? { type: 'finishUpgrade' } : { type: 'waitUpgrade', readyAt: endsAt };
    }
    // Un commerce déjà approvisionné finit de servir ses clients ; le reste attend la route.
    const serving = entity.business && entity.business.readyAt !== null;
    if (!serving && !this.isConnected(entity)) return { type: 'needsRoad' };
    if (entity.house) {
      return now >= entity.house.readyAt
        ? { type: 'collectRent' }
        : { type: 'waitRent', readyAt: entity.house.readyAt };
    }
    if (entity.business) {
      const { readyAt } = entity.business;
      if (readyAt === null) return { type: 'supply' };
      return now >= readyAt ? { type: 'collectBusiness' } : { type: 'waitCustomers', readyAt };
    }
    if (entity.farm) {
      const { cropId, readyAt } = entity.farm;
      if (cropId === null) return { type: 'plant' };
      return now >= readyAt ? { type: 'harvest' } : { type: 'waitCrop', readyAt };
    }
    if (entity.port) {
      const { tripId, readyAt } = entity.port;
      if (tripId === null) return { type: 'sendBoat' };
      return now >= readyAt ? { type: 'unloadBoat' } : { type: 'waitBoat', readyAt };
    }
    if (entity.station) {
      const { shipmentId, readyAt } = entity.station;
      if (shipmentId === null) return { type: 'sendTrain' };
      return now >= readyAt ? { type: 'unloadTrain' } : { type: 'waitTrain', readyAt };
    }
    return { type: 'info' };
  }

  /** Coût en cash pour terminer immédiatement l'attente en cours, ou null. */
  speedUpCost(entity: Entity): number | null {
    const action = this.primaryAction(entity);
    switch (action.type) {
      case 'waitBuild':
      case 'waitUpgrade':
      case 'waitRent':
      case 'waitCrop':
      case 'waitCustomers':
      case 'waitBoat':
      case 'waitTrain':
        return speedUpCashCost((action.readyAt - this.now()) / 1000);
      default:
        return null;
    }
  }

  expansionInfo(cx: number, cy: number): ExpansionInfo {
    if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) return { status: 'unavailable' };
    if (this.isChunkUnlocked(cx, cy)) return { status: 'unlocked' };
    if (!chunkHasLand(cx, cy) || chunkHasMountain(cx, cy)) return { status: 'unavailable' };
    const adjacent =
      this.isChunkUnlocked(cx - 1, cy) ||
      this.isChunkUnlocked(cx + 1, cy) ||
      this.isChunkUnlocked(cx, cy - 1) ||
      this.isChunkUnlocked(cx, cy + 1);
    if (!adjacent) return { status: 'unavailable' };
    const price = expansionPrice(chunkDistance(cx, cy), this.state.expansionsBought);
    let reason: FailReason | null = null;
    const east = isEastChunk(cx);
    const level = east ? Math.max(price.level, EAST_SHORE_LEVEL) : price.level;
    if (this.state.level < level) reason = 'levelLocked';
    else if (east && !this.hasBridge()) reason = 'needsBridge';
    else if (this.state.coins < price.coins) reason = 'notEnoughCoins';
    return { status: 'purchasable', coins: price.coins, level, reason };
  }

  /** Constructions et cultures débloquées à un niveau donné. */
  unlocksAtLevel(level: number): string[] {
    const ids: string[] = [];
    for (const def of BUILDINGS) if (def.inShop !== false && def.requires?.level === level) ids.push(def.id);
    for (const crop of CROPS) if (crop.requires?.level === level) ids.push(crop.id);
    for (const trip of TRIPS) if (trip.requires?.level === level) ids.push(trip.id);
    for (const shipment of SHIPMENTS) if (shipment.requires?.level === level) ids.push(shipment.id);
    return ids;
  }

  // ———————————————————————————— Ressources ————————————————————————————

  private regenEnergy(): boolean {
    const now = this.now();
    const max = this.derived().energyMax;
    if (this.state.energy >= max) {
      this.state.energyUpdatedAt = now;
      return false;
    }
    const period = ENERGY_REGEN_SEC * 1000;
    const gained = Math.floor((now - this.state.energyUpdatedAt) / period);
    if (gained <= 0) return false;
    this.state.energy = Math.min(max, this.state.energy + gained);
    this.state.energyUpdatedAt = this.state.energy >= max ? now : this.state.energyUpdatedAt + gained * period;
    return true;
  }

  private spend(cost: Cost): void {
    const energyBefore = this.state.energy;
    for (const currency of ['coins', 'cash', 'goods', 'energy'] as const) {
      const amount = cost[currency] ?? 0;
      if (amount > 0) this.state[currency] -= amount;
    }
    // La régénération repart de zéro quand on entame une jauge pleine.
    if ((cost.energy ?? 0) > 0 && energyBefore >= this.derived().energyMax) {
      this.state.energyUpdatedAt = this.now();
    }
  }

  private give(reward: Reward, entityId: number | null): void {
    const { coins = 0, cash = 0, goods = 0, energy = 0, xp = 0 } = reward;
    this.state.coins += coins;
    this.state.cash += cash;
    this.state.energy += energy;
    if (goods > 0) this.state.goods = Math.min(this.derived().goodsCap, this.state.goods + goods);
    this.state.xp += xp;
    if (coins || cash || goods || energy || xp) this.events.emit('reward', { entityId, reward });
    if (xp > 0) this.checkLevelUp();
  }

  private checkLevelUp(): void {
    while (this.state.level < MAX_LEVEL && this.state.xp >= xpForLevel(this.state.level + 1)) {
      this.state.level += 1;
      this.derivedCache = null;
      const { coins, cash } = levelUpReward(this.state.level);
      this.state.coins += coins;
      this.state.cash += cash;
      const max = this.derived().energyMax;
      if (this.state.energy < max) {
        this.state.energy = max;
        this.state.energyUpdatedAt = this.now();
      }
      this.events.emit('levelUp', {
        level: this.state.level,
        reward: { coins, cash },
        unlocked: this.unlocksAtLevel(this.state.level),
      });
      this.syncQuests();
    }
  }

  private useEnergy(): Result<object> {
    this.regenEnergy();
    if (this.state.energy < ENERGY_PER_ACTION) return fail('notEnoughEnergy', ENERGY_PER_ACTION - this.state.energy);
    this.spend({ energy: ENERGY_PER_ACTION });
    return { ok: true };
  }

  /** À appeler régulièrement (≈ 1 fois par seconde). */
  tick(): void {
    let changed = this.regenEnergy();
    if (this.refreshDaily()) changed = true;
    const now = this.now();
    const items = this.readySince(this.lastReadyCheck, now);
    this.lastReadyCheck = now;
    if (items.length > 0) this.events.emit('ready', { items });
    if (changed) this.changed();
  }

  /** Attentes terminées entre `from` (exclu) et `to` (inclus), dans l'ordre. */
  readySince(from: number, to: number): ReadyItem[] {
    const items: ReadyItem[] = [];
    const push = (entity: Entity, kind: ReadyKind, at: number) => {
      if (at > from && at <= to) items.push({ entityId: entity.id, kind, at });
    };
    for (const entity of this.state.entities) {
      if (!entity.built && entity.construction) push(entity, 'build', entity.construction.endsAt);
      if (entity.farm?.cropId) push(entity, 'crop', entity.farm.readyAt);
      if (entity.port?.tripId) push(entity, 'boat', entity.port.readyAt);
      if (entity.station?.shipmentId) push(entity, 'train', entity.station.readyAt);
      if (entity.business && entity.business.readyAt !== null) push(entity, 'business', entity.business.readyAt);
    }
    return items.sort((a, b) => a.at - b.at);
  }

  private changed(): void {
    this.events.emit('change', undefined);
  }

  private track(event: GameplayEvent): void {
    this.state.stats[event.type] = (this.state.stats[event.type] ?? 0) + 1;
    this.events.emit('gameplay', event);
    this.onGameplayForQuests(event);
    this.onGameplayForDaily(event);
  }

  // ———————————————————————————— Actions ————————————————————————————

  place(defId: string, x: number, y: number): Result<{ entity: Entity }> {
    const def = getBuildingDef(defId);
    if (def.inShop === false) return fail('invalid');
    const purchase = this.checkPurchase(def);
    if (!purchase.ok) return purchase;
    const placement = this.checkPlacement(def, x, y);
    if (placement) return fail(placement);

    this.spend(def.cost);
    const now = this.now();
    const built = def.buildSec <= 0;
    const entity: Entity = { id: this.state.nextEntityId++, defId, x, y, built };
    if (built) initBuiltState(entity, now);
    else entity.construction = { startedAt: now, endsAt: now + def.buildSec * 1000 };
    this.state.entities.push(entity);
    this.byId.set(entity.id, entity);
    this.grid.fill(x, y, def.size, entity.id);
    this.derivedCache = null;
    this.events.emit('entityAdded', entity);
    this.track({ type: 'place', defId, category: def.category });
    if (built) {
      // Construction immédiate : l'XP est gagnée tout de suite.
      this.give({ xp: def.xp }, entity.id);
      this.track({ type: 'build', defId, category: def.category });
    }
    this.changed();
    return { ok: true, entity };
  }

  move(id: number, x: number, y: number): Result<object> {
    const entity = this.byId.get(id);
    if (!entity) return fail('invalid');
    const def = getBuildingDef(entity.defId);
    if (def.category === 'rail') return fail('notSellable');
    const placement = this.checkPlacement(def, x, y, id);
    if (placement) return fail(placement);
    this.grid.fill(entity.x, entity.y, def.size, 0);
    entity.x = x;
    entity.y = y;
    this.grid.fill(x, y, def.size, id);
    // Les raccordements aux routes ont pu changer.
    this.derivedCache = null;
    this.events.emit('entityMoved', entity);
    this.changed();
    return { ok: true };
  }

  sellValue(entity: Entity): number {
    return Math.floor((getBuildingDef(entity.defId).cost.coins ?? 0) * SELL_REFUND_RATIO);
  }

  sell(id: number): Result<{ refund: number }> {
    const entity = this.byId.get(id);
    if (!entity) return fail('invalid');
    const def = getBuildingDef(entity.defId);
    if (def.sellable === false) return fail('notSellable');
    if (def.category === 'community' && entity.built) {
      const { populationProjected, popCap } = this.derived();
      if (populationProjected > popCap - def.popCap) return fail('populationCap');
    }
    const refund = this.sellValue(entity);
    this.grid.fill(entity.x, entity.y, def.size, 0);
    this.byId.delete(id);
    this.state.entities = this.state.entities.filter((e) => e.id !== id);
    this.derivedCache = null;
    this.state.goods = Math.min(this.state.goods, this.derived().goodsCap);
    this.events.emit('entityRemoved', entity);
    if (refund > 0) this.give({ coins: refund }, null);
    this.changed();
    return { ok: true, refund };
  }

  /** Inaugure un chantier dont le minuteur est écoulé (aucune énergie requise). */
  finishBuild(id: number): Result<object> {
    const entity = this.byId.get(id);
    if (!entity || entity.built) return fail('invalid');
    if (this.now() < (entity.construction?.endsAt ?? 0)) return fail('notReady');
    this.completeConstruction(entity);
    this.changed();
    return { ok: true };
  }

  private completeConstruction(entity: Entity): void {
    const def = getBuildingDef(entity.defId);
    entity.built = true;
    delete entity.construction;
    initBuiltState(entity, this.now());
    this.derivedCache = null;
    this.events.emit('entityUpdated', entity);
    this.events.emit('constructionComplete', entity);
    // Inauguration : l'XP du bâtiment et une petite prime en pièces (5 % du prix).
    this.give({ xp: def.xp, coins: inaugurationBonus(def) }, entity.id);
    this.track({ type: 'build', defId: entity.defId, category: def.category });
  }

  collectRent(id: number): Result<{ coins: number }> {
    const entity = this.byId.get(id);
    if (!entity?.house || !entity.built) return fail('invalid');
    if (this.now() < entity.house.readyAt) return fail('notReady');
    if (!this.isConnected(entity)) return fail('needsRoad');
    const energy = this.useEnergy();
    if (!energy.ok) return energy;
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'house') return fail('invalid');
    const rent = this.rentFor(entity);
    entity.house.readyAt = this.now() + def.rent.intervalSec * 1000;
    this.give({ coins: rent.coins, xp: rent.xp }, entity.id);
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'collectRent', defId: entity.defId });
    this.changed();
    return { ok: true, coins: rent.coins };
  }

  plant(id: number, cropId: string): Result<object> {
    const entity = this.byId.get(id);
    if (!entity?.farm || !entity.built || entity.farm.cropId !== null) return fail('invalid');
    const crop = getCropDef(cropId);
    const requirement = this.checkRequirements(crop.requires);
    if (requirement) return fail(requirement);
    if (this.state.coins < crop.cost) return fail('notEnoughCoins', crop.cost - this.state.coins);
    this.spend({ coins: crop.cost });
    const now = this.now();
    entity.farm = { cropId, plantedAt: now, readyAt: now + crop.growSec * 1000 };
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'plant', cropId });
    this.changed();
    return { ok: true };
  }

  harvest(id: number): Result<{ goods: number }> {
    const entity = this.byId.get(id);
    if (!entity?.farm || entity.farm.cropId === null) return fail('invalid');
    if (this.now() < entity.farm.readyAt) return fail('notReady');
    if (this.state.goods >= this.derived().goodsCap) return fail('storageFull');
    const energy = this.useEnergy();
    if (!energy.ok) return energy;
    const crop = getCropDef(entity.farm.cropId);
    const goods = Math.min(crop.goods, this.derived().goodsCap - this.state.goods);
    entity.farm = { cropId: null, plantedAt: 0, readyAt: 0 };
    this.give({ goods, xp: crop.xp }, entity.id);
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'harvest', cropId: crop.id });
    this.changed();
    return { ok: true, goods };
  }

  /** Envoie le bateau d'un port en expédition (coût en pièces). */
  sendBoat(id: number, tripId: string): Result<object> {
    const entity = this.byId.get(id);
    if (!entity?.port || !entity.built || entity.port.tripId !== null) return fail('invalid');
    const def = getBuildingDef(entity.defId);
    const trip = getTripDef(tripId);
    if (def.category !== 'port' || def.boatTier < trip.boatTier) return fail('invalid');
    const requirement = this.checkRequirements(trip.requires);
    if (requirement) return fail(requirement);
    if (this.state.coins < trip.cost) return fail('notEnoughCoins', trip.cost - this.state.coins);
    this.spend({ coins: trip.cost });
    const now = this.now();
    entity.port = { tripId, startedAt: now, readyAt: now + this.tripDurationSec(entity, trip.durationSec) * 1000 };
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'sendBoat', tripId });
    this.changed();
    return { ok: true };
  }

  /** Décharge la pêche d'un bateau revenu (1 énergie). */
  unloadBoat(id: number): Result<{ goods: number }> {
    const entity = this.byId.get(id);
    if (!entity?.port || entity.port.tripId === null) return fail('invalid');
    if (this.now() < entity.port.readyAt) return fail('notReady');
    if (this.state.goods >= this.derived().goodsCap) return fail('storageFull');
    const energy = this.useEnergy();
    if (!energy.ok) return energy;
    const trip = getTripDef(entity.port.tripId);
    const goods = Math.min(trip.goods, this.derived().goodsCap - this.state.goods);
    entity.port = { tripId: null, startedAt: 0, readyAt: 0 };
    this.give({ goods, xp: trip.xp }, entity.id);
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'unloadBoat', tripId: trip.id });
    this.changed();
    return { ok: true, goods };
  }

  /** Charge un train en gare : les marchandises partent, les pièces reviennent avec lui. */
  sendTrain(id: number, shipmentId: string): Result<object> {
    const entity = this.byId.get(id);
    if (!entity?.station || !entity.built || entity.station.shipmentId !== null) return fail('invalid');
    if (!this.isConnected(entity)) return fail('needsRoad');
    const shipment = getShipmentDef(shipmentId);
    const requirement = this.checkRequirements(shipment.requires);
    if (requirement) return fail(requirement);
    if (this.state.goods < shipment.goods) return fail('notEnoughGoods', shipment.goods - this.state.goods);
    this.spend({ goods: shipment.goods });
    const now = this.now();
    entity.station = { shipmentId, startedAt: now, readyAt: now + shipment.durationSec * 1000 };
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'sendTrain', shipmentId });
    this.changed();
    return { ok: true };
  }

  /** Encaisse la livraison d'un train revenu (1 énergie). */
  unloadTrain(id: number): Result<{ coins: number }> {
    const entity = this.byId.get(id);
    if (!entity?.station || entity.station.shipmentId === null) return fail('invalid');
    if (this.now() < entity.station.readyAt) return fail('notReady');
    const energy = this.useEnergy();
    if (!energy.ok) return energy;
    const shipment = getShipmentDef(entity.station.shipmentId);
    entity.station = { shipmentId: null, startedAt: 0, readyAt: 0 };
    this.give({ coins: shipment.coins, xp: shipment.xp }, entity.id);
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'unloadTrain', shipmentId: shipment.id });
    this.changed();
    return { ok: true, coins: shipment.coins };
  }

  supply(id: number): Result<object> {
    const entity = this.byId.get(id);
    if (!entity?.business || !entity.built || entity.business.readyAt !== null) return fail('invalid');
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'business') return fail('invalid');
    if (!this.isConnected(entity)) return fail('needsRoad');
    if (this.state.goods < def.supplyGoods) return fail('notEnoughGoods', def.supplyGoods - this.state.goods);
    this.spend({ goods: def.supplyGoods });
    const now = this.now();
    entity.business = { readyAt: now + def.serveSec * 1000, suppliedAt: now };
    this.give({ xp: 1 }, entity.id);
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'supply', defId: entity.defId });
    this.changed();
    return { ok: true };
  }

  collectBusiness(id: number): Result<{ coins: number }> {
    const entity = this.byId.get(id);
    if (!entity?.business || entity.business.readyAt === null) return fail('invalid');
    if (this.now() < entity.business.readyAt) return fail('notReady');
    const energy = this.useEnergy();
    if (!energy.ok) return energy;
    const payout = this.payoutFor(entity);
    entity.business = { readyAt: null, suppliedAt: null };
    this.give({ coins: payout.coins, xp: payout.xp }, entity.id);
    this.events.emit('entityUpdated', entity);
    this.track({ type: 'collectBusiness', defId: entity.defId });
    this.changed();
    return { ok: true, coins: payout.coins };
  }

  speedUp(id: number): Result<{ cost: number }> {
    const entity = this.byId.get(id);
    if (!entity) return fail('invalid');
    const cost = this.speedUpCost(entity);
    if (cost === null) return fail('invalid');
    if (this.state.cash < cost) return fail('notEnoughCash', cost - this.state.cash);
    this.spend({ cash: cost });
    const now = this.now();
    if (!entity.built) {
      this.completeConstruction(entity);
    } else if (entity.upgrade) {
      this.completeUpgrade(entity);
    } else {
      if (entity.house) entity.house.readyAt = now;
      if (entity.farm && entity.farm.cropId !== null) entity.farm.readyAt = now;
      if (entity.business && entity.business.readyAt !== null) entity.business.readyAt = now;
      if (entity.port && entity.port.tripId !== null) entity.port.readyAt = now;
      if (entity.station && entity.station.shipmentId !== null) entity.station.readyAt = now;
      this.events.emit('entityUpdated', entity);
    }
    this.changed();
    return { ok: true, cost };
  }

  buyExpansion(cx: number, cy: number): Result<object> {
    const info = this.expansionInfo(cx, cy);
    if (info.status !== 'purchasable') return fail('invalid');
    if (info.reason)
      return fail(info.reason, info.reason === 'notEnoughCoins' ? info.coins - this.state.coins : undefined);
    this.spend({ coins: info.coins });
    this.state.unlockedChunks.push(chunkKey(cx, cy));
    this.unlocked.add(chunkKey(cx, cy));
    this.state.expansionsBought += 1;
    this.adoptScenery(cx, cy);
    this.events.emit('expanded', { cx, cy });
    this.give({ xp: 10 }, null);
    this.track({ type: 'expand' });
    this.changed();
    return { ok: true };
  }

  /** Les arbres et routes sauvages d'une zone achetée deviennent des constructions du joueur. */
  private adoptScenery(cx: number, cy: number): void {
    for (const item of sceneryOf(cx, cy)) {
      if (!this.grid.isFree(item.x, item.y, { w: 1, d: 1 })) continue;
      const entity: Entity = {
        id: this.state.nextEntityId++,
        defId: item.defId,
        x: item.x,
        y: item.y,
        built: true,
        starter: true,
      };
      this.state.entities.push(entity);
      this.byId.set(entity.id, entity);
      this.grid.fill(entity.x, entity.y, { w: 1, d: 1 }, entity.id);
      this.events.emit('entityAdded', entity);
    }
    this.derivedCache = null;
  }

  /** Achat d'une offre payée en cash (pièces, énergie). */
  buyCashOffer(offerId: string): Result<object> {
    const offer = findCashOffer(offerId);
    if (!offer) return fail('invalid');
    const refill = offer.reward === 'energyRefill' ? Math.max(0, this.derived().energyMax - this.state.energy) : 0;
    // Une recharge complète n'a aucun sens quand la jauge est déjà pleine.
    if (offer.reward === 'energyRefill' && refill === 0) return fail('energyFull');
    if (this.state.cash < offer.cash) return fail('notEnoughCash', offer.cash - this.state.cash);
    this.spend({ cash: offer.cash });
    if (offer.reward === 'energyRefill') {
      this.give({ energy: refill }, null);
    } else {
      this.give(offer.reward, null);
    }
    this.changed();
    return { ok: true };
  }

  /**
   * Crédite un produit payé en argent réel. Doit être appelé UNIQUEMENT après
   * confirmation du fournisseur de paiement (et, en production, validation serveur).
   */
  grantStoreProduct(productId: string): Result<object> {
    const product = findStoreProduct(productId);
    if (!product) return fail('invalid');
    if (product.oneTime && this.state.oneTimePurchases.includes(productId)) return fail('alreadyOwned');
    if (product.oneTime) this.state.oneTimePurchases.push(productId);
    this.state.stats.purchases = (this.state.stats.purchases ?? 0) + 1;
    if (product.workers) this.state.workers += product.workers;
    this.give(product.reward, null);
    this.changed();
    return { ok: true };
  }

  markIntroSeen(): void {
    this.state.tutorial.introSeen = true;
    this.changed();
  }

  // ———————————————————————————— Objectifs ————————————————————————————

  activeQuests(): Array<{ def: QuestDef; progress: QuestProgress }> {
    return this.state.quests.active.map((progress) => ({ def: getQuestDef(progress.id), progress }));
  }

  /** Avancement de chaque tâche d'un objectif actif. */
  questTaskStatus(progress: QuestProgress): Array<{ value: number; target: number; done: boolean }> {
    const def = getQuestDef(progress.id);
    return def.tasks.map((task, index) => {
      const target = 'target' in task ? task.target : task.count;
      let value: number;
      if (task.type === 'population') value = this.derived().population;
      else if (task.type === 'level') value = this.state.level;
      else value = progress.counts[index] ?? 0;
      value = Math.min(value, target);
      return { value, target, done: value >= target };
    });
  }

  private questEligible(def: QuestDef): boolean {
    const { completed, active } = this.state.quests;
    if (completed.includes(def.id) || active.some((q) => q.id === def.id)) return false;
    if (def.requires?.level !== undefined && this.state.level < def.requires.level) return false;
    return (def.requires?.quests ?? []).every((id) => completed.includes(id));
  }

  /** Active les objectifs éligibles puis valide ceux qui sont déjà remplis. */
  private syncQuests(): void {
    for (const def of QUESTS) {
      if (!this.questEligible(def)) continue;
      const progress: QuestProgress = {
        id: def.id,
        counts: def.tasks.map((task) => this.initialTaskCount(task)),
        startedAt: this.now(),
      };
      this.state.quests.active.push(progress);
      this.events.emit('questStarted', { questId: def.id });
    }
    this.checkQuestCompletion();
  }

  /** Les achats déjà faits d'un bâtiment précis comptent pour les nouvelles tâches. */
  private initialTaskCount(task: QuestTask): number {
    if ((task.type === 'place' || task.type === 'build') && task.defId) {
      return this.state.entities.filter(
        (e) => !e.starter && e.defId === task.defId && (task.type === 'place' || e.built),
      ).length;
    }
    return 0;
  }

  private taskMatches(task: QuestTask, event: GameplayEvent): boolean {
    if (task.type !== event.type) return false;
    switch (event.type) {
      case 'place':
      case 'build':
      case 'upgrade': {
        const filter = task as { defId?: string; category?: string };
        if (filter.defId && filter.defId !== event.defId) return false;
        if (filter.category && filter.category !== event.category) return false;
        return true;
      }
      case 'collectRent':
      case 'supply':
      case 'collectBusiness': {
        const filter = task as { defId?: string };
        return !filter.defId || filter.defId === event.defId;
      }
      case 'plant':
      case 'harvest': {
        const filter = task as { cropId?: string };
        return !filter.cropId || filter.cropId === event.cropId;
      }
      case 'sendBoat':
      case 'unloadBoat':
      case 'sendTrain':
      case 'unloadTrain':
        return true;
      case 'expand':
      case 'helpNeighbor':
      case 'visitNeighbor':
      case 'marketSell':
      case 'marketBuy':
        return true;
    }
  }

  private onGameplayForQuests(event: GameplayEvent): void {
    for (const progress of this.state.quests.active) {
      const def = getQuestDef(progress.id);
      let progressed = false;
      def.tasks.forEach((task, index) => {
        if (!('count' in task) || !this.taskMatches(task, event)) return;
        const current = progress.counts[index] ?? 0;
        if (current < task.count) {
          progress.counts[index] = current + 1;
          progressed = true;
        }
      });
      if (progressed) this.events.emit('questProgress', { questId: progress.id });
    }
    this.checkQuestCompletion();
  }

  private checkQuestCompletion(): void {
    for (const progress of [...this.state.quests.active]) {
      if (!this.questTaskStatus(progress).every((task) => task.done)) continue;
      // Peut avoir été retiré par un appel imbriqué (passage de niveau).
      if (!this.state.quests.active.includes(progress)) continue;
      const def = getQuestDef(progress.id);
      this.state.quests.active = this.state.quests.active.filter((q) => q !== progress);
      this.state.quests.completed.push(def.id);
      this.events.emit('questCompleted', { questId: def.id, reward: def.reward });
      this.give(def.reward, null);
      this.syncQuests();
    }
  }

  // ———————————————————————————— Défis du jour ————————————————————————————

  /** Tire de nouveaux défis si le jour a changé. Renvoie vrai s'il y a eu un tirage. */
  private refreshDaily(): boolean {
    if (this.state.level < DAILY_MIN_LEVEL) return false;
    const day = localDay(this.now());
    if (this.state.daily.day === day) return false;
    this.state.daily = drawDaily(this.state, day);
    this.events.emit('dailyRefreshed', undefined);
    return true;
  }

  dailyInfo(): DailyInfo {
    const { daily } = this.state;
    const available = this.state.level >= DAILY_MIN_LEVEL && daily.tasks.length > 0;
    const tasks = daily.tasks.map((task) => ({ ...task, done: task.count >= task.target }));
    const allClaimed = tasks.length > 0 && tasks.every((task) => task.claimed);
    const claimable =
      tasks.filter((task) => task.done && !task.claimed).length + (allClaimed && !daily.bonusClaimed ? 1 : 0);
    return {
      available,
      tasks,
      bonus: daily.bonus,
      bonusClaimed: daily.bonusClaimed,
      claimable: available ? claimable : 0,
      resetsAt: nextLocalMidnight(this.now()),
    };
  }

  private onGameplayForDaily(event: GameplayEvent): void {
    this.state.daily.tasks.forEach((task, index) => {
      if (task.count >= task.target || !dailyMatches(task.type, event)) return;
      task.count += 1;
      if (task.count >= task.target) this.events.emit('dailyCompleted', { index });
    });
  }

  /** Réclame la récompense d'un défi rempli. */
  claimDaily(index: number): Result<{ reward: Reward }> {
    const task = this.state.daily.tasks[index];
    if (!task || task.claimed) return fail('invalid');
    if (task.count < task.target) return fail('notReady');
    task.claimed = true;
    this.give(task.reward, null);
    this.events.emit('dailyClaimed', { index, reward: task.reward });
    this.changed();
    return { ok: true, reward: task.reward };
  }

  /** Réclame le bonus une fois les trois défis réclamés. */
  claimDailyBonus(): Result<{ reward: Reward }> {
    const { daily } = this.state;
    if (daily.bonusClaimed || daily.tasks.length === 0) return fail('invalid');
    if (!daily.tasks.every((task) => task.claimed)) return fail('notReady');
    daily.bonusClaimed = true;
    this.give(daily.bonus, null);
    this.events.emit('dailyClaimed', { index: 'bonus', reward: daily.bonus });
    this.changed();
    return { ok: true, reward: daily.bonus };
  }

  /** Renomme la ville (1 à 30 caractères). */
  setCityName(name: string): Result<object> {
    const clean = name.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (clean.length < 1 || clean.length > 30) return fail('invalid');
    this.state.cityName = clean;
    this.changed();
    return { ok: true };
  }

  // ———————————————————————————— Améliorations et limites ————————————————————————————

  /** Nombre de constructions d'un type (chantiers et bâtiments de départ compris). */
  countOf(defId: string): number {
    let n = 0;
    for (const entity of this.state.entities) if (entity.defId === defId) n++;
    return n;
  }

  /** Nombre maximal d'exemplaires de ce bâtiment au niveau actuel (null : illimité). */
  buildLimitFor(def: BuildingDef): number | null {
    return buildLimit(def.category, this.state.level);
  }

  /** Multiplicateur d'effet dû aux étoiles (1 sans amélioration). */
  upgradeFactor(entity: Entity, extraStars = 0): number {
    const { category } = getBuildingDef(entity.defId);
    if (!isUpgradable(category) || category === 'port') return 1;
    return 1 + ((entity.stars ?? 0) + extraStars) * UPGRADE_GAIN[category];
  }

  /** Habitants d'une maison, étoiles comprises. */
  housePopulation(entity: Entity, extraStars = 0): number {
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'house') return 0;
    return Math.round(def.population * this.upgradeFactor(entity, extraStars));
  }

  /** Durée d'une expédition depuis ce port (plus courte avec les étoiles). */
  tripDurationSec(entity: Entity, baseSec: number): number {
    return Math.round(baseSec * (1 - (entity.stars ?? 0) * UPGRADE_GAIN.port));
  }

  upgradeInfo(entity: Entity): UpgradeInfo {
    const def = getBuildingDef(entity.defId);
    const price = def.cost.coins ?? 0;
    if (!isUpgradable(def.category) || price <= 0 || !entity.built) return { status: 'none' };
    const stars = entity.stars ?? 0;
    if (entity.upgrade) return { status: 'working', stars, endsAt: entity.upgrade.endsAt };
    if (stars >= UPGRADE.maxStars) return { status: 'max', stars };
    const cost = upgradeCost(price, stars);
    const level = UPGRADE.levels[stars] ?? MAX_LEVEL;
    const durationSec = Math.max(
      UPGRADE.minDurationSec,
      Math.round(def.buildSec * (UPGRADE.durationRatio[stars] ?? 1)),
    );
    let reason: FailReason | null = null;
    let missing: number | undefined;
    if (this.state.level < level) reason = 'levelLocked';
    else if (def.category === 'house') {
      const { populationProjected, popCap } = this.derived();
      const extra = this.housePopulation(entity, 1) - this.housePopulation(entity);
      if (populationProjected + extra > popCap) reason = 'populationCap';
    }
    if (!reason && !this.hasFreeWorker()) reason = 'noWorker';
    if (!reason && this.state.coins < cost.coins) {
      reason = 'notEnoughCoins';
      missing = cost.coins - this.state.coins;
    } else if (!reason && this.state.goods < cost.goods) {
      reason = 'notEnoughGoods';
      missing = cost.goods - this.state.goods;
    }
    return { status: 'available', stars, cost, level, durationSec, reason, ...(missing ? { missing } : {}) };
  }

  /** Lance le chantier d'amélioration vers l'étoile suivante. */
  startUpgrade(id: number): Result<object> {
    const entity = this.byId.get(id);
    if (!entity) return fail('invalid');
    const info = this.upgradeInfo(entity);
    if (info.status === 'max') return fail('maxStars');
    if (info.status !== 'available') return fail('invalid');
    if (info.reason) return fail(info.reason, info.missing);
    this.spend(info.cost);
    const now = this.now();
    entity.upgrade = { startedAt: now, endsAt: now + info.durationSec * 1000 };
    this.derivedCache = null;
    this.events.emit('entityUpdated', entity);
    this.events.emit('upgradeStarted', entity);
    this.changed();
    return { ok: true };
  }

  /** Termine une amélioration dont le minuteur est écoulé. */
  finishUpgrade(id: number): Result<object> {
    const entity = this.byId.get(id);
    if (!entity?.upgrade) return fail('invalid');
    if (this.now() < entity.upgrade.endsAt) return fail('notReady');
    this.completeUpgrade(entity);
    this.changed();
    return { ok: true };
  }

  private completeUpgrade(entity: Entity): void {
    const def = getBuildingDef(entity.defId);
    delete entity.upgrade;
    entity.stars = Math.min(UPGRADE.maxStars, (entity.stars ?? 0) + 1);
    this.derivedCache = null;
    this.events.emit('entityUpdated', entity);
    this.events.emit('upgradeComplete', entity);
    // Comme une inauguration : de l'XP et une petite prime à ramasser.
    this.give({ xp: Math.max(5, Math.round(def.xp * 0.5)), coins: inaugurationBonus(def) }, entity.id);
    this.track({ type: 'upgrade', defId: def.id, category: def.category, stars: entity.stars });
  }

  // ———————————————————————————— Récompense de connexion ————————————————————————————

  /** `today` : date locale du joueur (AAAA-MM-JJ), fournie par l'interface. */
  loginRewardStatus(today: string): LoginRewardStatus {
    const { lastDay, streak } = this.state.loginStreak;
    if (lastDay === today) {
      return { available: false, day: streak, reward: loginReward(streak, this.state.level) };
    }
    const day = lastDay !== null && lastDay === previousDay(today) ? (streak % LOGIN_STREAK_DAYS) + 1 : 1;
    return { available: true, day, reward: loginReward(day, this.state.level) };
  }

  claimLoginReward(today: string): Result<{ day: number; reward: Reward }> {
    if (!DAY_PATTERN.test(today)) return fail('invalid');
    // Une date antérieure à la dernière réclamation (horloge reculée) est refusée.
    const { lastDay } = this.state.loginStreak;
    if (lastDay !== null && today < lastDay) return fail('notReady');
    const status = this.loginRewardStatus(today);
    if (!status.available) return fail('notReady');
    this.state.loginStreak = { lastDay: today, streak: status.day };
    this.give(status.reward, null);
    this.track({ type: 'loginReward' });
    this.changed();
    return { ok: true, day: status.day, reward: status.reward };
  }

  // ———————————————————————————— Voisins ————————————————————————————

  /**
   * Récompense d'un coup de main donné à un voisin. Le serveur garantit la
   * limite d'un coup de main par voisin et par jour.
   */
  rewardHelpGiven(): Reward {
    const reward = helpGivenReward(this.state.level);
    this.give(reward, null);
    this.track({ type: 'helpNeighbor' });
    this.changed();
    return reward;
  }

  /** Visite de la ville d'un autre joueur (objectifs). */
  visitedNeighbor(): void {
    this.track({ type: 'visitNeighbor' });
    this.changed();
  }

  /** Crédite les coups de main reçus pendant l'absence du joueur. */
  receiveHelps(count: number): Reward {
    if (count <= 0) return {};
    const one = helpReceivedReward(this.state.level);
    const reward = { coins: one.coins * count, xp: one.xp * count };
    this.give(reward, null);
    this.changed();
    return reward;
  }

  // ———————————————————————————— Marché ————————————————————————————

  /** Met de côté des marchandises pour un lot mis en vente. */
  marketReserve(qty: number): Result<object> {
    if (this.state.level < MARKET.minLevel) return fail('levelLocked');
    if (!Number.isInteger(qty) || qty <= 0) return fail('invalid');
    if (this.state.goods < qty) return fail('notEnoughGoods', qty - this.state.goods);
    this.state.goods -= qty;
    this.changed();
    return { ok: true };
  }

  /** Lot accepté par le serveur (les marchandises ont été mises de côté par `marketReserve`). */
  marketListed(): void {
    this.track({ type: 'marketSell' });
    this.changed();
  }

  /** Rend des marchandises (lot retiré ou expiré), même au-delà de la capacité. */
  marketReturn(qty: number): void {
    if (qty <= 0) return;
    this.state.goods += qty;
    this.events.emit('reward', { entityId: null, reward: { goods: qty } });
    this.changed();
  }

  /** Vérifie qu'un achat est possible (pièces et place dans l'entrepôt). */
  checkMarketPurchase(qty: number, total: number): Result<object> {
    if (this.state.level < MARKET.minLevel) return fail('levelLocked');
    if (this.state.coins < total) return fail('notEnoughCoins', total - this.state.coins);
    if (this.state.goods + qty > this.derived().goodsCap) return fail('storageFull');
    return { ok: true };
  }

  /** Achat confirmé par le serveur : paie et reçoit les marchandises. */
  marketBuy(qty: number, total: number): Result<object> {
    const check = this.checkMarketPurchase(qty, total);
    if (!check.ok) return check;
    this.spend({ coins: total });
    this.state.goods += qty;
    this.events.emit('reward', { entityId: null, reward: { goods: qty } });
    this.track({ type: 'marketBuy' });
    this.changed();
    return { ok: true };
  }

  /** Recettes des ventes encaissées. */
  marketIncome(coins: number): void {
    if (coins <= 0) return;
    this.give({ coins }, null);
    this.changed();
  }

  // ———————————————————————————— Outils de test ————————————————————————————

  devGrant(reward: Reward): void {
    this.give(reward, null);
    this.changed();
  }

  /** Fait comme si `ms` millisecondes s'étaient écoulées (décale tous les minuteurs). */
  devSkipTime(ms: number): void {
    for (const entity of this.state.entities) {
      if (entity.construction) {
        entity.construction.startedAt -= ms;
        entity.construction.endsAt -= ms;
      }
      if (entity.upgrade) {
        entity.upgrade.startedAt -= ms;
        entity.upgrade.endsAt -= ms;
      }
      if (entity.port && entity.port.tripId !== null) {
        entity.port.readyAt -= ms;
        entity.port.startedAt -= ms;
      }
      if (entity.station && entity.station.shipmentId !== null) {
        entity.station.readyAt -= ms;
        entity.station.startedAt -= ms;
      }
      if (entity.house) entity.house.readyAt -= ms;
      if (entity.farm && entity.farm.cropId !== null) {
        entity.farm.readyAt -= ms;
        entity.farm.plantedAt -= ms;
      }
      if (entity.business && entity.business.readyAt !== null && entity.business.suppliedAt !== null) {
        entity.business.readyAt -= ms;
        entity.business.suppliedAt -= ms;
      }
    }
    this.state.energyUpdatedAt -= ms;
    this.lastReadyCheck -= ms;
    this.regenEnergy();
    for (const entity of this.state.entities) this.events.emit('entityUpdated', entity);
    this.changed();
  }
}
