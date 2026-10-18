/**
 * Bruits procéduraux pour les textures du terrain.
 *
 * Avec `period > 0`, le bruit se répète exactement toutes les `period` unités
 * sur chaque axe : des cases voisines dessinées séparément se raccordent alors
 * sans couture (voir `GROUND_PERIOD`). Avec `period = 0`, il ne se répète pas.
 */

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Valeurs aléatoires d'une grille périodique, calculées une fois (les textures en lisent des millions). */
const lattices = new Map<number, Float32Array>();

function lattice(cells: number, seed: number): Float32Array {
  const key = cells * 1_000_003 + seed;
  let table = lattices.get(key);
  if (!table) {
    table = new Float32Array(cells * cells);
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) table[y * cells + x] = hash(x, y, seed);
    lattices.set(key, table);
  }
  return table;
}

/**
 * Bruit de valeur lissé dans [0, 1) : `freq` cellules par unité, période
 * `period` unités (`freq × period` doit être entier).
 */
export function noise(u: number, v: number, freq: number, period: number, seed: number): number {
  const x = u * freq;
  const y = v * freq;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  let a: number;
  let b: number;
  let c: number;
  let d: number;
  const cells = Math.round(freq * period);
  if (cells > 0) {
    const table = lattice(cells, seed);
    const xa = ((x0 % cells) + cells) % cells;
    const ya = ((y0 % cells) + cells) % cells;
    const xb = xa + 1 === cells ? 0 : xa + 1;
    const yb = ya + 1 === cells ? 0 : ya + 1;
    a = table[ya * cells + xa]!;
    b = table[ya * cells + xb]!;
    c = table[yb * cells + xa]!;
    d = table[yb * cells + xb]!;
  } else {
    a = hash(x0, y0, seed);
    b = hash(x0 + 1, y0, seed);
    c = hash(x0, y0 + 1, seed);
    d = hash(x0 + 1, y0 + 1, seed);
  }
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Bruit fractal (plusieurs octaves de `noise`), normalisé dans [0, 1). */
export function fbm(u: number, v: number, freq: number, period: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += noise(u, v, f, period, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Bruit « en crêtes » (arêtes vives, utile pour la roche), dans [0, 1]. */
export function ridged(u: number, v: number, freq: number, period: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise(u, v, f, period, seed + i * 131) * 2 - 1);
    n *= n * weight;
    weight = Math.min(1, n * 1.6);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export type Rgb = [number, number, number];

/** Interpolation dans une rampe de couleurs régulièrement espacées (t ∈ [0, 1]). */
export function ramp(stops: readonly Rgb[], t: number, out: Rgb): Rgb {
  const n = stops.length - 1;
  const x = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

export function mixRgb(a: Rgb, b: Readonly<Rgb>, t: number): Rgb {
  a[0] += (b[0] - a[0]) * t;
  a[1] += (b[1] - a[1]) * t;
  a[2] += (b[2] - a[2]) * t;
  return a;
}
