import { beforeEach, describe, expect, it } from 'vitest';
import { ENERGY_REGEN_SEC, energyMaxForLevel, xpForLevel } from '@/data/balance';
import { getBuildingDef } from '@/data/buildings';
import { Game, type Clock } from './game';
import { createNewGame } from './newGame';
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
    expect(game.activeQuests().map((q) => q.def.id)).toEqual(['welcome']);
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
    expect(game.place('cottage', 1, 1)).toMatchObject({ ok: false, reason: 'locked' });
    expect(game.place('cottage', 39, 39)).toMatchObject({ ok: false, reason: 'outOfBounds' });
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
      expect(game.primaryAction(result.entity)).toEqual({ type: 'build' });
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
  it('termine le chantier après le bon nombre de coups (1 énergie chacun)', () => {
    const { game, clock } = setup();
    const spot = freeSpot(game, 'cottage');
    const placed = game.place('cottage', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    const energy = game.state.energy;
    expect(game.buildStep(placed.entity.id)).toMatchObject({ ok: true, completed: false });
    expect(game.buildStep(placed.entity.id)).toMatchObject({ ok: true, completed: false });
    expect(game.buildStep(placed.entity.id)).toMatchObject({ ok: true, completed: true });
    expect(game.state.energy).toBe(energy - 3);
    expect(placed.entity.built).toBe(true);
    expect(game.derived().population).toBe(45);
    clock.advance(180);
    expect(game.primaryAction(placed.entity).type).toBe('collectRent');
  });

  it('refuse un coup de marteau sans énergie', () => {
    const { game } = setup();
    const spot = freeSpot(game, 'cottage');
    const placed = game.place('cottage', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    game.state.energy = 0;
    expect(game.buildStep(placed.entity.id)).toMatchObject({ ok: false, reason: 'notEnoughEnergy' });
  });

  it('permet de terminer un chantier contre du cash', () => {
    const { game } = setup();
    const spot = freeSpot(game, 'bakery');
    const placed = game.place('bakery', spot.x, spot.y);
    if (!placed.ok) throw new Error();
    expect(game.speedUpCost(placed.entity)).toBe(4);
    const cash = game.state.cash;
    expect(game.speedUp(placed.entity.id)).toMatchObject({ ok: true, cost: 4 });
    expect(game.state.cash).toBe(cash - 4);
    expect(placed.entity.built).toBe(true);
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
    clock.advance(180);
    expect(game.collectRent(house.id).ok).toBe(true);
  });

  it('récolte, replante et fait pousser une culture', () => {
    const plot = byDef(game, 'plot')[0]!;
    const goods = game.state.goods;
    expect(game.harvest(plot.id)).toMatchObject({ ok: true, goods: 8 });
    expect(game.state.goods).toBe(goods + 8);
    expect(game.primaryAction(plot).type).toBe('plant');
    expect(game.plant(plot.id, 'wheat')).toMatchObject({ ok: false, reason: 'levelLocked' });
    expect(game.plant(plot.id, 'strawberry').ok).toBe(true);
    expect(game.primaryAction(plot).type).toBe('waitCrop');
    clock.advance(60);
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
    clock.advance(60);
    expect(game.customersServed(bakery)).toEqual({ served: 5, total: 10 });
    expect(game.collectBusiness(bakery.id)).toMatchObject({ ok: false, reason: 'notReady' });
    clock.advance(60);
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
    for (let i = 0; i < 4; i++) fresh.buildStep(placed.entity.id);
    fresh.state.goods = 100;
    fresh.supply(placed.entity.id);
    expect(fresh.questTaskStatus(bakeryQuest().progress).map((t) => t.done)).toEqual([true, true, true, false]);
    clock.advance(120);
    fresh.collectBusiness(placed.entity.id);
    expect(fresh.state.quests.completed).toContain('bakery');
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
    expect(game.state.coins).toBe(coins - 2000);
    expect(game.isTileUnlocked(0, 16)).toBe(true);
    expect(game.expansionInfo(0, 1)).toMatchObject({ status: 'purchasable' });
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
