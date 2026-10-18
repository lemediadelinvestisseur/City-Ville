import { findBuildingDef } from '@/data/buildings';
import { findCropDef } from '@/data/crops';
import { findQuestDef } from '@/data/quests';
import { CHUNK_SIZE, EAST_CHUNK_X } from '@/data/balance';
import { wildTrees } from '@/data/startingTown';
import { isWater } from '@/data/terrain';
import { SAVE_VERSION } from './newGame';
import type { GameState } from './types';

/** Accès au stockage clé/valeur (localStorage en web, Preferences en natif…). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

type Migration = (state: Record<string, unknown>, savedAt: number) => Record<string, unknown>;

/** Une construction (format brut) recouvre-t-elle une case d'eau ? */
function overlapsWater(entity: Record<string, unknown>): boolean {
  const def = typeof entity.defId === 'string' ? findBuildingDef(entity.defId) : undefined;
  if (!def || typeof entity.x !== 'number' || typeof entity.y !== 'number') return false;
  for (let dy = 0; dy < def.size.d; dy++) {
    for (let dx = 0; dx < def.size.w; dx++) {
      if (isWater(entity.x + dx, entity.y + dy)) return true;
    }
  }
  return false;
}

/**
 * Migrations successives : `MIGRATIONS[n]` transforme un état de version n
 * en version n + 1. Ajouter une entrée à chaque changement de format.
 */
const MIGRATIONS: Record<number, Migration> = {
  /** v1 → v2 : chantiers à minuteur (plus de coups de marteau) et arrivée de la mer. */
  1: (state, savedAt) => {
    const entities = Array.isArray(state.entities) ? (state.entities as unknown[]) : [];
    state.entities = entities.filter(isObject).filter((entity) => {
      if (overlapsWater(entity)) return false;
      const def = typeof entity.defId === 'string' ? findBuildingDef(entity.defId) : undefined;
      if (def && entity.built === false) {
        entity.construction = { startedAt: savedAt, endsAt: savedAt + def.buildSec * 1000 };
      }
      delete entity.buildProgress;
      return true;
    });
    return state;
  },
  /** v2 → v3 : la mer à l'est devient un bras de mer ; une rive est boisée apparaît. */
  2: (state) => {
    const entities = Array.isArray(state.entities) ? (state.entities as unknown[]).filter(isObject) : [];
    let nextId = typeof state.nextEntityId === 'number' ? state.nextEntityId : entities.length + 1;
    for (const tree of wildTrees()) {
      if (tree.x < EAST_CHUNK_X * CHUNK_SIZE) continue;
      entities.push({ id: nextId++, defId: tree.defId, x: tree.x, y: tree.y, built: true, starter: true });
    }
    state.entities = entities;
    state.nextEntityId = nextId;
    return state;
  },
};

export function serialize(state: GameState, now: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state };
  return JSON.stringify(file);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Relit une sauvegarde ; renvoie null si elle est absente, corrompue ou incompatible. */
export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed) || typeof parsed.version !== 'number' || !isObject(parsed.state)) return null;
  let version = parsed.version;
  let state = parsed.state;
  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now();
  if (version > SAVE_VERSION) return null;
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null;
    state = migrate(state, savedAt);
    version += 1;
  }
  state.version = SAVE_VERSION;
  return validate(state) ? (state as unknown as GameState) : null;
}

function validate(state: Record<string, unknown>): boolean {
  const numbers = ['coins', 'cash', 'xp', 'level', 'goods', 'energy', 'energyUpdatedAt', 'nextEntityId'];
  if (!numbers.every((key) => typeof state[key] === 'number' && Number.isFinite(state[key]))) return false;
  if (!Array.isArray(state.entities) || !Array.isArray(state.unlockedChunks)) return false;
  if (!isObject(state.quests) || !isObject(state.tutorial) || !isObject(state.stats)) return false;
  const quests = state.quests;
  if (!Array.isArray(quests.active) || !Array.isArray(quests.completed)) return false;
  // Contenu retiré ou renommé par une mise à jour : on l'écarte plutôt que de bloquer la partie.
  state.entities = (state.entities as Array<Record<string, unknown>>).filter(
    (e) => isObject(e) && typeof e.defId === 'string' && findBuildingDef(e.defId) !== undefined,
  );
  for (const entity of state.entities as Array<Record<string, unknown>>) {
    const farm = entity.farm;
    if (isObject(farm) && farm.cropId !== null && (typeof farm.cropId !== 'string' || !findCropDef(farm.cropId))) {
      entity.farm = { cropId: null, plantedAt: 0, readyAt: 0 };
    }
  }
  quests.active = (quests.active as unknown[]).filter(
    (q) => isObject(q) && typeof q.id === 'string' && findQuestDef(q.id) !== undefined && Array.isArray(q.counts),
  );
  quests.completed = (quests.completed as unknown[]).filter((id) => typeof id === 'string' && findQuestDef(id));
  return true;
}

export function loadGame(storage: KeyValueStorage, key: string): GameState | null {
  try {
    return deserialize(storage.getItem(key));
  } catch {
    return null;
  }
}

export function saveGame(storage: KeyValueStorage, key: string, state: GameState, now: number): boolean {
  try {
    storage.setItem(key, serialize(state, now));
    return true;
  } catch {
    return false;
  }
}
