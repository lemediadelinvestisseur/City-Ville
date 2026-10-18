import type { Terrain } from '@/core/types';
import { CHANNEL_WIDTH, CHUNK_SIZE, EAST_CHUNK_X, MAP_H, MAP_W } from './balance';

/**
 * Géographie fixe de la carte : deux rives séparées par un bras de mer qui
 * traverse la carte du nord au sud. La ville de départ est sur la rive ouest ;
 * la rive est s'atteint par un pont. La côte ondule légèrement et une plage
 * borde chaque rive.
 */
export function coastX(y: number): number {
  return 30 + Math.floor(Math.sin(y * 0.45) * 1.1 + Math.sin(y * 0.17 + 1.3) * 0.7 + 0.5);
}

/** Première case de terre de la rive est sur une rangée. */
export function eastCoastX(y: number): number {
  return coastX(y) + CHANNEL_WIDTH;
}

export function terrainAt(x: number, y: number): Terrain {
  const west = coastX(y);
  const east = eastCoastX(y);
  if (x >= west && x < east) return 'water';
  if (x === west - 1 || x === east) return 'sand';
  // Chaque rive est une île : une plage borde aussi les bords de la carte.
  if (x === 0 || x === MAP_W - 1 || y === 0 || y === MAP_H - 1) return 'sand';
  return 'grass';
}

export function isWater(x: number, y: number): boolean {
  return terrainAt(x, y) === 'water';
}

/** Eau peu profonde (près d'un rivage), pour le rendu. */
export function isShallow(x: number, y: number): boolean {
  return x - coastX(y) < 2 || eastCoastX(y) - x <= 2;
}

/** Rive d'une case de terre. */
export function shoreOf(x: number, y: number): 'west' | 'east' {
  return x < coastX(y) ? 'west' : 'east';
}

/** Une zone d'agrandissement est-elle sur la rive est ? */
export function isEastChunk(cx: number): boolean {
  return cx >= EAST_CHUNK_X;
}

/** Une zone d'agrandissement contient-elle au moins une case de terre ? */
export function chunkHasLand(cx: number, cy: number): boolean {
  for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_H, (cy + 1) * CHUNK_SIZE); y++) {
    for (let x = cx * CHUNK_SIZE; x < Math.min(MAP_W, (cx + 1) * CHUNK_SIZE); x++) {
      if (!isWater(x, y)) return true;
    }
  }
  return false;
}
