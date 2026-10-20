import { findBuildingDef } from '@/data/buildings';
import { findCropDef } from '@/data/crops';
import { findQuestDef } from '@/data/quests';
import { CHUNK_SIZE } from '@/data/balance';
import { isSceneryRail } from '@/data/scenery';
import { isWater, terrainAt } from '@/data/terrain';
import { OccupancyGrid, chunkKey, chunkOf, inBounds } from './grid';
import { SAVE_VERSION, START_WORKERS, emptyDaily } from './newGame';
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

/** Bâtiments agrandis en v8 (emprises plus réalistes) ; l'épicerie, elle, rétrécit. */
const GROWN_IN_V8: ReadonlySet<string> = new Set([
  'library',
  'town_hall',
  'museum',
  'school',
  'convention_center',
  'hospital',
  'supermarket',
  'skyscraper',
  'mall',
  'amusement_park',
  'university',
  'stadium',
  'airport',
]);

/** Distance maximale (en cases) d'un décalage lors de la migration v7 → v8. */
const MAX_SHIFT_V8 = 6;

/** Décalages candidats, du plus proche au plus lointain (anneaux successifs). */
function spiralOffsets(maxShift: number): Array<{ dx: number; dy: number }> {
  const offsets: Array<{ dx: number; dy: number }> = [];
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      if (dx !== 0 || dy !== 0) offsets.push({ dx, dy });
    }
  }
  const ring = (o: { dx: number; dy: number }): number => Math.max(Math.abs(o.dx), Math.abs(o.dy));
  // Tri stable : anneau, puis distance réelle, puis ordre de balayage.
  return offsets.sort((a, b) => ring(a) - ring(b) || a.dx * a.dx + a.dy * a.dy - (b.dx * b.dx + b.dy * b.dy));
}

/**
 * v7 → v8 : certaines constructions s'agrandissent. Celles dont la nouvelle emprise
 * déborde (autre construction, eau, montagne, zone non débloquée, bord de carte)
 * sont décalées vers l'emplacement libre le plus proche (mêmes règles que
 * `Game.checkPlacement`), sinon retirées et remboursées en pièces.
 */
function migrateFootprintsV8(state: Record<string, unknown>): Record<string, unknown> {
  const unlocked = new Set(Array.isArray(state.unlockedChunks) ? (state.unlockedChunks as unknown[]) : []);
  const entities = Array.isArray(state.entities) ? (state.entities as unknown[]).filter(isObject) : [];
  const defOf = (entity: Record<string, unknown>) =>
    typeof entity.defId === 'string' ? findBuildingDef(entity.defId) : undefined;
  const placed = (entity: Record<string, unknown>): entity is Record<string, unknown> & { x: number; y: number } =>
    typeof entity.x === 'number' && typeof entity.y === 'number';
  const idOf = (entity: Record<string, unknown>): number => (typeof entity.id === 'number' ? entity.id : 0);

  const grown = entities.filter((e) => typeof e.defId === 'string' && GROWN_IN_V8.has(e.defId) && placed(e));
  const grownSet = new Set(grown);

  const grid = new OccupancyGrid();
  for (const entity of entities) {
    const def = defOf(entity);
    if (def && placed(entity) && !grownSet.has(entity)) grid.fill(entity.x, entity.y, def.size, idOf(entity) || -1);
  }

  const one = { w: 1, d: 1 };
  const fits = (x: number, y: number, w: number, d: number): boolean => {
    if (!inBounds(x, y) || !inBounds(x + w - 1, y + d - 1)) return false;
    for (let dy = 0; dy < d; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const terrain = terrainAt(x + dx, y + dy);
        if (terrain === 'water' || terrain === 'rock') return false;
        const { cx, cy } = chunkOf(x + dx, y + dy);
        if (!unlocked.has(chunkKey(cx, cy))) return false;
      }
    }
    return grid.isFree(x, y, { w, d });
  };

  // L'hôtel de ville de départ, passé en 4 × 4, recouvre des massifs de fleurs de départ :
  // comme dans une nouvelle partie, ces fleurs glissent d'une case vers l'est.
  // (21,16) : ville de départ d'avant les routes obligatoires ; (20,17) : celle d'après,
  // où l'hôtel de ville remonte aussi d'une case pour ne pas mordre sur la route.
  const starter = (defId: string, x: number, y: number) =>
    entities.find((e) => e.starter === true && e.defId === defId && e.x === x && e.y === y);
  const moveFlowers = (from: ReadonlyArray<readonly [number, number]>) => {
    for (const [fx, fy] of from) {
      const flowers = starter('flower_bed', fx, fy);
      if (!flowers) continue;
      grid.fill(fx, fy, one, 0);
      if (fits(fx + 1, fy, 1, 1)) flowers.x = fx + 1;
      grid.fill(flowers.x as number, fy, one, idOf(flowers) || -1);
    }
  };
  const oldHall = starter('town_hall', 21, 16);
  if (oldHall && grown.includes(oldHall)) moveFlowers([[24, 18]]);
  const hall = starter('town_hall', 20, 17);
  if (hall && grown.includes(hall)) {
    moveFlowers([
      [23, 17],
      [23, 19],
    ]);
    if (fits(20, 16, 4, 4)) hall.y = 16;
  }

  // Une construction déplacée doit de préférence rester au bord d'une route.
  const roads = new Set(entities.filter((e) => e.defId === 'road' && placed(e)).map((e) => `${e.x},${e.y}`));
  const touchesRoad = (x: number, y: number, w: number, d: number): boolean => {
    for (let i = -1; i <= w; i++) {
      if (roads.has(`${x + i},${y - 1}`) || roads.has(`${x + i},${y + d}`)) return true;
    }
    for (let j = 0; j < d; j++) {
      if (roads.has(`${x - 1},${y + j}`) || roads.has(`${x + w},${y + j}`)) return true;
    }
    return false;
  };

  const offsets = spiralOffsets(MAX_SHIFT_V8);
  const removed = new Set<Record<string, unknown>>();
  let refund = 0;
  for (const entity of [...grown].sort((a, b) => idOf(a) - idOf(b))) {
    const def = defOf(entity);
    if (!def || !placed(entity)) continue;
    const { w, d } = def.size;
    let spot: { x: number; y: number } | null = fits(entity.x, entity.y, w, d) ? { x: entity.x, y: entity.y } : null;
    // Deux passes : d'abord une place au bord d'une route, sinon n'importe quelle place libre.
    for (const needRoad of spot ? [] : [true, false]) {
      const found = offsets.find(
        ({ dx, dy }) =>
          fits(entity.x + dx, entity.y + dy, w, d) && (!needRoad || touchesRoad(entity.x + dx, entity.y + dy, w, d)),
      );
      if (found) {
        spot = { x: entity.x + found.dx, y: entity.y + found.dy };
        break;
      }
    }
    if (!spot) {
      removed.add(entity);
      if (entity.starter !== true) refund += def.cost.coins ?? 0;
      continue;
    }
    // Seule la position change : loyer, chantier, amélioration… sont conservés.
    entity.x = spot.x;
    entity.y = spot.y;
    grid.fill(spot.x, spot.y, def.size, idOf(entity) || -1);
  }
  state.entities = entities.filter((e) => !removed.has(e));
  if (typeof state.coins === 'number') state.coins += refund;
  return state;
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
  /** v2 → v3 : la mer à l'est devient un bras de mer (la rive est boisée est désormais un décor). */
  2: (state) => state,
  /**
   * v3 → v4 : la carte s'agrandit (forêts, montagnes, lacs). Les arbres sauvages
   * des zones non achetées deviennent du décor ; une construction tombée dans
   * l'eau d'un nouveau rivage est retirée et remboursée.
   */
  3: (state) => {
    const unlocked = new Set(Array.isArray(state.unlockedChunks) ? (state.unlockedChunks as unknown[]) : []);
    const entities = Array.isArray(state.entities) ? (state.entities as unknown[]).filter(isObject) : [];
    let refund = 0;
    state.entities = entities.filter((entity) => {
      const x = typeof entity.x === 'number' ? entity.x : 0;
      const y = typeof entity.y === 'number' ? entity.y : 0;
      const chunk = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
      const wildTree = entity.starter === true && typeof entity.defId === 'string' && entity.defId.startsWith('tree_');
      if (wildTree && !unlocked.has(chunk)) return false;
      if (overlapsWater(entity)) {
        const def = typeof entity.defId === 'string' ? findBuildingDef(entity.defId) : undefined;
        if (def && entity.starter !== true) refund += def.cost.coins ?? 0;
        return false;
      }
      return true;
    });
    if (typeof state.coins === 'number') state.coins += refund;
    return state;
  },
  /** v4 → v5 : défis du jour. */
  4: (state) => {
    state.daily = emptyDaily();
    return state;
  },
  /** v5 → v6 : récompense de connexion (série de 7 jours) et améliorations ★ (champs optionnels). */
  5: (state) => {
    state.loginStreak = { lastDay: null, streak: 0 };
    return state;
  },
  /**
   * v6 → v7 : ouvriers, champs 1 × 1 (même case d'origine), la gare devient un
   * terminus de trains et la voie ferrée apparaît dans les zones déjà achetées
   * (à la place des arbres sauvages, sans toucher aux constructions du joueur).
   */
  6: (state) => {
    state.workers = START_WORKERS;
    const unlocked = new Set(Array.isArray(state.unlockedChunks) ? (state.unlockedChunks as unknown[]) : []);
    let entities = Array.isArray(state.entities) ? (state.entities as unknown[]).filter(isObject) : [];
    const onRail = (e: Record<string, unknown>) =>
      typeof e.x === 'number' && typeof e.y === 'number' && isSceneryRail(e.x, e.y);
    entities = entities.filter(
      (e) => !(onRail(e) && e.starter === true && typeof e.defId === 'string' && e.defId.startsWith('tree_')),
    );
    const occupied = new Set<string>();
    for (const entity of entities) {
      const def = typeof entity.defId === 'string' ? findBuildingDef(entity.defId) : undefined;
      if (entity.defId === 'train_station' && entity.built === true) {
        entity.station = { shipmentId: null, startedAt: 0, readyAt: 0 };
      }
      if (!def || typeof entity.x !== 'number' || typeof entity.y !== 'number') continue;
      for (let dy = 0; dy < def.size.d; dy++) {
        for (let dx = 0; dx < def.size.w; dx++) occupied.add(`${entity.x + dx},${entity.y + dy}`);
      }
    }
    let nextId = typeof state.nextEntityId === 'number' ? state.nextEntityId : entities.length + 1;
    for (const key of unlocked) {
      if (typeof key !== 'string') continue;
      const [cx = 0, cy = 0] = key.split(',').map(Number);
      for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
        for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
          if (!isSceneryRail(x, y) || occupied.has(`${x},${y}`)) continue;
          entities.push({ id: nextId++, defId: 'rail', x, y, built: true, starter: true });
        }
      }
    }
    state.entities = entities;
    state.nextEntityId = nextId;
    return state;
  },
  /** v7 → v8 : emprises plus réalistes (voir `migrateFootprintsV8`). */
  7: migrateFootprintsV8,
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
  const numbers = ['coins', 'cash', 'xp', 'level', 'goods', 'energy', 'workers', 'energyUpdatedAt', 'nextEntityId'];
  if (!numbers.every((key) => typeof state[key] === 'number' && Number.isFinite(state[key]))) return false;
  if (!Array.isArray(state.entities) || !Array.isArray(state.unlockedChunks)) return false;
  if (!isObject(state.quests) || !isObject(state.tutorial) || !isObject(state.stats)) return false;
  const login = state.loginStreak;
  if (!isObject(login) || (login.lastDay !== null && typeof login.lastDay !== 'string')) return false;
  if (typeof login.streak !== 'number' || !Number.isFinite(login.streak)) return false;
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
  if (!isValidDaily(state.daily)) state.daily = emptyDaily();
  return true;
}

function isValidDaily(daily: unknown): boolean {
  if (!isObject(daily) || typeof daily.day !== 'string' || !Array.isArray(daily.tasks)) return false;
  if (!isObject(daily.bonus) || typeof daily.bonusClaimed !== 'boolean') return false;
  return daily.tasks.every(
    (task) =>
      isObject(task) &&
      typeof task.type === 'string' &&
      typeof task.target === 'number' &&
      typeof task.count === 'number' &&
      typeof task.claimed === 'boolean' &&
      isObject(task.reward),
  );
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
