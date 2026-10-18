import { beforeEach, describe, expect, it } from 'vitest';
import {
  ENERGY_REGEN_SEC,
  MAP_H,
  MAP_W,
  chunkDistance,
  energyMaxForLevel,
  expansionPrice,
  xpForLevel,
} from '@/data/balance';
import { getBuildingDef } from '@/data/buildings';
import { getCropDef, getTripDef } from '@/data/crops';
import { coastX, isWater, terrainAt } from '@/data/terrain';
import { sceneryOf } from '@/data/scenery';
import { Game, type Clock } from './game';
import { findHint, findQuestHint } from './hints';
import { SAVE_VERSION, createNewGame } from './newGame';
import { deserialize, serialize } from './save';
import type { Entity } from './types';

class FakeClock implements Clock {
  constructor(public t = 1_700_000_000_000) {}
  now(): number {
    return this.t;
  }
  advance(sec: number): void {
    this.t += sec * 1000;
  }
}

function setup(): { game: Game; clock: FakeClock } {
  const clock = new FakeClock();
  const game = new Game(createNewGame(clock.now()), clock);
  return { game, clock };
}

const byDef = (game: Game, defId: string): Entity[] => game.state.entities.filter((e) => e.defId === defId);

/** Premier emplacement libre (balayage) pour une construction donnée. */
function freeSpot(game: Game, defId: string): { x: number; y: number } {
  const def = getBuildingDef(defId);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      if (game.checkPlacement(def, x, y) === null) return { x, y };
    }
  }
  throw new Error('Aucun emplacement libre');
}

describe('nouvelle partie', () => {
  it('démarre avec la ville de départ et le premier objectif', () => {
    const { game } = setup();
    expect(byDef(game, 'town_hall')).toHaveLength(1);
    expect(byDef(game, 'cottage')).toHaveLength(2);
    expect(byDef(game, 'plot')).toHaveLength(4);
    expect(game.activeQuests().map((q) => q.def.id)).toEqual(['welcome', 'harvest']);
    expect(game.derived()).toMatchObject({ population: 30, popCap: 80, goodsCap: 250 });
  });

  it('n’a aucun chevauchement entre constructions', () => {
    const { game } = setup();
    const seen = new Set<string>();
    for (const entity of game.state.entities) {
      const { size } = getBuildingDef(entity.defId);
      for (let dx = 0; dx < size.w; dx++) {
        for (let dy = 0; dy < size.d; dy++) {
          const key = `${entity.x + dx},${entity.y + dy}`;
          expect(seen.has(key), `case ${key} occupée deux fois`).toBe(false);
          seen.add(key);
        }
      }
    }
  });
});

describe('placement', () => {
  it('refuse les cases occupées, verrouillées ou hors carte', () => {
    const { game } = setup();
    const hall = byDef(game, 'town_hall')[0]!;
    expect(game.place('cottage', hall.x, hall.y)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(game.place('cottage', 4, 12)).toMatchObject({ ok: false, reason: 'locked' });
    expect(game.place('cottage', MAP_W - 1, MAP_H - 1)).toMatchObject({ ok: false, reason: 'outOfBounds' });
  });

  it('débite le coût et crée un chantier', () => {
    const { game } = setup();
    const coins = game.state.coins;
    const spot = freeSpot(game, 'cottage');
    const result = game.place('cottage', spot.x, spot.y);
    expect(result.ok).toBe(true);
    expect(game.state.coins).toBe(coins - 250);
    if (result.ok) {
      expect(result.entity.built).toBe(false);
      expect(game.primaryAction(result.entity)).toMatchObject({ type: 'waitBuild' });
    }
  });

  it('respecte le niveau requis', () => {
    const { game } = setup();
    const spot = freeSpot(game, 'bungalow');
    expect(game.place('bungalow', spot.x, spot.y)).toMatchObject({ ok: false, reason: 'levelLocked' });
  });

  it('bloque les habitations au-delà du plafond de population', () => {
    const { game } = setup();
    game.devGrant({ coins: 10_000 });
    // 30 habitants + 3 maisonnettes (45) = 75 ≤ 80, la 4e dépasse.
    for (let i = 0; i < 3; i++) {
      const spot = freeSpot(game, 'cottage');
      expect(game.place('cottage', spot.x, spot.y).ok).toBe(true);
    }
    const spot = freeSpot(game, 'cottage');
    expect(game.place('cottage', spot.x, spot.y)).toMatchObject({ ok: false, reason: 'populationCap' });
  });

  it('déplace et vend une construction', () => {
    const { game } = setup();
    const spot = freeSpot(game, 'flower_bed');
    const placed = game.place('flower_bed', spot.x, spot.y);
    if (!placed.ok) throw new Error('placement impossible');
    const target = freeSpot(game, 'flower_bed');
    expect(game.move(placed.entity.id, target.x, target.y).ok).toBe(true);
    expect(game.entityAt(target.x, target.y)?.id).toBe(placed.entity.id);
    expect(game.entityAt(spot.x, spot.y)).toBeUndefined();
    const coins = game.state.coins;
    expect(game.sell(placed.entity.id)).toMatchObject({ ok: true, refund: 10 });
    expect(game.state.coins).toBe(coins + 10);
    expect(game.getEntity(placed.entity.id)).toBeUndefined();
  });

  it('interdit de vendre la mairie', () => {
    const { game } = setup();
    const hall = byDef(game, 'town_hall')[0]!;
    expect(game.sell(hall.id)).toMatchObject({ ok: false, reason: 'notSellable' });
  });
});

describe('construction', () => {
  it('attend la fin du minuteur puis inaugure le bâtiment (sans énergie)', () => {
    const { game, clock } = setup();
    const spot = freeSpot(game, 'cottage');
    const placed = game.place('cottage', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    const energy = game.state.energy;
    const xp = game.state.xp;
    expect(game.primaryAction(placed.entity).type).toBe('waitBuild');
    expect(game.finishBuild(placed.entity.id)).toMatchObject({ ok: false, reason: 'notReady' });
    clock.advance(getBuildingDef('cottage').buildSec);
    expect(game.primaryAction(placed.entity).type).toBe('finishBuild');
    expect(game.finishBuild(placed.entity.id)).toMatchObject({ ok: true });
    expect(game.state.energy).toBe(energy);
    expect(game.state.xp).toBe(xp + getBuildingDef('cottage').xp);
    expect(placed.entity.built).toBe(true);
    expect(placed.entity.construction).toBeUndefined();
    expect(game.derived().population).toBe(45);
    clock.advance(300);
    expect(game.primaryAction(placed.entity).type).toBe('collectRent');
  });

  it('allonge les chantiers des bâtiments de haut niveau', () => {
    expect(getBuildingDef('cottage').buildSec).toBeLessThan(getBuildingDef('apartments').buildSec);
    expect(getBuildingDef('apartments').buildSec).toBeLessThan(getBuildingDef('skyscraper').buildSec);
  });

  it('permet de terminer un chantier contre du cash', () => {
    const { game } = setup();
    const spot = freeSpot(game, 'bakery');
    const placed = game.place('bakery', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    const cost = game.speedUpCost(placed.entity);
    expect(cost).toBeGreaterThan(0);
    const cash = game.state.cash;
    expect(game.speedUp(placed.entity.id)).toMatchObject({ ok: true, cost });
    expect(game.state.cash).toBe(cash - cost!);
    expect(placed.entity.built).toBe(true);
  });
});

describe('pêche', () => {
  it('impose le bord de l’eau aux ports et interdit de bâtir sur l’eau', () => {
    const { game } = setup();
    game.state.level = 4;
    const pier = getBuildingDef('pier');
    const cottage = getBuildingDef('cottage');
    let water: { x: number; y: number } | null = null;
    for (let y = 8; y < 32 && !water; y++) for (let x = 8; x < 32; x++) if (isWater(x, y)) water = { x, y };
    expect(water).not.toBeNull();
    expect(game.checkPlacement(cottage, water!.x, water!.y)).toBe('onWater');
    expect(game.checkPlacement(pier, 12, 12)).toBe('needsWater');
  });

  it('envoie le bateau en mer puis décharge la pêche', () => {
    const { game, clock } = setup();
    game.state.level = 4;
    game.state.coins = 10_000;
    const spot = freeSpot(game, 'pier');
    const placed = game.place('pier', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    game.speedUp(placed.entity.id);
    const pier = placed.entity;
    expect(game.primaryAction(pier).type).toBe('sendBoat');
    expect(game.sendBoat(pier.id, 'trawl')).toMatchObject({ ok: false, reason: 'invalid' });
    const trip = getTripDef('coastal');
    const coins = game.state.coins;
    expect(game.sendBoat(pier.id, trip.id).ok).toBe(true);
    expect(game.state.coins).toBe(coins - trip.cost);
    expect(game.primaryAction(pier).type).toBe('waitBoat');
    expect(game.unloadBoat(pier.id)).toMatchObject({ ok: false, reason: 'notReady' });
    clock.advance(trip.durationSec);
    expect(game.primaryAction(pier).type).toBe('unloadBoat');
    const goods = game.state.goods;
    expect(game.unloadBoat(pier.id)).toMatchObject({ ok: true, goods: trip.goods });
    expect(game.state.goods).toBe(goods + trip.goods);
    expect(game.primaryAction(pier).type).toBe('sendBoat');
  });
});

describe('les deux rives', () => {
  it('sépare la carte par un bras de mer et réserve la rive est au pont', () => {
    const { game } = setup();
    game.state.level = 20;
    game.state.coins = 1_000_000;
    game.state.cash = 100;
    // Zone de la rive est voisine de la ville de départ : visible mais fermée.
    expect(game.expansionInfo(4, 2)).toMatchObject({ status: 'purchasable', reason: 'needsBridge' });
    expect(game.buyExpansion(4, 2).ok).toBe(false);
    const bridge = getBuildingDef('bridge');
    expect(game.checkPlacement(bridge, 20, 20)).toBe('bridgeSpan');
    const x = coastX(20);
    expect(game.checkPlacement(bridge, x + 1, 20)).toBe('bridgeSpan');
    const placed = game.place('bridge', x, 20);
    if (!placed.ok) throw new Error(placed.reason);
    game.speedUp(placed.entity.id);
    expect(game.hasBridge()).toBe(true);
    expect(game.isRoad(x + 2, 20)).toBe(true);
    expect(game.expansionInfo(4, 2)).toMatchObject({ status: 'purchasable', reason: null });
    expect(game.buyExpansion(4, 2).ok).toBe(true);
  });

  it('exige le niveau 15 pour la rive est', () => {
    const { game } = setup();
    game.state.level = 12;
    expect(game.expansionInfo(4, 2)).toMatchObject({ level: 15, reason: 'levelLocked' });
  });
});

describe('marché', () => {
  it('met de côté, rend, achète et encaisse', () => {
    const { game } = setup();
    expect(game.marketReserve(10)).toMatchObject({ ok: false, reason: 'levelLocked' });
    game.state.level = 5;
    game.state.goods = 100;
    expect(game.marketReserve(150)).toMatchObject({ ok: false, reason: 'notEnoughGoods', missing: 50 });
    expect(game.marketReserve(60).ok).toBe(true);
    expect(game.state.goods).toBe(40);
    game.marketReturn(60);
    expect(game.state.goods).toBe(100);
    const coins = game.state.coins;
    expect(game.marketBuy(50, 200).ok).toBe(true);
    expect(game.state).toMatchObject({ goods: 150, coins: coins - 200 });
    expect(game.marketBuy(500, 10)).toMatchObject({ ok: false, reason: 'storageFull' });
    game.marketIncome(90);
    expect(game.state.coins).toBe(coins - 110);
  });
});

describe('boucle économique', () => {
  let game: Game;
  let clock: FakeClock;
  beforeEach(() => ({ game, clock } = setup()));

  it('encaisse un loyer puis attend le suivant', () => {
    const house = byDef(game, 'cottage')[0]!;
    const coins = game.state.coins;
    expect(game.collectRent(house.id)).toMatchObject({ ok: true });
    expect(game.state.coins).toBeGreaterThanOrEqual(coins + 30);
    expect(game.primaryAction(house).type).toBe('waitRent');
    expect(game.collectRent(house.id)).toMatchObject({ ok: false, reason: 'notReady' });
    const cottage = getBuildingDef('cottage');
    if (cottage.category !== 'house') throw new Error();
    clock.advance(cottage.rent.intervalSec);
    expect(game.collectRent(house.id).ok).toBe(true);
  });

  it('récolte, replante et fait pousser une culture', () => {
    const plot = byDef(game, 'plot')[0]!;
    const goods = game.state.goods;
    const strawberry = getCropDef('strawberry');
    expect(game.harvest(plot.id)).toMatchObject({ ok: true, goods: strawberry.goods });
    expect(game.state.goods).toBe(goods + strawberry.goods);
    expect(game.primaryAction(plot).type).toBe('plant');
    expect(game.plant(plot.id, 'wheat')).toMatchObject({ ok: false, reason: 'levelLocked' });
    expect(game.plant(plot.id, 'strawberry').ok).toBe(true);
    expect(game.primaryAction(plot).type).toBe('waitCrop');
    clock.advance(strawberry.growSec);
    expect(game.primaryAction(plot).type).toBe('harvest');
  });

  it('refuse la récolte quand l’entrepôt est plein', () => {
    const plot = byDef(game, 'plot')[0]!;
    game.state.goods = game.derived().goodsCap;
    expect(game.harvest(plot.id)).toMatchObject({ ok: false, reason: 'storageFull' });
  });

  it('approvisionne un commerce, sert les clients et encaisse', () => {
    const spot = freeSpot(game, 'bakery');
    const placed = game.place('bakery', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    game.speedUp(placed.entity.id);
    const bakery = placed.entity;
    expect(game.primaryAction(bakery).type).toBe('supply');
    game.state.goods = 10;
    expect(game.supply(bakery.id)).toMatchObject({ ok: false, reason: 'notEnoughGoods', missing: 10 });
    game.state.goods = 50;
    expect(game.supply(bakery.id).ok).toBe(true);
    expect(game.state.goods).toBe(30);
    const def = getBuildingDef('bakery');
    if (def.category !== 'business') throw new Error();
    clock.advance(def.serveSec / 2);
    expect(game.customersServed(bakery)).toEqual({ served: 5, total: 10 });
    expect(game.collectBusiness(bakery.id)).toMatchObject({ ok: false, reason: 'notReady' });
    clock.advance(def.serveSec / 2);
    const coins = game.state.coins;
    const collected = game.collectBusiness(bakery.id);
    expect(collected.ok).toBe(true);
    expect(game.state.coins).toBeGreaterThanOrEqual(coins + 150);
    expect(game.primaryAction(bakery).type).toBe('supply');
  });

  it('applique le bonus des décorations proches', () => {
    const house = byDef(game, 'cottage')[0]!;
    const before = game.decorationBonus(house);
    const def = getBuildingDef('flower_bed');
    // Une case libre au contact de la maison.
    const candidates = [
      [house.x - 1, house.y],
      [house.x + 2, house.y],
      [house.x, house.y - 1],
      [house.x, house.y + 2],
    ] as const;
    const spot = candidates.find(([x, y]) => game.checkPlacement(def, x, y) === null);
    if (!spot) throw new Error('pas de case libre');
    game.place('flower_bed', spot[0], spot[1]);
    expect(game.decorationBonus(house)).toBe(before + 2);
  });
});

describe('énergie et niveaux', () => {
  it('régénère une unité par période', () => {
    const { game, clock } = setup();
    game.state.energy = 5;
    game.state.energyUpdatedAt = clock.now();
    clock.advance(ENERGY_REGEN_SEC * 2.5);
    game.tick();
    expect(game.state.energy).toBe(7);
    expect(game.nextEnergyAt()).toBe(clock.now() - ENERGY_REGEN_SEC * 500 + ENERGY_REGEN_SEC * 1000);
  });

  it('ne dépasse pas le maximum par régénération', () => {
    const { game, clock } = setup();
    game.state.energy = energyMaxForLevel(1) - 1;
    clock.advance(ENERGY_REGEN_SEC * 10);
    game.tick();
    expect(game.state.energy).toBe(energyMaxForLevel(1));
    expect(game.nextEnergyAt()).toBeNull();
  });

  it('passe de niveau, récompense et recharge l’énergie', () => {
    const { game } = setup();
    const levels: number[] = [];
    game.events.on('levelUp', ({ level }) => levels.push(level));
    game.state.energy = 0;
    const cash = game.state.cash;
    game.devGrant({ xp: xpForLevel(3) });
    expect(game.state.level).toBe(3);
    expect(levels).toEqual([2, 3]);
    expect(game.state.cash).toBe(cash + 2);
    expect(game.state.energy).toBe(energyMaxForLevel(3));
  });
});

describe('objectifs', () => {
  it('enchaîne les objectifs de la ville de départ', () => {
    const { game } = setup();
    const completed: string[] = [];
    game.events.on('questCompleted', ({ questId }) => completed.push(questId));
    for (const house of byDef(game, 'cottage')) game.collectRent(house.id);
    expect(completed).toEqual(['welcome']);
    expect(game.activeQuests().map((q) => q.def.id)).toEqual(['harvest']);
    for (const plot of byDef(game, 'plot')) game.harvest(plot.id);
    expect(completed).toEqual(['welcome', 'harvest']);
    expect(game.activeQuests().map((q) => q.def.id)).toEqual(['plant', 'bakery']);
  });

  it('suit les tâches à plusieurs étapes', () => {
    const { game, clock } = setup();
    game.state.quests.completed.push('welcome', 'harvest');
    game.state.quests.active = [];
    const fresh = new Game(game.state, clock);
    const bakeryQuest = () => fresh.activeQuests().find((q) => q.def.id === 'bakery')!;
    const spot = freeSpot(fresh, 'bakery');
    const placed = fresh.place('bakery', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    expect(fresh.questTaskStatus(bakeryQuest().progress).map((t) => t.done)).toEqual([true, false, false, false]);
    clock.advance(getBuildingDef('bakery').buildSec);
    fresh.finishBuild(placed.entity.id);
    fresh.state.goods = 100;
    fresh.supply(placed.entity.id);
    expect(fresh.questTaskStatus(bakeryQuest().progress).map((t) => t.done)).toEqual([true, true, true, false]);
    clock.advance(3 * 60);
    fresh.collectBusiness(placed.entity.id);
    expect(fresh.state.quests.completed).toContain('bakery');
  });
});

describe('aides des objectifs', () => {
  it('compte les récoltes faites avant la fin de « Bienvenue »', () => {
    const { game } = setup();
    for (const plot of byDef(game, 'plot')) game.harvest(plot.id);
    expect(game.state.quests.completed).toContain('harvest');
  });

  it('propose de planter quand rien n’est mûr', () => {
    const { game } = setup();
    for (const house of byDef(game, 'cottage')) game.collectRent(house.id);
    const plots = byDef(game, 'plot');
    game.harvest(plots[0]!.id);
    for (const plot of plots.slice(1)) {
      plot.farm = { cropId: 'strawberry', plantedAt: game.now(), readyAt: game.now() + 60_000 };
    }
    const harvest = game.state.quests.active.find((q) => q.id === 'harvest')!;
    expect(findQuestHint(game, harvest)).toEqual({ kind: 'entity', entityId: plots[0]!.id });
  });

  it('guide vers l’approvisionnement avant l’encaissement', () => {
    const { game } = setup();
    game.state.quests.completed.push('welcome', 'harvest', 'bakery', 'houses');
    game.state.quests.active = [];
    game.devGrant({ xp: 15, coins: 5000 });
    const fresh = new Game(game.state, { now: () => game.now() });
    for (let i = 0; i < 2; i++) {
      const spot = freeSpot(fresh, 'cottage');
      const placed = fresh.place('cottage', spot.x, spot.y);
      if (placed.ok) fresh.speedUp(placed.entity.id);
    }
    const spot = freeSpot(fresh, 'flower_shop');
    const placed = fresh.place('flower_shop', spot.x, spot.y);
    if (!placed.ok) throw new Error(placed.reason);
    fresh.state.cash = 50;
    fresh.speedUp(placed.entity.id);
    const quest = fresh.state.quests.active.find((q) => q.id === 'flowers')!;
    expect(findQuestHint(fresh, quest)).toEqual({ kind: 'entity', entityId: placed.entity.id });
    expect(fresh.primaryAction(placed.entity).type).toBe('supply');
  });

  it('montre une zone achetable pour l’objectif d’agrandissement', () => {
    const { game } = setup();
    game.state.quests.completed.push('welcome', 'harvest', 'plant', 'bakery', 'houses', 'school');
    game.state.quests.active = [];
    const fresh = new Game(game.state, { now: () => game.now() });
    const quest = fresh.state.quests.active.find((q) => q.id === 'expand')!;
    const hint = findQuestHint(fresh, quest);
    expect(hint).toMatchObject({ kind: 'expand' });
    if (hint?.kind === 'expand') expect(fresh.expansionInfo(hint.cx, hint.cy).status).toBe('purchasable');
    expect(findHint(fresh)).not.toBeNull();
  });
});

describe('agrandissements', () => {
  it('ne vend que les zones adjacentes, au bon niveau', () => {
    const { game } = setup();
    expect(game.expansionInfo(2, 2)).toEqual({ status: 'unlocked' });
    expect(game.expansionInfo(0, 0)).toEqual({ status: 'unavailable' });
    expect(game.expansionInfo(0, 2)).toMatchObject({ status: 'purchasable', reason: 'levelLocked' });
    game.devGrant({ xp: xpForLevel(3) });
    const coins = game.state.coins;
    expect(game.buyExpansion(0, 2).ok).toBe(true);
    expect(game.state.coins).toBe(coins - 1500);
    expect(game.isTileUnlocked(0, 16)).toBe(true);
    expect(game.expansionInfo(0, 1)).toMatchObject({ status: 'purchasable' });
    // La grande route se prolonge dans la zone achetée (offerte).
    expect(game.isRoad(4, 20)).toBe(true);
  });

  it('fait payer plus cher les zones éloignées de la ville', () => {
    const near = expansionPrice(chunkDistance(4, 2), 0);
    const far = expansionPrice(chunkDistance(12, 9), 0);
    expect(far.coins).toBeGreaterThan(near.coins * 15);
    expect(far.level).toBeGreaterThan(near.level);
  });

  it('dessine une grande carte avec mer, montagnes, lacs et forêts', () => {
    const count = { water: 0, rock: 0, grass: 0, sand: 0 };
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) count[terrainAt(x, y)]++;
    expect(count.rock).toBeGreaterThan(300);
    expect(count.water).toBeGreaterThan(1000);
    expect(count.grass).toBeGreaterThan(MAP_W * MAP_H * 0.5);
    // La ville de départ est entièrement constructible.
    for (let y = 8; y < 32; y++) for (let x = 8; x < 28; x++) expect(terrainAt(x, y)).not.toBe('rock');
    const trees = sceneryOf(6, 4).filter((item) => item.defId !== 'road').length;
    expect(trees).toBeGreaterThan(0);
  });
});

describe('boutique', () => {
  it('échange du cash contre des pièces et de l’énergie', () => {
    const { game } = setup();
    game.state.cash = 20;
    const coins = game.state.coins;
    expect(game.buyCashOffer('coins_1000').ok).toBe(true);
    expect(game.state.coins).toBe(coins + 1000);
    game.state.energy = 2;
    expect(game.buyCashOffer('energy_full').ok).toBe(true);
    expect(game.state.energy).toBe(energyMaxForLevel(1));
    expect(game.buyCashOffer('coins_6000')).toMatchObject({ ok: false, reason: 'notEnoughCash' });
  });

  it('ne facture pas une recharge d’énergie quand la jauge est pleine', () => {
    const { game } = setup();
    game.state.cash = 20;
    expect(game.state.energy).toBe(energyMaxForLevel(1));
    expect(game.buyCashOffer('energy_full')).toMatchObject({ ok: false, reason: 'energyFull' });
    expect(game.state.cash).toBe(20);
  });

  it('crédite un achat réel une seule fois pour les offres uniques', () => {
    const { game } = setup();
    expect(game.grantStoreProduct('starter_pack').ok).toBe(true);
    expect(game.grantStoreProduct('starter_pack')).toMatchObject({ ok: false, reason: 'alreadyOwned' });
    expect(game.grantStoreProduct('cash_10').ok).toBe(true);
    expect(game.grantStoreProduct('cash_10').ok).toBe(true);
  });
});

describe('sauvegarde', () => {
  it('fait un aller-retour sans perte', () => {
    const { game, clock } = setup();
    game.collectRent(byDef(game, 'cottage')[0]!.id);
    const restored = deserialize(serialize(game.state, clock.now()));
    expect(restored).toEqual(game.state);
  });

  it('écarte les objectifs et cultures inconnus (contenu renommé)', () => {
    const { game, clock } = setup();
    const plot = byDef(game, 'plot')[0]!;
    const file = JSON.parse(serialize(game.state, clock.now()));
    file.state.quests.active.push({ id: 'quete_disparue', counts: [0], startedAt: 0 });
    file.state.quests.completed.push('autre_quete_disparue');
    file.state.entities.find((e: Entity) => e.id === plot.id).farm.cropId = 'mangue';
    const restored = deserialize(JSON.stringify(file));
    expect(restored).not.toBeNull();
    expect(restored!.quests.active.map((q) => q.id)).toEqual(['welcome', 'harvest']);
    expect(restored!.quests.completed).toEqual([]);
    expect(restored!.entities.find((e) => e.id === plot.id)!.farm!.cropId).toBeNull();
    expect(() => new Game(restored!, clock)).not.toThrow();
  });

  it('migre une sauvegarde v1 (coups de marteau) vers les minuteurs', () => {
    const { game, clock } = setup();
    const spot = freeSpot(game, 'cottage');
    const placed = game.place('cottage', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    const file = JSON.parse(serialize(game.state, clock.now()));
    file.version = 1;
    const raw = file.state.entities.find((e: Entity) => e.id === placed.entity.id);
    delete raw.construction;
    raw.buildProgress = 1;
    // Une route posée sur ce qui est désormais la mer disparaît.
    file.state.entities.push({ id: 9999, defId: 'road', x: 31, y: 20, built: true });
    const restored = deserialize(JSON.stringify(file))!;
    expect(restored.version).toBe(SAVE_VERSION);
    const migrated = restored.entities.find((e) => e.id === placed.entity.id)!;
    expect(migrated).not.toHaveProperty('buildProgress');
    expect(migrated.construction?.endsAt).toBe(clock.now() + getBuildingDef('cottage').buildSec * 1000);
    expect(restored.entities.some((e) => e.id === 9999)).toBe(false);
    expect(() => new Game(restored, clock)).not.toThrow();
  });

  it('rejette les données corrompues ou futures', () => {
    expect(deserialize('{pas du json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, state: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: 1, state: { coins: 'beaucoup' } }))).toBeNull();
  });

  it('reprend la progression hors-ligne (cultures, énergie)', () => {
    const { game, clock } = setup();
    const plot = byDef(game, 'plot')[0]!;
    game.harvest(plot.id);
    game.plant(plot.id, 'strawberry');
    const raw = serialize(game.state, clock.now());
    clock.advance(3600);
    const reloaded = new Game(deserialize(raw)!, clock);
    expect(reloaded.primaryAction(reloaded.getEntity(plot.id)!).type).toBe('harvest');
    expect(reloaded.state.energy).toBe(energyMaxForLevel(reloaded.state.level));
  });
});

describe('récompense quotidienne', () => {
  it('suit une série de 7 jours et repart au jour 1 après un jour manqué', () => {
    const { game } = setup();
    expect(game.dailyStatus('2026-10-18')).toMatchObject({ available: true, day: 1 });
    const coins = game.state.coins;
    const first = game.claimDailyReward('2026-10-18');
    expect(first.ok).toBe(true);
    expect(game.state.coins).toBeGreaterThan(coins);
    expect(game.claimDailyReward('2026-10-18')).toMatchObject({ ok: false, reason: 'notReady' });
    expect(game.dailyStatus('2026-10-18')).toMatchObject({ available: false, day: 1 });

    // Passage de mois et série complète : le 7e jour donne des billets.
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
    for (const day of days) expect(game.claimDailyReward(day).ok).toBe(true);
    expect(game.state.daily.streak).toBe(7);
    expect(game.dailyStatus('2026-10-24').reward.cash).toBeGreaterThan(0);
    expect(game.dailyStatus('2026-10-25')).toMatchObject({ available: true, day: 1 });
    expect(game.claimDailyReward('2026-10-25').ok).toBe(true);
    expect(game.dailyStatus('2026-10-26').day).toBe(2);
    expect(game.dailyStatus('2026-10-28').day).toBe(1);
    expect(game.dailyStatus('2026-11-01')).toMatchObject({ available: true, day: 1 });
  });

  it('refuse une date antérieure ou mal formée', () => {
    const { game } = setup();
    expect(game.claimDailyReward('2026-10-18').ok).toBe(true);
    expect(game.claimDailyReward('2026-10-17')).toMatchObject({ ok: false, reason: 'notReady' });
    expect(game.claimDailyReward('hier')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('migre une sauvegarde v4 et conserve la série', () => {
    const { game, clock } = setup();
    game.claimDailyReward('2026-03-30');
    const file = JSON.parse(serialize(game.state, clock.now()));
    expect(deserialize(JSON.stringify(file))!.daily).toEqual({ lastDay: '2026-03-30', streak: 1 });
    file.version = 4;
    delete file.state.daily;
    expect(deserialize(JSON.stringify(file))!.daily).toEqual({ lastDay: null, streak: 0 });
  });
});

describe('objectifs voisins et marché', () => {
  it('progressent avec les visites, l’aide et le marché', () => {
    const { game } = setup();
    game.devGrant({ xp: 2000, goods: 50 });
    const active = () => game.state.quests.active.map((q) => q.id);
    expect(active()).toContain('neighbors');
    expect(active()).toContain('market');
    expect(
      findQuestHint(
        game,
        game.state.quests.active.find((q) => q.id === 'neighbors')!,
      ),
    ).toEqual({
      kind: 'social',
      tab: 'neighbors',
    });
    game.visitedNeighbor();
    game.rewardHelpGiven();
    game.rewardHelpGiven();
    expect(game.state.quests.completed).toContain('neighbors');

    expect(game.marketReserve(10).ok).toBe(true);
    game.marketListed();
    expect(game.state.quests.completed).toContain('market');
    if (game.state.level >= 8) {
      expect(active()).toContain('trader');
      expect(game.marketBuy(10, 20).ok).toBe(true);
      const trader = game.state.quests.active.find((q) => q.id === 'trader')!;
      expect(trader.counts[0]).toBe(1);
    }
  });
});
