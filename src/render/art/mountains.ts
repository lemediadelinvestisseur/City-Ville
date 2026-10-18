import { HALF_H, HALF_W } from '../iso';
import { seeded, toRgb } from './color';
import { createCanvas, type ArtPiece } from './IsoPainter';
import { clamp01, fbm, mixRgb, noise, ramp, ridged, smoothstep, type Rgb } from './noise';

/**
 * Sommets montagneux rendus à partir d'un relief (carte de hauteurs) : crêtes
 * et ravines éclairées par la gauche, strates, éboulis, neige sur les hauts
 * sommets et petits conifères sur les pentes douces. Chaque sommet est ancré au
 * centre de son relief et déborde largement autour, en se fondant dans la roche.
 */

interface PeakShape {
  /** Rayon du relief, en cases. */
  radius: number;
  /** Hauteur du sommet, en pixels. */
  height: number;
  seed: number;
  /** Altitude relative (0 à 1) de la limite des neiges ; > 1 : pas de neige. */
  snow: number;
}

const SHAPES: readonly PeakShape[] = [
  // Grands sommets enneigés.
  { radius: 3.4, height: 280, seed: 11, snow: 0.56 },
  { radius: 3.1, height: 245, seed: 12, snow: 0.6 },
  { radius: 3.6, height: 310, seed: 13, snow: 0.52 },
  // Sommets moyens.
  { radius: 2.3, height: 160, seed: 14, snow: 0.8 },
  { radius: 2.1, height: 140, seed: 15, snow: 0.86 },
  { radius: 2.4, height: 175, seed: 16, snow: 0.76 },
  // Petits pitons rocheux.
  { radius: 1.3, height: 70, seed: 17, snow: 2 },
  { radius: 1.2, height: 55, seed: 18, snow: 2 },
  { radius: 1.4, height: 85, seed: 19, snow: 2 },
];
export const MOUNTAIN_VARIANTS = SHAPES.length;
/** Premières variantes de chaque taille (3 variantes par taille). */
export const PEAK_BIG = 0;
export const PEAK_MEDIUM = 3;
export const PEAK_SMALL = 6;

/** Échantillons du relief par case. */
const GRID = 28;
/** Période (en cases) des bruits : bien plus grande qu'un relief, elle ne se voit pas. */
const NP = 16;
/** Longueur d'une case en pixels « monde », pour estimer les pentes. */
const TILE_LEN = 80;
/** Lumière (axes u, v des cases, z vers le haut) : vient de la gauche de l'écran et d'en haut. */
const LIGHT = (() => {
  const v = [-0.42, 0.62, 0.66];
  const n = Math.hypot(...v);
  return v.map((c) => c / n) as [number, number, number];
})();

const ROCK: Rgb[] = ['#4f4943', '#6e665c', '#8c8376', '#a69d8e', '#c0b7a6'].map(toRgb);
const OCHRE = toRgb('#9b7a5a');
const SCREE = toRgb('#a8a193');
const FOREST = toRgb('#34502a');
const MEADOW = toRgb('#6e8a44');
const SNOW = toRgb('#f1f5fa');
/** Couleur moyenne des cases de roche, pour fondre le pied du relief dans le sol. */
const GROUND = toRgb('#8b8376');
const SUN: Rgb = [1.1, 1.02, 0.9];
const SKY: Rgb = [0.5, 0.57, 0.72];

function heightAt(u: number, v: number, s: PeakShape): number {
  const R = s.radius;
  const seed = s.seed * 1000;
  // Déformation du domaine : contour et arêtes irréguliers.
  const wu = u + (fbm(u, v, 0.7, NP, seed + 1, 3) - 0.5) * R * 0.55;
  const wv = v + (fbm(u, v, 0.7, NP, seed + 2, 3) - 0.5) * R * 0.55;
  const r = Math.hypot(wu, wv) / R;
  if (r >= 1) return 0;
  const cone = 1 - r;
  const ridges = ridged((wu / R) * 1.4, (wv / R) * 1.4, 1, NP, seed + 3, 5);
  const detail = fbm(u, v, 3.5, NP, seed + 4, 3);
  // Silhouette massive (dôme) creusée de crêtes et de ravines.
  const h = cone ** 1.15 * (0.6 + 0.4 * ridges) + cone * 0.12 * (detail - 0.5);
  return Math.max(0, h * smoothstep(1, 0.72, r));
}

export function mountainArt(variant: number): ArtPiece {
  const shape = SHAPES[variant % SHAPES.length]!;
  const R = shape.radius;
  const seed = shape.seed * 1000;
  const pad = 4;
  const top = shape.height + 12;
  const W = Math.ceil(4 * R * HALF_W) + pad * 2;
  const H = Math.ceil(4 * R * HALF_H + top) + pad * 2;
  const ox = W / 2;
  const oy = pad + top + 2 * R * HALF_H;

  // 1. Relief, normalisé à la hauteur voulue.
  const step = 1 / GRID;
  const N = Math.ceil(2 * R * GRID) + 3;
  const origin = -R - step;
  const hmap = new Float32Array(N * N);
  let max = 0;
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const h = heightAt(origin + ix * step, origin + iy * step, shape);
      hmap[iy * N + ix] = h;
      if (h > max) max = h;
    }
  }
  const scale = max > 0 ? shape.height / max : 0;
  for (let k = 0; k < hmap.length; k++) hmap[k]! *= scale;
  const at = (ix: number, iy: number) => hmap[Math.max(0, Math.min(N - 1, iy)) * N + Math.max(0, Math.min(N - 1, ix))]!;

  // 2. Relief adouci, pour l'occlusion ambiante (creux plus sombres).
  const blur = new Float32Array(N * N);
  const tmpRow = new Float32Array(N * N);
  const B = 4;
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      let s = 0;
      for (let d = -B; d <= B; d++) s += at(ix + d, iy);
      tmpRow[iy * N + ix] = s / (2 * B + 1);
    }
  }
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      let s = 0;
      for (let d = -B; d <= B; d++) s += tmpRow[Math.max(0, Math.min(N - 1, iy + d)) * N + ix]!;
      blur[iy * N + ix] = s / (2 * B + 1);
    }
  }

  // 3. Couleur éclairée de chaque échantillon, et zones boisées.
  const colors = new Float32Array(N * N * 3);
  const veg = new Float32Array(N * N);
  const albedo: Rgb = [0, 0, 0];
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const k = iy * N + ix;
      const u = origin + ix * step;
      const v = origin + iy * step;
      const h = hmap[k]!;
      const a = h / shape.height;
      const du = (at(ix + 1, iy) - at(ix - 1, iy)) / (2 * step * TILE_LEN);
      const dv = (at(ix, iy + 1) - at(ix, iy - 1)) / (2 * step * TILE_LEN);
      const nl = Math.hypot(du, dv, 1);
      const nx = -du / nl;
      const ny = -dv / nl;
      const nz = 1 / nl;
      const slope = 1 - nz;
      // Roche : strates horizontales, veines ocre, éboulis clairs sur les pentes moyennes.
      const strata = 0.5 + 0.5 * Math.sin(h * 0.12 + noise(u, v, 1.3, NP, seed + 5) * 6);
      ramp(ROCK, 0.18 + fbm(u, v, 2.2, NP, seed + 6, 3) * 0.45 + strata * 0.3 * smoothstep(0.15, 0.5, slope), albedo);
      mixRgb(albedo, OCHRE, smoothstep(0.62, 0.8, fbm(u, v, 1.4, NP, seed + 7, 2)) * 0.4);
      mixRgb(albedo, SCREE, smoothstep(0.5, 0.25, slope) * smoothstep(0.55, 0.2, a) * 0.5);
      // Végétation en bas des pentes douces.
      const green =
        smoothstep(0.3, 0.1, a + (noise(u, v, 2.5, NP, seed + 8) - 0.5) * 0.16) * smoothstep(0.62, 0.32, slope);
      const wood = smoothstep(0.45, 0.62, noise(u, v, 3, NP, seed + 9));
      veg[k] = green * wood;
      mixRgb(albedo, wood > 0.5 ? FOREST : MEADOW, green * 0.75);
      // Neige au-dessus de la limite, sauf sur les parois trop raides.
      const line = shape.snow + (fbm(u, v, 2, NP, seed + 10, 3) - 0.5) * 0.2;
      const snow = smoothstep(line - 0.02, line + 0.06, a) * smoothstep(0.85, 0.55, slope);
      mixRgb(albedo, SNOW, snow);
      // Éclairage : soleil chaud, ciel froid dans les ombres (la neige diffuse davantage).
      const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const ambient = 0.5 + 0.2 * nz + snow * 0.25;
      const ao = 0.62 + 0.38 * clamp01(1 - (blur[k]! - h) / (shape.height * 0.07));
      for (let c = 0; c < 3; c++) {
        colors[k * 3 + c] = albedo[c]! * (SKY[c]! * ambient + SUN[c]! * diffuse * 0.85) * ao;
      }
      // Le pied se fond dans la couleur des cases de roche.
      const foot = smoothstep(0.1, 0, a);
      for (let c = 0; c < 3; c++) colors[k * 3 + c]! += (GROUND[c]! - colors[k * 3 + c]!) * foot;
    }
  }

  // 4. Projection isométrique : colonne par colonne, de l'avant vers l'arrière.
  const { canvas, ctx } = createCanvas(W, H);
  const image = ctx.createImageData(W, H);
  const data = image.data;
  const depth = new Float32Array(W * H).fill(-Infinity);
  const sample = (u: number, v: number): number => {
    const gx = (u - origin) / step;
    const gy = (v - origin) / step;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // Couleur interpolée entre les échantillons voisins.
  const rgb: Rgb = [0, 0, 0];
  const color = (u: number, v: number, out: Rgb): void => {
    const gx = Math.max(0, Math.min(N - 1.001, (u - origin) / step));
    const gy = Math.max(0, Math.min(N - 1.001, (v - origin) / step));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const i00 = (y0 * N + x0) * 3;
    const i10 = i00 + 3;
    const i01 = i00 + N * 3;
    const i11 = i01 + 3;
    for (let c = 0; c < 3; c++) {
      const top = colors[i00 + c]! + (colors[i10 + c]! - colors[i00 + c]!) * fx;
      const bottom = colors[i01 + c]! + (colors[i11 + c]! - colors[i01 + c]!) * fx;
      out[c] = top + (bottom - top) * fy;
    }
  };
  const dt = 1 / (HALF_H * 2);
  for (let px = 0; px < W; px++) {
    const kk = (px + 0.5 - ox) / HALF_W;
    const span = 2 * R - Math.abs(kk);
    if (span <= 0) continue;
    // Ligne la plus haute déjà peinte (ce qui est derrière y est caché) et ligne de l'échantillon précédent.
    let minRow = H;
    let prevRow = -1;
    for (let t = span; t >= -span; t -= dt) {
      const u = (t + kk) / 2;
      const v = (t - kk) / 2;
      const h = sample(u, v);
      if (h < 0.4) {
        prevRow = -1;
        continue;
      }
      const y = oy + t * HALF_H - h;
      const row = Math.max(0, Math.ceil(y - 0.5));
      // Une pente tournée vers l'observateur couvre toutes les lignes jusqu'à l'échantillon précédent.
      const end = Math.min(minRow, prevRow >= 0 ? Math.max(prevRow, row + 1) : row + 1);
      prevRow = row;
      if (row >= end) continue;
      color(u, v, rgb);
      const alpha = smoothstep(0.4, 9, h);
      for (let py = row; py < end; py++) {
        const p = py * W + px;
        // Grain de la roche.
        const g = Math.imul(px * 374761393 + py * 668265263, 1274126177);
        const grain = 0.94 + (((g ^ (g >>> 15)) >>> 24) / 255) * 0.1;
        const o = p * 4;
        data[o] = rgb[0] * grain;
        data[o + 1] = rgb[1] * grain;
        data[o + 2] = rgb[2] * grain;
        data[o + 3] = alpha * 255;
        depth[p] = t;
      }
      minRow = Math.min(minRow, row);
    }
  }
  // Arêtes : une crête qui passe devant une pente lointaine assombrit légèrement celle-ci.
  for (let py = 1; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const p = py * W + px;
      const above = p - W;
      if (depth[p]! - depth[above]! > 0.6 && depth[above]! > -Infinity) {
        const o = above * 4;
        data[o] = data[o]! * 0.84;
        data[o + 1] = data[o + 1]! * 0.84;
        data[o + 2] = data[o + 2]! * 0.87;
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  // 5. Petits conifères sur les pentes boisées visibles, de l'arrière vers l'avant.
  const rand = seeded(seed + 11);
  const trees: Array<{ u: number; v: number; t: number }> = [];
  for (let iy = 2; iy < N - 2; iy += 3) {
    for (let ix = 2; ix < N - 2; ix += 3) {
      if (veg[iy * N + ix]! < 0.45 || rand() > 0.75) continue;
      const u = origin + (ix + (rand() - 0.5) * 2) * step;
      const v = origin + (iy + (rand() - 0.5) * 2) * step;
      trees.push({ u, v, t: u + v });
    }
  }
  trees.sort((a, b) => a.t - b.t);
  for (const { u, v, t } of trees) {
    const h = sample(u, v);
    if (h < 3) continue;
    const x = ox + (u - v) * HALF_W;
    const y = oy + t * HALF_H - h;
    const p = Math.round(y - 1) * W + Math.round(x);
    if (p < 0 || p >= depth.length || Math.abs(depth[p]! - t) > 0.05) continue;
    const s = 0.75 + rand() * 0.55;
    const th = 9 * s;
    const tw = 3.2 * s;
    ctx.fillStyle = 'rgba(16,30,14,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 0.5, tw * 1.2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#21402a';
    ctx.beginPath();
    ctx.moveTo(x, y - th);
    ctx.lineTo(x + tw, y);
    ctx.lineTo(x - tw, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3d6a40';
    ctx.beginPath();
    ctx.moveTo(x, y - th);
    ctx.lineTo(x, y);
    ctx.lineTo(x - tw, y);
    ctx.closePath();
    ctx.fill();
  }
  return { canvas, originX: ox / W, originY: oy / H };
}
