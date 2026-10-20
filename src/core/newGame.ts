import { START_RESOURCES, STARTING_CHUNKS } from '@/data/balance';
import { getBuildingDef } from '@/data/buildings';
import { getCropDef } from '@/data/crops';
import { STARTING_TOWN, type StartingPlacement } from '@/data/startingTown';
import { chunkKey } from './grid';
import type { DailyState, Entity, GameState } from './types';

export const SAVE_VERSION = 7;

/** Ouvriers au début de la partie (un deuxième s'achète dans la boutique). */
export const START_WORKERS = 1;

export function emptyDaily(): DailyState {
  return { day: '', tasks: [], bonus: {}, bonusClaimed: false };
}

/** Initialise l'état propre à la catégorie d'une construction terminée. */
export function initBuiltState(entity: Entity, now: number): void {
  const def = getBuildingDef(entity.defId);
  switch (def.category) {
    case 'house':
      entity.house = { readyAt: now + def.rent.intervalSec * 1000 };
      break;
    case 'business':
      entity.business = { readyAt: null, suppliedAt: null };
      break;
    case 'farm':
      entity.farm = { cropId: null, plantedAt: 0, readyAt: 0 };
      break;
    case 'port':
      entity.port = { tripId: null, startedAt: 0, readyAt: 0 };
      break;
    case 'station':
      entity.station = { shipmentId: null, startedAt: 0, readyAt: 0 };
      break;
    default:
      break;
  }
}

function starterEntity(id: number, placement: StartingPlacement, now: number): Entity {
  const entity: Entity = {
    id,
    defId: placement.defId,
    x: placement.x,
    y: placement.y,
    built: true,
    starter: true,
  };
  initBuiltState(entity, now);
  if (placement.preset === 'rentReady' && entity.house) entity.house.readyAt = now;
  if (placement.preset === 'ripeStrawberry' && entity.farm) {
    const crop = getCropDef('strawberry');
    entity.farm = { cropId: crop.id, plantedAt: now - crop.growSec * 1000, readyAt: now };
  }
  return entity;
}

export function createNewGame(now: number, cityName = 'Ma ville'): GameState {
  // Les forêts des zones à acheter sont du décor (src/data/scenery.ts), pas des constructions.
  const placements = STARTING_TOWN;
  const entities = placements.map((placement, index) => starterEntity(index + 1, placement, now));
  return {
    version: SAVE_VERSION,
    createdAt: now,
    cityName,
    coins: START_RESOURCES.coins,
    cash: START_RESOURCES.cash,
    xp: 0,
    level: 1,
    goods: START_RESOURCES.goods,
    energy: START_RESOURCES.energy,
    workers: START_WORKERS,
    energyUpdatedAt: now,
    entities,
    nextEntityId: entities.length + 1,
    unlockedChunks: STARTING_CHUNKS.map(([cx, cy]) => chunkKey(cx, cy)),
    expansionsBought: 0,
    quests: { active: [], completed: [] },
    oneTimePurchases: [],
    stats: {},
    tutorial: { introSeen: false },
    daily: emptyDaily(),
    loginStreak: { lastDay: null, streak: 0 },
  };
}
