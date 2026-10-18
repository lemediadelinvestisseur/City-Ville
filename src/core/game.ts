import {
  BASE_GOODS_CAP,
  BASE_POP_CAP,
  ENERGY_PER_ACTION,
  EAST_SHORE_LEVEL,
  ENERGY_REGEN_SEC,
  MAX_DECORATION_BONUS,
  MAX_LEVEL,
  SELL_REFUND_RATIO,
  energyMaxForLevel,
  expansionPrice,
  levelUpReward,
  speedUpCashCost,
  xpForLevel,
} from '@/data/balance';
import { BUILDINGS, getBuildingDef } from '@/data/buildings';
import { CROPS, TRIPS, getCropDef, getTripDef } from '@/data/crops';
import { findCashOffer, findStoreProduct } from '@/data/products';
import { QUESTS, getQuestDef } from '@/data/quests';
import { chunkHasLand, isEastChunk, isWater } from '@/data/terrain';
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
  gameplay: GameplayEvent;
}

export interface Derived {
  population: number;
  /** Population en comptant les habitations en chantier. */
  populationProjected: number;
  popCap: number;
  goodsCap: number;
  energyMax: number;
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

  constructor(
    public readonly state: GameState,
    private readonly clock: Clock = systemClock,
  ) {
    this.rebuildIndexes();
    this.regenEnergy();
    this.syncQuests();
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
    for (const entity of this.state.entities) {
      const def = getBuildingDef(entity.defId);
      if (def.category === 'house') {
        populationProjected += def.population;
        if (entity.built) population += def.population;
      } else if (entity.built && def.category === 'community') {
        popCap += def.popCap;
      } else if (entity.built && def.category === 'storage') {
        goodsCap += def.goodsCap;
      }
    }
    this.derivedCache = {
      population,
      populationProjected,
      popCap,
      goodsCap,
      energyMax: energyMaxForLevel(this.state.level),
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
        if (isWater(x + dx, y + dy)) return 'onWater';
        if (!this.isTileUnlocked(x + dx, y + dy)) return 'locked';
      }
    }
    if (!this.grid.isFree(x, y, def.size, ignoreId)) return 'blocked';
    if (def.placement === 'shore' && !this.touchesWater(x, y, def.size.w, def.size.d)) return 'needsWater';
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
    for (let i = 0; i < w; i++) {
      if (isWater(x + i, y - 1) || isWater(x + i, y + d)) return true;
    }
    for (let j = 0; j < d; j++) {
      if (isWater(x - 1, y + j) || isWater(x + w, y + j)) return true;
    }
    return false;
  }

  /** Raison pour laquelle un achat est impossible (hors emplacement), ou null. */
  checkPurchase(def: BuildingDef): Result<object> {
    const requirement = this.checkRequirements(def.requires);
    if (requirement) return fail(requirement);
    if (def.category === 'house') {
      const { populationProjected, popCap } = this.derived();
      if (populationProjected + def.population > popCap) return fail('populationCap');
    }
    const missing = this.missingFor(def.cost);
    if (missing) return fail(CURRENCY_REASON[missing.currency], missing.missing);
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
    return { coins: this.withBonus(entity, def.rent.coins), xp: def.rent.xp };
  }

  payoutFor(entity: Entity): { coins: number; xp: number } {
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'business') return { coins: 0, xp: 0 };
    return { coins: this.withBonus(entity, def.payout.coins), xp: def.payout.xp };
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
    return { type: 'info' };
  }

  /** Coût en cash pour terminer immédiatement l'attente en cours, ou null. */
  speedUpCost(entity: Entity): number | null {
    const action = this.primaryAction(entity);
    switch (action.type) {
      case 'waitBuild':
      case 'waitRent':
      case 'waitCrop':
      case 'waitCustomers':
      case 'waitBoat':
        return speedUpCashCost((action.readyAt - this.now()) / 1000);
      default:
        return null;
    }
  }

  expansionInfo(cx: number, cy: number): ExpansionInfo {
    if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) return { status: 'unavailable' };
    if (this.isChunkUnlocked(cx, cy)) return { status: 'unlocked' };
    if (!chunkHasLand(cx, cy)) return { status: 'unavailable' };
    const adjacent =
      this.isChunkUnlocked(cx - 1, cy) ||
      this.isChunkUnlocked(cx + 1, cy) ||
      this.isChunkUnlocked(cx, cy - 1) ||
      this.isChunkUnlocked(cx, cy + 1);
    if (!adjacent) return { status: 'unavailable' };
    const price = expansionPrice(this.state.expansionsBought);
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
    if (this.regenEnergy()) this.changed();
  }

  private changed(): void {
    this.events.emit('change', undefined);
  }

  private track(event: GameplayEvent): void {
    this.state.stats[event.type] = (this.state.stats[event.type] ?? 0) + 1;
    this.events.emit('gameplay', event);
    this.onGameplayForQuests(event);
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
    const placement = this.checkPlacement(def, x, y, id);
    if (placement) return fail(placement);
    this.grid.fill(entity.x, entity.y, def.size, 0);
    entity.x = x;
    entity.y = y;
    this.grid.fill(x, y, def.size, id);
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
    this.give({ xp: def.xp }, entity.id);
    this.track({ type: 'build', defId: entity.defId, category: def.category });
  }

  collectRent(id: number): Result<{ coins: number }> {
    const entity = this.byId.get(id);
    if (!entity?.house || !entity.built) return fail('invalid');
    if (this.now() < entity.house.readyAt) return fail('notReady');
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
    entity.port = { tripId, startedAt: now, readyAt: now + trip.durationSec * 1000 };
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

  supply(id: number): Result<object> {
    const entity = this.byId.get(id);
    if (!entity?.business || !entity.built || entity.business.readyAt !== null) return fail('invalid');
    const def = getBuildingDef(entity.defId);
    if (def.category !== 'business') return fail('invalid');
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
    } else {
      if (entity.house) entity.house.readyAt = now;
      if (entity.farm && entity.farm.cropId !== null) entity.farm.readyAt = now;
      if (entity.business && entity.business.readyAt !== null) entity.business.readyAt = now;
      if (entity.port && entity.port.tripId !== null) entity.port.readyAt = now;
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
    this.events.emit('expanded', { cx, cy });
    this.give({ xp: 10 }, null);
    this.track({ type: 'expand' });
    this.changed();
    return { ok: true };
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
      case 'build': {
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
        return true;
      case 'expand':
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
      if (entity.port && entity.port.tripId !== null) {
        entity.port.readyAt -= ms;
        entity.port.startedAt -= ms;
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
    this.regenEnergy();
    for (const entity of this.state.entities) this.events.emit('entityUpdated', entity);
    this.changed();
  }
}
