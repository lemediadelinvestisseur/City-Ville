import { HALF_H, HALF_W } from '../../iso';
import { seeded, shade } from '../color';
import { boxColors, type BoxColors, type IsoPainter, type V3 } from '../IsoPainter';
import { cypress, picket, roundBush } from '../toon';
import type { Hero } from './types';

/**
 * Habitations redessinées à la main (style cartoon) : voir `./types.ts`.
 * Conventions : face « left » = plan y = y1 (éclairée), face « right » = plan x = x1 (ombrée).
 * Sur une face, `along` est la coordonnée le long de la façade (x à gauche, y à droite).
 */

type Side = 'left' | 'right';
type P = IsoPainter;
type FacePt = readonly [number, number];

const GLASS = '#8fd3f4';
const WARM = '#ffe08a';
const BLOOMS = ['#e53935', '#ff80ab', '#ffeb3b', '#ffffff', '#ba68c8', '#ff7043'];
/** Longueur à l'écran d'une case le long d'une façade (px). */
const FACE_PX = Math.hypot(HALF_W, HALF_H);

// ——— Repères sur les façades ———

function fp(side: Side, along: number, plane: number, z: number): V3 {
  return side === 'left' ? [along, plane, z] : [plane, along, z];
}

/** Teinte d'une face : la face droite est dans l'ombre. */
function tone(side: Side, color: string, k = -0.18): string {
  return side === 'left' ? color : shade(color, k);
}

function quad(
  p: P,
  side: Side,
  a: number,
  b: number,
  za: number,
  zb: number,
  plane: number,
  style: string | CanvasGradient,
): void {
  if (side === 'left') p.leftQuad(a, b, za, zb, plane, style);
  else p.rightQuad(a, b, za, zb, plane, style);
}

function poly(p: P, side: Side, plane: number, pts: readonly FacePt[], style: string | CanvasGradient): void {
  p.fill(
    pts.map(([a, z]) => fp(side, a, plane, z)),
    style,
  );
}

function seg(p: P, side: Side, plane: number, a1: number, z1: number, a2: number, z2: number, color: string, w = 1) {
  p.line(fp(side, a1, plane, z1), fp(side, a2, plane, z2), color, w);
}

function dotV(p: P, v: V3, r: number, style: string): void {
  p.dot(v[0], v[1], v[2], r, style);
}

/** Saillie (boîte) collée à une façade, qui avance de `depth` vers l'extérieur. */
function jut(
  p: P,
  side: Side,
  a: number,
  b: number,
  plane: number,
  depth: number,
  za: number,
  zb: number,
  color: string | BoxColors,
): void {
  const c = typeof color === 'string' ? boxColors(color, false) : color;
  if (side === 'left') p.box(a, plane, b, plane + depth, za, zb, c);
  else p.box(plane, a, plane + depth, b, za, zb, c);
}

/** Demi-cercle (arc) au-dessus de `z`, centré en `c`, de demi-largeur `w` : points de face. */
function arcPts(c: number, w: number, z: number, rise: number): FacePt[] {
  const pts: FacePt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    pts.push([c + w * Math.cos(t), z + rise * Math.sin(t)]);
  }
  return pts;
}

/** Disque (œil-de-bœuf) sur une façade. */
function oculus(p: P, side: Side, c: number, plane: number, z: number, r: number, frame = '#ffffff', glass = GLASS) {
  const ring = (rr: number): FacePt[] =>
    Array.from({ length: 16 }, (_, i) => {
      const t = (i / 16) * Math.PI * 2;
      return [c + (Math.cos(t) * rr) / FACE_PX, z + Math.sin(t) * rr * 1.1] as const;
    });
  poly(p, side, plane, ring(r + 2.5), tone(side, frame, -0.1));
  poly(p, side, plane, ring(r), tone(side, glass, -0.15));
  seg(p, side, plane, c, z - r * 1.1, c, z + r * 1.1, tone(side, frame, -0.1), 1.4);
  seg(p, side, plane, c - r / FACE_PX, z, c + r / FACE_PX, z, tone(side, frame, -0.1), 1.4);
}

// ——— Textures de murs ———

/** Bardage à clin : lignes horizontales. */
function lap(p: P, side: Side, a: number, b: number, plane: number, z0: number, z1: number, wall: string, step = 5) {
  const c = shade(wall, side === 'left' ? -0.12 : -0.32);
  for (let z = z0 + step; z < z1 - 1; z += step) seg(p, side, plane, a, z, b, z, c, 1);
}

/** Briques en quinconce, quelques-unes plus claires ou plus foncées. */
function bricks(
  p: P,
  side: Side,
  a: number,
  b: number,
  plane: number,
  z0: number,
  z1: number,
  wall: string,
  seed = 1,
) {
  const rnd = seeded(seed);
  const base = tone(side, wall, -0.2);
  const mortar = shade(base, -0.2);
  const rowH = 5;
  const bw = 0.11;
  for (let z = z0, r = 0; z < z1 - 0.5; z += rowH, r++) {
    const top = Math.min(z1, z + rowH);
    for (let s = a - (r % 2 ? bw / 2 : 0); s < b; s += bw) {
      const k = rnd();
      if (k > 0.78) {
        const lo = Math.max(a, s + 0.008);
        const hi = Math.min(b, s + bw - 0.008);
        if (hi > lo) quad(p, side, lo, hi, z + 0.7, top - 0.7, plane, shade(base, k > 0.9 ? 0.12 : -0.1));
      }
      if (s > a) seg(p, side, plane, s, z, s, top, mortar, 0.7);
    }
    seg(p, side, plane, a, z, b, z, mortar, 0.8);
  }
}

/** Pierres d'angle (chaînage) alternées sur les deux arêtes d'une façade. */
function quoins(p: P, side: Side, a: number, b: number, plane: number, z0: number, z1: number, color: string) {
  for (let z = z0, i = 0; z < z1 - 1; z += 8, i++) {
    const w = i % 2 ? 0.07 : 0.11;
    const top = Math.min(z1, z + 7);
    quad(p, side, a, a + w, z, top, plane, tone(side, color));
    quad(p, side, b - w, b, z, top, plane, tone(side, color));
  }
}

/** Bandeau horizontal sur deux façades d'un volume. */
function band(p: P, x0: number, y0: number, x1: number, y1: number, za: number, zb: number, color: string) {
  p.leftQuad(x0, x1, za, zb, y1, color);
  p.rightQuad(y0, y1, za, zb, x1, shade(color, -0.18));
}

// ——— Ouvertures ———

interface WinOpts {
  frame?: string;
  glass?: string;
  shutter?: string;
  bars?: 'cross' | 'grid' | 'vert' | 'none';
  sill?: boolean;
  flowers?: boolean;
  arch?: boolean;
  seed?: number;
}

/** Fenêtre de façade : volets, petits bois, appui, jardinière, cintre éventuel. */
function win(p: P, side: Side, c: number, w: number, plane: number, za: number, zb: number, o: WinOpts = {}): void {
  const frame = tone(side, o.frame ?? '#ffffff', -0.12);
  const glass = o.glass ?? GLASS;
  if (o.shutter) {
    const sh = tone(side, o.shutter);
    for (const [s0, s1] of [
      [c - w - 0.085, c - w - 0.012],
      [c + w + 0.012, c + w + 0.085],
    ] as const) {
      quad(p, side, s0, s1, za, zb, plane, sh);
      for (let z = za + 3; z < zb - 1; z += 3) seg(p, side, plane, s0 + 0.012, z, s1 - 0.012, z, shade(sh, -0.25), 0.8);
    }
  }
  const rise = o.arch ? w * FACE_PX * 0.9 : 0;
  if (o.arch) {
    const outer: FacePt[] = [[c - w - 0.03, za - 2.5], [c + w + 0.03, za - 2.5], ...arcPts(c, w + 0.03, zb, rise + 2.5)];
    poly(p, side, plane, outer, frame);
    const g = p.gradient(
      fp(side, c, plane, zb + rise),
      fp(side, c, plane, za),
      shade(glass, 0.35),
      shade(glass, side === 'left' ? -0.1 : -0.22),
    );
    poly(p, side, plane, [[c - w, za], [c + w, za], ...arcPts(c, w, zb, rise)], g);
  } else {
    p.window(side, c - w, c + w, za, zb, plane, side === 'left' ? glass : shade(glass, -0.08), frame);
  }
  const bars = o.bars ?? 'cross';
  if (bars !== 'none') {
    seg(p, side, plane, c, za, c, zb + rise, frame, 1.6);
    if (bars === 'grid') {
      seg(p, side, plane, c - w / 2, za, c - w / 2, zb, frame, 1.2);
      seg(p, side, plane, c + w / 2, za, c + w / 2, zb, frame, 1.2);
      for (const t of [1 / 3, 2 / 3]) {
        const z = za + (zb - za) * t;
        seg(p, side, plane, c - w, z, c + w, z, frame, 1.2);
      }
    } else if (bars === 'cross') {
      const z = (za + zb) / 2;
      seg(p, side, plane, c - w, z, c + w, z, frame, 1.6);
    }
  }
  if (o.sill !== false) quad(p, side, c - w - 0.045, c + w + 0.045, za - 5, za - 2, plane, tone(side, '#f6f1e7', -0.15));
  if (o.flowers) flowerBox(p, side, c, w, plane, za - 4, o.seed ?? 0);
}

/** Jardinière fleurie sous une fenêtre. */
function flowerBox(p: P, side: Side, c: number, w: number, plane: number, z: number, seed = 0): void {
  jut(p, side, c - w - 0.02, c + w + 0.02, plane, 0.06, z - 5, z, '#a1673f');
  const n = Math.max(3, Math.round((2 * w) / 0.05));
  for (let i = 0; i < n; i++) dotV(p, fp(side, c - w + (2 * w * (i + 0.5)) / n, plane + 0.04, z + 1.5), 3.3, '#3f9b35');
  for (let i = 0; i < n; i++) {
    const v = fp(side, c - w + (2 * w * (i + 0.5)) / n, plane + 0.05, z + 3 + (i % 2) * 1.6);
    dotV(p, v, 2, BLOOMS[(i + seed) % BLOOMS.length]!);
  }
}

interface DoorOpts {
  frame?: string;
  z0?: number;
  transom?: boolean;
  glass?: boolean;
  arch?: boolean;
  pediment?: string;
}

/** Porte d'entrée à panneaux : imposte, fronton, cintre. */
function entry(p: P, side: Side, c: number, w: number, h: number, plane: number, color: string, o: DoorOpts = {}) {
  const z0 = o.z0 ?? 0;
  const frame = tone(side, o.frame ?? '#ffffff', -0.12);
  const body = tone(side, color);
  const a = c - w / 2;
  const b = c + w / 2;
  if (o.arch) {
    const rise = (w / 2) * FACE_PX * 0.8;
    poly(p, side, plane, [[a - 0.035, z0], [b + 0.035, z0], ...arcPts(c, w / 2 + 0.035, z0 + h, rise + 3)], frame);
    poly(p, side, plane, [[a, z0], [b, z0], ...arcPts(c, w / 2, z0 + h, rise)], body);
    seg(p, side, plane, c, z0, c, z0 + h + rise, shade(body, -0.3), 1.2);
  } else {
    quad(p, side, a - 0.035, b + 0.035, z0, z0 + h + 3, plane, frame);
    quad(p, side, a, b, z0, z0 + h, plane, body);
    if (o.transom) {
      poly(p, side, plane, [[a - 0.035, z0 + h + 2], [b + 0.035, z0 + h + 2], ...arcPts(c, w / 2 + 0.035, z0 + h + 2, 9)], frame);
      poly(p, side, plane, [[a + 0.02, z0 + h + 3.5], [b - 0.02, z0 + h + 3.5], ...arcPts(c, w / 2 - 0.02, z0 + h + 3.5, 6)], tone(side, GLASS, -0.15));
    }
  }
  const panel = shade(body, -0.16);
  quad(p, side, a + w * 0.14, c - w * 0.06, z0 + h * 0.12, z0 + h * 0.42, plane, panel);
  quad(p, side, c + w * 0.06, b - w * 0.14, z0 + h * 0.12, z0 + h * 0.42, plane, panel);
  if (o.glass) quad(p, side, a + w * 0.14, b - w * 0.14, z0 + h * 0.55, z0 + h * 0.88, plane, tone(side, GLASS, -0.15));
  else {
    quad(p, side, a + w * 0.14, c - w * 0.06, z0 + h * 0.52, z0 + h * 0.88, plane, panel);
    quad(p, side, c + w * 0.06, b - w * 0.14, z0 + h * 0.52, z0 + h * 0.88, plane, panel);
  }
  dotV(p, fp(side, b - w * 0.16, plane, z0 + h * 0.48), 1.8, '#f7d774');
  if (o.pediment) {
    const top = z0 + h + (o.transom ? 12 : 4);
    poly(p, side, plane, [[a - 0.08, top], [b + 0.08, top], [c, top + 11]], tone(side, o.pediment, -0.12));
    quad(p, side, a - 0.08, b + 0.08, top - 3, top, plane, tone(side, shade(o.pediment, -0.08), -0.12));
  }
}

/** Marches devant une porte (de la plus basse à la plus haute). */
function steps(p: P, side: Side, c: number, w: number, plane: number, n: number, color: string, rise = 3, run = 0.08) {
  for (let i = 0; i < n; i++) jut(p, side, c - w / 2, c + w / 2, plane, run * (n - i), i * rise, (i + 1) * rise, color);
}

/** Bandeau vitré continu (fenêtres en ruban) avec meneaux. */
function ribbon(
  p: P,
  side: Side,
  a: number,
  b: number,
  plane: number,
  za: number,
  zb: number,
  glass: string,
  frame: string,
  step = 0.25,
) {
  quad(p, side, a - 0.02, b + 0.02, za - 2, zb + 2, plane, tone(side, frame));
  const g = p.gradient(
    fp(side, a, plane, zb),
    fp(side, a, plane, za),
    shade(glass, side === 'left' ? 0.3 : 0.05),
    shade(glass, side === 'left' ? -0.12 : -0.28),
  );
  quad(p, side, a, b, za, zb, plane, g);
  const n = Math.max(1, Math.round((b - a) / step));
  for (let i = 1; i < n; i++) {
    const s = a + ((b - a) * i) / n;
    seg(p, side, plane, s, za, s, zb, tone(side, frame), 1.6);
  }
  // Reflet.
  p.ctx.save();
  p.ctx.globalAlpha = 0.3;
  const m = a + (b - a) * 0.15;
  poly(p, side, plane, [[m, zb], [m + (b - a) * 0.12, zb], [m + (b - a) * 0.05, za], [m - (b - a) * 0.07, za]], '#ffffff');
  p.ctx.restore();
}

/** Balcon : dalle et garde-corps (barreaux, verre ou plein). */
function balcony(
  p: P,
  side: Side,
  a: number,
  b: number,
  plane: number,
  z: number,
  o: { depth?: number; rail?: string; kind?: 'bars' | 'glass' | 'solid'; slab?: string; h?: number } = {},
) {
  const d = o.depth ?? 0.18;
  const rail = o.rail ?? '#37474f';
  const h = o.h ?? 11;
  jut(p, side, a, b, plane, d, z - 3, z, boxColors(o.slab ?? '#eceff1', false));
  const front = plane + d - 0.01;
  const kind = o.kind ?? 'bars';
  if (kind === 'glass') {
    p.ctx.save();
    p.ctx.globalAlpha = 0.55;
    quad(p, side, a, b, z, z + h, front, tone(side, '#b3e5fc', -0.15));
    p.fill([fp(side, b, plane, z), fp(side, b, front, z), fp(side, b, front, z + h), fp(side, b, plane, z + h)], '#81d4fa');
    p.ctx.restore();
  } else if (kind === 'solid') {
    quad(p, side, a, b, z, z + h, front, tone(side, rail));
  } else {
    const n = Math.max(2, Math.round((b - a) / 0.05));
    for (let i = 0; i <= n; i++) {
      const s = a + ((b - a) * i) / n;
      seg(p, side, front, s, z, s, z + h, rail, 1.1);
    }
    // Retour latéral.
    p.line(fp(side, b, plane, z + h), fp(side, b, front, z + h), rail, 1.6);
    p.line(fp(side, b, front, z), fp(side, b, front, z + h), rail, 1.6);
  }
  seg(p, side, front, a, z + h, b, z + h, kind === 'glass' ? '#ffffff' : rail, 2);
}

/** Auvent rayé à lambrequin festonné. */
function canopy(p: P, side: Side, a: number, b: number, plane: number, z: number, colors: readonly [string, string], depth = 0.3, drop = 12) {
  p.awning(side, a, b, z, plane, colors, depth, drop);
  const n = Math.max(4, Math.round((b - a) * 7));
  const step = (b - a) / n;
  const { ctx } = p;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = p.p(...fp(side, a + step * (i + 0.5), plane + depth, z - drop - 6));
    ctx.fillStyle = shade(colors[i % 2]!, side === 'left' ? -0.18 : -0.3);
    ctx.beginPath();
    ctx.arc(sx, sy, (step * FACE_PX) / 2, 0, Math.PI);
    ctx.fill();
  }
}

// ——— Toitures ———

type RoofStyle = 'shingle' | 'slate' | 'tiles' | 'scales';

/** Texture d'un pan : a→b égout, d au-dessus de a et c au-dessus de b (faîtage). */
function roofTex(p: P, face: readonly V3[], a: V3, b: V3, c: V3, d: V3, color: string, style: RoofStyle) {
  const { ctx } = p;
  const A = p.p(...a);
  const B = p.p(...b);
  const C = p.p(...c);
  const D = p.p(...d);
  const lerp = (u: readonly number[], v: readonly number[], t: number): [number, number] => [
    u[0]! + (v[0]! - u[0]!) * t,
    u[1]! + (v[1]! - u[1]!) * t,
  ];
  const len = (u: readonly number[], v: readonly number[]) => Math.hypot(v[0]! - u[0]!, v[1]! - u[1]!);
  const stroke = (u: readonly number[], v: readonly number[], color2: string, w: number) => {
    ctx.beginPath();
    ctx.moveTo(u[0]!, u[1]!);
    ctx.lineTo(v[0]!, v[1]!);
    ctx.strokeStyle = color2;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  ctx.save();
  p.path(face);
  ctx.clip();
  const dark = shade(color, -0.3);
  const light = shade(color, 0.22);
  const rows = Math.max(2, Math.round(len(A, D) / (style === 'slate' ? 6 : 7)));
  if (style === 'tiles') {
    const n = Math.max(3, Math.round(len(A, B) / 8));
    for (let i = 0; i <= n; i++) {
      stroke(lerp(A, B, i / n), lerp(D, C, i / n), light, 3);
      stroke(lerp(A, B, (i + 0.5) / n), lerp(D, C, (i + 0.5) / n), dark, 1.2);
    }
  }
  for (let r = 1; r <= rows; r++) {
    const t = r / rows;
    const P0 = lerp(A, D, t);
    const Q0 = lerp(B, C, t);
    if (style === 'scales') {
      const n = Math.max(2, Math.round(len(P0, Q0) / 11));
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.3;
      for (let i = 0; i <= n; i++) {
        const [sx, sy] = lerp(P0, Q0, (i + (r % 2) * 0.5) / n);
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      continue;
    }
    if (r === rows) continue;
    stroke(P0, Q0, dark, style === 'tiles' ? 1.6 : 1.1);
    ctx.globalAlpha = 0.5;
    stroke([P0[0], P0[1] + 1.4], [Q0[0], Q0[1] + 1.4], light, 1);
    ctx.globalAlpha = 1;
    if (style !== 'tiles') {
      const t0 = (r - 1) / rows;
      const P1 = lerp(A, D, t0);
      const Q1 = lerp(B, C, t0);
      const n = Math.max(2, Math.round(len(P0, Q0) / (style === 'slate' ? 9 : 12)));
      for (let i = 0; i <= n; i++) {
        const s = (i + (r % 2) * 0.5) / n;
        stroke(lerp(P0, Q0, s), lerp(P1, Q1, s), dark, 1);
      }
    }
  }
  ctx.restore();
}

interface RoofOpts {
  ov?: number;
  style?: RoofStyle;
  /** Couleur des rives (null : aucune). */
  eave?: string | null;
}

/** Toit en croupe (quatre pans) à faîtage court, débord généreux. */
function hipRoof(p: P, x0: number, y0: number, x1: number, y1: number, z: number, h: number, color: string, o: RoofOpts = {}) {
  const ov = o.ov ?? 0.16;
  const style = o.style ?? 'shingle';
  const X0 = x0 - ov;
  const X1 = x1 + ov;
  const Y0 = y0 - ov;
  const Y1 = y1 + ov;
  const A: V3 = [X0, Y0, z];
  const B: V3 = [X1, Y0, z];
  const C: V3 = [X1, Y1, z];
  const D: V3 = [X0, Y1, z];
  const w = X1 - X0;
  const d = Y1 - Y0;
  const top = z + h;
  let front: V3[];
  let right: V3[];
  let r1: V3;
  let r2: V3;
  if (w >= d) {
    const ym = (Y0 + Y1) / 2;
    r1 = [X0 + d / 2, ym, top];
    r2 = [X1 - d / 2, ym, top];
    p.fill([A, B, r2, r1], shade(color, 0.15));
    p.fill([A, D, r1], shade(color, 0.2));
    front = [D, C, r2, r1];
    right = [C, B, r2];
  } else {
    const xm = (X0 + X1) / 2;
    r1 = [xm, Y0 + w / 2, top];
    r2 = [xm, Y1 - w / 2, top];
    p.fill([A, B, r1], shade(color, 0.15));
    p.fill([A, D, r2, r1], shade(color, 0.2));
    front = [D, C, r2];
    right = [C, B, r1, r2];
  }
  p.fill(front, p.gradient(r1, D, shade(color, 0.1), shade(color, -0.05)));
  p.fill(right, p.gradient(r2, C, shade(color, -0.15), shade(color, -0.3)));
  if (w >= d) {
    roofTex(p, front, D, C, r2, r1, color, style);
    roofTex(p, right, C, B, r2, r2, shade(color, -0.2), style);
  } else {
    roofTex(p, front, D, C, r2, r2, color, style);
    roofTex(p, right, C, B, r1, r2, shade(color, -0.2), style);
  }
  const hip = shade(color, -0.42);
  p.line(C, r2, hip, 3.5);
  p.line(C, r2, shade(color, 0.25), 1.2);
  p.line(r1, r2, hip, 4.5);
  p.line(r1, r2, shade(color, 0.3), 1.5);
  if (o.eave !== null) {
    const eave = o.eave ?? '#ffffff';
    p.line(D, C, eave, 3.5);
    p.line(C, B, shade(eave, -0.15), 3.5);
  }
}

interface GableOpts extends RoofOpts {
  /** Planche de rive (pignon). */
  rake?: string;
  /** Décor du pignon, dessiné avant le pan avant. */
  onGable?: () => void;
}

/**
 * Toit à deux pans. axis 'x' : faîtage selon x, pignon sur la face droite (x = x1) ;
 * axis 'y' : faîtage selon y, pignon sur la face gauche (y = y1).
 */
function gableRoof(
  p: P,
  axis: 'x' | 'y',
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  gableWall: string,
  o: GableOpts = {},
) {
  const ov = o.ov ?? 0.16;
  const style = o.style ?? 'shingle';
  const rake = o.rake ?? '#ffffff';
  const zd = z - 3;
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    const back: V3[] = [
      [x0 - ov, y0 - ov, zd],
      [x1 + ov, y0 - ov, zd],
      [x1 + ov, ym, z + h],
      [x0 - ov, ym, z + h],
    ];
    const front: V3[] = [
      [x0 - ov, y1 + ov, zd],
      [x1 + ov, y1 + ov, zd],
      [x1 + ov, ym, z + h],
      [x0 - ov, ym, z + h],
    ];
    p.fill(back, shade(color, 0.14));
    p.fill(
      [
        [x1, y0, z],
        [x1, y1, z],
        [x1, ym, z + h],
      ],
      shade(gableWall, -0.18),
    );
    o.onGable?.();
    p.fill(front, p.gradient(front[3]!, front[0]!, shade(color, 0.1), shade(color, -0.08)));
    roofTex(p, front, front[0]!, front[1]!, front[2]!, front[3]!, color, style);
    p.line(front[3]!, front[2]!, shade(color, -0.4), 4.5);
    p.line(front[3]!, front[2]!, shade(color, 0.3), 1.5);
    if (o.eave !== null) p.line(front[0]!, front[1]!, o.eave ?? shade(rake, -0.05), 3.5);
    p.line(back[1]!, front[2]!, shade(rake, -0.15), 4.5);
    p.line(front[2]!, front[1]!, shade(rake, -0.15), 4.5);
  } else {
    const xm = (x0 + x1) / 2;
    const back: V3[] = [
      [x0 - ov, y1 + ov, zd],
      [x0 - ov, y0 - ov, zd],
      [xm, y0 - ov, z + h],
      [xm, y1 + ov, z + h],
    ];
    const front: V3[] = [
      [x1 + ov, y1 + ov, zd],
      [x1 + ov, y0 - ov, zd],
      [xm, y0 - ov, z + h],
      [xm, y1 + ov, z + h],
    ];
    p.fill(back, shade(color, 0.16));
    roofTex(p, back, back[0]!, back[1]!, back[2]!, back[3]!, shade(color, 0.16), style);
    p.fill(
      [
        [x0, y1, z],
        [x1, y1, z],
        [xm, y1, z + h],
      ],
      gableWall,
    );
    o.onGable?.();
    p.fill(front, p.gradient(front[3]!, front[0]!, shade(color, -0.1), shade(color, -0.26)));
    roofTex(p, front, front[0]!, front[1]!, front[2]!, front[3]!, shade(color, -0.18), style);
    p.line(front[3]!, front[2]!, shade(color, -0.4), 4.5);
    if (o.eave !== null) p.line(front[0]!, front[1]!, shade(o.eave ?? rake, -0.2), 3);
    p.line(back[0]!, front[3]!, rake, 4.5);
    p.line(front[3]!, front[0]!, rake, 4.5);
  }
}

/**
 * Lucarne posée sur un pan qui monte de `k` px par case vers l'intérieur.
 * `front` : plan de sa façade ; `zBase` : hauteur du pan à ce plan.
 */
function dormer(
  p: P,
  side: Side,
  c: number,
  w: number,
  front: number,
  zBase: number,
  k: number,
  wallH: number,
  roof: string,
  wall: string,
  o: { glass?: string; frame?: string; style?: RoofStyle } = {},
) {
  const rh = w * 34 + 5;
  const zt = zBase + wallH;
  const d1 = wallH / k;
  const d2 = (wallH + rh) / k;
  const P3 = (a: number, depth: number, z: number) => fp(side, a, front - depth, z);
  const cheek = side === 'left' ? shade(wall, -0.22) : wall;
  const face = side === 'left' ? wall : shade(wall, -0.2);
  p.fill([P3(c + w, 0, zBase), P3(c + w, d1, zt), P3(c + w, 0, zt)], cheek);
  quad(p, side, c - w, c + w, zBase, zt, front, face);
  p.window(side, c - w + 0.045, c + w - 0.045, zBase + 3, zt - 2, front, o.glass ?? GLASS, tone(side, o.frame ?? '#ffffff', -0.12));
  seg(p, side, front, c, zBase + 3, c, zt - 2, tone(side, o.frame ?? '#ffffff', -0.12), 1.4);
  const e = 0.05;
  const L: V3[] = [P3(c - w - e, -e, zt - 1), P3(c, -e, zt + rh), P3(c, d2, zt + rh), P3(c - w - e, d1, zt - 1)];
  const R: V3[] = [P3(c + w + e, -e, zt - 1), P3(c, -e, zt + rh), P3(c, d2, zt + rh), P3(c + w + e, d1, zt - 1)];
  p.fill(L, side === 'left' ? shade(roof, 0.12) : shade(roof, -0.22));
  p.fill([P3(c - w, 0, zt), P3(c + w, 0, zt), P3(c, 0, zt + rh)], face);
  p.fill(R, side === 'left' ? shade(roof, -0.2) : shade(roof, 0.08));
  if (o.style) roofTex(p, R, R[0]!, R[3]!, R[2]!, R[1]!, side === 'left' ? shade(roof, -0.2) : roof, o.style);
  p.line(L[0]!, L[1]!, '#ffffff', 3);
  p.line(R[0]!, R[1]!, '#f2f2f2', 3);
}

/** Toit plat : corniche, acrotère et toiture en creux. Renvoie la hauteur du sol du toit. */
function flatTop(
  p: P,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  o: { cornice?: string; parapet?: number; coping: string; roof: string; ov?: number; dentils?: string },
): number {
  const ov = o.ov ?? 0.06;
  let zc = z;
  if (o.cornice) {
    if (o.dentils) {
      for (let s = x0 + 0.04; s < x1 - 0.02; s += 0.08) p.leftQuad(s, s + 0.04, z - 4, z, y1 + ov * 0.5, o.dentils);
      for (let s = y0 + 0.04; s < y1 - 0.02; s += 0.08) p.rightQuad(s, s + 0.04, z - 4, z, x1 + ov * 0.5, shade(o.dentils, -0.2));
    }
    p.box(x0 - ov, y0 - ov, x1 + ov, y1 + ov, z, z + 5, boxColors(o.cornice, false));
    zc = z + 5;
  }
  const ph = o.parapet ?? 8;
  p.box(x0, y0, x1, y1, zc, zc + ph, boxColors(o.coping, false));
  const t = 0.07;
  const zf = zc + ph - 6;
  const { ctx } = p;
  ctx.save();
  p.path([
    [x0 + t, y0 + t, zc + ph],
    [x1 - t, y0 + t, zc + ph],
    [x1 - t, y1 - t, zc + ph],
    [x0 + t, y1 - t, zc + ph],
  ]);
  ctx.clip();
  p.flat(x0 + t, y0 + t, x1 - t, y1 - t, zf, o.roof);
  p.leftQuad(x0 + t, x1 - t, zf, zc + ph, y0 + t, shade(o.coping, -0.25));
  p.rightQuad(y0 + t, y1 - t, zf, zc + ph, x0 + t, shade(o.coping, -0.12));
  ctx.restore();
  return zf;
}

/** Cheminée en briques avec chapeau et mitrons. */
function chimney(p: P, x: number, y: number, z0: number, z1: number, color: string, w = 0.1, pots = 1) {
  p.box(x - w, y - w, x + w, y + w, z0, z1, boxColors(color, false));
  for (let z = z0 + 5; z < z1; z += 5) {
    p.line([x - w, y + w, z], [x + w, y + w, z], shade(color, -0.18), 0.8);
    p.line([x + w, y + w, z], [x + w, y - w, z], shade(color, -0.38), 0.8);
  }
  p.box(x - w - 0.03, y - w - 0.03, x + w + 0.03, y + w + 0.03, z1, z1 + 4, boxColors(shade(color, -0.25), false));
  for (let i = 0; i < pots; i++) {
    const px = pots === 1 ? x : x - w * 0.5 + (w * i) / Math.max(1, pots - 1);
    p.box(px - 0.03, y - 0.03, px + 0.03, y + 0.03, z1 + 4, z1 + 10, boxColors('#c8623a', false));
  }
}

// ——— Jardin et mobilier ———

function bush(p: P, x: number, y: number, z: number, r: number, color = '#4caf2a'): void {
  p.dot(x, y, z + r * 0.7, r, shade(color, -0.15));
  p.dot(x - 0.03, y - 0.03, z + r * 0.95, r * 0.7, color);
  p.dot(x - 0.06, y - 0.06, z + r * 1.2, r * 0.35, shade(color, 0.35));
}

/** Buisson fleuri. */
function flowerBush(p: P, x: number, y: number, r: number, bloom: string, z = 0): void {
  bush(p, x, y, z, r, '#4f9e2f');
  const [sx, sy] = p.p(x, y, z + r);
  const { ctx } = p;
  ctx.fillStyle = bloom;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    ctx.beginPath();
    ctx.arc(sx + Math.cos(a) * r * 0.55, sy + Math.sin(a) * r * 0.45 - 1, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Arbre feuillu à houppier en boules. */
function tree(p: P, x: number, y: number, h = 56, color = '#5cb83a', z = 0): void {
  p.line([x, y, z], [x, y, z + h * 0.5], '#7a5233', 4.5);
  const [sx, sy] = p.p(x, y, z + h * 0.66);
  const r = h * 0.26;
  const { ctx } = p;
  const blob = (dx: number, dy: number, rr: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx + dx * r, sy + dy * r, rr * r, 0, Math.PI * 2);
    ctx.fill();
  };
  const dark = shade(color, -0.25);
  blob(0.55, 0.3, 0.72, dark);
  blob(-0.5, 0.3, 0.7, dark);
  blob(0.1, -0.45, 0.8, dark);
  blob(-0.5, 0.15, 0.66, color);
  blob(0.45, 0.15, 0.62, shade(color, -0.08));
  blob(-0.05, -0.5, 0.74, color);
  blob(-0.35, -0.65, 0.32, shade(color, 0.3));
  blob(-0.75, 0.0, 0.2, shade(color, 0.3));
}

/** Sapin à étages. */
function pine(p: P, x: number, y: number, h = 60, color = '#2e7d4f'): void {
  p.line([x, y, 0], [x, y, 10], '#6d4c2f', 4);
  const [sx, sy] = p.p(x, y, 0);
  const { ctx } = p;
  for (let i = 0; i < 3; i++) {
    const base = sy - 6 - i * h * 0.24;
    const wd = h * 0.3 * (1 - i * 0.24);
    const top = base - h * 0.44;
    ctx.fillStyle = shade(color, 0.12 - i * 0.02);
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx - wd, base);
    ctx.quadraticCurveTo(sx - wd * 0.5, base + 4, sx, base + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(color, -0.2);
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx, base + 3);
    ctx.quadraticCurveTo(sx + wd * 0.5, base + 4, sx + wd, base);
    ctx.closePath();
    ctx.fill();
  }
}

/** Palmier : tronc courbe annelé et palmes retombantes. */
function palm(p: P, x: number, y: number, h = 70): void {
  const [sx, sy] = p.p(x, y, 0);
  const { ctx } = p;
  const tx = sx + 10;
  const ty = sy - h;
  ctx.strokeStyle = '#a77b4f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(sx - 4, sy - h * 0.55, tx, ty);
  ctx.stroke();
  ctx.strokeStyle = '#7d5634';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const bx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * (sx - 4) + t * t * tx;
    const by = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * (sy - h * 0.55) + t * t * ty;
    ctx.beginPath();
    ctx.moveTo(bx - 3, by);
    ctx.lineTo(bx + 3, by + 1);
    ctx.stroke();
  }
  const fronds = [-2.8, -2.2, -1.5, -0.8, -0.2, 0.5, 3.4];
  for (const [i, a] of fronds.entries()) {
    const L = 26;
    const ex = tx + Math.cos(a) * L;
    const ey = ty + Math.sin(a) * L * 0.5 + 12;
    const mx = tx + Math.cos(a) * L * 0.5;
    const my = ty + Math.sin(a) * L * 0.4 - 6;
    ctx.fillStyle = i % 2 ? '#4caf50' : '#66bb6a';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx, my - 6, ex, ey);
    ctx.quadraticCurveTo(mx, my + 5, tx, ty);
    ctx.fill();
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
  for (const [dx, dy] of [
    [-2, 3],
    [3, 4],
  ] as const) {
    ctx.fillStyle = '#6d4c2f';
    ctx.beginPath();
    ctx.arc(tx + dx, ty + dy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Topiaire en pot : boule ou cône. */
function topiary(p: P, x: number, y: number, kind: 'ball' | 'cone' = 'ball', z = 0, pot = '#c8623a'): void {
  p.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z, z + 7, boxColors(pot, false));
  if (kind === 'ball') {
    p.line([x, y, z + 7], [x, y, z + 12], '#6d4c2f', 2);
    p.dot(x, y, z + 18, 7, '#3f8f2f');
    p.dot(x - 0.03, y - 0.03, z + 20, 3, '#7cc35a');
  } else {
    const [sx, sy] = p.p(x, y, z + 7);
    const { ctx } = p;
    ctx.fillStyle = '#3f8f2f';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 26);
    ctx.quadraticCurveTo(sx + 9, sy - 4, sx, sy);
    ctx.quadraticCurveTo(sx - 9, sy - 4, sx, sy - 26);
    ctx.fill();
    ctx.fillStyle = '#6fb24a';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 26);
    ctx.quadraticCurveTo(sx - 9, sy - 4, sx - 1, sy - 1);
    ctx.quadraticCurveTo(sx - 3, sy - 12, sx, sy - 26);
    ctx.fill();
  }
}

/** Lampadaire à globe. */
function lamp(p: P, x: number, y: number, h = 36, z = 0): void {
  p.box(x - 0.03, y - 0.03, x + 0.03, y + 0.03, z, z + 4, boxColors('#37474f', false));
  p.line([x, y, z], [x, y, z + h], '#37474f', 2.6);
  p.dot(x, y, z + h + 3, 4.5, '#fff59d');
  p.dot(x - 0.01, y - 0.01, z + h + 4, 1.8, '#ffffff');
  p.dot(x, y, z + h + 7.5, 2, '#37474f');
}

/** Parasol à quartiers. */
function parasol(p: P, x: number, y: number, z: number, a = '#e53935', b = '#ffffff', r = 22): void {
  p.line([x, y, z], [x, y, z + 34], '#795548', 2.5);
  const [sx, sy] = p.p(x, y, z + 32);
  const { ctx } = p;
  const n = 10;
  const ry = r * 0.42;
  for (let i = 0; i < n; i++) {
    const t0 = Math.PI + (i / n) * Math.PI * 2;
    const t1 = Math.PI + ((i + 1) / n) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? a : b;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 11);
    ctx.lineTo(sx + Math.cos(t0) * r, sy + Math.sin(t0) * ry);
    ctx.lineTo(sx + Math.cos(t1) * r, sy + Math.sin(t1) * ry);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = shade(a, -0.2);
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    ctx.beginPath();
    ctx.arc(sx + Math.cos(Math.PI * t) * r, sy + Math.sin(Math.PI * t) * ry, 2.6, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(sx, sy - 12, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Transat. */
function lounger(p: P, x: number, y: number, cushion = '#4fc3f7'): void {
  p.box(x, y, x + 0.3, y + 0.12, 2, 5, boxColors('#ffffff', false));
  p.box(x + 0.02, y + 0.01, x + 0.22, y + 0.11, 5, 7, boxColors(cushion, false));
  p.fill(
    [
      [x + 0.22, y + 0.01, 7],
      [x + 0.22, y + 0.11, 7],
      [x + 0.3, y + 0.11, 16],
      [x + 0.3, y + 0.01, 16],
    ],
    shade(cushion, 0.1),
  );
}

/** Piscine : margelle, eau en creux, reflets et échelle. */
function pool(p: P, x0: number, y0: number, x1: number, y1: number, rim = '#eceff1'): void {
  p.box(x0, y0, x1, y1, 0, 3, boxColors(rim, false));
  const r = 0.07;
  const { ctx } = p;
  ctx.save();
  p.path([
    [x0 + r, y0 + r, 3],
    [x1 - r, y0 + r, 3],
    [x1 - r, y1 - r, 3],
    [x0 + r, y1 - r, 3],
  ]);
  ctx.clip();
  p.flat(x0 + r, y0 + r, x1 - r, y1 - r, -3, p.gradient([x0, y0, 0], [x1, y1, 0], '#4fc3f7', '#29a8e0'));
  p.leftQuad(x0 + r, x1 - r, -3, 3, y0 + r, '#81d4fa');
  p.rightQuad(y0 + r, y1 - r, -3, 3, x0 + r, '#b3e5fc');
  for (const [u, v, l] of [
    [0.3, 0.4, 0.18],
    [0.6, 0.65, 0.14],
    [0.2, 0.75, 0.1],
    [0.75, 0.3, 0.12],
  ] as const) {
    const px = x0 + (x1 - x0) * u;
    const py = y0 + (y1 - y0) * v;
    p.line([px, py, -3], [px + l, py, -3], 'rgba(255,255,255,0.75)', 1.6);
  }
  ctx.restore();
  for (const dy of [0.04, 0.12]) p.line([x1 - 0.12, y0 + 0.1 + dy, 3], [x1 - 0.12, y0 + 0.1 + dy, 13], '#cfd8dc', 1.8);
}

/** Fontaine à vasque. */
function fountain(p: P, x: number, y: number, r: number): void {
  const [sx, sy] = p.p(x, y, 0);
  const rx = r * HALF_W * Math.SQRT2;
  const { ctx } = p;
  p.groundEllipse(x, y, 0, r, '#b0a99f');
  ctx.fillStyle = '#c9c2b6';
  ctx.fillRect(sx - rx, sy - 9, rx * 2, 9);
  p.groundEllipse(x, y, 9, r, '#e7e1d6');
  p.groundEllipse(x, y, 9, r * 0.8, '#4fc3f7');
  p.box(x - 0.03, y - 0.03, x + 0.03, y + 0.03, 9, 26, boxColors('#e7e1d6', false));
  p.groundEllipse(x, y, 26, r * 0.4, '#e7e1d6');
  p.groundEllipse(x, y, 27, r * 0.3, '#81d4fa');
  ctx.strokeStyle = '#e1f5fe';
  ctx.lineWidth = 2;
  const [tx, ty] = p.p(x, y, 36);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + dir * 10, ty - 6, tx + dir * rx * 0.6, sy - 11);
    ctx.stroke();
  }
  p.dot(x, y, 37, 2.6, '#e1f5fe');
}

/** Grille en fer forgé à pointes dorées, poteaux en pierre aux extrémités. */
function ironFence(p: P, from: readonly [number, number], to: readonly [number, number], h = 15): void {
  const [fx, fy] = from;
  const [tx, ty] = to;
  const n = Math.max(2, Math.round(Math.hypot(tx - fx, ty - fy) * 11));
  p.line([fx, fy, 3], [tx, ty, 3], '#263238', 1.8);
  p.line([fx, fy, h - 2], [tx, ty, h - 2], '#263238', 1.8);
  for (let i = 0; i <= n; i++) {
    const x = fx + ((tx - fx) * i) / n;
    const y = fy + ((ty - fy) * i) / n;
    p.line([x, y, 0], [x, y, h], '#263238', 1.4);
    p.dot(x, y, h + 1, 1.5, '#ffca28');
  }
  for (const [x, y] of [from, to]) {
    p.box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, 0, h + 5, boxColors('#d7cfc2', false));
    p.dot(x, y, h + 8, 3, '#d7cfc2');
  }
}

/** Petit réservoir d'eau en bois sur pieds métalliques (toits new-yorkais). */
function waterTower(p: P, x: number, y: number, z: number, r = 0.22, h = 26): void {
  const legH = 14;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    p.line([x + dx * r * 0.6, y + dy * r * 0.6, z], [x + dx * r * 0.6, y + dy * r * 0.6, z + legH], '#37474f', 2.2);
  p.line([x - r * 0.6, y + r * 0.6, z + 4], [x + r * 0.6, y + r * 0.6, z + legH - 2], '#37474f', 1.2);
  const [sx, sy] = p.p(x, y, z + legH);
  const rx = r * HALF_W * Math.SQRT2;
  const ry = r * HALF_H * Math.SQRT2;
  const { ctx } = p;
  const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, '#c08a57');
  g.addColorStop(1, '#7a5233');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(sx - rx, sy - h);
  ctx.ellipse(sx, sy - h, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4e342e';
  ctx.lineWidth = 1.6;
  for (const k of [0.25, 0.7]) {
    ctx.beginPath();
    ctx.ellipse(sx, sy - h * k, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = '#5d4037';
  ctx.beginPath();
  ctx.ellipse(sx, sy - h, rx + 1, ry + 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6d4c41';
  ctx.beginPath();
  ctx.moveTo(sx - rx - 2, sy - h);
  ctx.lineTo(sx, sy - h - 14);
  ctx.lineTo(sx + rx + 2, sy - h);
  ctx.ellipse(sx, sy - h, rx + 2, ry + 1, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8d6e63';
  ctx.beginPath();
  ctx.moveTo(sx - rx - 2, sy - h);
  ctx.lineTo(sx, sy - h - 14);
  ctx.lineTo(sx - 2, sy - h + ry);
  ctx.closePath();
  ctx.fill();
}

// ——— Sol ———

function lawn(g: P, size: number, color = '#8fd14f'): void {
  g.flat(0.02, 0.02, size - 0.02, size - 0.02, 0, color, shade(color, -0.15));
  for (let i = 1; i < size * 3; i += 2) {
    g.flat(i / 3, 0.02, Math.min(size - 0.02, (i + 1) / 3), size - 0.02, 0, shade(color, 0.06));
  }
}

function paving(g: P, x0: number, y0: number, x1: number, y1: number, color: string, step = 0.25): void {
  g.flat(x0, y0, x1, y1, 0, color, shade(color, -0.15));
  const line = shade(color, -0.12);
  for (let x = x0 + step; x < x1 - 0.01; x += step) g.line([x, y0, 0], [x, y1, 0], line, 1);
  for (let y = y0 + step; y < y1 - 0.01; y += step) g.line([x0, y, 0], [x1, y, 0], line, 1);
}

function softShadow(g: P, size: number, x0: number, y0: number, x1: number, y1: number, alpha = 0.25): void {
  g.ctx.save();
  g.ctx.globalAlpha = alpha;
  g.flat(x0 + 0.04, y0 + 0.04, Math.min(size - 0.03, x1 + 0.3), Math.min(size - 0.03, y1 + 0.22), 0, '#2c4a16');
  g.ctx.restore();
}

function stonePath(g: P, from: readonly [number, number], to: readonly [number, number], color = '#e9dcc0'): void {
  const n = Math.max(2, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.14));
  for (let i = 0; i <= n; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / n + (i % 2 ? 0.03 : -0.03);
    const y = from[1] + ((to[1] - from[1]) * i) / n;
    g.groundEllipse(x, y, 0, 0.065, color, shade(color, -0.2));
  }
}

function mailbox(p: P, x: number, y: number, color = '#1e88e5'): void {
  p.line([x, y, 0], [x, y, 14], '#6d4c2f', 2.6);
  p.box(x - 0.05, y - 0.09, x + 0.05, y + 0.09, 14, 21, boxColors(color, false));
  p.line([x + 0.05, y - 0.05, 21], [x + 0.05, y - 0.05, 27], '#e53935', 1.6);
}

// ——— Bâtiments ———

/** Bungalow jaune : grand toit en croupe qui couvre la véranda, lucarne, jardinières. */
const bungalow: Hero = {
  height: 104,
  draw(g, p) {
    const S = 2;
    lawn(g, S, '#a5d46d');
    const x0 = 0.32;
    const x1 = 1.68;
    const y0 = 0.3;
    const y1 = 1.2;
    const deep = 0.32;
    const h = 42;
    const wall = '#ffd75e';
    const green = '#4e7d3a';
    softShadow(g, S, x0, y0, x1, y1 + deep);
    stonePath(g, [1.04, y1 + deep + 0.14], [1.0, 1.9]);

    picket(p, [0.06, 0.06], [1.94, 0.06]);
    picket(p, [0.06, 0.06], [0.06, 1.94]);
    chimney(p, 1.36, 0.6, 56, 94, '#b5523b');
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall));
    lap(p, 'left', x0, x1, y1, 4, h, wall);
    lap(p, 'right', y0, y1, x1, 4, h, wall);
    p.rightQuad(y0, y1, 0, 5, x1, '#a99a86');
    p.leftQuad(x0, x0 + 0.05, 0, h, y1, '#ffffff');
    p.rightQuad(y1 - 0.05, y1, 0, h, x1, '#e3e6e8');
    win(p, 'right', 0.55, 0.12, x1, 15, 32, { shutter: green, flowers: true, seed: 1 });
    win(p, 'right', 0.97, 0.12, x1, 15, 32, { shutter: green, flowers: true, seed: 3 });
    // Véranda.
    const va = 0.8;
    p.box(va, y1, x1 - 0.02, y1 + deep, 0, 5, boxColors('#c69c6d'));
    for (let x = va + 0.08; x < x1 - 0.04; x += 0.1) p.line([x, y1, 5], [x, y1 + deep, 5], '#a87d52', 1);
    win(p, 'left', 0.52, 0.14, y1, 16, 33, { shutter: green, flowers: true, seed: 2 });
    win(p, 'left', 1.42, 0.14, y1, 16, 33, { shutter: green, flowers: true, seed: 4 });
    entry(p, 'left', 1.04, 0.24, 30, y1, green, { z0: 5, glass: true });
    const yr = y1 + deep - 0.05;
    const posts = [va + 0.04, 0.86, 1.24, x1 - 0.06];
    p.line([x1 - 0.06, y1 + 0.02, 17], [x1 - 0.06, yr, 17], '#ffffff', 2.4);
    for (const [a, b] of [
      [posts[0]!, posts[1]!],
      [posts[2]!, posts[3]!],
    ] as const) {
      for (let x = a; x <= b; x += 0.06) p.line([x, yr, 5], [x, yr, 16], '#ffffff', 1.6);
      p.line([a, yr, 17], [b, yr, 17], '#ffffff', 2.6);
    }
    for (const x of posts) p.box(x - 0.035, yr - 0.035, x + 0.035, yr + 0.035, 5, h, boxColors('#ffffff', false));
    steps(p, 'left', 1.05, 0.34, y1 + deep, 1, '#bfa58a', 3, 0.1);
    flowerBush(p, 0.5, y1 + 0.16, 7, '#ff80ab');
    flowerBush(p, 0.66, y1 + 0.2, 6, '#ffffff');
    flowerBush(p, x1 - 0.1, y1 + deep + 0.14, 7, '#ffeb3b');
    // Auvent de la véranda (appentis), puis grand toit en croupe.
    const shed: V3[] = [
      [va - 0.04, y1, h - 4],
      [x1 + 0.04, y1, h - 4],
      [x1 + 0.04, y1 + deep + 0.08, 30],
      [va - 0.04, y1 + deep + 0.08, 30],
    ];
    p.fill(shed, p.gradient(shed[0]!, shed[3]!, '#8e5b48', '#6e4031'));
    roofTex(p, shed, shed[3]!, shed[2]!, shed[1]!, shed[0]!, '#7b4b3a', 'shingle');
    p.line(shed[3]!, shed[2]!, '#ffffff', 3.5);
    p.line(shed[2]!, shed[1]!, '#f0f0f0', 3);
    hipRoof(p, x0, y0, x1, y1, h, 32, '#7b4b3a', { ov: 0.14, style: 'shingle' });
    const k = 32 / ((y1 - y0) / 2 + 0.14);
    dormer(p, 'left', 0.95, 0.14, y1 + 0.14 - 0.24, h + k * 0.24, k, 11, '#7b4b3a', wall, { style: 'shingle' });
    tree(p, 1.84, 0.26, 60, '#5cb83a');
    roundBush(p, 1.82, 1.2, 9, '#5cbf32');
    roundBush(p, 0.2, 1.62, 8);
    mailbox(p, 0.78, 1.86);
    picket(p, [0.06, 1.94], [0.88, 1.94]);
    picket(p, [1.12, 1.94], [1.94, 1.94]);
    picket(p, [1.94, 0.06], [1.94, 1.94]);
  },
};

/** Maison de ville victorienne bleue : bow-window, perron, pignon ardoise à œil-de-bœuf. */
const townhouse: Hero = {
  height: 150,
  draw(g, p) {
    const S = 2;
    paving(g, 0.02, 0.02, S - 0.02, S - 0.02, '#cfd8dc', 0.2);
    const x0 = 0.42;
    const x1 = 1.58;
    const y0 = 0.24;
    const y1 = 1.3;
    const h = 80;
    const wall = '#8ec5f2';
    const trim = '#ffffff';
    g.flat(0.12, 1.42, 0.98, 1.88, 0, '#8fd14f', '#6fae3a');
    g.flat(1.88, 0.12, 1.98, 1.98, 0, '#8fd14f');
    softShadow(g, S, x0, y0, x1, y1);

    chimney(p, 0.72, 0.45, 96, 140, '#90a4ae', 0.09, 2);
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall));
    lap(p, 'left', x0, x1, y1, 9, h, wall);
    lap(p, 'right', y0, y1, x1, 9, h, wall);
    band(p, x0, y0, x1, y1, 0, 9, '#9aa7ad');
    band(p, x0, y0, x1, y1, 40, 44, trim);
    band(p, x0, y0, x1, y1, h - 4, h, trim);
    p.leftQuad(x0, x0 + 0.05, 9, h, y1, trim);
    p.leftQuad(x1 - 0.05, x1, 9, h, y1, trim);
    p.rightQuad(y1 - 0.05, y1, 9, h, x1, '#dfe3e6');
    for (const c of [0.52, 1.0]) {
      win(p, 'right', c, 0.12, x1, 16, 34, { shutter: '#2b5f8a', seed: 2 });
      win(p, 'right', c, 0.12, x1, 52, 72, { shutter: '#2b5f8a', flowers: true, seed: c > 0.8 ? 1 : 4 });
    }
    // Bow-window sur deux niveaux.
    const ba = 0.5;
    const bb = 0.98;
    const bd = 0.2;
    jut(p, 'left', ba, bb, y1, bd, 0, 9, boxColors('#8d989e', false));
    jut(p, 'left', ba, bb, y1, bd, 9, 74, boxColors(wall, false));
    lap(p, 'left', ba, bb, y1 + bd, 9, 74, wall);
    band(p, ba, y1, bb, y1 + bd, 40, 44, trim);
    for (const [za, zb] of [
      [15, 35],
      [51, 70],
    ] as const) {
      win(p, 'left', (ba + bb) / 2, 0.14, y1 + bd, za, zb, { bars: 'grid' });
      win(p, 'right', y1 + bd / 2, 0.05, bb, za, zb, { bars: 'none', sill: false });
    }
    jut(p, 'left', ba - 0.03, bb + 0.03, y1 - 0.02, bd + 0.05, 74, 79, boxColors(trim, false));
    for (let s = ba; s < bb; s += 0.06) p.leftQuad(s, s + 0.03, 71, 74, y1 + bd + 0.02, '#e3e6e8');
    // Entrée sur perron.
    win(p, 'left', 1.32, 0.11, y1, 52, 72, { flowers: true, seed: 3 });
    entry(p, 'left', 1.32, 0.24, 30, y1, '#37474f', { z0: 9, transom: true, pediment: trim });
    steps(p, 'left', 1.32, 0.34, y1, 3, '#b8b0a4', 3, 0.09);
    for (const x of [1.13, 1.51]) {
      p.line([x, y1, 22], [x, y1 + 0.27, 10], '#263238', 2);
      p.line([x, y1 + 0.27, 0], [x, y1 + 0.27, 12], '#263238', 2);
    }
    gableRoof(p, 'y', x0, y0, x1, y1, h, 46, '#50636e', wall, {
      style: 'slate',
      ov: 0.14,
      onGable: () => {
        lap(p, 'left', x0 + 0.1, x1 - 0.1, y1, h, h + 30, wall);
        oculus(p, 'left', (x0 + x1) / 2, y1, h + 20, 8);
        // Lambrequin ajouré sous la rive.
        const xm = (x0 + x1) / 2;
        for (let i = 1; i < 6; i++) {
          const t = i / 6;
          p.dot(x0 + (xm - x0) * t, y1 + 0.02, h + 46 * t - 5, 2.2, '#ffffff');
          p.dot(x1 - (x1 - xm) * t, y1 + 0.02, h + 46 * t - 5, 2.2, '#ffffff');
        }
      },
    });
    flowerBush(p, 0.3, 1.58, 8, '#ff80ab');
    flowerBush(p, 0.62, 1.72, 7, '#ffeb3b');
    roundBush(p, 0.9, 1.6, 7, '#5cbf32');
    ironFence(p, [0.1, 1.92], [1.0, 1.92]);
    lamp(p, 1.86, 1.72, 40);
    tree(p, 1.8, 0.3, 58, '#66bb44');
    topiary(p, 1.8, 1.2, 'ball');
  },
};

/** Chalet alpin : rondins, soubassement en pierre, balcon sculpté sous le grand pignon. */
const chalet: Hero = {
  height: 150,
  draw(g, p) {
    const S = 2;
    lawn(g, S, '#9ccf63');
    const x0 = 0.4;
    const x1 = 1.6;
    const y0 = 0.3;
    const y1 = 1.36;
    const h = 46;
    const wood = '#a8693c';
    const stone = '#9e9e9e';
    const shut = '#2e7d32';
    softShadow(g, S, x0, y0, x1, y1);
    stonePath(g, [1.0, y1 + 0.2], [1.0, 1.92], '#d7ccc8');

    p.fence([0.06, 0.06], [1.94, 0.06], '#8d6e63');
    p.fence([0.06, 0.06], [0.06, 1.94], '#8d6e63');
    pine(p, 0.22, 0.3, 66);
    chimney(p, 0.7, 0.48, 70, 112, '#8f8a84', 0.1);
    // Soubassement en pierres, puis rondins.
    p.box(x0, y0, x1, y1, 0, 12, boxColors(stone));
    const rnd = seeded(7);
    for (const side of ['left', 'right'] as const) {
      const [a, b, plane] = side === 'left' ? [x0, x1, y1] : [y0, y1, x1];
      for (let z = 1, r = 0; z < 11; z += 5, r++)
        for (let s = a + (r % 2) * 0.06; s < b - 0.05; s += 0.12)
          poly(p, side, plane, [[s + 0.01, z], [s + 0.1, z], [s + 0.1, z + 4], [s + 0.01, z + 4]], tone(side, shade(stone, rnd() * 0.25 - 0.05)));
    }
    p.box(x0, y0, x1, y1, 12, h, boxColors(wood));
    for (const side of ['left', 'right'] as const) {
      const [a, b, plane] = side === 'left' ? [x0, x1, y1] : [y0, y1, x1];
      for (let z = 12; z < h; z += 5.5) {
        seg(p, side, plane, a, z + 4.8, b, z + 4.8, tone(side, shade(wood, -0.3)), 1.2);
        seg(p, side, plane, a, z + 1.5, b, z + 1.5, tone(side, shade(wood, 0.15)), 1);
      }
    }
    // Têtes de rondins aux angles.
    for (let z = 14.5; z < h; z += 5.5) {
      p.dot(x0, y1 + 0.02, z, 2.6, '#d9a066');
      p.dot(x1 + 0.02, y1 + 0.02, z, 2.6, '#c88f55');
    }
    for (const c of [0.6, 1.4]) win(p, 'left', c, 0.12, y1, 20, 36, { shutter: shut, glass: WARM, flowers: true, seed: c > 1 ? 0 : 3 });
    for (const c of [0.58, 1.08]) win(p, 'right', c, 0.12, x1, 20, 36, { shutter: shut, glass: WARM, flowers: true, seed: c > 1 ? 2 : 5 });
    entry(p, 'left', 1.0, 0.24, 30, y1, '#4e342e', { z0: 0, frame: '#d7a86e' });
    const xm = (x0 + x1) / 2;
    gableRoof(p, 'y', x0, y0, x1, y1, h, 50, '#37474f', '#b77646', {
      style: 'slate',
      ov: 0.18,
      rake: '#7a4a2a',
      eave: '#5d4037',
      onGable: () => {
        for (let x = x0 + 0.06; x < x1 - 0.02; x += 0.075) {
          const top = h + 50 * (1 - Math.abs(x - xm) / (xm - x0));
          seg(p, 'left', y1, x, h, x, top - 2, shade('#b77646', -0.25), 1);
        }
        for (const c of [0.8, 1.2]) win(p, 'left', c, 0.09, y1, h + 12, h + 27, { glass: WARM, shutter: shut, sill: false });
        oculus(p, 'left', xm, y1, h + 38, 4.5, '#f3e2c7', WARM);
        // Balcon à balustres découpés.
        jut(p, 'left', x0 - 0.04, x1 + 0.04, y1, 0.24, h - 1, h + 3, boxColors('#8a5530', false));
        const yb = y1 + 0.23;
        p.leftQuad(x0 - 0.04, x1 + 0.04, h + 3, h + 15, yb, '#c98a4f');
        for (let x = x0 + 0.02; x < x1; x += 0.1) {
          const [sx, sy] = p.p(x + 0.04, yb, h + 9);
          p.ctx.fillStyle = '#6d4426';
          p.ctx.beginPath();
          p.ctx.ellipse(sx, sy, 2, 3.2, 0, 0, Math.PI * 2);
          p.ctx.fill();
        }
        p.leftQuad(x0 - 0.06, x1 + 0.06, h + 14, h + 17, yb + 0.01, '#8a5530');
        p.rightQuad(y1, yb, h + 3, h + 15, x1 + 0.04, '#a5703f');
        for (let x = x0; x <= x1; x += 0.3) flowerBush(p, x + 0.1, yb - 0.03, 4, '#e53935', h + 15);
      },
    });
    // Fumée.
    for (const [dz, dx, r] of [
      [10, 0, 5],
      [20, 0.06, 6.5],
      [32, 0.02, 8],
    ] as const)
      p.dot(0.7 + dx, 0.48 - dx, 120 + dz, r, '#f2f2f2');
    // Étoile « premium ».
    const [sx, sy] = p.p(1.0, 1.7, 126);
    const { ctx } = p;
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 10 : 4.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    // Tas de bois contre la façade droite.
    p.box(x1 + 0.04, 0.45, x1 + 0.2, 0.95, 0, 16, boxColors('#8d6e63', false));
    for (let z = 3; z < 16; z += 4.5)
      for (let y = 0.5; y < 0.95; y += 0.075) p.dot(x1 + 0.2, y, z, 2.3, '#e0b27a');
    pine(p, 1.84, 0.28, 60, '#2f7a4a');
    lamp(p, 0.78, y1 + 0.3, 26);
    roundBush(p, 1.82, 1.72, 8, '#3f8f2f');
    pine(p, 0.22, 1.78, 48, '#3a8a55');
    p.fence([0.06, 1.94], [0.86, 1.94], '#8d6e63');
    p.fence([1.14, 1.94], [1.94, 1.94], '#8d6e63');
    p.fence([1.94, 0.06], [1.94, 1.94], '#8d6e63');
  },
};

/** Villa méditerranéenne : tuiles canal, aile à toit-terrasse, piscine, palmiers et cyprès. */
const villa: Hero = {
  height: 150,
  draw(g, p) {
    const S = 3;
    lawn(g, S, '#a8d672');
    const x0 = 1.0;
    const x1 = 2.62;
    const y0 = 0.32;
    const y1 = 1.8;
    const h = 70;
    const wall = '#fff6e3';
    const roof = '#c8623a';
    const teal = '#3fa7a0';
    const frame = '#8d6e63';
    paving(g, 0.12, 2.02, 2.9, 2.92, '#efe3cf', 0.22);
    paving(g, 1.84, y1, 2.18, 2.02, '#efe3cf', 0.22);
    softShadow(g, S, 0.3, y0, x1, y1);

    picket(p, [0.06, 0.06], [2.94, 0.06]);
    picket(p, [0.06, 0.06], [0.06, 2.94]);
    palm(p, 0.32, 0.4, 84);
    // Aile basse à toit-terrasse.
    const wa = 0.3;
    const wy0 = 0.78;
    const wh = 38;
    p.box(wa, wy0, x0, y1, 0, wh, boxColors(wall));
    for (const c of [0.48, 0.82]) win(p, 'left', c, 0.1, y1, 6, 24, { arch: true, shutter: teal, frame, bars: 'vert' });
    p.box(wa - 0.03, wy0 - 0.03, x0, y1 + 0.03, wh, wh + 4, boxColors('#f1dfc0', false));
    for (let x = wa; x <= x0 - 0.02; x += 0.07) p.line([x, y1, wh + 4], [x, y1, wh + 12], '#ffffff', 2.2);
    for (let y = wy0; y <= y1; y += 0.07) p.line([wa, y, wh + 4], [wa, y, wh + 12], '#ffffff', 2.2);
    p.line([wa, y1, wh + 13], [x0, y1, wh + 13], '#ffffff', 3);
    p.line([wa, wy0, wh + 13], [wa, y1, wh + 13], '#ffffff', 3);
    topiary(p, 0.55, 1.15, 'ball', wh + 4);
    // Corps principal.
    chimney(p, 1.4, 0.62, 86, 124, '#f1dfc0', 0.09);
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall));
    band(p, x0, y0, x1, y1, 0, 5, '#d9c6a5');
    band(p, x0, y0, x1, y1, 35, 38, '#f1dfc0');
    band(p, x0, y0, x1, y1, h - 5, h, '#f1dfc0');
    const slots = [1.2, 1.61, 2.01, 2.42];
    for (const [i, c] of slots.entries()) {
      if (i !== 2) win(p, 'left', c, 0.1, y1, 9, 26, { arch: true, shutter: teal, frame, bars: 'vert' });
      if (i !== 2) win(p, 'left', c, 0.1, y1, 44, 62, { shutter: teal, frame, flowers: true, seed: i });
    }
    entry(p, 'left', 2.01, 0.26, 26, y1, '#6d4c41', { arch: true, frame: '#e8c9a0' });
    win(p, 'left', 2.01, 0.11, y1, 42, 64, { frame, bars: 'vert', sill: false });
    balcony(p, 'left', 1.85, 2.17, y1, 42, { depth: 0.14, rail: '#3e2723', slab: '#f1dfc0' });
    for (const [i, c] of [0.6, 1.06, 1.52].entries()) {
      win(p, 'right', c, 0.1, x1, 9, 26, { arch: true, shutter: teal, frame, bars: 'vert' });
      win(p, 'right', c, 0.1, x1, 44, 62, { shutter: teal, frame, flowers: true, seed: i + 2 });
    }
    hipRoof(p, x0, y0, x1, y1, h, 38, roof, { style: 'tiles', ov: 0.16, eave: '#fff3e0' });
    // Bougainvillier grimpant sur l'angle.
    for (const [dz, dx] of [
      [10, 0],
      [22, 0.03],
      [34, -0.02],
      [46, 0.02],
    ] as const)
      flowerBush(p, x0 + 0.04 + dx, y1 + 0.04, 7, '#e91e8c', dz - 6);
    pool(p, 0.24, 2.18, 1.6, 2.8);
    topiary(p, 1.78, 1.92, 'ball');
    topiary(p, 2.25, 1.92, 'ball');
    cypress(p, 2.82, 0.42, 66);
    cypress(p, 2.82, 1.1, 58);
    palm(p, 2.8, 1.85, 74);
    lounger(p, 2.3, 2.44, '#4fc3f7');
    lounger(p, 2.3, 2.66, '#ffb74d');
    parasol(p, 2.72, 2.42, 0, '#e53935', '#ffffff', 22);
    flowerBush(p, 0.18, 1.95, 7, '#e91e8c');
    picket(p, [0.06, 2.94], [1.84, 2.94]);
    picket(p, [2.18, 2.94], [2.94, 2.94]);
    picket(p, [2.94, 0.06], [2.94, 2.94]);
  },
};

/** Grande demeure coloniale blanche : portique à colonnes et fronton, ardoises, lucarnes, fontaine. */
const mansion: Hero = {
  height: 170,
  draw(g, p) {
    const S = 3;
    lawn(g, S, '#a8d672');
    const x0 = 0.42;
    const x1 = 2.58;
    const y0 = 0.32;
    const y1 = 1.9;
    const h = 80;
    const wall = '#fdfaf2';
    const slate = '#455a64';
    const black = '#263238';
    g.groundEllipse(1.5, 2.56, 0, 0.44, '#e8dfcf');
    g.flat(1.3, 2.4, 1.7, 2.98, 0, '#e8dfcf');
    g.groundEllipse(1.5, 2.56, 0, 0.2, '#a8d672');
    softShadow(g, S, x0, y0, x1, y1);

    ironFence(p, [0.08, 0.08], [2.92, 0.08]);
    ironFence(p, [0.08, 0.08], [0.08, 2.92]);
    chimney(p, 0.85, 1.1, 104, 146, '#bcaaa4', 0.11, 2);
    chimney(p, 2.15, 1.1, 104, 146, '#bcaaa4', 0.11, 2);
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall));
    band(p, x0, y0, x1, y1, 0, 6, '#d7ccc8');
    band(p, x0, y0, x1, y1, 38, 42, '#ece6dc');
    band(p, x0, y0, x1, y1, h - 5, h, '#ece6dc');
    quoins(p, 'left', x0, x1, y1, 6, h - 5, '#efe9df');
    for (const c of [0.72, 2.28]) {
      win(p, 'left', c, 0.12, y1, 12, 32, { shutter: black, bars: 'grid' });
      win(p, 'left', c, 0.12, y1, 50, 70, { shutter: black, bars: 'grid' });
    }
    for (const c of [1.2, 1.8]) {
      win(p, 'left', c, 0.11, y1, 12, 32, { bars: 'grid' });
      win(p, 'left', c, 0.11, y1, 50, 70, { bars: 'grid' });
    }
    entry(p, 'left', 1.5, 0.28, 30, y1, '#3e2723', { transom: true, z0: 6 });
    for (const c of [0.62, 1.11, 1.6]) {
      win(p, 'right', c, 0.12, x1, 12, 32, { shutter: black, bars: 'grid' });
      win(p, 'right', c, 0.12, x1, 50, 70, { shutter: black, bars: 'grid' });
    }
    hipRoof(p, x0, y0, x1, y1, h, 46, slate, { style: 'slate', ov: 0.16 });
    const k = 46 / ((y1 - y0) / 2 + 0.16);
    for (const c of [0.9, 2.1]) dormer(p, 'left', c, 0.13, y1 + 0.16 - 0.3, h + k * 0.3, k, 14, slate, wall, { style: 'slate' });
    dormer(p, 'right', 1.1, 0.13, x1 + 0.16 - 0.3, h + k * 0.3, k, 14, slate, wall, { style: 'slate' });
    // Portique : emmarchement, colonnes, entablement et fronton.
    const pa = 1.0;
    const pb = 2.0;
    const pd = y1 + 0.34;
    p.box(pa - 0.04, y1, pb + 0.04, pd + 0.02, 0, 6, boxColors('#e7e1d6', false));
    steps(p, 'left', 1.5, 0.5, pd + 0.02, 2, '#ddd5c8', 3, 0.08);
    for (const x of [1.06, 1.35, 1.65, 1.94]) {
      p.box(x - 0.055, pd - 0.1, x + 0.055, pd - 0.0, 6, 9, boxColors('#f3efe8', false));
      p.box(x - 0.04, pd - 0.09, x + 0.04, pd - 0.01, 9, 70, { top: '#ffffff', left: '#ffffff', right: '#e3ded5' });
      p.line([x - 0.02, pd - 0.01, 10], [x - 0.02, pd - 0.01, 69], '#ece8e0', 1);
      p.box(x - 0.06, pd - 0.11, x + 0.06, pd + 0.01, 70, 74, boxColors('#f3efe8', false));
    }
    p.box(pa, y1, pb, pd + 0.02, 74, 84, boxColors('#f8f5ef', false));
    const top = 108;
    p.fill(
      [
        [1.5, pd + 0.02, top],
        [pb + 0.05, pd + 0.02, 83],
        [pb + 0.05, y1, 83],
        [1.5, y1, top],
      ],
      shade(slate, -0.2),
    );
    poly(p, 'left', pd + 0.02, [[pa - 0.05, 84], [pb + 0.05, 84], [1.5, top]], '#ffffff');
    poly(p, 'left', pd + 0.02, [[pa + 0.08, 87], [pb - 0.08, 87], [1.5, top - 5]], '#e8e2d6');
    oculus(p, 'left', 1.5, pd + 0.02, 94, 4);
    p.line([pa - 0.05, pd + 0.02, 84], [1.5, pd + 0.02, top], '#ffffff', 3.5);
    p.line([1.5, pd + 0.02, top], [pb + 0.05, pd + 0.02, 84], '#f2f2f2', 3.5);
    tree(p, 2.8, 0.42, 76, '#5cb83a');
    for (const [x, y] of [
      [0.5, 2.08],
      [0.72, 2.12],
      [2.28, 2.12],
      [2.5, 2.08],
    ] as const)
      flowerBush(p, x, y, 7, x < 1 ? '#ff80ab' : '#ffffff');
    topiary(p, 0.88, 2.4, 'cone', 0, '#eceff1');
    topiary(p, 2.12, 2.4, 'cone', 0, '#eceff1');
    fountain(p, 1.5, 2.56, 0.18);
    roundBush(p, 0.3, 2.3, 10, '#3f8f2f');
    roundBush(p, 2.72, 2.3, 10, '#3f8f2f');
    roundBush(p, 2.78, 1.5, 9, '#4caf50');
    ironFence(p, [0.08, 2.92], [1.22, 2.92]);
    ironFence(p, [1.78, 2.92], [2.92, 2.92]);
    ironFence(p, [2.92, 0.08], [2.92, 2.92]);
  },
};

/** Manoir anglais : deux ailes à pignons en colombages, ardoises, lucarnes, piscine et jardin à la française. */
const manor: Hero = {
  height: 190,
  draw(g, p) {
    const S = 4;
    lawn(g, S, '#9ccf63');
    const wall = '#f6ecd8';
    const slate = '#37474f';
    const timber = '#6d4c41';
    const h = 86;
    const rh = 50;
    const my0 = 0.5;
    const my1 = 2.2;
    const wy0 = 0.6;
    const wy1 = 2.8;
    const L = [0.42, 1.3] as const;
    const R = [2.45, 3.33] as const;
    g.flat(1.3, my1, 2.45, wy1, 0, '#e8dfcf');
    g.flat(1.72, wy1, 2.04, 3.98, 0, '#e8dfcf');
    paving(g, 0.14, 2.98, 1.62, 3.9, '#efe3cf', 0.25);
    softShadow(g, S, L[0], my0, R[1], wy1);

    picket(p, [0.06, 0.06], [3.94, 0.06]);
    picket(p, [0.06, 0.06], [0.06, 3.94]);
    tree(p, 3.62, 0.36, 80, '#5cb83a');

    const wing = (a: number, b: number) => {
      p.box(a, wy0, b, wy1, 0, h, boxColors(wall));
      band(p, a, wy0, b, wy1, 0, 7, '#bdb3a3');
      band(p, a, wy0, b, wy1, 41, 44, '#e9dcc3');
      quoins(p, 'left', a, b, wy1, 7, h, '#e2d6c0');
      quoins(p, 'right', wy0, wy1, b, 7, h, '#e2d6c0');
      const c = (a + b) / 2;
      // Bow-window du rez-de-chaussée.
      jut(p, 'left', c - 0.26, c + 0.26, wy1, 0.14, 0, 7, boxColors('#bdb3a3', false));
      jut(p, 'left', c - 0.26, c + 0.26, wy1, 0.14, 7, 36, boxColors(wall, false));
      for (const s of [c - 0.15, c + 0.15]) win(p, 'left', s, 0.09, wy1 + 0.14, 12, 31, { bars: 'grid', sill: false });
      win(p, 'right', wy1 + 0.07, 0.04, c + 0.26, 12, 31, { bars: 'none', sill: false });
      jut(p, 'left', c - 0.29, c + 0.29, wy1 - 0.02, 0.19, 36, 40, boxColors(slate, false));
      win(p, 'left', c, 0.14, wy1, 52, 72, { bars: 'grid', flowers: true, seed: a > 1 ? 2 : 0 });
      for (const y of [1.0, 1.7, 2.4]) {
        if (b > 3) win(p, 'right', y, 0.11, b, 12, 32, { bars: 'grid' });
        win(p, 'right', y, 0.11, b, 52, 72, { bars: 'grid' });
      }
      chimney(p, c, 1.05, 118, 164, '#a1887f', 0.11, 3);
      gableRoof(p, 'y', a, wy0, b, wy1, h, rh, slate, wall, {
        style: 'slate',
        ov: 0.14,
        onGable: () => {
          // Colombages.
          const t = '#6d4c41';
          seg(p, 'left', wy1, a, h + 2, b, h + 2, t, 3);
          for (const s of [a + 0.2, c, b - 0.2]) {
            const top = h + rh * (1 - Math.abs(s - c) / (c - a));
            seg(p, 'left', wy1, s, h + 2, s, top - 3, t, 2.6);
          }
          seg(p, 'left', wy1, a + 0.2, h + 2, c - 0.1, h + 0.75 * rh, t, 2.2);
          seg(p, 'left', wy1, b - 0.2, h + 2, c + 0.1, h + 0.75 * rh, t, 2.2);
          win(p, 'left', c - 0.1, 0.06, wy1, h + 10, h + 24, { sill: false, bars: 'none' });
          win(p, 'left', c + 0.1, 0.06, wy1, h + 10, h + 24, { sill: false, bars: 'none' });
        },
      });
    };

    wing(L[0], L[1]);
    // Corps central entre les ailes.
    p.box(L[1], my0, R[0], my1, 0, h, boxColors(wall));
    band(p, L[1], my0, R[0], my1, 0, 7, '#bdb3a3');
    band(p, L[1], my0, R[0], my1, 41, 44, '#e9dcc3');
    for (const c of [1.55, 2.2]) win(p, 'left', c, 0.11, my1, 12, 32, { bars: 'grid', shutter: timber });
    for (const c of [1.55, 1.875, 2.2]) win(p, 'left', c, 0.1, my1, 52, 72, { bars: 'grid', flowers: true, seed: Math.round(c * 7) });
    entry(p, 'left', 1.875, 0.26, 32, my1, '#4e342e', { arch: true, z0: 0, frame: '#e9dcc3' });
    gableRoof(p, 'x', 0.87, my0, 2.89, my1, h, rh - 8, slate, wall, { style: 'slate', ov: 0.14 });
    const k = (rh - 8) / ((my1 - my0) / 2 + 0.14);
    for (const c of [1.55, 2.2]) dormer(p, 'left', c, 0.12, my1 + 0.14 - 0.3, h - 3 + k * 0.3, k, 13, slate, wall, { style: 'slate' });
    // Porche à colonnettes.
    for (const x of [1.68, 2.07]) p.box(x - 0.03, my1 + 0.2, x + 0.03, my1 + 0.26, 0, 40, boxColors('#ffffff', false));
    gableRoof(p, 'y', 1.64, my1, 2.11, my1 + 0.26, 40, 14, slate, '#ffffff', { style: 'slate', ov: 0.05 });
    wing(R[0], R[1]);

    // Jardin : piscine, massifs, haies, topiaires.
    pool(p, 0.3, 3.08, 1.48, 3.78);
    lounger(p, 0.4, 2.86, '#e57373');
    lounger(p, 0.86, 2.86, '#4fc3f7');
    parasol(p, 1.42, 2.92, 0, '#1e88e5', '#ffffff', 20);
    for (const [x, y] of [
      [2.4, 3.05],
      [3.05, 3.05],
      [2.4, 3.6],
      [3.05, 3.6],
    ] as const) {
      p.box(x - 0.2, y - 0.16, x + 0.2, y + 0.16, 0, 8, boxColors('#3f8f2f', false));
      flowerBush(p, x, y, 6, ['#e91e63', '#ffeb3b', '#ba68c8', '#ff7043'][Math.round(x + y * 2) % 4]!, 6);
    }
    topiary(p, 2.72, 3.32, 'cone', 0, '#eceff1');
    for (const y of [1.3, 2.2, 3.0]) cypress(p, 3.72, y, 56);
    roundBush(p, 1.48, 2.62, 8, '#5cbf32');
    roundBush(p, 2.28, 2.62, 8, '#5cbf32');
    lamp(p, 2.12, 3.86, 34);
    picket(p, [0.06, 3.94], [1.72, 3.94]);
    picket(p, [2.04, 3.94], [3.94, 3.94]);
    picket(p, [3.94, 0.06], [3.94, 3.94]);
  },
};

export const HEROES: Record<string, Hero> = {
  bungalow,
  townhouse,
  chalet,
  villa,
  mansion,
  manor,
};
