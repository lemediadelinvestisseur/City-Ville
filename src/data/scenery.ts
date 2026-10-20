import { CHUNK_SIZE, MAP_H, MAP_W, STARTING_CHUNKS } from './balance';
import {
  coastX,
  eastCoastX,
  hash2,
  isBuildableTerrain,
  smoothNoise,
  southSeaY,
  terrainAt,
  visualTerrainAt,
} from './terrain';

/**
 * Décor des zones encore sauvages : forêts et routes qui se prolongent au-delà
 * de la ville. Déterministe : il est recalculé (jamais sauvegardé) tant que la
 * zone n'est pas achetée ; à l'achat, il devient de vraies constructions
 * (arbres à défricher, routes offertes).
 */

export interface SceneryItem {
  defId: 'tree_oak' | 'tree_pine' | 'road' | 'rail';
  x: number;
  y: number;
}

/** Grandes routes : rangées et colonnes qui traversent la carte. */
const ROAD_ROWS = [20, 60];
const ROAD_COLS = [19, 52, 90];

/**
 * Voie ferrée : elle sort des montagnes au nord (tunnel hors de la carte) et
 * descend à l'ouest de la ville de départ jusqu'à un butoir, avant la grande route.
 */
export const RAIL_X = 4;
export const RAIL_END_Y = 18;

export function isSceneryRail(x: number, y: number): boolean {
  return x === RAIL_X && y >= 0 && y <= RAIL_END_Y;
}

/** Zone de la ville de départ (ses routes et arbres sont posés à la main). */
function inStartingArea(x: number, y: number): boolean {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  return STARTING_CHUNKS.some(([sx, sy]) => sx === cx && sy === cy);
}

/** Case de route du réseau de départ, hors de la ville initiale. */
export function isSceneryRoad(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  if (inStartingArea(x, y) || !isBuildableTerrain(x, y)) return false;
  if (ROAD_ROWS.includes(y)) {
    // Les routes s'arrêtent avant la plage du bras de mer (un pont les reliera).
    return x < coastX(y) - 1 || x > eastCoastX(y);
  }
  if (ROAD_COLS.includes(x)) return y < southSeaY(x) - 1;
  return false;
}

/** Densité de forêt (0 à 1) : grands massifs boisés et clairières. */
export function forestDensity(x: number, y: number): number {
  const n = smoothNoise(x, y, 11, 7) * 0.7 + smoothNoise(x, y, 4, 8) * 0.3;
  return Math.max(0, Math.min(1, (n - 0.42) * 2.4));
}

/** Arbre sauvage sur cette case (null s'il n'y en a pas). */
export function wildTreeAt(x: number, y: number): SceneryItem['defId'] | null {
  if (terrainAt(x, y) !== 'grass' || isSceneryRoad(x, y) || isSceneryRail(x, y)) return null;
  // Pas d'arbre au bord immédiat des routes : elles restent visibles.
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (isSceneryRoad(x + dx, y + dy) || isSceneryRail(x + dx, y + dy)) return null;
  }
  const density = forestDensity(x, y);
  const chance = 0.04 + density * 0.6;
  if (hash2(x, y, 3) >= chance) return null;
  return hash2(x, y, 4) < 0.55 ? 'tree_pine' : 'tree_oak';
}

/** Décor d'une zone (arbres et routes). Vide pour les zones de départ. */
export function sceneryOf(cx: number, cy: number): SceneryItem[] {
  const items: SceneryItem[] = [];
  for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_H, (cy + 1) * CHUNK_SIZE); y++) {
    for (let x = cx * CHUNK_SIZE; x < Math.min(MAP_W, (cx + 1) * CHUNK_SIZE); x++) {
      if (inStartingArea(x, y)) continue;
      if (isSceneryRail(x, y)) {
        items.push({ defId: 'rail', x, y });
        continue;
      }
      if (isSceneryRoad(x, y)) {
        items.push({ defId: 'road', x, y });
        continue;
      }
      const tree = wildTreeAt(x, y);
      if (tree) items.push({ defId: tree, x, y });
    }
  }
  return items;
}

/** Distance (0 à `max`, en cases) entre une case et le terrain non rocheux le plus proche. */
function rockDepth(x: number, y: number, max = 3): number {
  for (let r = 0; r < max; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (visualTerrainAt(x + dx, y + dy) !== 'rock') return r;
      }
    }
  }
  return max;
}

export type PeakSize = 'big' | 'medium' | 'small';

export interface Peak {
  /** Centre du relief, en cases (fractionnaire). */
  x: number;
  y: number;
  size: PeakSize;
  /** Variante (0 à 2) dans sa taille. */
  variant: number;
  /** Échelle d'affichage : les sommets grandissent vers le cœur des massifs. */
  scale: number;
}

/** Grand sommet du bloc 4 × 4 (bx, by), au cœur des massifs. */
function bigPeak(bx: number, by: number): Peak | null {
  const x = bx * 4 + 0.8 + hash2(bx, by, 13) * 2.4;
  const y = by * 4 + 0.8 + hash2(bx, by, 14) * 2.4;
  const depth = rockDepth(Math.floor(x), Math.floor(y), 7);
  if (depth < 3 || hash2(bx, by, 15) > 0.85) return null;
  const scale = 0.72 + (depth - 3) * 0.1 + hash2(bx, by, 17) * 0.16;
  return { x, y, size: 'big', variant: Math.floor(hash2(bx, by, 16) * 3), scale };
}

/** Sommet moyen ou piton de la case paire (gx, gy), sauf trop près d'un plus grand. */
function smallerPeak(gx: number, gy: number, size: 'medium' | 'small'): Peak | null {
  const x = gx + 0.5 + hash2(gx, gy, 11);
  const y = gy + 0.5 + hash2(gx, gy, 12);
  const depth = rockDepth(Math.floor(x), Math.floor(y));
  if (size === 'medium' ? depth < 2 : depth !== 1) return null;
  if (hash2(gx, gy, size === 'medium' ? 9 : 17) > (size === 'medium' ? 0.75 : 0.5)) return null;
  const bx = Math.floor(gx / 4);
  const by = Math.floor(gy / 4);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const big = bigPeak(bx + dx, by + dy);
      if (big && Math.hypot(big.x - x, big.y - y) < (size === 'medium' ? 2.6 : 2.2)) return null;
    }
  }
  if (size === 'small') {
    for (let dy = -2; dy <= 2; dy += 2) {
      for (let dx = -2; dx <= 2; dx += 2) {
        const medium = smallerPeak(gx + dx, gy + dy, 'medium');
        if (medium && Math.hypot(medium.x - x, medium.y - y) < 1.6) return null;
      }
    }
  }
  return { x, y, size, variant: Math.floor(hash2(gx, gy, 10) * 3), scale: 0.8 + hash2(gx, gy, 18) * 0.35 };
}

/**
 * Sommets des montagnes d'une zone (y compris au-delà des limites de la carte) :
 * de grands sommets espacés au cœur des massifs, des sommets moyens autour,
 * de petits pitons sur les bords.
 */
export function mountainPeaks(cx: number, cy: number): Peak[] {
  const peaks: Peak[] = [];
  const blocks = CHUNK_SIZE / 4;
  for (let by = cy * blocks; by < (cy + 1) * blocks; by++) {
    for (let bx = cx * blocks; bx < (cx + 1) * blocks; bx++) {
      const big = bigPeak(bx, by);
      if (big) peaks.push(big);
    }
  }
  for (let gy = cy * CHUNK_SIZE; gy < (cy + 1) * CHUNK_SIZE; gy += 2) {
    for (let gx = cx * CHUNK_SIZE; gx < (cx + 1) * CHUNK_SIZE; gx += 2) {
      const peak = smallerPeak(gx, gy, 'medium') ?? smallerPeak(gx, gy, 'small');
      if (peak) peaks.push(peak);
    }
  }
  return peaks;
}

export type GroundCoverKind =
  | 'bush'
  | 'fern'
  | 'flowers'
  | 'grass'
  | 'boulder'
  | 'stone'
  | 'log'
  | 'mushrooms'
  | 'young_broadleaf'
  | 'young_conifer';

export interface GroundCover {
  kind: GroundCoverKind;
  variant: number;
  /** Position du pied, en cases (fractionnaire). */
  x: number;
  y: number;
}

function cover(kind: GroundCoverKind, variants: number, x: number, y: number, seed: number): GroundCover {
  // Position dans la case, en évitant le centre (occupé par l'arbre éventuel).
  const a = hash2(x, y, seed) * Math.PI * 2;
  const r = 0.22 + hash2(x, y, seed + 1) * 0.18;
  return {
    kind,
    variant: Math.floor(hash2(x, y, seed + 2) * variants),
    x: x + 0.5 + Math.cos(a) * r,
    y: y + 0.5 + Math.sin(a) * r,
  };
}

/**
 * Sous-bois et détails des zones sauvages : buissons, fougères, champignons et
 * bois mort en forêt ; fleurs, herbes hautes et rochers en prairie. Purement
 * décoratif (rien n'est sauvegardé) : ils disparaissent quand la zone est achetée.
 */
export function groundCoverOf(cx: number, cy: number): GroundCover[] {
  const items: GroundCover[] = [];
  for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_H, (cy + 1) * CHUNK_SIZE); y++) {
    for (let x = cx * CHUNK_SIZE; x < Math.min(MAP_W, (cx + 1) * CHUNK_SIZE); x++) {
      if (inStartingArea(x, y) || isSceneryRoad(x, y) || isSceneryRail(x, y)) continue;
      const terrain = terrainAt(x, y);
      const roll = hash2(x, y, 20);
      if (terrain === 'sand') {
        if (roll < 0.1) items.push(cover('grass', 1, x, y, 30));
        continue;
      }
      if (terrain !== 'grass') continue;
      const forest = forestDensity(x, y);
      const nearRock = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => terrainAt(x + dx, y + dy) === 'rock'));
      if (nearRock && roll < 0.35) items.push(cover(roll < 0.12 ? 'boulder' : 'stone', 3, x, y, 40));
      else if (forest > 0.3) {
        // Jeunes arbres entre les grands, pour une forêt dense.
        if (forest > 0.45 && !wildTreeAt(x, y) && hash2(x, y, 22) < 0.6) {
          items.push(cover(hash2(x, y, 23) < 0.55 ? 'young_conifer' : 'young_broadleaf', 3, x, y, 140));
        }
        if (roll < 0.55) items.push(cover(roll < 0.3 ? 'fern' : 'bush', roll < 0.3 ? 2 : 3, x, y, 50));
        const extra = hash2(x, y, 21);
        if (extra < 0.07) items.push(cover('mushrooms', 1, x, y, 60));
        else if (extra < 0.11 && !wildTreeAt(x, y)) items.push(cover('log', 1, x, y, 70));
      } else if (roll < 0.11) items.push(cover('flowers', 4, x, y, 80));
      else if (roll < 0.24) items.push(cover('grass', 2, x, y, 90));
      else if (roll < 0.28) items.push(cover('bush', 3, x, y, 100));
      else if (roll < 0.31) items.push(cover('stone', 3, x, y, 110));
    }
  }
  return items;
}

/** Rochers posés sur la roche, au pied des montagnes (permanents : la roche n'est pas constructible). */
export function rockScatterOf(cx: number, cy: number): GroundCover[] {
  const items: GroundCover[] = [];
  for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
      if (visualTerrainAt(x, y) !== 'rock' || rockDepth(x, y) > 1) continue;
      const roll = hash2(x, y, 120);
      if (roll < 0.4) items.push(cover(roll < 0.18 ? 'boulder' : 'stone', 3, x, y, 130));
    }
  }
  return items;
}
