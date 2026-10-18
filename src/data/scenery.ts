import { CHUNK_SIZE, MAP_H, MAP_W, STARTING_CHUNKS } from './balance';
import { coastX, eastCoastX, hash2, isBuildableTerrain, smoothNoise, southSeaY, terrainAt } from './terrain';

/**
 * Décor des zones encore sauvages : forêts et routes qui se prolongent au-delà
 * de la ville. Déterministe : il est recalculé (jamais sauvegardé) tant que la
 * zone n'est pas achetée ; à l'achat, il devient de vraies constructions
 * (arbres à défricher, routes offertes).
 */

export interface SceneryItem {
  defId: 'tree_oak' | 'tree_pine' | 'road';
  x: number;
  y: number;
}

/** Grandes routes : rangées et colonnes qui traversent la carte. */
const ROAD_ROWS = [20, 60];
const ROAD_COLS = [19, 52, 90];

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
  if (terrainAt(x, y) !== 'grass' || isSceneryRoad(x, y)) return null;
  // Pas d'arbre au bord immédiat des routes : elles restent visibles.
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (isSceneryRoad(x + dx, y + dy)) return null;
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

/** Sommets dessinés sur les montagnes : un toutes les ~3 cases de roche. */
export function mountainPeaks(cx: number, cy: number): Array<{ x: number; y: number; variant: number }> {
  const peaks: Array<{ x: number; y: number; variant: number }> = [];
  for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_H, (cy + 1) * CHUNK_SIZE); y += 2) {
    for (let x = cx * CHUNK_SIZE; x < Math.min(MAP_W, (cx + 1) * CHUNK_SIZE); x += 2) {
      if (hash2(x, y, 9) > 0.6) continue;
      let rock = true;
      for (let dy = 0; dy < 2 && rock; dy++) {
        for (let dx = 0; dx < 2 && rock; dx++) if (terrainAt(x + dx, y + dy) !== 'rock') rock = false;
      }
      if (rock) peaks.push({ x, y, variant: Math.floor(hash2(x, y, 10) * 3) });
    }
  }
  return peaks;
}
