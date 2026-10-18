import type { Terrain } from '@/core/types';
import { CHANNEL_WIDTH, CHUNK_SIZE, EAST_CHUNK_X, MAP_H, MAP_W } from './balance';

/**
 * Géographie fixe de la carte (identique pour tous les joueurs) :
 * - un bras de mer du nord au sud sépare la rive ouest (ville de départ) de la rive est ;
 * - la mer borde le sud et l'ouest, des montagnes ferment le nord, un massif se dresse au nord-est ;
 * - quelques lacs parsèment les deux rives.
 * Tout est calculé à partir de fonctions déterministes : rien n'est stocké dans la sauvegarde.
 */

/** Bruit pseudo-aléatoire stable par case, dans [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur lissé (une octave) : varie doucement d'une case à l'autre. */
export function smoothNoise(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function coastX(y: number): number {
  return 30 + Math.floor(Math.sin(y * 0.45) * 1.1 + Math.sin(y * 0.17 + 1.3) * 0.7 + 0.5);
}

/** Première case de terre de la rive est sur une rangée. */
export function eastCoastX(y: number): number {
  return coastX(y) + CHANNEL_WIDTH;
}

/** Première rangée de mer au sud, pour une colonne donnée. */
export function southSeaY(x: number): number {
  return MAP_H - 9 + Math.floor(smoothNoise(x, 0, 9, 11) * 4);
}

/** Dernière colonne de mer à l'ouest, pour une rangée donnée (−1 : pas de mer). */
function westSeaX(y: number): number {
  return Math.floor(smoothNoise(0, y, 7, 12) * 3) - 1;
}

/** Limite sud des montagnes du nord, pour une colonne donnée. */
function northRockY(x: number): number {
  // La ville de départ (rangées 8 et plus) reste dégagée.
  return 2 + Math.floor(smoothNoise(x, 0, 6, 13) * 5);
}

const MASSIF = { x: 104, y: 22, r: 15 };

const LAKES: ReadonlyArray<{ x: number; y: number; rx: number; ry: number }> = [
  { x: 57, y: 43, rx: 6, ry: 4.5 },
  { x: 97, y: 66, rx: 8, ry: 5 },
  { x: 14, y: 66, rx: 5, ry: 4 },
  { x: 72, y: 13, rx: 4, ry: 3 },
];

function inLake(x: number, y: number): boolean {
  for (const lake of LAKES) {
    const dx = (x - lake.x) / lake.rx;
    const dy = (y - lake.y) / lake.ry;
    if (dx * dx + dy * dy <= 0.85 + smoothNoise(x, y, 3, 21) * 0.35) return true;
  }
  return false;
}

function inMassif(x: number, y: number): boolean {
  const d = Math.hypot(x - MASSIF.x, (y - MASSIF.y) * 1.3);
  return d < MASSIF.r * (0.7 + smoothNoise(x, y, 5, 31) * 0.5);
}

export function terrainAt(x: number, y: number): Terrain {
  const west = coastX(y);
  const east = eastCoastX(y);
  if (x >= west && x < east) return 'water';
  if (y >= southSeaY(x) || x <= westSeaX(y) || inLake(x, y)) return 'water';
  if (y < northRockY(x) || inMassif(x, y)) return 'rock';
  if (x === west - 1 || x === east || y === southSeaY(x) - 1 || x === westSeaX(y) + 1) return 'sand';
  if (x === MAP_W - 1) return 'sand';
  return 'grass';
}

export function isWater(x: number, y: number): boolean {
  return terrainAt(x, y) === 'water';
}

/** Case sur laquelle on peut construire (ni eau ni montagne). */
export function isBuildableTerrain(x: number, y: number): boolean {
  const t = terrainAt(x, y);
  return t === 'grass' || t === 'sand';
}

/** Eau peu profonde (près d'un rivage), pour le rendu. */
export function isShallow(x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 2) continue;
      const t = terrainAt(x + dx, y + dy);
      if (t !== 'water') return true;
    }
  }
  return false;
}

/** Une zone d'agrandissement est-elle sur la rive est ? */
export function isEastChunk(cx: number): boolean {
  return cx >= EAST_CHUNK_X;
}

/** Une zone d'agrandissement contient-elle au moins une case constructible ? */
export function chunkHasLand(cx: number, cy: number): boolean {
  for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_H, (cy + 1) * CHUNK_SIZE); y++) {
    for (let x = cx * CHUNK_SIZE; x < Math.min(MAP_W, (cx + 1) * CHUNK_SIZE); x++) {
      if (isBuildableTerrain(x, y)) return true;
    }
  }
  return false;
}
