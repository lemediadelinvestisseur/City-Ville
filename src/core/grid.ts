import { CHUNK_SIZE, MAP_SIZE } from '@/data/balance';
import type { Entity, Size } from './types';

export const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

export function chunkOf(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
}

export const CHUNKS_PER_SIDE = Math.ceil(MAP_SIZE / CHUNK_SIZE);

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

/** Grille d'occupation : identifiant de l'entité présente sur chaque case (0 = libre). */
export class OccupancyGrid {
  private cells = new Int32Array(MAP_SIZE * MAP_SIZE);

  clear(): void {
    this.cells.fill(0);
  }

  get(x: number, y: number): number {
    if (!inBounds(x, y)) return 0;
    return this.cells[y * MAP_SIZE + x] ?? 0;
  }

  fill(x: number, y: number, size: Size, id: number): void {
    for (let dy = 0; dy < size.d; dy++) {
      for (let dx = 0; dx < size.w; dx++) {
        if (inBounds(x + dx, y + dy)) this.cells[(y + dy) * MAP_SIZE + (x + dx)] = id;
      }
    }
  }

  /** Vrai si toute l'emprise est libre (en ignorant éventuellement une entité). */
  isFree(x: number, y: number, size: Size, ignoreId = 0): boolean {
    for (let dy = 0; dy < size.d; dy++) {
      for (let dx = 0; dx < size.w; dx++) {
        const id = this.get(x + dx, y + dy);
        if (id !== 0 && id !== ignoreId) return false;
      }
    }
    return true;
  }
}

/** Distance (en cases) entre deux emprises rectangulaires, 0 si elles se touchent. */
export function footprintDistance(
  a: { x: number; y: number; size: Size },
  b: { x: number; y: number; size: Size },
): number {
  const dx = Math.max(0, a.x - (b.x + b.size.w - 1), b.x - (a.x + a.size.w - 1));
  const dy = Math.max(0, a.y - (b.y + b.size.d - 1), b.y - (a.y + a.size.d - 1));
  return Math.max(dx, dy);
}

/** Masque de connexion d'une route : bit 1 = x+1, 2 = y+1, 4 = x-1, 8 = y-1. */
export function roadMask(isRoad: (x: number, y: number) => boolean, x: number, y: number): number {
  let mask = 0;
  if (isRoad(x + 1, y)) mask |= 1;
  if (isRoad(x, y + 1)) mask |= 2;
  if (isRoad(x - 1, y)) mask |= 4;
  if (isRoad(x, y - 1)) mask |= 8;
  return mask;
}

export function entityCenter(entity: Entity, size: Size): { x: number; y: number } {
  return { x: entity.x + size.w / 2, y: entity.y + size.d / 2 };
}
