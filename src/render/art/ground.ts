import { HALF_H, HALF_W } from '../iso';
import { seeded, toRgb } from './color';
import { createCanvas, type ArtPiece } from './IsoPainter';
import { clamp01, fbm, mixRgb, noise, ramp, ridged, smoothstep, type Rgb } from './noise';

/**
 * Sols du terrain (herbe, sable, roche, eau) et leurs transitions (rivages,
 * bordures d'herbe), dessinés pixel par pixel.
 *
 * Chaque motif est périodique sur GROUND_PERIOD cases : la case (x, y) utilise
 * la variante (x mod P, y mod P), si bien que la texture se prolonge d'une case
 * à l'autre sans couture visible. Les grandes variations de couleur (prairie
 * sèche, sous-bois, profondeur de l'eau) sont ajoutées au rendu par des teintes
 * aux coins des cases (voir `groundStyle.ts`).
 */
export const GROUND_PERIOD = 3;
const P = GROUND_PERIOD;

const PAD = 2;
const W = 2 * HALF_W + PAD * 2;
const H = 2 * HALF_H + PAD * 2;
const OX = PAD + HALF_W;
const OY = PAD;
/** Distance écran (px) entre deux bords opposés d'une case. */
const EDGE_PX = (2 * HALF_W * HALF_H) / Math.hypot(HALF_W, HALF_H);
/** Débord (px) au-delà du losange : les cases voisines se recouvrent légèrement, sans jour entre elles. */
const BLEED = 1.5;

/** Couleur d'un point du motif : `out` reçoit r, g, b (0 à 255) et a (0 à 1, déjà à 1). */
type Shader = (U: number, V: number, lu: number, lv: number, out: Float32Array) => void;

function piece(canvas: HTMLCanvasElement): ArtPiece {
  return { canvas, originX: OX / W, originY: OY / H };
}

/** Remplit la case (i, j) du motif, pixel par pixel. */
function raster(i: number, j: number, shader: Shader): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const { canvas, ctx } = createCanvas(W, H);
  const image = ctx.createImageData(W, H);
  const data = image.data;
  const out = new Float32Array(4);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = (px + 0.5 - OX) / HALF_W;
      const sy = (py + 0.5 - OY) / HALF_H;
      const lu = (sx + sy) / 2;
      const lv = (sy - sx) / 2;
      const edge = Math.min(lu, 1 - lu, lv, 1 - lv) * EDGE_PX + BLEED;
      if (edge <= 0) continue;
      out[3] = 1;
      shader(i + lu, j + lv, lu, lv, out);
      const alpha = out[3] * Math.min(1, edge);
      if (alpha <= 0) continue;
      const k = (py * W + px) * 4;
      data[k] = out[0]!;
      data[k + 1] = out[1]!;
      data[k + 2] = out[2]!;
      data[k + 3] = alpha * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, ctx };
}

/** Limite le dessin des détails au losange (débord compris). */
function clipTile(ctx: CanvasRenderingContext2D): void {
  const b = BLEED;
  ctx.beginPath();
  ctx.moveTo(OX, OY - b * 1.12);
  ctx.lineTo(OX + HALF_W + b * 2.24, OY + HALF_H);
  ctx.lineTo(OX, OY + 2 * HALF_H + b * 1.12);
  ctx.lineTo(OX - HALF_W - b * 2.24, OY + HALF_H);
  ctx.closePath();
  ctx.clip();
}

interface Speck {
  U: number;
  V: number;
  a: number;
  b: number;
  c: number;
}

/** Détails répartis sur tout le motif (P × P cases), reproductibles. */
function scatter(perTile: number, seed: number): Speck[] {
  const rand = seeded(seed);
  return Array.from({ length: Math.round(perTile * P * P) }, () => ({
    U: rand() * P,
    V: rand() * P,
    a: rand(),
    b: rand(),
    c: rand(),
  }));
}

/**
 * Détails proches de la case (i, j), y compris ceux des cases voisines qui
 * débordent, de l'arrière vers l'avant, en coordonnées du canevas.
 */
type Near = [x: number, y: number, s: Speck, lu: number, lv: number];

function near(specks: readonly Speck[], i: number, j: number, margin: number): Near[] {
  const list: Near[] = [];
  for (const s of specks) {
    for (let du = -P; du <= P; du += P) {
      for (let dv = -P; dv <= P; dv += P) {
        const lu = s.U + du - i;
        const lv = s.V + dv - j;
        if (lu < -margin || lu > 1 + margin || lv < -margin || lv > 1 + margin) continue;
        list.push([OX + (lu - lv) * HALF_W, OY + (lu + lv) * HALF_H, s, lu, lv]);
      }
    }
  }
  return list.sort((a, b) => a[3] + a[4] - (b[3] + b[4]));
}

const rgb = (hex: string): Rgb => toRgb(hex);
const tmp: Rgb = [0, 0, 0];

// ——————————————————————————————— Herbe ———————————————————————————————

const GRASS_RAMP: Rgb[] = ['#3f6a26', '#558530', '#6e9f3b', '#88b649', '#a0c65a'].map(rgb);
const GRASS_DRY = rgb('#b3ae62');

function grassShade(U: number, V: number, out: Float32Array): void {
  const patches = fbm(U, V, 5 / 3, P, 11, 3);
  const clumps = noise(U, V, 7, P, 12);
  const grain = noise(U, V, 22, P, 13);
  const fine = noise(U, V, 44, P, 14);
  ramp(GRASS_RAMP, 0.12 + patches * 0.48 + clumps * 0.25 + grain * 0.15, tmp);
  mixRgb(tmp, GRASS_DRY, smoothstep(0.6, 0.82, fbm(U, V, 1, P, 15, 2)) * 0.4);
  const k = 0.9 + fine * 0.16;
  out[0] = tmp[0] * k;
  out[1] = tmp[1] * k;
  out[2] = tmp[2] * k;
}

const BLADES = scatter(240, 101);
const TUFTS = scatter(6, 102);
const CLOVER = scatter(1.5, 103);
const FLOWERS = scatter(0.5, 104);
const FLOWER_COLORS = ['#f6f3e8', '#f3d644', '#c7a3e6', '#f2a7c2'];

/** Brins, touffes, trèfles et fleurs ; `keep` écarte les détails hors de l'herbe (bordures). */
function grassDetails(ctx: CanvasRenderingContext2D, i: number, j: number, keep?: Keep): void {
  ctx.save();
  clipTile(ctx);
  const ok = ([, , s, lu, lv]: Near) => !keep || keep(s.U, s.V, lu, lv);
  ctx.lineCap = 'round';
  for (const item of near(BLADES, i, j, 0.08)) {
    if (!ok(item)) continue;
    const [x, y, s] = item;
    const len = 2 + s.a * 3;
    ctx.strokeStyle = s.b < 0.55 ? `rgba(186,222,112,${0.35 + s.c * 0.3})` : `rgba(34,62,18,${0.3 + s.c * 0.3})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (s.c - 0.5) * 2.5, y - len);
    ctx.stroke();
  }
  for (const item of near(CLOVER, i, j, 0.1)) {
    if (!ok(item)) continue;
    const [x, y, s] = item;
    const n = 5 + Math.floor(s.a * 5);
    for (let k = 0; k < n; k++) {
      const a = k * 2.4 + s.b * 6;
      const r = 1.5 + (k % 3) * 1.6;
      const cx = x + Math.cos(a) * r * 1.6;
      const cy = y + Math.sin(a) * r * 0.8;
      ctx.fillStyle = 'rgba(52,96,34,0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,200,100,0.6)';
      ctx.fillRect(cx - 0.8, cy - 0.9, 1, 1);
    }
  }
  for (const item of near(TUFTS, i, j, 0.12)) {
    if (!ok(item)) continue;
    const [x, y, s] = item;
    ctx.fillStyle = 'rgba(30,52,16,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 0.5, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const blades = 5 + Math.floor(s.a * 4);
    for (let k = 0; k < blades; k++) {
      const spread = (k / (blades - 1) - 0.5) * 2;
      const h = 5 + s.b * 4 + (1 - Math.abs(spread)) * 3;
      ctx.strokeStyle = k % 2 === 0 ? 'rgba(62,104,34,0.95)' : 'rgba(118,166,66,0.95)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x + spread * 1.5, y);
      ctx.quadraticCurveTo(x + spread * 2.5, y - h * 0.6, x + spread * 4.5, y - h);
      ctx.stroke();
    }
  }
  for (const item of near(FLOWERS, i, j, 0.1)) {
    if (!ok(item)) continue;
    const [x, y, s] = item;
    const color = FLOWER_COLORS[Math.floor(s.a * FLOWER_COLORS.length)] ?? '#fff';
    const n = 3 + Math.floor(s.b * 5);
    for (let k = 0; k < n; k++) {
      const a = k * 2.1 + s.c * 6;
      const r = 2 + k * 1.3;
      const fx = x + Math.cos(a) * r * 1.7;
      const fy = y + Math.sin(a) * r * 0.8;
      ctx.strokeStyle = 'rgba(50,90,30,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 2.5);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Case d'herbe (variante (i, j) du motif). */
export function grassTile(i: number, j: number): ArtPiece {
  const { canvas, ctx } = raster(i, j, (U, V, _lu, _lv, out) => grassShade(U, V, out));
  grassDetails(ctx, i, j);
  return piece(canvas);
}

/** Valeur interpolée des coins (N, E, S, O = bits 1, 2, 4, 8) au point local (lu, lv). */
function cornerField(mask: number, lu: number, lv: number): number {
  const n = mask & 1 ? 1 : 0;
  const e = mask & 2 ? 1 : 0;
  const s = mask & 4 ? 1 : 0;
  const w = mask & 8 ? 1 : 0;
  return n * (1 - lu) * (1 - lv) + e * lu * (1 - lv) + s * lu * lv + w * (1 - lu) * lv;
}

const FRINGE_RIM = rgb('#4b4a2c');

/**
 * Bordure d'herbe débordant sur une case de sable, de roche ou d'eau : l'herbe
 * couvre les coins herbeux (`mask`) avec un contour irrégulier. Sur l'eau
 * (`onWater`), elle laisse une bande de berge.
 */
export function grassFringe(mask: number, onWater: boolean, i: number, j: number): ArtPiece {
  const tau = onWater ? 0.8 : 0.5;
  const field = (U: number, V: number, lu: number, lv: number) =>
    cornerField(mask, lu, lv) + (fbm(U, V, 2, P, 61, 3) - 0.5) * 0.42 + (noise(U, V, 18, P, 62) - 0.5) * 0.1;
  const { canvas, ctx } = raster(i, j, (U, V, lu, lv, out) => {
    const d = field(U, V, lu, lv) - tau;
    if (d < -0.04) {
      out[3] = 0;
      return;
    }
    if (d < 0) {
      out[0] = FRINGE_RIM[0];
      out[1] = FRINGE_RIM[1];
      out[2] = FRINGE_RIM[2];
      out[3] = 0.32 * (1 + d / 0.04);
      return;
    }
    grassShade(U, V, out);
    const t = clamp01(d / 0.02);
    out[0] = FRINGE_RIM[0] + (out[0]! - FRINGE_RIM[0]) * t;
    out[1] = FRINGE_RIM[1] + (out[1]! - FRINGE_RIM[1]) * t;
    out[2] = FRINGE_RIM[2] + (out[2]! - FRINGE_RIM[2]) * t;
    out[3] = 0.32 + 0.68 * t;
  });
  grassDetails(ctx, i, j, (U, V, lu, lv) => field(U, V, lu, lv) - tau > 0.02);
  return piece(canvas);
}

// ——————————————————————————————— Sable ———————————————————————————————

const SAND_RAMP: Rgb[] = ['#c9b07c', '#d8c290', '#e4d1a3', '#ecdcb2'].map(rgb);

function sandShade(U: number, V: number, out: Float32Array): void {
  const patches = fbm(U, V, 5 / 3, P, 21, 3);
  const grain = noise(U, V, 40, P, 22);
  // Rides laissées par le vent (fréquences entières : le motif reste périodique).
  const ripple = Math.sin(Math.PI * 2 * (3 * U + 2 * V) + fbm(U, V, 1, P, 23, 2) * 9);
  ramp(SAND_RAMP, 0.25 + patches * 0.55 + grain * 0.2, tmp);
  const k = 0.97 + ripple * 0.025 + (grain - 0.5) * 0.07;
  out[0] = tmp[0] * k;
  out[1] = tmp[1] * k;
  out[2] = tmp[2] * k;
}

const PEBBLES = scatter(14, 201);
const SPECKS = scatter(40, 202);
const SHELLS = scatter(0.35, 203);

type Keep = (U: number, V: number, lu: number, lv: number) => boolean;

function kept(list: Near[], keep?: Keep): Near[] {
  return keep ? list.filter(([, , s, lu, lv]) => keep(s.U, s.V, lu, lv)) : list;
}

function sandDetails(ctx: CanvasRenderingContext2D, i: number, j: number, keep?: Keep): void {
  ctx.save();
  clipTile(ctx);
  for (const [x, y, s] of kept(near(SPECKS, i, j, 0.03), keep)) {
    ctx.fillStyle = s.a < 0.5 ? 'rgba(120,96,58,0.35)' : 'rgba(255,250,235,0.5)';
    ctx.fillRect(x, y, 1, 1);
  }
  for (const [x, y, s] of kept(near(PEBBLES, i, j, 0.05), keep)) {
    const r = 1 + s.a * 1.8;
    const tone = 110 + Math.floor(s.b * 70);
    ctx.fillStyle = 'rgba(90,70,40,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 0.8, y + 0.6, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgb(${tone},${tone - 8},${tone - 22})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - r * 0.5, y - r * 0.4, 1, 1);
  }
  for (const [x, y, s] of kept(near(SHELLS, i, j, 0.05), keep)) {
    ctx.fillStyle = s.a < 0.5 ? '#f6e3d6' : '#efd2c4';
    ctx.beginPath();
    ctx.moveTo(x, y + 1.5);
    ctx.arc(x, y + 1.5, 3, Math.PI * 1.1, Math.PI * 1.9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,90,0.5)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.restore();
}

export function sandTile(i: number, j: number): ArtPiece {
  const { canvas, ctx } = raster(i, j, (U, V, _lu, _lv, out) => sandShade(U, V, out));
  sandDetails(ctx, i, j);
  return piece(canvas);
}

// ——————————————————————————————— Roche ———————————————————————————————

const ROCK_RAMP: Rgb[] = ['#5f584f', '#766e63', '#8d8578', '#a49c8e', '#b8b0a2'].map(rgb);
const LICHEN = rgb('#a3a064');
const MOSS = rgb('#5d7836');

function rockShade(U: number, V: number, out: Float32Array): void {
  const slabs = fbm(U, V, 5 / 3, P, 31, 3);
  const crack = ridged(U, V, 2, P, 32, 3);
  const gravel = noise(U, V, 36, P, 33);
  ramp(ROCK_RAMP, 0.15 + slabs * 0.5 + gravel * 0.35, tmp);
  mixRgb(tmp, LICHEN, smoothstep(0.62, 0.78, fbm(U, V, 7 / 3, P, 34, 2)) * 0.45);
  mixRgb(tmp, MOSS, smoothstep(0.64, 0.8, fbm(U, V, 1, P, 35, 2)) * 0.55);
  const k = 1 - smoothstep(0.72, 0.95, crack) * 0.38;
  out[0] = tmp[0] * k;
  out[1] = tmp[1] * k;
  out[2] = tmp[2] * k;
}

const STONES = scatter(36, 301);
const BOULDERS = scatter(1.1, 302);
const DRY_TUFTS = scatter(3, 303);

/** Caillou ombré (éclairé par la gauche). */
function stone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tone: number, wobble: number): void {
  ctx.fillStyle = 'rgba(30,26,20,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.45, y + r * 0.25, r * 1.25, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r * 0.5);
  g.addColorStop(0, `rgb(${tone + 40},${tone + 36},${tone + 28})`);
  g.addColorStop(0.55, `rgb(${tone},${tone - 4},${tone - 12})`);
  g.addColorStop(1, `rgb(${tone - 45},${tone - 48},${tone - 52})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  const n = 7;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (0.85 + 0.3 * Math.sin(a * 3 + wobble * 9));
    const px = x + Math.cos(a) * rr * 1.15;
    const py = y - r * 0.35 + Math.sin(a) * rr * 0.75;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function rockDetails(ctx: CanvasRenderingContext2D, i: number, j: number, keep?: Keep): void {
  ctx.save();
  clipTile(ctx);
  for (const [x, y, s] of kept(near(STONES, i, j, 0.05), keep))
    stone(ctx, x, y, 1 + s.a * 2.2, 100 + Math.floor(s.b * 60), s.c);
  for (const [x, y, s] of kept(near(DRY_TUFTS, i, j, 0.1), keep)) {
    for (let k = 0; k < 5; k++) {
      const spread = (k / 4 - 0.5) * 2;
      ctx.strokeStyle = k % 2 ? 'rgba(160,150,80,0.9)' : 'rgba(120,118,60,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + spread, y);
      ctx.lineTo(x + spread * 3.5, y - 4 - s.a * 3);
      ctx.stroke();
    }
  }
  for (const [x, y, s] of kept(near(BOULDERS, i, j, 0.15), keep))
    stone(ctx, x, y, 4 + s.a * 4, 120 + Math.floor(s.b * 40), s.c);
  ctx.restore();
}

export function rockTile(i: number, j: number): ArtPiece {
  const { canvas, ctx } = raster(i, j, (U, V, _lu, _lv, out) => rockShade(U, V, out));
  rockDetails(ctx, i, j);
  return piece(canvas);
}

// ——————————————————————————————— Eau ———————————————————————————————

/**
 * Surface de l'eau en tons neutres très clairs : la couleur (turquoise près
 * des côtes, bleu profond au large) vient de la teinte appliquée aux coins.
 */
function waterShade(U: number, V: number, out: Float32Array): void {
  const tau = Math.PI * 2;
  // Fréquences entières par case : le motif reste périodique.
  const w1 = Math.sin(tau * 3 * (U + V) + fbm(U, V, 5 / 3, P, 41, 3) * 8);
  const w2 = Math.sin(tau * (5 * U + 2 * V) + fbm(U, V, 2, P, 42, 2) * 7);
  const w3 = Math.sin(tau * (2 * U + 6 * V) + fbm(U, V, 2, P, 43, 2) * 7);
  const crest = Math.max(0, w1) ** 4 * 0.75 + Math.max(0, w2) ** 6 * 0.45 + Math.max(0, w3) ** 6 * 0.35;
  const trough = Math.max(0, -w1) ** 2;
  const value = 0.84 + Math.min(0.16, crest * 0.16) - trough * 0.05 + (noise(U, V, 6, P, 44) - 0.5) * 0.06;
  out[0] = value * 244;
  out[1] = value * 250;
  out[2] = value * 255;
}

export function waterTile(i: number, j: number): ArtPiece {
  const { canvas } = raster(i, j, (U, V, _lu, _lv, out) => waterShade(U, V, out));
  return piece(canvas);
}

export type ShoreKind = 'sand' | 'rock';

/** Sable ou galets mouillés au bord de l'eau. */
const SHORE_WET: Record<ShoreKind, Rgb> = { sand: rgb('#a8946a'), rock: rgb('#4c473f') };
const SHORE_BOTTOM: Record<ShoreKind, Rgb> = { sand: rgb('#d6dcae'), rock: rgb('#5d7a72') };
const FOAM = rgb('#f7fbfb');

/**
 * Rivage dessiné sur une case d'eau : la terre occupe les coins terrestres
 * (`mask`, bits N, E, S, O), avec la même texture que le sable (ou la roche)
 * voisin, assombrie par l'eau près du bord, un liseré d'écume et le fond clair
 * des hauts-fonds.
 */
export function shoreOverlay(mask: number, kind: ShoreKind, i: number, j: number): ArtPiece {
  const wet = SHORE_WET[kind];
  const bottom = SHORE_BOTTOM[kind];
  const shadeLand = kind === 'sand' ? sandShade : rockShade;
  const field = (U: number, V: number, lu: number, lv: number) =>
    cornerField(mask, lu, lv) + (fbm(U, V, 2, P, 51, 3) - 0.5) * 0.3 - 0.42;
  const { canvas, ctx } = raster(i, j, (U, V, lu, lv, out) => {
    const d = field(U, V, lu, lv);
    const breakup = noise(U, V, 14, P, 52);
    if (d > 0) {
      shadeLand(U, V, out);
      tmp[0] = out[0]!;
      tmp[1] = out[1]!;
      tmp[2] = out[2]!;
      mixRgb(tmp, wet, (1 - smoothstep(0, 0.3, d)) * 0.75);
      const foam = (1 - smoothstep(0, 0.045, d)) * (0.45 + 0.55 * breakup);
      mixRgb(tmp, FOAM, foam * 0.85);
      out[0] = tmp[0];
      out[1] = tmp[1];
      out[2] = tmp[2];
      return;
    }
    // Côté eau : liseré d'écume, puis fond clair qui s'efface vers le large.
    const foam = (1 - smoothstep(0, 0.035, -d)) * (0.5 + 0.5 * breakup);
    const shallow = smoothstep(-0.34, 0, d) * 0.5;
    const alpha = Math.max(shallow, foam * 0.9);
    if (alpha <= 0.002) {
      out[3] = 0;
      return;
    }
    tmp[0] = bottom[0];
    tmp[1] = bottom[1];
    tmp[2] = bottom[2];
    mixRgb(tmp, FOAM, clamp01(foam / Math.max(alpha, 0.01)));
    out[0] = tmp[0];
    out[1] = tmp[1];
    out[2] = tmp[2];
    out[3] = alpha;
  });
  const dry = (U: number, V: number, lu: number, lv: number) => field(U, V, lu, lv) > 0.2;
  if (kind === 'sand') sandDetails(ctx, i, j, dry);
  else rockDetails(ctx, i, j, dry);
  return piece(canvas);
}

/**
 * Ressac : ligne d'écume qui lèche le rivage, au large du liseré. Pièce séparée
 * pour pouvoir l'animer sans toucher au sable.
 */
export function surfOverlay(mask: number, i: number, j: number): ArtPiece {
  const { canvas } = raster(i, j, (U, V, lu, lv, out) => {
    const f = cornerField(mask, lu, lv) + (fbm(U, V, 2, P, 51, 3) - 0.5) * 0.3;
    const d = f - 0.42;
    const wobble = (noise(U, V, 5, P, 54) - 0.5) * 0.06;
    const line = 1 - smoothstep(0, 0.03, Math.abs(d + 0.11 + wobble));
    const foam = line * (0.35 + 0.65 * noise(U, V, 14, P, 52)) * (d < 0 ? 1 : 0);
    out[0] = FOAM[0];
    out[1] = FOAM[1];
    out[2] = FOAM[2];
    out[3] = foam * 0.85;
  });
  return piece(canvas);
}
