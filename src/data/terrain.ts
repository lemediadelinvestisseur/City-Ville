import type { Terrain } from '@/core/types';
import { CHUNK_SIZE, MAP_SIZE } from './balance';

/**
 * Géographie fixe de la carte : la ville est au bord de la mer, côté est.
 * La côte ondule légèrement ; une bande de sable la longe.
 */
export function coastX(y: number): number {
  return 30 + Math.floor(Math.sin(y * 0.45) * 1.1 + Math.sin(y * 0.17 + 1.3) * 0.7 + 0.5);
}

export function terrainAt(x: number, y: number): Terrain {
  const coast = coastX(y);
  if (x >= coast) return 'water';
  if (x === coast - 1) return 'sand';
  // La ville est une île : une plage borde aussi les autres côtés.
  if (x === 0 || y === 0 || y === MAP_SIZE - 1) return 'sand';
  return 'grass';
}

export function isWater(x: number, y: number): boolean {
  return terrainAt(x, y) === 'water';
}

/** Eau peu profonde (près du rivage), pour le rendu. */
export function isShallow(x: number, y: number): boolean {
  return x - coastX(y) < 2;
}

/** Une zone d'agrandissement contient-elle au moins une case de terre ? */
export function chunkHasLand(cx: number, cy: number): boolean {
  for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_SIZE, (cy + 1) * CHUNK_SIZE); y++) {
    if (coastX(y) > cx * CHUNK_SIZE) return true;
  }
  return false;
}
