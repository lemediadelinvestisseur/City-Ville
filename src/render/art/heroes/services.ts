import { signText } from '@/i18n/content';
import { HALF_H, HALF_W } from '../../iso';
import { shade } from '../color';
import { boxColors, type BoxColors, type IsoPainter, type V3 } from '../IsoPainter';
import { cypress, picket, roundBush } from '../toon';
import type { Hero } from './types';

/**
 * Services publics redessinés à la main (style cartoon) : mairie, école, poste,
 * police, pompiers, bibliothèque, hôpital, gare, université, musée, palais des
 * congrès et aéroport. Repère et calques : voir `./types.ts`.
 */

type Side = 'left' | 'right';
type Draw = (ctx: CanvasRenderingContext2D) => void;

const C = boxColors;
/** Longueur à l'écran d'une case le long d'une façade. */
const FACE_PX = Math.hypot(HALF_W, HALF_H);
const FU_X = HALF_W / FACE_PX;
const FU_Y = HALF_H / FACE_PX;
/** Demi-axes à l'écran d'un cercle au sol de rayon 1 case. */
const RX = HALF_W * Math.SQRT2;
const RY = HALF_H * Math.SQRT2;

const GRASS = '#8fd14f';
const GLASS = '#9fdcf7';
const WHITE = '#ffffff';

// ——— Sol ———

function lot(g: IsoPainter, size: number, color: string): void {
  g.flat(0.02, 0.02, size - 0.02, size - 0.02, 0, color, shade(color, -0.18));
}

function patch(g: IsoPainter, x0: number, y0: number, x1: number, y1: number, color: string): void {
  g.flat(x0, y0, x1, y1, 0, color);
}

/** Pelouse à bandes de tonte. */
function lawn(g: IsoPainter, x0: number, y0: number, x1: number, y1: number, color = GRASS): void {
  g.flat(x0, y0, x1, y1, 0, color, shade(color, -0.12));
  for (let x = x0 + 0.25, i = 0; x < x1 - 0.05; x += 0.25, i++) {
    if (i % 2) continue;
    g.flat(x, y0 + 0.02, Math.min(x1 - 0.02, x + 0.25), y1 - 0.02, 0, shade(color, 0.07));
  }
}

/** Dallage avec joints. */
function paved(g: IsoPainter, x0: number, y0: number, x1: number, y1: number, color: string, step = 0.25): void {
  g.flat(x0, y0, x1, y1, 0, color);
  const joint = shade(color, -0.1);
  for (let x = x0 + step; x < x1 - 0.01; x += step) g.line([x, y0, 0], [x, y1, 0], joint, 1);
  for (let y = y0 + step; y < y1 - 0.01; y += step) g.line([x0, y, 0], [x1, y, 0], joint, 1);
}

/** Bitume de parking avec places tracées le long de x (`axis` = sens des lignes). */
function parking(
  g: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  axis: 'x' | 'y',
  step = 0.4,
  color = '#8d9096',
): void {
  g.flat(x0, y0, x1, y1, 0, color);
  if (axis === 'y') {
    for (let y = y0 + 0.08; y <= y1 - 0.05; y += step) g.line([x0 + 0.05, y, 0], [x1 - 0.15, y, 0], WHITE, 1.6);
  } else {
    for (let x = x0 + 0.08; x <= x1 - 0.05; x += step) g.line([x, y0 + 0.05, 0], [x, y1 - 0.15, 0], WHITE, 1.6);
  }
}

function shadow(g: IsoPainter, x0: number, y0: number, x1: number, y1: number, alpha = 0.26): void {
  g.shadow(x0, y0, x1, y1, alpha);
}

/** Massif de fleurs (points colorés au sol). */
function flowerBed(g: IsoPainter, x0: number, y0: number, x1: number, y1: number): void {
  g.flat(x0, y0, x1, y1, 0, '#7a5a3a');
  const colors = ['#ff5c8a', '#ffd23f', '#ffffff', '#c86bfa', '#ff8a3d'];
  let i = 0;
  for (let x = x0 + 0.06; x < x1 - 0.03; x += 0.11) {
    for (let y = y0 + 0.06; y < y1 - 0.03; y += 0.11) {
      g.dot(x, y, 1, 3.2, '#3f8f2a');
      g.dot(x, y, 2.5, 1.9, colors[i++ % colors.length] ?? WHITE);
    }
  }
}

// ——— Façades ———

function faceQuad(p: IsoPainter, side: Side) {
  return side === 'left' ? p.leftQuad.bind(p) : p.rightQuad.bind(p);
}

/** Dessine dans le plan d'une façade (repère local : x le long du mur en px, y vers le bas). */
function onFace(p: IsoPainter, side: Side, along: number, plane: number, z: number, draw: Draw): void {
  const [sx, sy] = side === 'left' ? p.p(along, plane, z) : p.p(plane, along, z);
  const { ctx } = p;
  ctx.save();
  ctx.setTransform(FU_X, side === 'left' ? FU_Y : -FU_Y, 0, 1, sx, sy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  ctx.restore();
}

interface WinOpts {
  glass?: string;
  frame?: string;
  /** Linteau cintré. */
  arch?: boolean;
  /** Petits bois en croix. */
  panes?: boolean;
  shutters?: string;
  sill?: string;
  /** Demi-largeur relative à l'emplacement (0..0.5). */
  w?: number;
  skip?: readonly number[];
}

function win(p: IsoPainter, side: Side, c: number, hw: number, plane: number, za: number, zb: number, o: WinOpts) {
  const glass = o.glass ?? GLASS;
  const frame = o.frame ?? WHITE;
  const quad = faceQuad(p, side);
  if (o.shutters) {
    const k = side === 'left' ? 0 : -0.15;
    quad(c - hw - 0.1, c - hw - 0.03, za, zb, plane, shade(o.shutters, k));
    quad(c + hw + 0.03, c + hw + 0.1, za, zb, plane, shade(o.shutters, k));
  }
  p.window(side, c - hw, c + hw, za, zb, plane, glass, frame);
  if (o.arch) {
    const r = hw * FACE_PX;
    onFace(p, side, c, plane, zb, (ctx) => {
      ctx.fillStyle = frame;
      ctx.beginPath();
      ctx.ellipse(0, 1, r + 2.6, r * 0.8 + 2.6, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = shade(glass, 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 1, r, r * 0.8, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(0, -r * 0.8);
      ctx.stroke();
    });
  }
  if (o.panes) {
    const mz = (za + zb) / 2;
    if (side === 'left') {
      p.line([c, plane, za], [c, plane, zb], frame, 1.6);
      p.line([c - hw, plane, mz], [c + hw, plane, mz], frame, 1.6);
    } else {
      p.line([plane, c, za], [plane, c, zb], frame, 1.6);
      p.line([plane, c - hw, mz], [plane, c + hw, mz], frame, 1.6);
    }
  }
  if (o.sill)
    quad(c - hw - 0.04, c + hw + 0.04, za - 5, za - 2, plane, side === 'left' ? o.sill : shade(o.sill, -0.15));
}

/** Rangée de `n` fenêtres régulièrement espacées entre `from` et `to`. */
function wins(
  p: IsoPainter,
  side: Side,
  from: number,
  to: number,
  plane: number,
  za: number,
  zb: number,
  n: number,
  o: WinOpts = {},
): void {
  const slot = (to - from) / n;
  for (let i = 0; i < n; i++) {
    if (o.skip?.includes(i)) continue;
    win(p, side, from + slot * (i + 0.5), slot * (o.w ?? 0.26), plane, za, zb, o);
  }
}

/** Porte (simple ou double) avec imposte vitrée, posée à partir de z0. */
function door(
  p: IsoPainter,
  side: Side,
  c: number,
  w: number,
  z0: number,
  h: number,
  plane: number,
  color: string,
  o: { glass?: boolean; arch?: boolean; frame?: string } = {},
): void {
  const quad = faceQuad(p, side);
  const a = c - w / 2;
  const b = c + w / 2;
  const frame = o.frame ?? WHITE;
  const dark = side === 'left' ? color : shade(color, -0.15);
  quad(a - 0.035, b + 0.035, z0, z0 + h + 3, plane, frame);
  quad(a, b, z0, z0 + h, plane, dark, shade(color, -0.45));
  if (o.glass) {
    quad(a + 0.03, c - 0.015, z0 + 3, z0 + h - 3, plane, '#bfe8fb');
    quad(c + 0.015, b - 0.03, z0 + 3, z0 + h - 3, plane, '#a8dcf5');
  } else {
    quad(a + 0.03, c - 0.02, z0 + h * 0.55, z0 + h - 3, plane, shade(color, 0.12));
    quad(c + 0.02, b - 0.03, z0 + h * 0.55, z0 + h - 3, plane, shade(color, 0.12));
    quad(a + 0.03, c - 0.02, z0 + 3, z0 + h * 0.45, plane, shade(color, 0.12));
    quad(c + 0.02, b - 0.03, z0 + 3, z0 + h * 0.45, plane, shade(color, 0.12));
  }
  if (side === 'left') p.line([c, plane, z0], [c, plane, z0 + h], shade(color, -0.45), 1.2);
  else p.line([plane, c, z0], [plane, c, z0 + h], shade(color, -0.45), 1.2);
  if (o.arch) {
    const r = (w / 2) * FACE_PX;
    onFace(p, side, c, plane, z0 + h + 3, (ctx) => {
      ctx.fillStyle = frame;
      ctx.beginPath();
      ctx.ellipse(0, 0.5, r + 2.5, r * 0.7 + 2.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.ellipse(0, 0.5, r - 1, r * 0.7 - 1, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 1.3;
      for (const t of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(0, 0.5);
        ctx.lineTo(Math.sin(t) * r, -Math.cos(t) * r * 0.7);
        ctx.stroke();
      }
    });
  }
}

/** Horloge ronde sur une façade. */
function clock(p: IsoPainter, side: Side, c: number, plane: number, z: number, r = 8): void {
  onFace(p, side, c, plane, z, (ctx) => {
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d4037';
    for (let i = 0; i < 12; i += 3) {
      const a = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r * 0.7);
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.5, r * 0.15);
    ctx.stroke();
  });
}

/** Croix (médicale) sur fond rond. */
function crossBadge(p: IsoPainter, side: Side, c: number, plane: number, z: number, s: number, disc = WHITE): void {
  onFace(p, side, c, plane, z, (ctx) => {
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e53935';
    const a = s * 0.25;
    const b = s * 0.72;
    ctx.fillRect(-a, -b, a * 2, b * 2);
    ctx.fillRect(-b, -a, b * 2, a * 2);
  });
}

/** Chaînage d'angle (pierres alternées) sur un coin avant. */
function quoins(
  p: IsoPainter,
  x: number,
  y: number,
  z0: number,
  z1: number,
  color: string,
  side: Side | 'both' = 'both',
) {
  for (let z = z0, i = 0; z < z1 - 4; z += 8, i++) {
    const w = i % 2 ? 0.08 : 0.13;
    if (side !== 'right') p.leftQuad(x - w, x, z, z + 6, y, color);
    if (side !== 'left') p.rightQuad(y - w, y, z, z + 6, x, shade(color, -0.15));
  }
}

/** Assises de briques (lignes horizontales). */
function bricks(p: IsoPainter, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, wall: string) {
  for (let z = z0 + 4; z < z1 - 1; z += 4) {
    p.line([x0, y1, z], [x1, y1, z], shade(wall, -0.12), 0.8);
    p.line([x1, y1, z], [x1, y0, z], shade(wall, -0.32), 0.8);
  }
}

/** Corps de bâtiment : volume, soubassement, corniche. */
function body(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  wall: string,
  o: { base?: string; cornice?: string; bands?: readonly number[]; band?: string } = {},
): void {
  p.box(x0, y0, x1, y1, 0, h, C(wall));
  const base = o.base ?? shade(wall, -0.25);
  p.leftQuad(x0, x1, 0, 6, y1, base);
  p.rightQuad(y0, y1, 0, 6, x1, shade(base, -0.18));
  const band = o.band ?? shade(wall, 0.4);
  for (const z of o.bands ?? []) {
    p.leftQuad(x0, x1, z - 2, z + 2, y1, band);
    p.rightQuad(y0, y1, z - 2, z + 2, x1, shade(band, -0.15));
  }
  if (o.cornice) p.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, h - 5, h, C(o.cornice));
}

// ——— Toits ———

function roofStripes(p: IsoPainter, face: readonly V3[], bottom: [V3, V3], top: [V3, V3], color: string, rows = 6) {
  const { ctx } = p;
  ctx.save();
  p.path(face);
  ctx.clip();
  for (let i = 1; i < rows; i++) {
    const t = i / rows;
    const l = (a: V3, b: V3): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    p.line(l(bottom[0], top[0]), l(bottom[1], top[1]), color, 1.1);
  }
  ctx.restore();
}

/** Toit en croupe (quatre pans), faîtage selon le grand côté. */
function hipRoof(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  ov = 0.12,
): void {
  const X0 = x0 - ov;
  const Y0 = y0 - ov;
  const X1 = x1 + ov;
  const Y1 = y1 + ov;
  const w = X1 - X0;
  const d = Y1 - Y0;
  const A: V3 = [X0, Y0, z];
  const B: V3 = [X1, Y0, z];
  const Cc: V3 = [X1, Y1, z];
  const D: V3 = [X0, Y1, z];
  const line = shade(color, -0.25);
  if (w >= d) {
    const ym = (Y0 + Y1) / 2;
    const r0: V3 = [X0 + d / 2, ym, z + h];
    const r1: V3 = [X1 - d / 2, ym, z + h];
    p.fill([A, B, r1, r0], shade(color, 0.1));
    p.fill([D, A, r0], shade(color, 0.15));
    const front: V3[] = [D, Cc, r1, r0];
    p.fill(front, p.gradient(r0, D, shade(color, 0.12), shade(color, -0.04)));
    roofStripes(p, front, [D, Cc], [r0, r1], line);
    const right: V3[] = [Cc, B, r1];
    p.fill(right, shade(color, -0.22));
    roofStripes(p, right, [Cc, B], [r1, r1], shade(color, -0.4));
    p.line(r0, r1, shade(color, 0.35), 2.5);
    p.line(Cc, r1, shade(color, 0.3), 2);
  } else {
    const xm = (X0 + X1) / 2;
    const r0: V3 = [xm, Y0 + w / 2, z + h];
    const r1: V3 = [xm, Y1 - w / 2, z + h];
    p.fill([A, B, r0], shade(color, 0.1));
    p.fill([D, A, r0, r1], shade(color, 0.15));
    const front: V3[] = [D, Cc, r1];
    p.fill(front, p.gradient(r1, D, shade(color, 0.12), shade(color, -0.04)));
    roofStripes(p, front, [D, Cc], [r1, r1], line);
    const right: V3[] = [Cc, B, r0, r1];
    p.fill(right, p.gradient(r1, Cc, shade(color, -0.16), shade(color, -0.28)));
    roofStripes(p, right, [Cc, B], [r1, r0], shade(color, -0.42));
    p.line(r0, r1, shade(color, 0.35), 2.5);
    p.line(Cc, r1, shade(color, 0.3), 2);
  }
  p.line(D, Cc, shade(color, 0.45), 3);
  p.line(Cc, B, shade(color, 0.2), 3);
}

/** Toit plat avec acrotère (on voit l'intérieur du parapet). */
function flatRoof(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  rim: string,
  floor: string,
  ph = 7,
): void {
  p.box(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, z, z + ph, C(rim));
  const i = 0.07;
  p.flat(x0 + i, y0 + i, x1 - i, y1 - i, z + 2, floor);
  p.leftQuad(x0 + i, x1 - i, z + 2, z + ph, y0 + i, shade(rim, -0.12));
  p.rightQuad(y0 + i, y1 - i, z + 2, z + ph, x0 + i, shade(rim, -0.28));
}

/** Toit cintré (voûte) dont la courbe se lit sur le pignon droit (axe x) ou gauche (axe y). */
function barrelRoof(
  p: IsoPainter,
  axis: 'x' | 'y',
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  end: string,
  ov = 0.12,
): void {
  const n = 14;
  const a0 = axis === 'x' ? y0 - ov : x0 - ov;
  const a1 = axis === 'x' ? y1 + ov : x1 + ov;
  const zAt = (t: number) => z - 3 + h * Math.sin(Math.PI * t);
  const pt = (t: number, along: number): V3 => {
    const a = a0 + (a1 - a0) * t;
    return axis === 'x' ? [along, a, zAt(t)] : [a, along, zAt(t)];
  };
  const s0 = axis === 'x' ? x0 - ov : y0 - ov;
  const s1 = axis === 'x' ? x1 + ov : y1 + ov;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const u = (i + 1) / n;
    // Pente vers le spectateur (seconde moitié) éclairée, l'autre plus sombre.
    const k = axis === 'x' ? 0.18 - t * 0.3 : -0.05 - t * 0.2;
    p.fill([pt(t, s0), pt(t, s1), pt(u, s1), pt(u, s0)], shade(color, k));
    if (i % 2 === 1) p.line(pt(u, s0), pt(u, s1), shade(color, -0.12), 0.8);
  }
  const prof: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    prof.push(axis === 'x' ? [x1 + ov, a, zAt(t)] : [a, y1 + ov, zAt(t)]);
  }
  p.fill(prof, axis === 'x' ? shade(end, -0.18) : end);
  // Rive claire le long de la courbe.
  for (let i = 0; i < n; i++) {
    const s = prof[i];
    const e = prof[i + 1];
    if (s && e) p.line(s, e, WHITE, 3);
  }
  const eave: [V3, V3] = axis === 'x' ? [pt(1, s0), pt(1, s1)] : [pt(1, s0), pt(1, s1)];
  p.line(eave[0], eave[1], shade(color, 0.4), 3);
}

// ——— Volumes ronds ———

function cylinder(
  p: IsoPainter,
  cx: number,
  cy: number,
  z0: number,
  z1: number,
  r: number,
  color: string,
  top?: string,
) {
  const [sx, sy0] = p.p(cx, cy, z0);
  const [, sy1] = p.p(cx, cy, z1);
  const rx = r * RX;
  const ry = r * RY;
  const { ctx } = p;
  const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, shade(color, 0.08));
  g.addColorStop(0.3, shade(color, 0.28));
  g.addColorStop(1, shade(color, -0.32));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(sx - rx, sy1);
  ctx.lineTo(sx - rx, sy0);
  ctx.ellipse(sx, sy0, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(sx + rx, sy1);
  ctx.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI, true);
  ctx.fill();
  ctx.fillStyle = top ?? shade(color, 0.18);
  ctx.beginPath();
  ctx.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Bandes horizontales sur le devant d'un cylindre (fenêtres, anneaux). */
function cylBand(p: IsoPainter, cx: number, cy: number, za: number, zb: number, r: number, color: string) {
  const [sx, sa] = p.p(cx, cy, za);
  const [, sb] = p.p(cx, cy, zb);
  const rx = r * RX;
  const ry = r * RY;
  const { ctx } = p;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(sx, sa, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(sx + rx, sb);
  ctx.ellipse(sx, sb, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
}

/** Dôme hémisphérique avec côtes et reflet. */
function dome(p: IsoPainter, cx: number, cy: number, z: number, r: number, h: number, color: string, ribs = true) {
  const [sx, sy] = p.p(cx, cy, z);
  const rx = r * RX;
  const ry = r * RY;
  const { ctx } = p;
  const g = ctx.createRadialGradient(sx - rx * 0.4, sy - h * 0.65, 1, sx, sy - h * 0.3, Math.max(rx, h) * 1.25);
  g.addColorStop(0, shade(color, 0.6));
  g.addColorStop(0.4, color);
  g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, h, 0, Math.PI, 0);
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI);
  ctx.fill();
  if (!ribs) return;
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 1.2;
  for (const k of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const bx = sx + k * rx;
    const by = sy + ry * Math.sqrt(1 - k * k);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(sx + k * rx * 1.02, sy - h * 0.75, sx, sy - h);
    ctx.stroke();
  }
}

function column(p: IsoPainter, x: number, y: number, z0: number, z1: number, r = 0.05, color = '#fbfaf6') {
  const k = r * 1.45;
  p.box(x - k, y - k, x + k, y + k, z0, z0 + 3, C(shade(color, -0.06)));
  cylinder(p, x, y, z0 + 3, z1 - 4, r, color);
  p.box(x - k, y - k, x + k, y + k, z1 - 4, z1, C(color));
}

// ——— Ensembles classiques ———

/** Marches descendant vers +y. */
function steps(
  p: IsoPainter,
  x0: number,
  x1: number,
  y: number,
  n: number,
  depth: number,
  rise: number,
  color: string,
) {
  for (let i = 0; i < n; i++) {
    p.box(x0, y + i * depth, x1, y + (i + 1) * depth, 0, (n - i) * rise, C(shade(color, (i % 2) * 0.04)));
  }
}

/** Portique à colonnes et fronton sur la façade gauche (y = wall), avançant vers +y. */
function portico(
  p: IsoPainter,
  x0: number,
  x1: number,
  wall: number,
  depth: number,
  z0: number,
  zTop: number,
  cols: number,
  o: { stone: string; roof: string; ped: number; sign?: string; entH?: number },
): void {
  const y1 = wall + depth;
  p.box(x0, wall, x1, y1, 0, z0, C(shade(o.stone, -0.08)));
  for (let i = 0; i < cols; i++) {
    const x = x0 + 0.1 + ((x1 - x0 - 0.2) * i) / (cols - 1);
    column(p, x, y1 - 0.08, z0, zTop, 0.052, '#fdfcf8');
  }
  const eh = o.entH ?? 9;
  p.box(x0 - 0.04, wall, x1 + 0.04, y1 + 0.03, zTop, zTop + eh, C(o.stone));
  p.leftQuad(x0 - 0.04, x1 + 0.04, zTop + eh - 2, zTop + eh, y1 + 0.03, shade(o.stone, 0.3));
  if (o.sign) {
    const t = signText(o.sign);
    p.faceText(
      'left',
      t,
      (x0 + x1) / 2,
      y1 + 0.035,
      zTop + eh / 2,
      `800 ${Math.min(11, eh - 1)}px system-ui, sans-serif`,
      '#6d4c41',
      (x1 - x0) * FACE_PX * 0.9,
    );
  }
  p.gableRoofY(x0 - 0.04, wall - 0.1, x1 + 0.04, y1 + 0.03, zTop + eh, o.ped, o.roof, o.stone, 0.06);
  // Tympan : moulure intérieure et médaillon doré.
  const xm = (x0 + x1) / 2;
  const zb = zTop + eh + 3;
  p.fill(
    [
      [x0 + 0.08, y1 + 0.035, zb],
      [x1 - 0.08, y1 + 0.035, zb],
      [xm, y1 + 0.035, zTop + eh + o.ped - 6],
    ],
    shade(o.stone, -0.1),
  );
  onFace(p, 'left', xm, y1 + 0.04, zb + o.ped * 0.28, (ctx) => {
    ctx.fillStyle = '#e8b830';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.ellipse(-1.5, -1.2, 2.2, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ——— Mobilier urbain et végétation ———

function tree(p: IsoPainter, x: number, y: number, s = 1, color = '#5cb83a'): void {
  p.line([x, y, 0], [x, y, 18 * s], '#7a5232', 4.5 * s);
  const lobes: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.09, -0.07, 28, 12],
    [-0.09, 0.07, 28, 12],
    [0.06, 0.06, 26, 11],
    [0, 0, 40, 14],
  ];
  for (const [dx, dy, z, r] of lobes) p.dot(x + dx * s, y + dy * s, z * s, r * s, shade(color, -0.12));
  for (const [dx, dy, z, r] of lobes) p.dot(x + dx * s - 0.02, y + dy * s - 0.02, (z + 3) * s, r * 0.7 * s, color);
  p.dot(x - 0.05 * s, y - 0.05 * s, 46 * s, 6 * s, shade(color, 0.35));
}

function lamp(p: IsoPainter, x: number, y: number, h = 36): void {
  p.line([x, y, 0], [x, y, 3], '#263238', 5);
  p.line([x, y, 0], [x, y, h], '#37474f', 2.6);
  p.dot(x, y, h + 4, 4.6, '#fff3b0');
  p.dot(x - 0.012, y - 0.012, h + 5.5, 1.8, WHITE);
  p.line([x, y, h + 8.5], [x, y, h + 10], '#37474f', 4);
}

function bench(p: IsoPainter, x: number, y: number, axis: 'x' | 'y' = 'x'): void {
  const [a, b] = axis === 'x' ? [0.18, 0.06] : [0.06, 0.18];
  p.box(x - a, y - b, x + a, y + b, 4, 7, C('#b5763f'));
  if (axis === 'x') p.box(x - a, y - b, x + a, y - b + 0.03, 7, 14, C('#a8693a'));
  else p.box(x - a, y - b, x - a + 0.03, y + b, 7, 14, C('#a8693a'));
  p.line([x - a * 0.8, y + b * 0.8, 0], [x - a * 0.8, y + b * 0.8, 4], '#37474f', 2);
  p.line([x + a * 0.8, y + b * 0.8, 0], [x + a * 0.8, y + b * 0.8, 4], '#37474f', 2);
}

function flag(p: IsoPainter, x: number, y: number, z: number, h: number, cloth: string, stripe?: string): void {
  p.line([x, y, z], [x, y, z + h], '#cfd8dc', 2.4);
  p.dot(x, y, z + h + 1.5, 2.6, '#ffd54f');
  const [sx, sy] = p.p(x, y, z + h);
  const { ctx } = p;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(sx + 1, sy + 1);
    ctx.bezierCurveTo(sx + 9, sy - 4, sx + 15, sy + 5, sx + 24, sy);
    ctx.lineTo(sx + 24, sy + 13);
    ctx.bezierCurveTo(sx + 15, sy + 18, sx + 9, sy + 9, sx + 1, sy + 14);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = cloth;
  ctx.fill();
  if (stripe) {
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = stripe;
    ctx.fillRect(sx + 9, sy - 6, 8, 26);
    ctx.restore();
  }
}

function hydrant(p: IsoPainter, x: number, y: number): void {
  cylinder(p, x, y, 0, 10, 0.045, '#e53935');
  p.dot(x, y, 12, 4, '#c62828');
  p.box(x - 0.07, y - 0.015, x + 0.07, y + 0.015, 5, 8, C('#c62828', false));
}

function planter(p: IsoPainter, x: number, y: number, color = '#5cbf32'): void {
  cylinder(p, x, y, 0, 9, 0.11, '#c8b7a0');
  roundBush(p, x, y, 9, color);
}

function cone(p: IsoPainter, x: number, y: number): void {
  const [sx, sy] = p.p(x, y, 0);
  const { ctx } = p;
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(sx - 5, sy);
  ctx.lineTo(sx, sy - 14);
  ctx.lineTo(sx + 5, sy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillRect(sx - 3, sy - 8, 6, 2.5);
}

// ——— Véhicules ———

interface Vehicle {
  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, c: BoxColors): void;
  /** Quadrilatère sur le flanc visible (v = plan). */
  side(u0: number, u1: number, z0: number, z1: number, color: string, v?: number): void;
  /** Quadrilatère sur l'avant (u = plan). */
  front(v0: number, v1: number, z0: number, z1: number, color: string, u?: number): void;
  wheel(u: number, r?: number): void;
  at(u: number, v: number, z: number): V3;
  sideSide: Side;
  frontSide: Side;
}

/** Repère d'un véhicule : u le long (avant en u = len), v en travers ; flanc visible en v = wid. */
function vehicle(p: IsoPainter, x: number, y: number, axis: 'x' | 'y', len: number, wid: number): Vehicle {
  const map = (u: number, v: number): [number, number] => (axis === 'x' ? [x + u, y + v] : [x + v, y + u]);
  return {
    sideSide: axis === 'x' ? 'left' : 'right',
    frontSide: axis === 'x' ? 'right' : 'left',
    box(u0, v0, u1, v1, z0, z1, c) {
      const [ax, ay] = map(u0, v0);
      const [bx, by] = map(u1, v1);
      p.box(ax, ay, bx, by, z0, z1, c);
    },
    side(u0, u1, z0, z1, color, v = wid) {
      if (axis === 'x') p.leftQuad(x + u0, x + u1, z0, z1, y + v, color);
      else p.rightQuad(y + u0, y + u1, z0, z1, x + v, shade(color, -0.1));
    },
    front(v0, v1, z0, z1, color, u = len) {
      if (axis === 'x') p.rightQuad(y + v0, y + v1, z0, z1, x + u, shade(color, -0.1));
      else p.leftQuad(x + v0, x + v1, z0, z1, y + u, color);
    },
    wheel(u, r = 4.6) {
      const [wx, wy] = map(u, wid);
      p.dot(wx, wy, r - 0.5, r, '#263238');
      p.dot(wx, wy, r - 0.5, r * 0.4, '#b0bec5');
    },
    at(u, v, z) {
      const [ax, ay] = map(u, v);
      return [ax, ay, z];
    },
  };
}

function car(p: IsoPainter, x: number, y: number, axis: 'x' | 'y', color: string, police = false): void {
  const len = 0.56;
  const wid = 0.28;
  const v = vehicle(p, x, y, axis, len, wid);
  v.box(0, 0, len, wid, 3, 12, C(color));
  v.box(0.13, 0.03, 0.4, wid - 0.03, 12, 21, C(police ? '#ffffff' : shade(color, 0.1)));
  v.side(0.16, 0.26, 13.5, 19.5, '#9fdcf7', wid - 0.03);
  v.side(0.28, 0.37, 13.5, 19.5, '#9fdcf7', wid - 0.03);
  v.front(0.06, wid - 0.06, 13.5, 19.5, '#7cc8ee', 0.4);
  if (police) {
    v.side(0.04, len - 0.04, 5, 10, '#1e5aa8');
    v.box(0.22, 0.05, 0.27, wid / 2, 21, 25, C('#e53935'));
    v.box(0.22, wid / 2, 0.27, wid - 0.05, 21, 25, C('#1e88e5'));
  }
  const [hx, hy, hz] = v.at(len, 0.06, 8);
  const [kx, ky, kz] = v.at(len, wid - 0.06, 8);
  p.dot(hx, hy, hz, 1.8, '#fff8c4');
  p.dot(kx, ky, kz, 1.8, '#fff8c4');
  v.wheel(0.12);
  v.wheel(len - 0.12);
}

function van(p: IsoPainter, x: number, y: number, axis: 'x' | 'y', color: string, stripe: string, cross = false) {
  const len = 0.66;
  const wid = 0.3;
  const v = vehicle(p, x, y, axis, len, wid);
  v.box(0, 0, 0.48, wid, 3, 28, C(color));
  v.box(0.48, 0.01, len, wid - 0.01, 3, 18, C(color));
  v.box(0.48, 0.02, 0.56, wid - 0.02, 18, 25, C(shade(color, -0.05)));
  v.front(0.04, wid - 0.04, 18.5, 24, '#7cc8ee', 0.56);
  v.side(0.5, 0.6, 12, 17, '#9fdcf7', wid - 0.01);
  v.side(0.02, 0.48, 12, 16, stripe);
  if (cross) {
    crossBadge(
      p,
      v.sideSide,
      v.at(0.26, wid, 0)[axis === 'x' ? 0 : 1],
      v.at(0.26, wid, 0)[axis === 'x' ? 1 : 0],
      22,
      5,
    );
    v.box(0.4, 0.05, 0.46, wid / 2, 28, 32, C('#e53935'));
    v.box(0.4, wid / 2, 0.46, wid - 0.05, 28, 32, C('#1e88e5'));
  }
  const [hx, hy, hz] = v.at(len, 0.06, 9);
  p.dot(hx, hy, hz, 2, '#fff8c4');
  v.wheel(0.14);
  v.wheel(len - 0.13);
}

function bus(p: IsoPainter, x: number, y: number, axis: 'x' | 'y'): void {
  const len = 1.25;
  const wid = 0.36;
  const yellow = '#ffc61a';
  const v = vehicle(p, x, y, axis, len, wid);
  v.box(0, 0, len, wid, 4, 30, C(yellow));
  v.box(0.04, 0.03, len - 0.06, wid - 0.03, 30, 33, C(shade(yellow, 0.35)));
  v.side(0, len, 4, 9, '#3d3d3d');
  v.side(0, len, 15, 17, '#3d3d3d');
  for (let i = 0; i < 6; i++) {
    const u = 0.08 + i * 0.17;
    v.side(u, u + 0.13, 19, 27, '#a6dcf5');
  }
  v.front(0.04, wid - 0.04, 16, 28, '#7cc8ee');
  v.front(0, wid, 4, 8, '#3d3d3d');
  v.box(len, 0.05, len + 0.04, wid - 0.05, 9, 12, C('#e0e0e0'));
  const [hx, hy, hz] = v.at(len, 0.07, 12);
  const [kx, ky, kz] = v.at(len, wid - 0.07, 12);
  p.dot(hx, hy, hz, 2, '#fff8c4');
  p.dot(kx, ky, kz, 2, '#fff8c4');
  const [sx, sy, sz] = v.at(len - 0.15, wid + 0.02, 22);
  p.dot(sx, sy, sz, 3.4, '#e53935');
  v.wheel(0.22, 5.4);
  v.wheel(len - 0.25, 5.4);
}

function fireTruck(p: IsoPainter, x: number, y: number, axis: 'x' | 'y'): void {
  const len = 1.05;
  const wid = 0.38;
  const red = '#e5322d';
  const v = vehicle(p, x, y, axis, len, wid);
  v.box(0, 0.01, 0.76, wid - 0.01, 4, 24, C(red));
  for (const u of [0.05, 0.28, 0.51]) v.side(u, u + 0.2, 9, 21, '#d7dde2');
  v.side(0, 0.76, 6, 8, WHITE);
  v.box(0.76, 0, len, wid, 4, 30, C(red));
  v.front(0.04, wid - 0.04, 18, 27, '#7cc8ee');
  v.side(0.8, 0.98, 18, 27, '#9fdcf7');
  v.front(0, wid, 4, 9, '#cfd8dc');
  // Échelle sur le toit.
  const a = v.at(0.04, 0.1, 27);
  const b = v.at(0.95, 0.1, 33);
  const c = v.at(0.04, wid - 0.1, 27);
  const d = v.at(0.95, wid - 0.1, 33);
  p.box(...pair(v.at(0.1, 0.1, 0), v.at(0.2, wid - 0.1, 0)), 24, 27, C('#9e9e9e'));
  p.line(a, b, '#eceff1', 2.4);
  p.line(c, d, '#eceff1', 2.4);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const l = (m: V3, n: V3): V3 => [m[0] + (n[0] - m[0]) * t, m[1] + (n[1] - m[1]) * t, m[2] + (n[2] - m[2]) * t];
    p.line(l(a, b), l(c, d), '#eceff1', 1.6);
  }
  v.box(0.84, 0.06, 0.92, wid / 2, 30, 34, C('#ff5252'));
  v.box(0.84, wid / 2, 0.92, wid - 0.06, 30, 34, C('#2196f3'));
  const [hx, hy, hz] = v.at(len, 0.07, 13);
  const [kx, ky, kz] = v.at(len, wid - 0.07, 13);
  p.dot(hx, hy, hz, 2.2, '#fff8c4');
  p.dot(kx, ky, kz, 2.2, '#fff8c4');
  v.wheel(0.18, 5.6);
  v.wheel(0.5, 5.6);
  v.wheel(len - 0.15, 5.6);
}

function pair(a: V3, b: V3): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** Avion de ligne : nez en (x, y), fuselage le long de +y (axe y) ou de −x (axe x). */
function airliner(p: IsoPainter, x: number, y: number, axis: 'x' | 'y', len: number, z = 18, livery = '#1565c0') {
  const at = (u: number, v: number, zz: number): V3 => (axis === 'y' ? [x + v, y + u, zz] : [x - u, y + v, zz]);
  const s = len / 1.6;
  const wing = (sign: number) => {
    p.fill(
      [
        at(len * 0.36, 0, z),
        at(len * 0.58, sign * 0.88 * s, z + 4),
        at(len * 0.66, sign * 0.88 * s, z + 4),
        at(len * 0.6, 0, z),
      ],
      sign > 0 ? '#e9eef2' : '#c9d2d9',
    );
    const e = at(len * 0.44, sign * 0.4 * s, z - 6);
    const ee = at(len * 0.56, sign * 0.4 * s, z - 6);
    p.line(e, ee, '#90a4ae', 9 * s);
    p.line(e, ee, '#cfd8dc', 6 * s);
    p.dot(...e, 3 * s, '#455a64');
  };
  const stab = (sign: number) =>
    p.fill(
      [
        at(len * 0.86, 0, z + 4),
        at(len * 0.96, sign * 0.32 * s, z + 6),
        at(len, sign * 0.32 * s, z + 6),
        at(len * 0.98, 0, z + 4),
      ],
      sign > 0 ? '#e9eef2' : '#c9d2d9',
    );
  wing(-1);
  stab(-1);
  // Fuselage : gros trait arrondi, ventre plus sombre, bande de couleur.
  const n0 = at(0.06, 0, z);
  const n1 = at(len, 0, z + 2);
  p.line(at(0.06, 0, z - 3), at(len * 0.95, 0, z - 1), '#b0bec5', 18 * s);
  p.line(n0, n1, '#f7f9fa', 17 * s);
  p.line(at(0.1, 0, z + 1), at(len * 0.97, 0, z + 3), livery, 3 * s);
  for (let u = 0.2; u < len * 0.88; u += 0.07) p.dot(...at(u, 0.04, z + 6 * s), 1.4 * s, '#37474f');
  p.dot(...at(0.08, 0.02, z + 6 * s), 3 * s, '#37474f');
  // Dérive.
  p.fill(
    [at(len * 0.8, 0, z + 6), at(len * 0.98, 0, z + 6), at(len * 1.02, 0, z + 44 * s), at(len * 0.93, 0, z + 44 * s)],
    livery,
  );
  p.dot(...at(len * 0.93, 0, z + 26 * s), 4.5 * s, WHITE);
  p.dot(...at(len * 0.93, 0, z + 26 * s), 2.2 * s, '#ffc61a');
  stab(1);
  wing(1);
}

// ——— Objets de toit ———

/** Enveloppe géante cachetée, sur un mât (poste). */
function envelope(p: IsoPainter, x: number, y: number, z: number): void {
  p.line([x, y, z - 18], [x, y, z + 2], '#5d4037', 3);
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.save();
  ctx.translate(sx, sy - 16);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(-24, -16, 48, 32);
  ctx.strokeStyle = '#d7c9ad';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-24, 16);
  ctx.lineTo(-4, 0);
  ctx.moveTo(24, 16);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.fillStyle = '#f1e6cf';
  ctx.beginPath();
  ctx.moveTo(-24, -16);
  ctx.lineTo(0, 4);
  ctx.lineTo(24, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.bezierCurveTo(-9, 2, -5, -6, 0, -1);
  ctx.bezierCurveTo(5, -6, 9, 2, 0, 9);
  ctx.fill();
  ctx.fillStyle = '#42a5f5';
  ctx.fillRect(13, -13, 8, 9);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1;
  ctx.strokeRect(14.5, -11.5, 5, 6);
  ctx.restore();
}

/** Gyrophare : socle, dôme rouge et bleu, éclats. */
function beacon(p: IsoPainter, x: number, y: number, z: number): void {
  p.box(x - 0.14, y - 0.14, x + 0.14, y + 0.14, z, z + 6, C('#37474f'));
  const [sx, sy] = p.p(x, y, z + 6);
  const { ctx } = p;
  const r = 0.12 * RX;
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.ellipse(sx, sy, r, 18, 0, Math.PI, Math.PI * 1.5);
  ctx.lineTo(sx, sy + r * 0.5);
  ctx.ellipse(sx, sy, r, r * 0.5, 0, Math.PI / 2, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#1e88e5';
  ctx.beginPath();
  ctx.ellipse(sx, sy, r, 18, 0, Math.PI * 1.5, 0);
  ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI / 2);
  ctx.lineTo(sx, sy - 18);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(sx - r * 0.45, sy - 9, 2.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffeb3b';
  for (const [dx, dy] of [
    [-r - 6, -12],
    [r + 6, -12],
    [0, -26],
  ] as const) {
    ctx.beginPath();
    ctx.arc(sx + dx, sy + dy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Climatiseur de toit. */
function acUnit(p: IsoPainter, x: number, y: number, z: number): void {
  p.box(x, y, x + 0.36, y + 0.28, z, z + 11, C('#cfd8dc'));
  p.groundEllipse(x + 0.18, y + 0.14, z + 11, 0.09, '#78909c');
}

// ——— Bâtiments ———

function townHall(g: IsoPainter, p: IsoPainter): void {
  lot(g, 4, '#e6e0d3');
  lawn(g, 0.08, 2.95, 1.3, 3.92);
  lawn(g, 2.7, 2.95, 3.92, 3.92);
  lawn(g, 3.62, 0.08, 3.92, 2.95);
  lawn(g, 0.08, 0.08, 0.38, 2.95);
  paved(g, 1.3, 3.0, 2.7, 3.95, '#d9d0bf');
  flowerBed(g, 0.3, 3.15, 1.1, 3.4);
  flowerBed(g, 2.9, 3.15, 3.7, 3.4);
  shadow(g, 0.4, 0.5, 3.6, 2.8);

  const wall = '#f4f0e6';
  const roof = '#6f8a99';
  tree(p, 0.25, 0.7, 1.05);
  cypress(p, 3.75, 0.35, 52);
  body(p, 0.55, 0.5, 3.45, 2.55, 80, wall, { bands: [42], cornice: '#e3dbc9' });
  quoins(p, 3.45, 2.55, 6, 76, '#e3dbc9', 'right');
  wins(p, 'left', 0.55, 3.45, 2.55, 14, 32, 6, { arch: true, frame: WHITE, glass: '#a9d8f2' });
  wins(p, 'left', 0.55, 3.45, 2.55, 50, 66, 6, { panes: true, sill: '#e3dbc9' });
  wins(p, 'right', 0.5, 2.55, 3.45, 14, 32, 4, { arch: true, glass: '#a9d8f2' });
  wins(p, 'right', 0.5, 2.55, 3.45, 50, 66, 4, { panes: true, sill: '#e3dbc9' });
  hipRoof(p, 0.55, 0.5, 3.45, 2.55, 80, 26, roof);

  // Dôme doré sur tambour.
  const cx = 2.0;
  const cy = 1.5;
  cylinder(p, cx, cy, 92, 124, 0.44, wall);
  for (const k of [-0.62, -0.2, 0.22, 0.62]) {
    const [sx, sy] = p.p(cx, cy, 104);
    const rx = 0.44 * RX;
    const bx = sx + k * rx;
    const by = sy + 0.44 * RY * Math.sqrt(1 - k * k);
    p.ctx.fillStyle = '#7fb8da';
    p.ctx.beginPath();
    p.ctx.roundRect(bx - 3.5, by - 14, 7, 15, [3.5, 3.5, 0, 0]);
    p.ctx.fill();
  }
  cylinder(p, cx, cy, 122, 128, 0.49, '#e3dbc9');
  dome(p, cx, cy, 128, 0.44, 46, '#f2c230');
  cylinder(p, cx, cy, 170, 184, 0.1, wall);
  dome(p, cx, cy, 184, 0.12, 10, '#f2c230', false);
  flag(p, cx, cy, 193, 30, '#1e63c6', WHITE);

  // Pavillons d'angle.
  for (const [a, b] of [
    [0.4, 1.15],
    [2.85, 3.6],
  ] as const) {
    body(p, a, 1.95, b, 2.8, 88, wall, { bands: [42], cornice: '#e3dbc9' });
    quoins(p, b, 2.8, 6, 84, '#e3dbc9');
    win(p, 'left', (a + b) / 2, 0.16, 2.8, 14, 34, { arch: true, glass: '#a9d8f2' });
    win(p, 'left', (a + b) / 2, 0.14, 2.8, 52, 70, { panes: true, sill: '#e3dbc9', shutters: '#5b7c8c' });
    win(p, 'right', 2.38, 0.14, b, 14, 34, { arch: true, glass: '#a9d8f2' });
    win(p, 'right', 2.38, 0.12, b, 52, 70, { panes: true, sill: '#e3dbc9' });
    hipRoof(p, a, 1.95, b, 2.8, 88, 24, roof, 0.08);
    p.dot((a + b) / 2, 2.375, 112, 2.5, '#f2c230');
  }

  // Entrée : portique, fronton et perron.
  door(p, 'left', 2.0, 0.34, 12, 34, 2.55, '#7a4a2e', { arch: true });
  portico(p, 1.45, 2.55, 2.55, 0.5, 12, 68, 4, { stone: '#f1ecdf', roof, ped: 24 });
  steps(p, 1.5, 2.5, 3.05, 4, 0.1, 3, '#ddd5c4');
  roundBush(p, 1.27, 2.98, 9);
  roundBush(p, 2.73, 2.98, 9);
  lamp(p, 1.35, 3.35, 38);
  lamp(p, 2.65, 3.35, 38);
  tree(p, 0.35, 3.62, 0.85);
  tree(p, 3.62, 3.62, 0.85);
  roundBush(p, 1.15, 3.75, 7, '#4caf2a');
  roundBush(p, 2.85, 3.75, 7, '#4caf2a');
}

function school(g: IsoPainter, p: IsoPainter): void {
  lot(g, 4, '#d8d2c6');
  lawn(g, 0.08, 0.08, 3.92, 0.32);
  patch(g, 0.12, 1.7, 2.32, 3.88, '#c9c0b1');
  // Marelle et terrain de jeu.
  for (let i = 0; i < 5; i++) {
    const y = 2.1 + i * 0.16;
    g.flat(1.0, y, 1.16, y + 0.14, 0, 'rgba(255,255,255,0)', WHITE);
  }
  g.groundEllipse(1.9, 3.3, 0, 0.3, 'rgba(0,0,0,0)', WHITE);
  lawn(g, 0.15, 3.35, 0.95, 3.85);
  parking(g, 2.4, 2.7, 3.92, 3.92, 'x', 0.5);
  patch(g, 1.2, 1.55, 1.55, 1.7, '#c9c0b1');
  shadow(g, 0.35, 0.35, 3.65, 2.5);

  const brick = '#c8603e';
  const trim = '#f6efe3';
  const roof = '#4f5f69';
  cypress(p, 3.82, 0.3, 46);
  // Bâtiment principal.
  body(p, 0.35, 0.35, 2.45, 1.55, 64, brick, { bands: [33], band: trim, base: '#8e3f27' });
  bricks(p, 0.35, 2.45, 0.35, 1.55, 6, 62, brick);
  quoins(p, 0.35, 1.55, 6, 60, trim, 'left');
  wins(p, 'left', 0.35, 2.45, 1.55, 40, 57, 4, { panes: true, sill: trim });
  wins(p, 'left', 0.35, 2.45, 1.55, 9, 26, 4, { panes: true, sill: trim, skip: [1, 2] });
  door(p, 'left', 1.4, 0.36, 0, 22, 1.55, '#1e4f8c', { glass: true });
  p.sign('left', 1.08, 1.72, 26, 35, 1.56, WHITE, '#b71c1c', signText('ÉCOLE'));
  // Auvent d'entrée.
  p.box(1.15, 1.55, 1.65, 1.78, 22, 25, C(trim));
  p.line([1.18, 1.75, 0], [1.18, 1.75, 22], WHITE, 2.4);
  p.line([1.62, 1.75, 0], [1.62, 1.75, 22], WHITE, 2.4);
  p.gableRoofX(0.35, 0.35, 2.45, 1.55, 64, 32, roof, shade(brick, -0.2));
  // Clocheton avec sa cloche.
  const bx = 1.2;
  const by = 0.82;
  p.box(bx, by, bx + 0.32, by + 0.32, 84, 100, C(trim));
  for (const [a, b] of [
    [bx + 0.03, by + 0.29],
    [bx + 0.29, by + 0.29],
    [bx + 0.03, by + 0.03],
    [bx + 0.29, by + 0.03],
  ] as const)
    p.line([a, b, 100], [a, b, 116], WHITE, 3);
  p.dot(bx + 0.16, by + 0.16, 108, 5, '#f2c230');
  p.dot(bx + 0.14, by + 0.14, 110, 2, '#fff2b0');
  p.pyramidRoof(bx, by, bx + 0.32, by + 0.32, 116, 22, '#c0392b', 0.07);
  p.line([bx + 0.16, by + 0.16, 138], [bx + 0.16, by + 0.16, 146], '#37474f', 2);
  // Aile à pignon.
  body(p, 2.45, 0.35, 3.65, 2.5, 64, brick, { bands: [33], band: trim, base: '#8e3f27' });
  bricks(p, 2.45, 3.65, 0.35, 2.5, 6, 62, brick);
  quoins(p, 3.65, 2.5, 6, 60, trim);
  quoins(p, 2.45, 2.5, 6, 60, trim, 'left');
  wins(p, 'left', 2.45, 3.65, 2.5, 9, 26, 2, { panes: true, sill: trim, w: 0.3 });
  wins(p, 'left', 2.45, 3.65, 2.5, 40, 57, 2, { panes: true, sill: trim, w: 0.3 });
  wins(p, 'right', 0.35, 2.5, 3.65, 9, 26, 4, { panes: true, sill: trim });
  wins(p, 'right', 0.35, 2.5, 3.65, 40, 57, 4, { panes: true, sill: trim });
  p.gableRoofY(2.45, 0.35, 3.65, 2.5, 64, 32, roof, brick);
  clock(p, 'left', 3.05, 2.51, 80, 8);

  // Cour : balançoire, toboggan, arbre, drapeau.
  const sw = (x: number, y: number) => {
    p.line([x, y - 0.12, 0], [x, y, 34], '#e53935', 2.6);
    p.line([x, y + 0.12, 0], [x, y, 34], '#e53935', 2.6);
  };
  sw(0.45, 2.3);
  for (const x of [0.62, 0.8]) {
    p.line([x, 2.3, 34], [x, 2.3, 10], '#78909c', 1.2);
    p.box(x - 0.05, 2.27, x + 0.05, 2.33, 8, 10, C('#1e88e5'));
  }
  sw(0.98, 2.3);
  p.line([0.45, 2.3, 34], [0.98, 2.3, 34], '#c62828', 3);
  // Toboggan.
  p.box(0.4, 2.85, 0.6, 3.0, 0, 22, C('#ffc61a'));
  p.fill(
    [
      [0.6, 2.86, 22],
      [0.6, 2.99, 22],
      [1.0, 2.99, 2],
      [1.0, 2.86, 2],
    ],
    '#42a5f5',
  );
  tree(p, 0.55, 3.62, 0.95);
  bench(p, 1.75, 2.45);
  flag(p, 2.2, 1.95, 0, 70, '#1e63c6', WHITE);
  bus(p, 2.55, 3.05, 'x');
  picket(p, [0.08, 1.7], [0.08, 3.92]);
  picket(p, [0.08, 3.92], [2.32, 3.92]);
  roundBush(p, 0.4, 1.68, 8);
  roundBush(p, 2.2, 1.7, 8, '#5cbf32');
  roundBush(p, 2.6, 2.6, 7);
  roundBush(p, 3.5, 2.62, 8, '#5cbf32');
}

function postOffice(g: IsoPainter, p: IsoPainter): void {
  lot(g, 2, '#ded8cc');
  paved(g, 0.05, 1.3, 1.95, 1.95, '#e8e1d2', 0.2);
  lawn(g, 0.05, 0.05, 1.95, 0.22);
  parking(g, 1.58, 0.22, 1.95, 1.25, 'y', 0.5);
  shadow(g, 0.3, 0.25, 1.55, 1.3);

  const wall = '#fff6dc';
  const blue = '#1e3a8a';
  roundBush(p, 0.2, 0.25, 7);
  body(p, 0.3, 0.25, 1.55, 1.3, 58, wall, { base: blue, bands: [37], band: blue });
  for (const [x, y] of [
    [0.3, 1.3],
    [1.55, 1.3],
  ] as const)
    p.leftQuad(x - (x > 1 ? 0.07 : 0), x + (x > 1 ? 0 : 0.07), 6, 58, y, blue);
  p.rightQuad(0.25, 0.32, 6, 58, 1.55, shade(blue, -0.2));
  p.rightQuad(1.23, 1.3, 6, 58, 1.55, shade(blue, -0.2));
  win(p, 'left', 0.52, 0.14, 1.3, 9, 30, { glass: '#e3f2fd', frame: WHITE, panes: true });
  win(p, 'left', 0.9, 0.14, 1.3, 9, 30, { glass: '#e3f2fd', frame: WHITE, panes: true });
  door(p, 'left', 1.3, 0.24, 6, 26, 1.3, blue, { glass: true });
  wins(p, 'right', 0.25, 1.3, 1.55, 9, 30, 2, { glass: '#e3f2fd', panes: true, shutters: '#ffd600', w: 0.22 });
  p.awning('left', 0.35, 1.1, 36, 1.3, ['#ffd600', '#1e3a8a'], 0.22, 10);
  p.sign('left', 0.42, 1.43, 40, 54, 1.31, '#ffd600', '#1a237e', signText('POSTE'));
  hipRoof(p, 0.3, 0.25, 1.55, 1.3, 58, 24, '#3f51b5', 0.08);
  // Lucarne à horloge.
  p.box(0.82, 0.95, 1.08, 1.22, 58, 72, C(wall));
  p.gableRoofY(0.82, 0.95, 1.08, 1.22, 72, 14, '#3f51b5', wall, 0.05);
  clock(p, 'left', 0.95, 1.225, 66, 6);
  envelope(p, 0.85, 0.68, 106);

  // Camionnette postale et boîte aux lettres.
  van(p, 1.63, 0.32, 'y', '#ffd600', blue);
  p.line([0.18, 1.6, 0], [0.18, 1.6, 14], '#37474f', 3);
  p.box(0.1, 1.53, 0.26, 1.67, 14, 30, C('#ffd600'));
  p.dot(0.18, 1.6, 31, 5.4, '#ffe14d');
  p.leftQuad(0.13, 0.23, 23, 25.5, 1.67, blue);
  lamp(p, 1.75, 1.45, 34);
  bench(p, 0.85, 1.75);
  planter(p, 1.45, 1.75);
  roundBush(p, 1.85, 1.85, 7, '#5cbf32');
}

function police(g: IsoPainter, p: IsoPainter): void {
  lot(g, 3, '#d5d9de');
  parking(g, 2.35, 0.1, 2.95, 2.95, 'y', 0.75);
  paved(g, 0.05, 1.95, 2.35, 2.95, '#e2e5e9');
  lawn(g, 0.08, 2.3, 0.75, 2.92);
  lawn(g, 0.08, 0.08, 2.3, 0.25);
  shadow(g, 0.3, 0.3, 2.25, 2.2);

  const wall = '#eaf2fb';
  const blue = '#1e5aa8';
  body(p, 0.3, 0.3, 2.2, 1.85, 64, wall, { base: '#4f6f90', bands: [32] });
  p.leftQuad(0.3, 2.2, 54, 64, 1.85, blue);
  p.rightQuad(0.3, 1.85, 54, 64, 2.2, shade(blue, -0.2));
  wins(p, 'left', 0.3, 2.2, 1.85, 38, 51, 5, { glass: '#bbdefb', frame: '#0d47a1', w: 0.3 });
  wins(p, 'left', 0.3, 2.2, 1.85, 9, 24, 5, { glass: '#bbdefb', frame: '#0d47a1', w: 0.3, skip: [1, 2, 3] });
  wins(p, 'right', 0.3, 1.85, 2.2, 38, 51, 4, { glass: '#bbdefb', frame: '#0d47a1', w: 0.3 });
  wins(p, 'right', 0.3, 1.85, 2.2, 9, 24, 4, { glass: '#bbdefb', frame: '#0d47a1', w: 0.3 });
  flatRoof(p, 0.3, 0.3, 2.2, 1.85, 64, blue, '#a7b6c6');
  acUnit(p, 0.55, 0.5, 66);
  p.box(0.5, 1.2, 0.9, 1.6, 66, 82, C('#dbe7f3'));
  p.leftQuad(0.62, 0.78, 66, 78, 1.6, '#4f6f90');
  flatRoof(p, 0.5, 1.2, 0.9, 1.6, 82, blue, '#a7b6c6', 3);
  // Mât d'antenne.
  p.line([1.95, 0.5, 66], [1.95, 0.5, 124], '#90a4ae', 2.4);
  for (const z of [84, 100, 114]) p.line([1.88, 0.5, z], [2.02, 0.5, z], '#90a4ae', 1.6);
  p.dot(1.95, 0.5, 126, 2.8, '#ff1744');
  p.box(1.1, 0.9, 1.4, 1.2, 66, 76, C('#cfd8dc'));
  beacon(p, 1.25, 1.05, 76);

  // Hall d'entrée avancé.
  body(p, 0.75, 1.85, 1.75, 2.2, 50, wall, { base: '#4f6f90' });
  p.leftQuad(0.75, 1.75, 34, 47, 2.2, blue);
  p.faceText('left', signText('POLICE'), 1.25, 2.205, 40.5, '800 11px system-ui, sans-serif', WHITE, 64);
  p.box(0.72, 1.82, 1.78, 2.23, 50, 54, C(blue));
  onFace(p, 'right', 2.02, 1.75, 41, (ctx) => {
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 3 : 7;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  door(p, 'left', 1.25, 0.4, 0, 24, 2.2, '#0d47a1', { glass: true });
  p.awning('left', 0.92, 1.58, 31, 2.2, [blue, WHITE], 0.26, 9);
  steps(p, 1.0, 1.5, 2.2, 2, 0.08, 2, '#c7ccd2');
  // Tourelle d'angle vitrée.
  cylinder(p, 2.2, 1.85, 0, 72, 0.3, '#eaf2fb');
  for (const z of [10, 40]) cylBand(p, 2.2, 1.85, z, z + 15, 0.3, '#9fcaf0');
  cylBand(p, 2.2, 1.85, 0, 6, 0.3, '#4f6f90');
  cylBand(p, 2.2, 1.85, 60, 72, 0.3, blue);
  cylinder(p, 2.2, 1.85, 72, 76, 0.34, blue, '#3f7cc8');
  dome(p, 2.2, 1.85, 76, 0.26, 16, '#3f7cc8', false);
  p.dot(2.2, 1.85, 94, 2.6, '#ffd54f');

  car(p, 2.42, 0.4, 'y', '#ffffff', true);
  car(p, 2.42, 1.15, 'y', '#ffffff', true);
  car(p, 2.62, 2.25, 'x', '#455a64');
  flag(p, 0.45, 2.55, 0, 58, '#1e5aa8', WHITE);
  roundBush(p, 0.55, 2.05, 8);
  roundBush(p, 1.95, 2.05, 8, '#5cbf32');
  tree(p, 0.35, 2.8, 0.75);
  lamp(p, 2.2, 2.5, 34);
  cone(p, 2.3, 2.8);
  cone(p, 2.15, 2.9);
  bench(p, 1.25, 2.82);
}

function fireStation(g: IsoPainter, p: IsoPainter): void {
  lot(g, 3, '#d8d2c6');
  patch(g, 0.3, 1.9, 2.0, 2.98, '#bfb8ac');
  for (const x of [0.48, 1.12, 1.24, 1.88]) g.line([x, 1.98, 0], [x, 2.95, 0], '#ffd23f', 2);
  lawn(g, 2.05, 2.1, 2.95, 2.95);
  lawn(g, 0.05, 0.05, 2.95, 0.22);
  shadow(g, 0.3, 0.3, 2.45, 1.95);

  const red = '#d6453d';
  const trim = '#f5f5f5';
  body(p, 0.3, 0.3, 2.45, 1.95, 74, red, { base: '#8e2b25', bands: [], cornice: trim });
  bricks(p, 0.3, 2.45, 0.3, 1.95, 6, 68, red);
  quoins(p, 0.3, 1.95, 6, 68, trim, 'left');
  quoins(p, 2.45, 1.95, 6, 68, trim);
  // Grandes portes cintrées : l'une ouverte sur le camion, l'autre fermée.
  for (const [c, open] of [
    [0.8, true],
    [1.56, false],
  ] as const) {
    const a = c - 0.32;
    const b = c + 0.32;
    p.leftQuad(a - 0.05, b + 0.05, 0, 38, 1.95, trim);
    onFace(p, 'left', c, 1.95, 38, (ctx) => {
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.37 * FACE_PX, 11, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = open ? '#3a2a24' : '#ffe9a8';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.32 * FACE_PX, 8, 0, Math.PI, 0);
      ctx.fill();
    });
    p.leftQuad(a, b, 0, 38, 1.95, open ? '#3a2a24' : '#eef1f3');
    if (!open) {
      for (let z = 5; z < 38; z += 5) p.line([a, 1.952, z], [b, 1.952, z], '#b0bec5', 1.2);
      for (const x of [a + 0.08, a + 0.22, a + 0.36, a + 0.5]) p.leftQuad(x, x + 0.1, 24, 30, 1.953, '#9fdcf7');
    }
  }
  p.sign('left', 0.5, 1.86, 54, 66, 1.96, WHITE, '#c62828', signText('POMPIERS'));
  door(p, 'left', 2.18, 0.2, 0, 24, 1.95, '#5d4037');
  win(p, 'left', 2.18, 0.08, 1.95, 36, 58, { arch: true, frame: trim });
  wins(p, 'right', 0.3, 1.95, 2.45, 10, 26, 3, { arch: true, frame: trim, glass: '#ffe0b2' });
  wins(p, 'right', 0.3, 1.95, 2.45, 40, 60, 3, { arch: true, frame: trim, glass: '#ffe0b2' });
  flatRoof(p, 0.3, 0.3, 2.45, 1.95, 74, trim, '#6b6b6b');
  // Sirène sur le toit.
  p.line([0.7, 0.7, 76], [0.7, 0.7, 92], '#9e9e9e', 2.4);
  cylinder(p, 0.7, 0.7, 92, 100, 0.09, '#cfd8dc');
  acUnit(p, 1.4, 0.6, 76);

  // Tour d'exercice.
  const tx0 = 2.45;
  const ty0 = 0.2;
  body(p, tx0, ty0, 2.95, 0.75, 142, red, { base: '#8e2b25', bands: [48, 96], band: trim });
  bricks(p, tx0, 2.95, ty0, 0.75, 6, 140, red);
  for (const z of [16, 62, 110]) {
    win(p, 'left', 2.7, 0.1, 0.75, z, z + 22, { glass: '#3a2a24', frame: trim, arch: true });
    win(p, 'right', 0.48, 0.1, 2.95, z, z + 22, { glass: '#3a2a24', frame: trim, arch: true });
  }
  p.pyramidRoof(tx0, ty0, 2.95, 0.75, 142, 20, '#424242', 0.06);
  p.line([2.8, 0.76, 136], [2.82, 0.8, 70], '#f5f5dc', 2.5);

  fireTruck(p, 0.6, 1.88, 'y');
  hydrant(p, 2.2, 2.35);
  roundBush(p, 2.75, 2.2, 9);
  tree(p, 2.6, 2.75, 0.75);
  lamp(p, 2.05, 2.85, 34);
  cone(p, 1.3, 2.75);
  cone(p, 1.8, 2.75);
}

function library(g: IsoPainter, p: IsoPainter): void {
  lot(g, 3, '#e3ded3');
  lawn(g, 0.05, 2.25, 0.95, 2.95);
  lawn(g, 2.05, 2.25, 2.95, 2.95);
  lawn(g, 2.65, 0.05, 2.95, 2.25);
  paved(g, 0.95, 2.3, 2.05, 2.98, '#d9d0bf');
  shadow(g, 0.35, 0.3, 2.6, 1.9);

  const wall = '#efe6d2';
  const stone = '#e6dcc4';
  const roof = '#7a5242';
  tree(p, 0.2, 0.5, 0.95, '#4caf2a');
  body(p, 0.35, 0.3, 2.6, 1.9, 66, wall, { base: '#c9bb9c', bands: [12], band: stone, cornice: stone });
  quoins(p, 0.35, 1.9, 6, 62, stone, 'left');
  quoins(p, 2.6, 1.9, 6, 62, stone);
  wins(p, 'left', 0.35, 2.6, 1.9, 18, 48, 5, { arch: true, panes: true, glass: '#fff3c4', frame: WHITE, w: 0.22 });
  wins(p, 'right', 0.3, 1.9, 2.6, 18, 48, 3, { arch: true, panes: true, glass: '#fff3c4', frame: WHITE, w: 0.24 });
  hipRoof(p, 0.35, 0.3, 2.6, 1.9, 66, 22, roof, 0.1);
  // Lanterne à dôme vert-de-gris.
  cylinder(p, 1.45, 1.1, 82, 100, 0.2, wall);
  for (const k of [-0.5, 0, 0.5]) {
    const [sx, sy] = p.p(1.45, 1.1, 86);
    const bx = sx + k * 0.2 * RX;
    p.ctx.fillStyle = '#fff3c4';
    p.ctx.beginPath();
    p.ctx.roundRect(bx - 2.2, sy + 0.2 * RY * Math.sqrt(1 - k * k) - 11, 4.4, 10, [2.2, 2.2, 0, 0]);
    p.ctx.fill();
  }
  dome(p, 1.45, 1.1, 100, 0.22, 22, '#5fb59a');
  p.line([1.45, 1.1, 121], [1.45, 1.1, 130], '#c9a227', 2);
  p.dot(1.45, 1.1, 131, 2.6, '#f2c230');

  door(p, 'left', 1.475, 0.32, 16, 30, 1.9, '#5d4037', { arch: true });
  portico(p, 0.95, 2.0, 1.9, 0.42, 16, 60, 4, { stone, roof, ped: 20, sign: 'BIBLIOTHÈQUE', entH: 11 });
  steps(p, 1.0, 1.95, 2.32, 5, 0.09, 3.2, '#d9cfb9');
  // Lions sur socles.
  for (const x of [0.86, 2.09]) {
    p.box(x - 0.09, 2.45, x + 0.09, 2.65, 0, 14, C('#d9cfb9'));
    p.dot(x, 2.55, 20, 6.5, '#d8b46a');
    p.dot(x - 0.03, 2.6, 26, 5, '#c99a4a');
    p.dot(x - 0.04, 2.61, 27, 2.5, '#e8c98a');
  }
  lamp(p, 0.75, 2.9, 34);
  lamp(p, 2.2, 2.9, 34);
  roundBush(p, 0.55, 2.05, 9);
  roundBush(p, 2.4, 2.05, 9, '#5cbf32');
  tree(p, 0.35, 2.6, 0.8);
  tree(p, 2.75, 2.6, 0.8);
  bench(p, 2.8, 1.4, 'y');
}

function hospital(g: IsoPainter, p: IsoPainter): void {
  lot(g, 4, '#e3e5e6');
  lawn(g, 0.08, 2.4, 2.45, 3.92);
  patch(g, 1.2, 2.0, 1.7, 3.92, '#d0d4d6');
  patch(g, 2.55, 2.75, 3.92, 3.92, '#9a9ea3');
  g.line([2.6, 3.8, 0], [3.9, 3.8, 0], WHITE, 2);
  lawn(g, 0.08, 0.08, 3.92, 0.28);
  shadow(g, 0.35, 0.35, 3.7, 2.75);

  const wall = '#fafafa';
  const green = '#4caf50';
  const glass = '#b2ebf2';
  // Tour principale.
  body(p, 0.35, 0.35, 2.55, 2.0, 138, wall, { base: '#9fb0b8' });
  for (let f = 0; f < 4; f++) {
    const z = 14 + f * 30;
    p.leftQuad(0.35, 2.55, z - 4, z - 1, 2.0, green);
    p.rightQuad(0.35, 2.0, z - 4, z - 1, 2.55, shade(green, -0.2));
    wins(p, 'left', 0.35, 2.55, 2.0, z + 4, z + 20, 6, {
      glass,
      frame: '#e0f2f1',
      w: 0.34,
      skip: f === 0 ? [2, 3] : [],
    });
    wins(p, 'right', 0.35, 2.0, 2.55, z + 4, z + 20, 4, { glass, frame: '#e0f2f1', w: 0.34 });
  }
  crossBadge(p, 'left', 1.45, 2.0, 127, 13);
  crossBadge(p, 'right', 1.18, 2.55, 127, 13);
  flatRoof(p, 0.35, 0.35, 2.55, 2.0, 138, '#e0e0e0', '#b0bec5');
  // Héliport.
  p.groundEllipse(1.45, 1.17, 140.5, 0.6, '#546e7a');
  p.groundEllipse(1.45, 1.17, 140.5, 0.52, 'rgba(0,0,0,0)', '#ffd54f');
  for (const [x0, y0, x1, y1] of [
    [1.22, 0.94, 1.32, 1.4],
    [1.58, 0.94, 1.68, 1.4],
    [1.32, 1.12, 1.58, 1.22],
  ] as const)
    p.flat(x0, y0, x1, y1, 140.5, WHITE);
  // Bandeau vert et entrée principale.
  door(p, 'left', 1.45, 0.5, 0, 26, 2.0, '#00796b', { glass: true });
  p.box(1.05, 2.0, 1.85, 2.35, 28, 32, C(green));
  p.line([1.1, 2.31, 0], [1.1, 2.31, 28], '#cfd8dc', 2.4);
  p.line([1.8, 2.31, 0], [1.8, 2.31, 28], '#cfd8dc', 2.4);

  // Aile des urgences.
  body(p, 2.55, 0.35, 3.7, 2.75, 50, wall, { base: '#9fb0b8' });
  p.leftQuad(2.55, 3.7, 40, 44, 2.75, green);
  p.rightQuad(0.35, 2.75, 40, 44, 3.7, shade(green, -0.2));
  wins(p, 'right', 0.35, 2.75, 3.7, 12, 32, 4, { glass, frame: '#e0f2f1', w: 0.34 });
  flatRoof(p, 2.55, 0.35, 3.7, 2.75, 50, '#e0e0e0', '#b0bec5', 6);
  acUnit(p, 2.85, 0.6, 52);
  acUnit(p, 3.15, 1.4, 52);
  door(p, 'left', 3.12, 0.56, 0, 24, 2.75, '#00796b', { glass: true });
  p.box(2.68, 2.75, 3.57, 3.18, 28, 36, C('#e53935'));
  crossBadge(p, 'left', 3.12, 3.185, 32, 4.5);
  p.line([2.72, 3.14, 0], [2.72, 3.14, 28], '#cfd8dc', 2.4);
  p.line([3.53, 3.14, 0], [3.53, 3.14, 28], '#cfd8dc', 2.4);
  van(p, 3.25, 3.1, 'y', WHITE, '#e53935', true);

  tree(p, 0.45, 2.75, 0.95);
  tree(p, 0.55, 3.6, 0.85, '#4caf2a');
  tree(p, 2.15, 3.55, 0.9);
  bench(p, 0.95, 3.15, 'y');
  bench(p, 1.95, 3.0, 'y');
  lamp(p, 1.1, 3.75, 34);
  lamp(p, 1.8, 3.75, 34);
  roundBush(p, 0.6, 2.2, 8);
  roundBush(p, 2.25, 2.2, 8, '#5cbf32');
  roundBush(p, 2.45, 2.95, 7);
}

function trainStation(g: IsoPainter, p: IsoPainter): void {
  // La voie longe un côté x (ouest ou est) : un quai de chaque côté, parallèle à l'axe y.
  lot(g, 3, '#d7ccc8');
  for (const [a, b, edge] of [
    [0.02, 0.45, 0.07],
    [2.4, 2.98, 2.93],
  ] as const) {
    paved(g, a, 0.02, b, 2.98, '#c4bab2', 0.3);
    g.line([edge, 0.04, 0], [edge, 2.96, 0], '#ffd23f', 3);
  }
  paved(g, 0.45, 2.55, 2.4, 2.98, '#e3d9cf', 0.22);
  shadow(g, 0.55, 0.25, 2.25, 2.55);

  const wall = '#e2b47a';
  const trim = '#fff6e6';
  const roof = '#7a4432';
  bench(p, 0.25, 0.9, 'y');
  lamp(p, 0.25, 1.7, 36);
  body(p, 0.6, 0.25, 2.2, 2.5, 66, wall, { base: '#8d6e63', bands: [40], band: trim, cornice: trim });
  quoins(p, 0.6, 2.5, 6, 62, trim, 'left');
  quoins(p, 2.2, 2.5, 6, 62, trim);
  // Pignon : portail cintré, deux fenêtres, enseigne.
  door(p, 'left', 1.4, 0.42, 0, 26, 2.5, '#3e2723', { glass: true, arch: true });
  wins(p, 'left', 0.6, 2.2, 2.5, 8, 26, 3, { arch: true, glass: '#fff3c4', skip: [1], w: 0.2 });
  p.sign('left', 0.8, 2.0, 44, 58, 2.51, '#1a237e', WHITE, signText('GARE'));
  wins(p, 'right', 0.25, 2.5, 2.2, 8, 30, 5, { arch: true, glass: '#fff3c4', w: 0.24, skip: [2] });
  door(p, 'right', 1.375, 0.34, 0, 28, 2.2, '#3e2723', { glass: true });
  p.gableRoofY(0.6, 0.25, 2.2, 2.5, 66, 30, roof, wall, 0.14);
  // Lucarnes sur le long pan.
  for (const y of [0.55, 2.0]) {
    p.box(1.55, y, 1.85, y + 0.28, 66, 80, C(trim));
    p.rightQuad(y + 0.06, y + 0.22, 69, 77, 1.85, '#fff3c4');
    p.gableRoofX(1.55, y, 1.85, y + 0.28, 80, 10, roof, trim, 0.04);
  }
  // Œil-de-bœuf dans le pignon.
  onFace(p, 'left', 1.4, 2.51, 78, (ctx) => {
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Tour de l'horloge sur le faîtage.
  const tx = 1.17;
  const ty = 0.95;
  p.box(tx, ty, tx + 0.46, ty + 0.46, 84, 122, C(trim));
  p.box(tx - 0.03, ty - 0.03, tx + 0.49, ty + 0.49, 118, 123, C('#e8d9bf'));
  clock(p, 'left', tx + 0.23, ty + 0.46, 104, 10);
  clock(p, 'right', ty + 0.23, tx + 0.46, 104, 10);
  p.pyramidRoof(tx, ty, tx + 0.46, ty + 0.46, 123, 28, roof, 0.08);
  flag(p, tx + 0.23, ty + 0.23, 151, 14, '#1a237e', WHITE);

  // Marquise du quai est.
  const posts = [0.4, 1.1, 1.8, 2.45];
  p.fill(
    [
      [2.22, 0.2, 60],
      [2.22, 2.55, 60],
      [2.95, 2.55, 52],
      [2.95, 0.2, 52],
    ],
    p.gradient([2.22, 1, 60], [2.95, 1, 52], '#3f8f5a', '#2e6d43'),
  );
  for (let y = 0.3; y < 2.55; y += 0.15) p.line([2.24, y, 60], [2.95, y, 52], '#2a5e3a', 1);
  // Lambrequin festonné.
  p.rightQuad(0.2, 2.55, 47, 52, 2.95, '#f2efe6');
  for (let y = 0.2; y < 2.55; y += 0.12) p.dot(2.95, y + 0.06, 47, 3, '#f2efe6');
  for (const y of posts) p.line([2.82, y, 0], [2.82, y, 53], '#2e5d3a', 2.8);
  bench(p, 2.6, 0.75, 'y');
  bench(p, 2.6, 2.0, 'y');
  // Chariot à bagages.
  p.box(2.5, 1.25, 2.75, 1.55, 6, 9, C('#8d6e63'));
  p.box(2.53, 1.28, 2.7, 1.42, 9, 18, C('#e57373'));
  p.box(2.55, 1.42, 2.7, 1.52, 9, 15, C('#4fc3f7'));
  p.dot(2.75, 1.3, 3, 3, '#263238');
  p.dot(2.75, 1.5, 3, 3, '#263238');
  lamp(p, 0.55, 2.85, 34);
  lamp(p, 2.25, 2.85, 34);
  planter(p, 0.95, 2.82, '#5cbf32');
  planter(p, 1.85, 2.82);
}

function university(g: IsoPainter, p: IsoPainter): void {
  lot(g, 5, '#a8d672');
  lawn(g, 0.1, 2.1, 4.9, 4.9, '#93d354');
  paved(g, 1.75, 2.0, 2.15, 4.95, '#e6dccb', 0.2);
  paved(g, 0.1, 3.3, 4.9, 3.7, '#e6dccb', 0.2);
  paved(g, 3.6, 3.0, 4.9, 3.3, '#e6dccb', 0.2);
  g.groundEllipse(1.95, 3.5, 0, 0.55, '#e6dccb');
  shadow(g, 0.4, 0.35, 4.6, 3.0);

  const brick = '#b0412e';
  const trim = '#f5f0e6';
  const roof = '#37474f';
  cypress(p, 0.2, 0.3, 50);
  tree(p, 4.8, 0.4, 1.0);
  // Grand bâtiment.
  body(p, 0.4, 0.35, 3.4, 1.6, 90, brick, { base: '#7b2a1d', bands: [32, 62], band: trim, cornice: trim });
  bricks(p, 0.4, 3.4, 0.35, 1.6, 6, 84, brick);
  quoins(p, 0.4, 1.6, 6, 84, trim, 'left');
  for (const [za, zb] of [
    [10, 26],
    [40, 56],
    [68, 82],
  ] as const) {
    wins(p, 'left', 0.4, 3.4, 1.6, za, zb, 7, { panes: true, sill: trim, arch: za === 10 });
  }
  p.gableRoofX(0.4, 0.35, 3.4, 1.6, 90, 36, roof, shade(brick, -0.2));
  // Lucarnes.
  for (const x of [0.8, 2.95]) {
    p.box(x - 0.14, 1.25, x + 0.14, 1.5, 90, 106, C(trim));
    p.leftQuad(x - 0.08, x + 0.08, 94, 103, 1.5, '#cfe8f7');
    p.gableRoofY(x - 0.14, 1.25, x + 0.14, 1.5, 106, 10, roof, trim, 0.04);
  }

  // Aile est à pignon.
  body(p, 3.4, 0.35, 4.6, 3.0, 76, brick, { base: '#7b2a1d', bands: [32, 62], band: trim, cornice: trim });
  bricks(p, 3.4, 4.6, 0.35, 3.0, 6, 70, brick);
  quoins(p, 4.6, 3.0, 6, 70, trim);
  quoins(p, 3.4, 3.0, 6, 70, trim, 'left');
  for (const [za, zb] of [
    [10, 26],
    [40, 56],
  ] as const) {
    wins(p, 'left', 3.4, 4.6, 3.0, za, zb, 3, { panes: true, sill: trim, arch: true });
    wins(p, 'right', 0.35, 3.0, 4.6, za, zb, 6, { panes: true, sill: trim });
  }
  wins(p, 'right', 0.35, 3.0, 4.6, 66, 72, 6, { w: 0.18 });
  p.gableRoofY(3.4, 0.35, 4.6, 3.0, 76, 38, roof, brick);
  onFace(p, 'left', 4.0, 3.01, 94, (ctx) => {
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfe8f7';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Tour de l'horloge, en avant-corps.
  const t0 = 1.6;
  const t1 = 2.3;
  const ty0 = 1.35;
  const ty1 = 2.0;
  body(p, t0, ty0, t1, ty1, 150, brick, { base: '#7b2a1d', bands: [32, 62, 110], band: trim, cornice: trim });
  bricks(p, t0, t1, ty0, ty1, 6, 145, brick);
  quoins(p, t0, ty1, 6, 145, trim, 'left');
  quoins(p, t1, ty1, 6, 145, trim);
  door(p, 'left', 1.95, 0.34, 0, 28, ty1, '#3e2723', { arch: true });
  win(p, 'left', 1.95, 0.14, ty1, 42, 58, { panes: true, arch: true });
  win(p, 'left', 1.95, 0.14, ty1, 72, 96, { panes: true, arch: true });
  win(p, 'right', 1.675, 0.14, t1, 72, 96, { panes: true, arch: true });
  clock(p, 'left', 1.95, ty1 + 0.005, 128, 11);
  clock(p, 'right', 1.675, t1 + 0.005, 128, 11);
  flatRoof(p, t0, ty0, t1, ty1, 150, trim, '#9e9e9e', 6);
  cylinder(p, 1.95, 1.675, 156, 176, 0.24, trim);
  for (const k of [-0.55, 0, 0.55]) {
    const [sx, sy] = p.p(1.95, 1.675, 160);
    const bx = sx + k * 0.24 * RX;
    p.ctx.fillStyle = '#3a2a24';
    p.ctx.beginPath();
    p.ctx.roundRect(bx - 2.6, sy + 0.24 * RY * Math.sqrt(1 - k * k) - 14, 5.2, 13, [2.6, 2.6, 0, 0]);
    p.ctx.fill();
  }
  dome(p, 1.95, 1.675, 176, 0.27, 26, '#5fb59a');
  p.line([1.95, 1.675, 200], [1.95, 1.675, 214], '#c9a227', 2.2);
  p.dot(1.95, 1.675, 215, 3, '#f2c230');
  steps(p, 1.72, 2.18, 2.0, 3, 0.08, 2.5, '#d9cfb9');

  // Campus : fontaine, arbres, bancs, lampadaires.
  cylinder(p, 1.95, 3.5, 0, 7, 0.42, '#d9cfb9', '#4fc3f7');
  p.groundEllipse(1.95, 3.5, 7, 0.34, '#6fd0f5');
  cylinder(p, 1.95, 3.5, 7, 22, 0.06, '#d9cfb9');
  p.dot(1.95, 3.5, 25, 6, '#bdeafc');
  p.dot(1.94, 3.49, 27, 3, WHITE);
  tree(p, 0.55, 2.55, 1.0);
  tree(p, 3.2, 2.45, 0.9, '#4caf2a');
  tree(p, 0.55, 4.35, 1.05, '#4caf2a');
  tree(p, 3.3, 4.4, 1.0);
  tree(p, 4.5, 4.3, 0.95);
  bench(p, 1.2, 3.15);
  bench(p, 2.7, 3.15);
  bench(p, 1.2, 3.88);
  for (const [x, y] of [
    [1.65, 2.5],
    [2.25, 2.5],
    [1.65, 4.5],
    [2.25, 4.5],
    [3.8, 3.85],
  ] as const)
    lamp(p, x, y, 36);
  flag(p, 4.7, 3.55, 0, 74, '#7b1fa2', '#ffd54f');
  roundBush(p, 0.6, 1.8, 9);
  roundBush(p, 1.3, 1.8, 8, '#5cbf32');
  roundBush(p, 2.6, 1.8, 8);
  roundBush(p, 3.2, 1.8, 9, '#5cbf32');
  roundBush(p, 4.8, 2.0, 9);
  roundBush(p, 3.6, 3.15, 8);
}

function museum(g: IsoPainter, p: IsoPainter): void {
  lot(g, 4, '#ebe5d6');
  paved(g, 0.05, 3.0, 3.95, 3.95, '#e2d9c6', 0.3);
  lawn(g, 0.05, 0.05, 0.45, 3.0);
  lawn(g, 3.55, 0.05, 3.95, 3.0);
  shadow(g, 0.5, 0.45, 3.5, 3.0);

  const wall = '#f5f0e6';
  const stone = '#ece5d4';
  const roof = '#bdb6a8';
  tree(p, 0.22, 0.6, 0.9);
  tree(p, 3.75, 0.45, 0.9, '#4caf2a');
  body(p, 0.5, 0.45, 3.5, 2.55, 80, wall, { base: '#cfc6b1', bands: [14], band: stone, cornice: stone });
  // Niches aveugles et oriflammes.
  wins(p, 'right', 0.45, 2.55, 3.5, 20, 60, 4, { arch: true, glass: '#d9cfb9', frame: stone, w: 0.2 });
  const banners = ['#c62828', '#1e63c6', '#f2a81d', '#1e63c6', '#c62828'];
  for (let i = 0; i < 5; i++) {
    const x = 0.85 + i * 0.575;
    p.leftQuad(x - 0.09, x + 0.09, 30, 66, 2.555, banners[i] ?? '#c62828');
    p.leftQuad(x - 0.09, x + 0.09, 62, 66, 2.556, '#f2c230');
    onFace(p, 'left', x, 2.557, 30, (ctx) => {
      ctx.fillStyle = banners[i] ?? '#c62828';
      ctx.beginPath();
      ctx.moveTo(-6.5, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(6.5, 0);
      ctx.closePath();
      ctx.fill();
    });
  }
  door(p, 'left', 2.0, 0.38, 14, 34, 2.55, '#6d4c41', { arch: true });
  portico(p, 0.55, 3.45, 2.55, 0.45, 14, 70, 6, { stone, roof, ped: 30, sign: 'MUSÉE', entH: 12 });
  // Toiture principale derrière le fronton, verrière en dôme.
  p.gableRoofY(0.5, 0.45, 3.5, 2.5, 80, 32, roof, wall, 0.08);
  dome(p, 2.0, 1.1, 104, 0.4, 30, '#8fd3f4', false);
  {
    const [sx, sy] = p.p(2.0, 1.1, 104);
    const { ctx } = p;
    ctx.strokeStyle = '#e0f4fd';
    ctx.lineWidth = 1.3;
    for (const k of [-0.6, -0.2, 0.2, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(sx + k * 0.4 * RX, sy + 0.4 * RY * Math.sqrt(1 - k * k));
      ctx.quadraticCurveTo(sx + k * 0.4 * RX, sy - 22, sx, sy - 30);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(sx, sy - 12, 0.4 * RX * 0.92, 8, 0, 0, Math.PI);
    ctx.stroke();
  }
  p.dot(2.0, 1.1, 136, 3, '#f2c230');
  steps(p, 0.75, 3.25, 3.0, 4, 0.1, 3.5, '#ddd5c4');

  // Statue équestre stylisée sur socle, côté gauche ; sphère de bronze à droite.
  p.box(0.25, 3.3, 0.6, 3.65, 0, 22, C('#cfc6b1'));
  p.box(0.22, 3.27, 0.63, 3.68, 22, 25, C('#ddd5c4'));
  {
    // Statue en bronze : drapé, bras levé tenant une torche.
    const [sx, sy] = p.p(0.425, 3.475, 25);
    const { ctx } = p;
    const g = ctx.createLinearGradient(sx - 9, 0, sx + 9, 0);
    g.addColorStop(0, '#7fc4b0');
    g.addColorStop(1, '#3f7f6d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx - 9, sy);
    ctx.lineTo(sx - 5, sy - 30);
    ctx.lineTo(sx + 5, sy - 30);
    ctx.lineTo(sx + 9, sy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy - 35, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4f8f7d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy - 27);
    ctx.lineTo(sx + 9, sy - 46);
    ctx.stroke();
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy - 47);
    ctx.quadraticCurveTo(sx + 4, sy - 54, sx + 9, sy - 60);
    ctx.quadraticCurveTo(sx + 14, sy - 54, sx + 9, sy - 47);
    ctx.fill();
  }
  p.box(3.45, 3.35, 3.75, 3.65, 0, 10, C('#cfc6b1'));
  p.dot(3.6, 3.5, 24, 13, '#d9a441');
  p.dot(3.56, 3.46, 28, 5, '#f7e2a0');
  lamp(p, 0.65, 3.85, 36);
  lamp(p, 3.35, 3.85, 36);
  planter(p, 1.3, 3.75);
  planter(p, 2.7, 3.75, '#4caf2a');
  roundBush(p, 0.3, 2.85, 9);
  roundBush(p, 3.7, 2.85, 9, '#5cbf32');
}

function conventionCenter(g: IsoPainter, p: IsoPainter): void {
  lot(g, 4, '#d4dde1');
  paved(g, 0.05, 2.5, 3.95, 3.95, '#e4eaec', 0.33);
  lawn(g, 0.05, 0.05, 3.95, 0.22);
  lawn(g, 3.55, 0.22, 3.95, 2.5);
  // Bassin à jets.
  g.flat(2.0, 2.95, 3.3, 3.35, 0, '#9fb3bb');
  g.flat(2.05, 3.0, 3.25, 3.3, 0, '#5cc6ee');
  shadow(g, 0.3, 0.3, 3.4, 2.4);

  const teal = '#00695c';
  const glassA = '#9fe3e8';
  // Halle vitrée.
  p.box(0.3, 0.3, 3.4, 2.4, 0, 58, { top: '#80cbc4', left: glassA, right: shade(glassA, -0.25) });
  p.leftQuad(0.3, 3.4, 0, 6, 2.4, teal);
  p.rightQuad(0.3, 2.4, 0, 6, 3.4, shade(teal, -0.2));
  for (let x = 0.3; x <= 3.41; x += 0.26) p.line([x, 2.4, 6], [x, 2.4, 44], '#e0f2f1', 1.4);
  for (let y = 0.3; y <= 2.41; y += 0.26) p.line([3.4, y, 6], [3.4, y, 44], '#c5e5e2', 1.4);
  for (const z of [18, 31]) {
    p.line([0.3, 2.4, z], [3.4, 2.4, z], '#e0f2f1', 1.2);
    p.line([3.4, 2.4, z], [3.4, 0.3, z], '#c5e5e2', 1.2);
  }
  // Reflets en diagonale.
  p.ctx.save();
  p.ctx.globalAlpha = 0.3;
  for (const x of [0.7, 1.9, 2.8]) {
    p.fill(
      [
        [x, 2.4, 44],
        [x + 0.25, 2.4, 44],
        [x + 0.05, 2.4, 8],
        [x - 0.2, 2.4, 8],
      ],
      WHITE,
    );
  }
  p.ctx.restore();
  p.leftQuad(0.3, 3.4, 44, 58, 2.4, teal);
  p.rightQuad(0.3, 2.4, 44, 58, 3.4, shade(teal, -0.2));
  p.sign('right', 0.6, 2.1, 46, 56, 3.405, teal, WHITE, signText('CONGRÈS'));
  barrelRoof(p, 'x', 0.3, 0.3, 3.4, 2.4, 58, 30, '#26a69a', '#e0f2f1', 0.16);

  // Atrium cylindrique d'entrée.
  cylinder(p, 1.05, 2.4, 0, 72, 0.5, '#b2ebf2');
  for (const z of [18, 36, 54]) cylBand(p, 1.05, 2.4, z, z + 2.5, 0.5, '#e0f7fa');
  cylBand(p, 1.05, 2.4, 0, 5, 0.5, teal);
  cylinder(p, 1.05, 2.4, 72, 78, 0.56, teal, '#4db6ac');
  cylinder(p, 1.05, 2.4, 78, 86, 0.3, '#b2ebf2', '#e0f7fa');
  cylinder(p, 1.05, 2.4, 86, 89, 0.34, teal, '#4db6ac');
  {
    const [sx, sy] = p.p(1.05, 2.9, 0);
    p.ctx.fillStyle = '#004d40';
    p.ctx.fillRect(sx - 9, sy - 26, 18, 25);
    p.ctx.fillStyle = '#b2ebf2';
    p.ctx.fillRect(sx - 7, sy - 24, 6, 22);
    p.ctx.fillRect(sx + 1, sy - 24, 6, 22);
  }

  // Parvis : drapeaux, jets d'eau, jardinières.
  const flags = ['#e53935', '#ffc61a', '#1e88e5', '#43a047', '#8e24aa'];
  flags.forEach((c, i) => flag(p, 1.95 + i * 0.36, 2.72, 0, 64, c, WHITE));
  for (const x of [2.25, 2.65, 3.05]) {
    p.line([x, 3.15, 0], [x, 3.15, 18], '#bdeafc', 3);
    p.dot(x, 3.15, 20, 4, '#e6f7fd');
  }
  planter(p, 0.4, 2.8);
  planter(p, 0.4, 3.55, '#4caf2a');
  planter(p, 1.6, 3.6);
  tree(p, 3.7, 2.8, 0.85);
  tree(p, 3.7, 3.65, 0.8, '#4caf2a');
  lamp(p, 1.75, 3.0, 38);
  lamp(p, 3.45, 3.25, 38);
  bench(p, 2.65, 3.7);
  roundBush(p, 3.65, 1.0, 9);
  roundBush(p, 3.7, 1.9, 8, '#5cbf32');
}

function airport(g: IsoPainter, p: IsoPainter): void {
  lot(g, 6, '#a3a7ab');
  lawn(g, 0.04, 4.35, 5.96, 5.96, '#8fcf54');
  // Piste : bords blancs, axe pointillé, seuils, balisage.
  g.flat(0.04, 4.6, 5.96, 5.7, 0, '#5f6368');
  g.line([0.06, 4.66, 0], [5.94, 4.66, 0], WHITE, 2);
  g.line([0.06, 5.64, 0], [5.94, 5.64, 0], WHITE, 2);
  for (let x = 0.7; x < 5.3; x += 0.42) g.line([x, 5.15, 0], [x + 0.22, 5.15, 0], WHITE, 2.4);
  for (const x0 of [0.15, 5.55]) for (let y = 4.75; y < 5.6; y += 0.12) g.flat(x0, y, x0 + 0.3, y + 0.06, 0, WHITE);
  for (let x = 0.1; x < 5.95; x += 0.4) {
    g.dot(x, 4.55, 1, 2.2, '#ffd23f');
    g.dot(x, 5.75, 1, 2.2, '#ffd23f');
  }
  // Tarmac et voies de circulation.
  g.flat(0.04, 2.0, 4.3, 4.35, 0, '#c4c6c8');
  g.flat(4.3, 3.4, 5.96, 4.35, 0, '#c4c6c8');
  g.line([1.4, 2.1, 0], [1.4, 4.3, 0], '#ffd23f', 2);
  g.line([1.4, 4.3, 0], [1.9, 4.62, 0], '#ffd23f', 2);
  g.line([3.0, 2.1, 0], [3.0, 3.9, 0], '#ffd23f', 2);
  lawn(g, 0.04, 0.04, 5.96, 0.24);
  shadow(g, 0.35, 0.3, 4.1, 1.9);

  const blue = '#1565c0';
  // Hangar à voûte (derrière, à droite).
  p.box(4.4, 1.55, 5.85, 3.35, 0, 40, C('#cfd8dc'));
  barrelRoof(p, 'y', 4.4, 1.55, 5.85, 3.35, 40, 36, '#b0bec5', '#e3e8eb', 0.06);
  p.leftQuad(4.6, 5.65, 0, 38, 3.351, '#5d6b73');
  for (let z = 5; z < 38; z += 5) p.line([4.6, 3.352, z], [5.65, 3.352, z], '#78909c', 1);
  p.leftQuad(4.6, 5.65, 38, 42, 3.352, '#ffc61a');
  // Tour de contrôle.
  const cx = 4.85;
  const cy = 0.85;
  p.box(4.45, 0.45, 5.3, 1.3, 0, 26, C('#eceff1'));
  wins(p, 'left', 4.45, 5.3, 1.3, 8, 20, 3, { glass: '#b3e5fc', frame: blue });
  wins(p, 'right', 0.45, 1.3, 5.3, 8, 20, 3, { glass: '#b3e5fc', frame: blue });
  flatRoof(p, 4.45, 0.45, 5.3, 1.3, 26, '#eceff1', '#b0bec5', 4);
  cylinder(p, cx, cy, 30, 150, 0.2, '#f5f7f8');
  for (const z of [60, 100]) cylBand(p, cx, cy, z, z + 4, 0.2, '#ff7043');
  cylinder(p, cx, cy, 148, 154, 0.42, '#eceff1');
  cylinder(p, cx, cy, 154, 172, 0.42, '#2a7fa8');
  for (const k of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const [sx, sy] = p.p(cx, cy, 154);
    const bx = sx + k * 0.42 * RX;
    const by = sy + 0.42 * RY * Math.sqrt(1 - k * k);
    p.ctx.strokeStyle = '#e0f4fd';
    p.ctx.lineWidth = 1.5;
    p.ctx.beginPath();
    p.ctx.moveTo(bx, by);
    p.ctx.lineTo(bx, by - 18);
    p.ctx.stroke();
  }
  cylinder(p, cx, cy, 172, 178, 0.48, '#eceff1', '#cfd8dc');
  p.line([cx, cy, 178], [cx, cy, 204], '#90a4ae', 2.4);
  p.dot(cx, cy, 206, 3, '#ff1744');
  p.dot(cx + 0.1, cy, 182, 4, '#cfd8dc');

  // Terminal vitré à toit ondulé.
  p.box(0.35, 0.3, 4.1, 1.9, 0, 50, { top: '#eceff1', left: '#a6dcf5', right: '#7fbbd8' });
  p.leftQuad(0.35, 4.1, 0, 6, 1.9, '#90a4ae');
  p.rightQuad(0.3, 1.9, 0, 6, 4.1, '#78909c');
  for (let x = 0.35; x <= 4.11; x += 0.25) p.line([x, 1.9, 6], [x, 1.9, 38], WHITE, 1.4);
  for (let y = 0.3; y <= 1.91; y += 0.25) p.line([4.1, y, 6], [4.1, y, 38], '#d6eaf3', 1.4);
  p.line([0.35, 1.9, 22], [4.1, 1.9, 22], WHITE, 1.2);
  p.line([4.1, 1.9, 22], [4.1, 0.3, 22], '#d6eaf3', 1.2);
  p.leftQuad(0.35, 4.1, 38, 50, 1.9, blue);
  p.rightQuad(0.3, 1.9, 38, 50, 4.1, shade(blue, -0.2));
  p.faceText('left', signText('AÉROPORT'), 2.2, 1.905, 44, '800 11px system-ui, sans-serif', WHITE, 150);
  barrelRoof(p, 'x', 0.35, 0.3, 4.1, 1.9, 50, 22, '#f5f7f8', '#dfe6ea', 0.18);
  // Passerelles.
  for (const x of [1.4, 3.0]) {
    p.box(x - 0.1, 1.9, x + 0.1, 2.5, 16, 28, C('#cfd8dc'));
    p.leftQuad(x - 0.1, x + 0.1, 18, 26, 2.5, '#455a64');
    p.line([x, 2.4, 0], [x, 2.4, 16], '#78909c', 3);
  }
  airliner(p, 1.4, 2.55, 'y', 1.7, 22);
  // Véhicules de piste.
  for (let i = 0; i < 3; i++) {
    const x = 2.3 + i * 0.26;
    p.box(x, 2.6, x + 0.2, 2.78, 3, 10, C('#90a4ae'));
    p.box(x + 0.02, 2.63, x + 0.18, 2.75, 10, 18, C(['#e57373', '#4fc3f7', '#ffd54f'][i] ?? '#ffd54f'));
    p.dot(x + 0.04, 2.78, 3, 2.5, '#263238');
    p.dot(x + 0.16, 2.78, 3, 2.5, '#263238');
  }
  van(p, 3.3, 3.2, 'x', '#ffc61a', '#3d3d3d');
  cone(p, 2.2, 3.1);
  cone(p, 2.4, 3.3);
  // Manche à air.
  p.line([5.75, 4.15, 0], [5.75, 4.15, 34], '#9e9e9e', 2.2);
  {
    const [sx, sy] = p.p(5.75, 4.15, 34);
    const { ctx } = p;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? WHITE : '#ff6d00';
      ctx.beginPath();
      ctx.moveTo(sx + i * 6, sy - 3 + i * 0.6);
      ctx.lineTo(sx + (i + 1) * 6, sy - 2.4 + i * 0.6);
      ctx.lineTo(sx + (i + 1) * 6, sy + 4 + i * 0.3);
      ctx.lineTo(sx + i * 6, sy + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
  airliner(p, 4.6, 5.15, 'x', 1.35, 16, '#e53935');
  tree(p, 0.3, 4.1, 0.85);
  roundBush(p, 4.5, 4.1, 8);
  roundBush(p, 5.3, 0.25, 8, '#5cbf32');
}

export const HEROES: Record<string, Hero> = {
  town_hall: { height: 236, draw: townHall },
  school: { height: 150, draw: school },
  post_office: { height: 140, draw: postOffice },
  police: { height: 134, draw: police },
  fire_station: { height: 168, draw: fireStation },
  library: { height: 136, draw: library },
  hospital: { height: 150, draw: hospital },
  train_station: { height: 172, draw: trainStation },
  university: { height: 222, draw: university },
  museum: { height: 146, draw: museum },
  convention_center: { height: 100, draw: conventionCenter },
  airport: { height: 212, draw: airport },
};
