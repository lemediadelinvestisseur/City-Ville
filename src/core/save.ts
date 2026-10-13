import { findBuildingDef } from '@/data/buildings';
import { findCropDef } from '@/data/crops';
import { findQuestDef } from '@/data/quests';
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

/**
 * Migrations successives : `MIGRATIONS[n]` transforme un état de version n
 * en version n + 1. Ajouter une entrée à chaque changement de format.
 */
const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {};

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
  if (version > SAVE_VERSION) return null;
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null;
    state = migrate(state);
    version += 1;
  }
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
