import type { Terrain } from '@/core/types';
import { forestDensity } from '@/data/scenery';
import { smoothNoise, visualTerrainAt } from '@/data/terrain';
import { toRgb } from './art/color';
import type { ShoreKind } from './art/ground';
import { smoothstep } from './art/noise';

/**
 * Habillage du sol à l'échelle de la carte : teintes douces aux coins des cases
 * (prairie sèche ou grasse, sous-bois, profondeur de l'eau) et masques des
 * transitions (rivages, bordures d'herbe). Les coins d'une case sont N (x, y),
 * E (x + 1, y), S (x + 1, y + 1) et O (x, y + 1), codés 1, 2, 4 et 8.
 */

/** Couleur multiplicative, composantes dans [0, 1]. */
export type Mul = [number, number, number];

/** Teintes des sommets N, E, S, O d'une case. */
export type Corners = readonly [Mul, Mul, Mul, Mul];

const WHITE: Mul = [1, 1, 1];

const hex = (h: string): Mul => toRgb(h).map((c) => c / 255) as Mul;

/** Profondeur (en cases jusqu'au rivage) → couleur de l'eau. */
const WATER_STOPS: ReadonlyArray<readonly [number, Mul]> = [
  [0, hex('#86e0d2')],
  [0.8, hex('#5ccad0')],
  [1.6, hex('#39a9c6')],
  [2.6, hex('#288ab6')],
  [3.8, hex('#1e6fa2')],
  [5.5, hex('#175a89')],
];
/** Couleur du large (fond de la scène), texture de l'eau comprise. */
export const DEEP_SEA = 0x134b75;

/** Cases qui touchent le sommet (X, Y). */
function around(X: number, Y: number): Array<[number, number]> {
  return [
    [X - 1, Y - 1],
    [X, Y - 1],
    [X - 1, Y],
    [X, Y],
  ];
}

/** Sommets N, E, S, O de la case (x, y). */
function cornersOf(x: number, y: number): Array<[number, number]> {
  return [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
  ];
}

const key = (x: number, y: number) => (x + 1024) * 4096 + (y + 1024);

export class GroundStyle {
  private terrains = new Map<number, Terrain>();
  private depths = new Map<number, number>();

  terrainAt(x: number, y: number): Terrain {
    const k = key(x, y);
    let t = this.terrains.get(k);
    if (t === undefined) {
      t = visualTerrainAt(x, y);
      this.terrains.set(k, t);
    }
    return t;
  }

  private countAround(X: number, Y: number, test: (t: Terrain) => boolean): number {
    let n = 0;
    for (const [x, y] of around(X, Y)) if (test(this.terrainAt(x, y))) n++;
    return n;
  }

  private mask(x: number, y: number, test: (X: number, Y: number) => boolean): number {
    let mask = 0;
    cornersOf(x, y).forEach(([X, Y], bit) => {
      if (test(X, Y)) mask |= 1 << bit;
    });
    return mask;
  }

  /** Coins terrestres d'une case d'eau : ceux qui touchent au moins une case de terre. */
  landMask(x: number, y: number): number {
    return this.mask(x, y, (X, Y) => this.countAround(X, Y, (t) => t !== 'water') > 0);
  }

  /**
   * Coins herbeux : ceux que se partagent au moins deux cases d'herbe. Sur
   * l'eau (rives des lacs, sans plage), tout coin qui touche l'herbe : la berge
   * suit alors le contour arrondi du rivage.
   */
  grassMask(x: number, y: number, onWater = false): number {
    return this.mask(x, y, (X, Y) => {
      const grass = this.countAround(X, Y, (t) => t === 'grass');
      if (!onWater) return grass >= 2;
      return grass >= 1 && this.countAround(X, Y, (t) => t === 'sand') === 0;
    });
  }

  /** Nature du rivage autour d'une case d'eau : rocheux au pied des montagnes, sableux ailleurs. */
  shoreKind(x: number, y: number): ShoreKind {
    let rock = 0;
    let other = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.terrainAt(x + dx, y + dy);
        if (t === 'rock') rock++;
        else if (t !== 'water') other++;
      }
    }
    return rock > other ? 'rock' : 'sand';
  }

  /** Distance (en cases) jusqu'à la terre la plus proche, plafonnée. */
  waterDepth(x: number, y: number): number {
    const k = key(x, y);
    const cached = this.depths.get(k);
    if (cached !== undefined) return cached;
    let best = 6;
    if (this.terrainAt(x, y) !== 'water') best = 0;
    else {
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const d = Math.hypot(dx, dy);
          if (d < best && this.terrainAt(x + dx, y + dy) !== 'water') best = d;
        }
      }
    }
    this.depths.set(k, best);
    return best;
  }

  /** Teinte de l'herbe au sommet (X, Y) : prairie sèche ou grasse, sous-bois plus sombre. */
  grassAt(X: number, Y: number): Mul {
    const lush = smoothNoise(X, Y, 10, 41);
    const light = 0.95 + 0.05 * smoothNoise(X, Y, 3.5, 42);
    const dry = smoothstep(0.58, 0.85, lush);
    const wet = smoothstep(0.42, 0.14, lush);
    const shade = smoothstep(0.1, 0.65, forestDensity(X, Y));
    // Variations volontairement discrètes : une prairie franche, un peu plus sombre sous les bois.
    return [
      light * (1 + 0.02 * dry) * (1 - 0.06 * wet) * (1 - 0.18 * shade),
      light * (1 - 0.01 * dry) * (1 - 0.02 * wet) * (1 - 0.1 * shade),
      light * (1 - 0.15 * dry) * (1 - 0.01 * wet) * (1 - 0.14 * shade),
    ];
  }

  sandAt(X: number, Y: number): Mul {
    const k = 0.96 + 0.04 * smoothNoise(X, Y, 5, 51);
    return [k, k, k * 0.98];
  }

  rockAt(X: number, Y: number): Mul {
    const k = 0.9 + 0.1 * smoothNoise(X, Y, 4, 71);
    const warm = smoothNoise(X, Y, 9, 72);
    return [k, k * (0.98 + 0.02 * warm), k * (0.94 + 0.06 * (1 - warm))];
  }

  /** Couleur de l'eau au sommet (X, Y) selon la profondeur moyenne des cases voisines. */
  waterAt(X: number, Y: number): Mul {
    let depth = 0;
    for (const [x, y] of around(X, Y)) depth += this.waterDepth(x, y);
    depth /= 4;
    let i = 1;
    while (i < WATER_STOPS.length - 1 && WATER_STOPS[i]![0] < depth) i++;
    const [d0, c0] = WATER_STOPS[i - 1]!;
    const [d1, c1] = WATER_STOPS[i]!;
    const t = Math.max(0, Math.min(1, (depth - d0) / (d1 - d0)));
    const k = 0.96 + 0.06 * smoothNoise(X, Y, 7, 61);
    return [(c0[0] + (c1[0] - c0[0]) * t) * k, (c0[1] + (c1[1] - c0[1]) * t) * k, (c0[2] + (c1[2] - c0[2]) * t) * k];
  }

  /** Teintes des sommets d'une case pour un type de sol. */
  corners(x: number, y: number, kind: Terrain): Corners {
    const at =
      kind === 'grass'
        ? this.grassAt.bind(this)
        : kind === 'water'
          ? this.waterAt.bind(this)
          : kind === 'sand'
            ? this.sandAt.bind(this)
            : this.rockAt.bind(this);
    const [n, e, s, w] = cornersOf(x, y).map(([X, Y]) => at(X, Y));
    return [n!, e!, s!, w!];
  }
}

function toInt(c: Mul): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2]);
}

/**
 * Teintes des coins de l'image (haut-gauche, haut-droit, bas-gauche, bas-droit)
 * qui reproduisent au mieux les teintes voulues aux sommets du losange (au
 * milieu des bords de l'image), multipliées par `mul`.
 */
export function quadTints(corners: Corners, mul: Mul = WHITE): [number, number, number, number] {
  const [N, E, S, Wc] = corners;
  const tl: Mul = [0, 0, 0];
  const tr: Mul = [0, 0, 0];
  const bl: Mul = [0, 0, 0];
  const br: Mul = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    // Une interpolation plane impose N + S = E + O : on répartit l'écart.
    const e = (N[c]! + S[c]! - E[c]! - Wc[c]!) / 4;
    const n = N[c]! - e;
    const ee = E[c]! + e;
    const w = Wc[c]! + e;
    const mean = (N[c]! + E[c]! + S[c]! + Wc[c]!) / 4;
    const topLeft = mean - ee + n;
    const topRight = 2 * n - topLeft;
    tl[c] = topLeft * mul[c]!;
    tr[c] = topRight * mul[c]!;
    br[c] = (2 * ee - topRight) * mul[c]!;
    bl[c] = (2 * w - topLeft) * mul[c]!;
  }
  return [toInt(tl), toInt(tr), toInt(bl), toInt(br)];
}

/** Même teinte partout. */
export function uniformTint(mul: Mul): number {
  return toInt(mul);
}
