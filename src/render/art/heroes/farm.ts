import { HALF_H, HALF_W } from '../../iso';
import { shade } from '../color';
import { boxColors, type BoxColors, type IsoPainter, type V3 } from '../IsoPainter';
import { roundBush } from '../toon';
import type { Hero } from './types';
import { signText } from '@/i18n/content';

/**
 * Élevage et ateliers agricoles redessinés à la main (style cartoon) :
 * poulailler sur pilotis et ses poules, étable aux vaches pie, ranch avec corral,
 * silo et éolienne de pompage, moulin à vent, fournil à four de briques,
 * fromagerie à meule géante et conserverie à boîte de conserve géante.
 */

type Side = 'left' | 'right';
type Ctx = CanvasRenderingContext2D;

const RX = HALF_W * Math.SQRT2;
const RY = HALF_H * Math.SQRT2;
/** Longueur écran (px) d'une case le long d'une face. */
const FACE_PX = Math.hypot(HALF_W, HALF_H);
const RED = '#c62f22';

// ——— Outils géométriques ———

/** Point d'une face : `along` le long de la face, `plane` = plan de la face. */
function pt(side: Side, along: number, plane: number, z: number): V3 {
  return side === 'left' ? [along, plane, z] : [plane, along, z];
}

function scr(p: IsoPainter, side: Side, along: number, plane: number, z: number): [number, number] {
  return p.p(...pt(side, along, plane, z));
}

function quad(
  p: IsoPainter,
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

/** Boîte posée contre une face, qui avance de `out` vers l'extérieur. */
function faceBox(
  p: IsoPainter,
  side: Side,
  a: number,
  b: number,
  za: number,
  zb: number,
  plane: number,
  out: number,
  c: BoxColors,
): void {
  if (side === 'left') p.box(a, plane, b, plane + out, za, zb, c);
  else p.box(plane, a, plane + out, b, za, zb, c);
}

/** La face droite est moins éclairée. */
function tone(side: Side, color: string): string {
  return side === 'left' ? color : shade(color, -0.14);
}

/** Couleurs de boîte avec un liseré discret (le gros contour vient du calque). */
function bc(color: string): BoxColors {
  return { top: shade(color, 0.2), left: color, right: shade(color, -0.2), outline: shade(color, -0.32) };
}

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** Rectangle écran aux coins arrondis. */
function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// ——— Sol ———

/** Parcelle en herbe. */
function lot(gp: IsoPainter, size: number, color: string): void {
  gp.flat(0.02, 0.02, size - 0.02, size - 0.02, 0, color, shade(color, -0.15));
}

/** Parcelle pavée avec joints, pelouses et bordure de trottoir. */
function pavedLot(
  gp: IsoPainter,
  size: number,
  pave: string,
  lawns: readonly (readonly [number, number, number, number])[],
): void {
  const e = size - 0.02;
  gp.flat(0.02, 0.02, e, e, 0, pave);
  const { ctx } = gp;
  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let i = 0.25; i < size; i += 0.25) {
    gp.line([i, 0.02, 0], [i, e, 0], shade(pave, -0.35), 1);
    gp.line([0.02, i, 0], [e, i, 0], shade(pave, -0.35), 1);
  }
  ctx.restore();
  gp.line([0.02, e, 0], [e, e, 0], shade(pave, 0.35), 3);
  gp.line([e, 0.02, 0], [e, e, 0], shade(pave, -0.15), 3);
  for (const [x0, y0, x1, y1] of lawns) {
    gp.flat(x0, y0, x1, y1, 0, '#8fd14f');
    gp.line([x0, y1, 0], [x1, y1, 0], '#6fae35', 2);
    gp.line([x1, y0, 0], [x1, y1, 0], '#6fae35', 2);
  }
}

function softShadow(gp: IsoPainter, x0: number, y0: number, x1: number, y1: number, alpha = 0.26): void {
  gp.ctx.save();
  gp.ctx.globalAlpha = alpha;
  gp.flat(x0 + 0.05, y0 + 0.05, x1 + 0.3, y1 + 0.22, 0, '#24301a');
  gp.ctx.restore();
}

function softDot(gp: IsoPainter, x: number, y: number, r: number): void {
  gp.ctx.save();
  gp.ctx.globalAlpha = 0.2;
  gp.groundEllipse(x + 0.04, y + 0.03, 0, r, '#1d2a12');
  gp.ctx.restore();
}

/** Grains éparpillés ou touffes, en petits points au sol. */
function speckle(gp: IsoPainter, x0: number, y0: number, x1: number, y1: number, n: number, color: string, r = 1.3) {
  let s = 7;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = gp.p(x0 + (x1 - x0) * rnd(), y0 + (y1 - y0) * rnd(), 0);
    ell(gp.ctx, sx, sy, r * 1.4, r, color);
  }
}

// ——— Volumes génériques ———

function ribsL(p: IsoPainter, x0: number, x1: number, y: number, z0: number, z1: number, c: string, step = 0.08) {
  for (let x = x0 + step; x < x1 - step / 3; x += step) p.line([x, y, z0], [x, y, z1], c, 1);
}

function ribsR(p: IsoPainter, y0: number, y1: number, x: number, z0: number, z1: number, c: string, step = 0.08) {
  for (let y = y0 + step; y < y1 - step / 3; y += step) p.line([x, y, z0], [x, y, z1], c, 1);
}

/** Rangs de briques (joints horizontaux) sur les deux faces visibles. */
function bricks(p: IsoPainter, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: string) {
  for (let z = z0 + 4; z < z1; z += 4) {
    p.line([x0, y1, z], [x1, y1, z], shade(c, 0.22), 1);
    p.line([x1, y1, z], [x1, y0, z], shade(c, 0.05), 1);
  }
}

/** Corps de bâtiment : murs, soubassement, chaînages d'angle. */
function walls(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  wall: string,
  trim = '#ffffff',
  base = shade(wall, -0.32),
): void {
  p.box(x0, y0, x1, y1, 0, h, { top: shade(wall, 0.2), left: wall, right: shade(wall, -0.18) });
  p.leftQuad(x0, x1, 0, 6, y1, base);
  p.rightQuad(y0, y1, 0, 6, x1, shade(base, -0.15));
  p.leftQuad(x0, x0 + 0.05, 6, h, y1, trim);
  p.leftQuad(x1 - 0.05, x1, 6, h, y1, shade(trim, -0.04));
  p.rightQuad(y1 - 0.05, y1, 6, h, x1, shade(trim, -0.16));
  p.rightQuad(y0, y0 + 0.05, 6, h, x1, shade(trim, -0.2));
}

/** Bandeau horizontal en relief sur les deux faces visibles. */
function band(p: IsoPainter, x0: number, y0: number, x1: number, y1: number, za: number, zb: number, c: string) {
  p.leftQuad(x0 - 0.02, x1 + 0.02, za, zb, y1 + 0.02, c);
  p.rightQuad(y0 - 0.02, y1 + 0.02, za, zb, x1 + 0.02, shade(c, -0.15));
}

/** Cylindre vertical (silo, bidon, boîte de conserve) ; r en cases. */
function cylinder(p: IsoPainter, cx: number, cy: number, z0: number, z1: number, r: number, color: string): void {
  frustum(p, cx, cy, z0, z1, r, r, color);
}

/** Tronc de cône vertical (tour de moulin) : rayon r0 en bas, r1 en haut. */
function frustum(p: IsoPainter, cx: number, cy: number, z0: number, z1: number, r0: number, r1: number, c: string) {
  const { ctx } = p;
  const [bx, by] = p.p(cx, cy, z0);
  const [, ty] = p.p(cx, cy, z1);
  const g = ctx.createLinearGradient(bx - r0 * RX, 0, bx + r0 * RX, 0);
  g.addColorStop(0, shade(c, 0.05));
  g.addColorStop(0.3, shade(c, 0.32));
  g.addColorStop(0.75, shade(c, -0.08));
  g.addColorStop(1, shade(c, -0.32));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(bx, by, r0 * RX, r0 * RY, 0, Math.PI, 0, true);
  ctx.lineTo(bx + r1 * RX, ty);
  ctx.ellipse(bx, ty, r1 * RX, r1 * RY, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ell(ctx, bx, ty, r1 * RX, r1 * RY, shade(c, 0.22));
}

/** Cerclage (anneau visible) autour d'un cylindre. */
function hoop(p: IsoPainter, cx: number, cy: number, z: number, r: number, color: string, w = 1.6): void {
  const [sx, sy] = p.p(cx, cy, z);
  p.ctx.strokeStyle = color;
  p.ctx.lineWidth = w;
  p.ctx.beginPath();
  p.ctx.ellipse(sx, sy, r * RX, r * RY, 0, 0, Math.PI);
  p.ctx.stroke();
}

/** Dôme ou cône posé sur un cylindre. */
function dome(p: IsoPainter, cx: number, cy: number, z: number, r: number, h: number, color: string, cone = false) {
  const { ctx } = p;
  const [sx, sy] = p.p(cx, cy, z);
  const rx = r * RX;
  const ry = r * RY;
  const g = ctx.createRadialGradient(sx - rx * 0.4, sy - h * 0.7, 2, sx, sy - h * 0.3, rx * 1.3);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (cone) {
    ctx.moveTo(sx - rx, sy);
    ctx.lineTo(sx, sy - h);
    ctx.lineTo(sx + rx, sy);
  } else ctx.ellipse(sx, sy, rx, h, 0, Math.PI, 0, false);
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
}

/** Porte de grange à croix blanche sur une face. */
function barnDoor(p: IsoPainter, side: Side, a: number, b: number, h: number, plane: number, color: string) {
  quad(p, side, a - 0.04, b + 0.04, 0, h + 4, plane, tone(side, '#ffffff'));
  const m = (a + b) / 2;
  for (const [s, e] of [
    [a, m - 0.01],
    [m + 0.01, b],
  ] as const) {
    quad(p, side, s, e, 0, h, plane, tone(side, color));
    for (let t = s + 0.06; t < e - 0.02; t += 0.06)
      p.line(pt(side, t, plane, 0), pt(side, t, plane, h), tone(side, shade(color, -0.15)), 1);
    quad(p, side, s, e, 0, 2.5, plane, tone(side, '#ffffff'));
    quad(p, side, s, e, h - 2.5, h, plane, tone(side, '#ffffff'));
    p.line(pt(side, s + 0.01, plane, 2), pt(side, e - 0.01, plane, h - 2), tone(side, '#ffffff'), 2.4);
    p.line(pt(side, e - 0.01, plane, 2), pt(side, s + 0.01, plane, h - 2), tone(side, '#ffffff'), 2.4);
  }
}

/** Lucarne d'aération à persiennes, coiffée d'un petit toit pointu. */
function cupola(p: IsoPainter, x: number, y: number, z: number, s: number, roof: string): void {
  p.box(x - s, y - s, x + s, y + s, z, z + 16, boxColors('#ffffff', false));
  for (let zz = z + 4; zz < z + 14; zz += 3) {
    p.line([x - s + 0.02, y + s, zz], [x + s - 0.02, y + s, zz], '#9e9e9e', 1);
    p.line([x + s, y + s - 0.02, zz], [x + s, y - s + 0.02, zz], '#8a8a8a', 1);
  }
  p.pyramidRoof(x - s, y - s, x + s, y + s, z + 16, 12, roof, 0.035);
}

// ——— Accessoires ———

function squareBale(p: IsoPainter, x: number, y: number, z = 0): void {
  p.box(x, y, x + 0.24, y + 0.16, z, z + 11, boxColors('#e8c547'));
  p.line([x + 0.07, y + 0.16, z], [x + 0.07, y + 0.16, z + 11], '#b8902a', 1.2);
  p.line([x + 0.17, y + 0.16, z], [x + 0.17, y + 0.16, z + 11], '#b8902a', 1.2);
}

function hayBale(p: IsoPainter, x: number, y: number): void {
  const [sx, sy] = p.p(x, y, 9);
  const { ctx } = p;
  ctx.fillStyle = '#d9ad3c';
  ctx.beginPath();
  ctx.ellipse(sx - 5, sy, 11, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(sx - 5, sy - 9.5, 9, 19);
  ell(ctx, sx + 4, sy, 7.5, 9.5, '#f3d57c');
  ctx.strokeStyle = '#c4932a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.3) {
    const r = (a / (Math.PI * 5)) * 7;
    const px = sx + 4 + Math.cos(a) * r * 0.8;
    const py = sy + Math.sin(a) * r;
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function woodCrate(p: IsoPainter, x: number, y: number, s: number, z = 0, color = '#c8914b'): void {
  p.box(x, y, x + s, y + s, z, z + s * 60, boxColors(color));
  const h = s * 60;
  p.line([x, y + s, z], [x + s, y + s, z + h], shade(color, -0.3), 1.5);
  p.line([x + s, y + s, z], [x + s, y, z + h], shade(color, -0.45), 1.5);
  p.line([x, y + s, z + h / 2], [x + s, y + s, z + h / 2], shade(color, -0.25), 1);
}

/** Cagette ouverte remplie de produits ronds (tomates, pommes…). */
function produceCrate(p: IsoPainter, x: number, y: number, fruit: string, z = 0): void {
  const w = 0.22;
  p.box(x, y, x + w, y + 0.18, z, z + 9, bc('#c48a52'));
  p.line([x, y + 0.18, z + 4.5], [x + w, y + 0.18, z + 4.5], '#8d5a3b', 1.2);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const fx = x + 0.04 + i * 0.07;
      const fy = y + 0.05 + j * 0.08;
      p.dot(fx, fy, z + 11, 3.4, fruit);
      p.dot(fx - 0.01, fy - 0.01, z + 12, 1.1, 'rgba(255,255,255,0.7)');
    }
}

/** Bidon de lait en aluminium. */
function milkCan(p: IsoPainter, x: number, y: number, z = 0): void {
  cylinder(p, x, y, z, z + 12, 0.05, '#cfd8dc');
  cylinder(p, x, y, z + 12, z + 15, 0.03, '#b0bec5');
  cylinder(p, x, y, z + 15, z + 17, 0.045, '#eceff1');
  hoop(p, x, y, z + 4, 0.05, '#90a4ae', 1.2);
}

/** Abreuvoir en tôle rempli d'eau. */
function trough(p: IsoPainter, x0: number, y0: number, x1: number, y1: number): void {
  for (const [x, y] of [
    [x0 + 0.03, y1 - 0.02],
    [x1 - 0.03, y1 - 0.02],
  ] as const)
    p.line([x, y, 0], [x, y, 4], '#5d4037', 2.5);
  p.box(x0, y0, x1, y1, 3, 10, bc('#90a4ae'));
  p.flat(x0 + 0.025, y0 + 0.025, x1 - 0.025, y1 - 0.025, 10, '#4fc3f7');
  p.line([x0 + 0.06, y0 + 0.06, 10], [x0 + 0.18, y0 + 0.06, 10], '#e1f5fe', 1.4);
}

/** Sac de farine ou de grain, ficelé en haut. */
function sack(p: IsoPainter, x: number, y: number, z = 0, color = '#efe3c6', stripe = '#64b5f6'): void {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  rrect(ctx, sx - 7, sy - 15, 14, 15, 5, color);
  ell(ctx, sx + 3, sy - 7, 3.5, 6.5, shade(color, -0.1));
  ctx.fillStyle = stripe;
  ctx.fillRect(sx - 6.5, sy - 10, 13, 2.6);
  ell(ctx, sx, sy - 15.5, 4.5, 2.4, shade(color, -0.12));
  ell(ctx, sx - 3, sy - 18, 2.4, 2, color);
  ell(ctx, sx + 2.5, sy - 18.5, 2.2, 1.8, shade(color, -0.04));
}

/** Gerbe de blé dressée. */
function sheaf(p: IsoPainter, x: number, y: number): void {
  const [sx, sy] = p.p(x, y, 0);
  const { ctx } = p;
  ctx.fillStyle = '#d4a531';
  ctx.beginPath();
  ctx.moveTo(sx - 5, sy);
  ctx.lineTo(sx - 2, sy - 12);
  ctx.lineTo(sx + 2, sy - 12);
  ctx.lineTo(sx + 5, sy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b8862a';
  ctx.fillRect(sx - 3, sy - 10, 6, 2.2);
  for (const [dx, a] of [
    [-5, -0.5],
    [-2, -0.2],
    [1.5, 0.15],
    [5, 0.45],
  ] as const)
    ell(ctx, sx + dx, sy - 18, 2.2, 6, '#f2c94c', a);
}

/** Petit tas de bûches. */
function logPile(p: IsoPainter, x: number, y: number): void {
  const [sx, sy] = p.p(x, y, 0);
  const { ctx } = p;
  for (const [dx, dy] of [
    [-9, -4],
    [0, -4],
    [9, -4],
    [-4.5, -11.5],
    [4.5, -11.5],
    [0, -19],
  ] as const) {
    ell(ctx, sx + dx, sy + dy, 4.8, 4.2, '#8d5a3b');
    ell(ctx, sx + dx + 0.6, sy + dy, 3.4, 3, '#e0b27a');
    ell(ctx, sx + dx + 0.6, sy + dy, 1.4, 1.2, '#b9875a');
  }
}

/** Fumée de cheminée. */
function smoke(p: IsoPainter, x: number, y: number, z: number): void {
  for (const [dz, dx, r] of [
    [6, 0, 5],
    [15, 0.03, 6.5],
    [26, 0.07, 8],
  ] as const)
    p.dot(x + dx, y - dx, z + dz, r, 'rgba(255,255,255,0.88)');
}

// ——— Animaux (dessinés à l'écran, pattes au point (x, y, 0)) ———

function hen(p: IsoPainter, x: number, y: number, flip = false, color = '#ffffff', peck = false, z = 0): void {
  const [sx, sy] = p.p(x, y, z);
  const d = flip ? -1 : 1;
  const { ctx } = p;
  ctx.strokeStyle = '#f9a825';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - d, sy - 5);
  ctx.lineTo(sx - d, sy);
  ctx.moveTo(sx + 2 * d, sy - 5);
  ctx.lineTo(sx + 2 * d, sy);
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.1);
  ctx.beginPath();
  ctx.moveTo(sx - 3 * d, sy - 9);
  ctx.lineTo(sx - 9.5 * d, sy - 17);
  ctx.lineTo(sx - 8 * d, sy - 7);
  ctx.closePath();
  ctx.fill();
  ell(ctx, sx, sy - 8.5, 7, 5.2, color);
  ell(ctx, sx - d, sy - 8.5, 4, 2.8, shade(color, -0.13));
  const hx = sx + (peck ? 7 : 5) * d;
  const hy = sy - (peck ? 6 : 14.5);
  ell(ctx, hx - 0.5 * d, hy - 3.2, 1.9, 1.9, '#e53935');
  ell(ctx, hx + 1.3 * d, hy - 2.8, 1.5, 1.5, '#e53935');
  ell(ctx, hx, hy, 3.2, 3.2, color);
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.moveTo(hx + 2.5 * d, hy - 1);
  ctx.lineTo(hx + 5.8 * d, hy + 0.4);
  ctx.lineTo(hx + 2.5 * d, hy + 1.3);
  ctx.closePath();
  ctx.fill();
  ell(ctx, hx + 1.8 * d, hy + 2.6, 1, 1.5, '#e53935');
  ell(ctx, hx + 0.9 * d, hy - 0.7, 0.9, 0.9, '#212121');
}

function chick(p: IsoPainter, x: number, y: number, flip = false): void {
  const [sx, sy] = p.p(x, y, 0);
  const d = flip ? -1 : 1;
  const { ctx } = p;
  ell(ctx, sx, sy - 3, 3.4, 2.8, '#ffe14d');
  ell(ctx, sx + 2.4 * d, sy - 6, 2.2, 2.2, '#ffe14d');
  ctx.fillStyle = '#ff9800';
  ctx.fillRect(sx + (d > 0 ? 4 : -5.5), sy - 6.5, 1.6, 1.2);
}

interface CowLook {
  coat: string;
  spots?: string;
  face?: string;
  horns?: boolean;
}

const HOLSTEIN: CowLook = { coat: '#fafafa', spots: '#263238' };
const HEREFORD: CowLook = { coat: '#9a4f2c', face: '#ffffff', horns: true };

/** Tête de vache (oreilles, cornes, mufle rose) centrée sur un point écran. */
function cowHead(ctx: Ctx, hx: number, hy: number, d: number, look: CowLook): void {
  const face = look.face ?? look.coat;
  ell(ctx, hx - 5 * d, hy - 3.5, 3.4, 1.8, look.coat, -0.3 * d);
  ell(ctx, hx + 4 * d, hy - 4.5, 3, 1.6, look.coat, 0.3 * d);
  if (look.horns) {
    ctx.strokeStyle = '#f5ecd2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy - 5);
    ctx.quadraticCurveTo(hx - 4, hy - 9, hx - 1.5, hy - 10);
    ctx.moveTo(hx + 2, hy - 5);
    ctx.quadraticCurveTo(hx + 4, hy - 9, hx + 1.5, hy - 10);
    ctx.stroke();
  }
  ell(ctx, hx, hy, 5, 5.6, face);
  if (look.spots) ell(ctx, hx - 1.5 * d, hy - 2.5, 2.6, 2.2, look.spots);
  ell(ctx, hx + 0.8 * d, hy + 3.6, 4.3, 3, '#f4a7a0');
  ell(ctx, hx - 0.8 * d, hy + 3.6, 0.8, 0.9, '#9c4d47');
  ell(ctx, hx + 2.2 * d, hy + 3.6, 0.8, 0.9, '#9c4d47');
  ell(ctx, hx + 1.6 * d, hy - 1.2, 1, 1.1, '#212121');
}

function cow(p: IsoPainter, x: number, y: number, look: CowLook, flip = false, graze = false): void {
  const [sx, sy] = p.p(x, y, 0);
  const d = flip ? -1 : 1;
  const { ctx } = p;
  const leg = shade(look.coat, -0.2);
  for (const lx of [-10, -6, 6, 10]) {
    ctx.fillStyle = Math.abs(lx) === 6 ? shade(leg, -0.12) : leg;
    ctx.fillRect(sx + lx * d - 1.6, sy - 9, 3.4, 8);
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(sx + lx * d - 1.6, sy - 2, 3.4, 2.2);
  }
  // Queue.
  ctx.strokeStyle = look.coat;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(sx - 13 * d, sy - 17);
  ctx.quadraticCurveTo(sx - 17 * d, sy - 12, sx - 15.5 * d, sy - 7);
  ctx.stroke();
  ell(ctx, sx - 15.5 * d, sy - 6.5, 1.8, 2.4, look.spots ?? '#3e2723');
  // Corps.
  ctx.save();
  rrect(ctx, sx - 14, sy - 23, 28, 15, 7, look.coat);
  ctx.clip();
  ell(ctx, sx, sy - 9, 14, 3, shade(look.coat, -0.12));
  if (look.spots) {
    ell(ctx, sx - 6 * d, sy - 18, 5, 4, look.spots, 0.4);
    ell(ctx, sx + 4 * d, sy - 13, 4.2, 3.4, look.spots, -0.3);
    ell(ctx, sx - 12 * d, sy - 11, 3.2, 3, look.spots);
  }
  ell(ctx, sx - 3, sy - 21, 9, 2, shade(look.coat, 0.18));
  ctx.restore();
  if (look.spots) ell(ctx, sx + 3 * d, sy - 7.5, 3.2, 2.2, '#f8bbd0');
  cowHead(ctx, sx + 15 * d, sy - (graze ? 9 : 21), d, look);
}

// ——— Auvents, enseignes ———

/** Auvent rayé bombé avec lambrequin festonné. */
function bulgeAwning(
  p: IsoPainter,
  side: Side,
  a: number,
  b: number,
  zTop: number,
  plane: number,
  colors: readonly [string, string],
  depth = 0.26,
  drop = 12,
): void {
  const stripes = Math.max(4, Math.round((b - a) * 8));
  const step = (b - a) / stripes;
  const K = 6;
  const prof = (k: number): [number, number] => {
    const t = (k / K) * (Math.PI / 2);
    return [depth * Math.sin(t), zTop - drop * (1 - Math.cos(t))];
  };
  const { ctx } = p;
  for (let i = 0; i < stripes; i++) {
    const s = a + i * step;
    const e = s + step;
    const color = tone(side, colors[i % 2]!);
    const [fx, fz] = prof(K);
    const [x0, y0] = scr(p, side, s, plane + fx, fz);
    const [x1, y1] = scr(p, side, e, plane + fx, fz);
    ctx.fillStyle = shade(color, -0.12);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 + 3);
    ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 8, x0, y0 + 3);
    ctx.closePath();
    ctx.fill();
    for (let k = 0; k < K; k++) {
      const [o0, z0] = prof(k);
      const [o1, z1] = prof(k + 1);
      p.fill(
        [
          pt(side, s, plane + o0, z0),
          pt(side, e, plane + o0, z0),
          pt(side, e, plane + o1, z1),
          pt(side, s, plane + o1, z1),
        ],
        shade(color, 0.14 - k * 0.04),
      );
    }
  }
  const [fo, fz] = prof(K);
  p.line(pt(side, a, plane + fo, fz), pt(side, b, plane + fo, fz), 'rgba(255,255,255,0.55)', 1.2);
  p.line(pt(side, a, plane, zTop), pt(side, b, plane, zTop), shade(colors[0], -0.35), 2.5);
}

/** Enseigne en relief : panneau épais, bordure claire et lettres ombrées. */
function reliefSign(
  p: IsoPainter,
  side: Side,
  a: number,
  b: number,
  za: number,
  zb: number,
  plane: number,
  bg: string,
  fg: string,
  text: string,
  border = '#ffffff',
): void {
  const out = 0.07;
  faceBox(p, side, a, b, za, zb, plane, out, bc(border));
  const f = plane + out;
  quad(p, side, a + 0.035, b - 0.035, za + 2.5, zb - 2.5, f, tone(side, bg));
  const size = Math.max(8, Math.min(15, (zb - za) * 0.62));
  const maxWidth = (b - a - 0.1) * FACE_PX * 0.92;
  const label = signText(text);
  const font = `900 ${size}px system-ui, sans-serif`;
  const zm = (za + zb) / 2;
  p.faceText(side, label, (a + b) / 2, f, zm - 1.2, font, shade(bg, -0.45), maxWidth);
  p.faceText(side, label, (a + b) / 2, f, zm, font, fg, maxWidth);
  for (const t of [a + 0.06, b - 0.06]) {
    const [x, y] = scr(p, side, t, f, zm);
    ell(p.ctx, x, y, 1.6, 1.6, '#ffd54f');
  }
}

/** Vitrine éclairée : cadre, intérieur chaud, étagères garnies, reflet et rebord. */
function shopWindow(
  p: IsoPainter,
  side: Side,
  a: number,
  b: number,
  za: number,
  zb: number,
  plane: number,
  frame: string,
  goods: (x: number, y: number, row: number) => void,
): void {
  const f = tone(side, frame);
  quad(p, side, a - 0.035, b + 0.035, za - 3, zb + 3, plane, f);
  quad(p, side, a, b, za, zb, plane, p.gradient(pt(side, a, plane, zb), pt(side, a, plane, za), '#fff7e0', '#f3c98d'));
  const rows = [za + 3, za + (zb - za) * 0.52];
  const n = Math.max(2, Math.round((b - a) * 8));
  rows.forEach((z, row) => {
    quad(p, side, a, b, z - 2, z, plane, tone(side, '#8d5a3b'));
    for (let i = 0; i < n; i++) {
      const [x, y] = scr(p, side, a + ((b - a) * (i + 0.5)) / n, plane, z);
      goods(x, y, row);
    }
  });
  const { ctx } = p;
  ctx.save();
  ctx.globalAlpha = 0.28;
  const m = (t: number) => a + (b - a) * t;
  p.fill(
    [
      pt(side, m(0.55), plane, zb),
      pt(side, m(0.75), plane, zb),
      pt(side, m(0.35), plane, za),
      pt(side, m(0.15), plane, za),
    ],
    '#ffffff',
  );
  ctx.restore();
  p.line(pt(side, m(0.5), plane, za), pt(side, m(0.5), plane, zb), f, 2.4);
  faceBox(p, side, a - 0.06, b + 0.06, za - 6, za - 2, plane, 0.06, bc(shade(frame, 0.1)));
}

/** Porte pleine à imposte vitrée. */
function plankDoor(p: IsoPainter, side: Side, c: number, w: number, h: number, plane: number, color: string) {
  const a = c - w / 2;
  const b = c + w / 2;
  quad(p, side, a - 0.035, b + 0.035, 0, h + 4, plane, tone(side, '#ffffff'));
  quad(p, side, a, b, 0, h, plane, tone(side, color));
  for (let t = a + 0.05; t < b - 0.02; t += 0.05)
    p.line(pt(side, t, plane, 0), pt(side, t, plane, h - 8), tone(side, shade(color, -0.18)), 1);
  quad(p, side, a + 0.03, b - 0.03, h - 7, h - 2, plane, tone(side, '#ffe9bf'));
  const [kx, ky] = scr(p, side, b - 0.05, plane, h * 0.42);
  ell(p.ctx, kx, ky, 1.7, 1.7, '#ffd54f');
}

/** Ardoise sur chevalet. */
function chalkboard(gp: IsoPainter, p: IsoPainter, x: number, y: number): void {
  softDot(gp, x, y, 0.07);
  p.line([x - 0.06, y + 0.04, 0], [x - 0.06, y, 20], '#8d6e63', 2.4);
  p.line([x + 0.06, y + 0.04, 0], [x + 0.06, y, 20], '#8d6e63', 2.4);
  p.leftQuad(x - 0.06, x + 0.06, 5, 20, y + 0.02, '#37474f');
  for (const [z, c] of [
    [16, '#ffffff'],
    [12, '#ffcc80'],
    [8.5, '#ffffff'],
  ] as const)
    p.line([x - 0.035, y + 0.02, z], [x + 0.035, y + 0.02, z], c, 1.2);
}

// ——— Poulailler ———

const chickenCoop: Hero = {
  height: 92,
  draw: (gp, p) => {
    lot(gp, 2, '#9ccf63');
    gp.flat(0.1, 0.95, 1.92, 1.92, 0, '#d8bd8a');
    gp.flat(0.45, 1.3, 1.5, 1.8, 0, '#cfae74');
    speckle(gp, 0.3, 1.1, 1.8, 1.85, 40, '#f2d27a', 1.1);
    softShadow(gp, 0.18, 0.18, 1.1, 0.95, 0.3);

    // Mini-silo à grain et arbuste derrière l'enclos.
    roundBush(p, 1.75, 0.22, 9, '#5cbf32');
    cylinder(p, 1.5, 0.48, 0, 38, 0.17, '#cfd8dc');
    for (let z = 5; z < 38; z += 5) hoop(p, 1.5, 0.48, z, 0.17, '#a7b6bd', 1);
    dome(p, 1.5, 0.48, 38, 0.17, 14, RED, true);
    p.line([1.62, 0.6, 2], [1.62, 0.6, 34], '#78909c', 1.4);
    sack(p, 1.82, 0.62, 0, '#e9d6a8', '#e53935');
    sack(p, 1.8, 0.78, 0, '#efe3c6', '#e53935');

    // Clôture arrière de l'enclos.
    p.fence([1.12, 0.96], [1.92, 0.96], '#ffffff', 10);
    p.fence([0.08, 0.96], [0.08, 1.92], '#ffffff', 10);

    // Poulailler en planches sur pilotis.
    const [x0, y0, x1, y1] = [0.2, 0.2, 1.08, 0.86];
    const zf = 8;
    const h = 36;
    const wood = '#d39b5a';
    for (const [x, y] of [
      [x0 + 0.04, y1 - 0.04],
      [x1 - 0.04, y1 - 0.04],
      [x1 - 0.04, y0 + 0.04],
    ] as const)
      p.box(x - 0.03, y - 0.03, x + 0.03, y + 0.03, 0, zf, boxColors('#6d4c41', false));
    p.box(x0, y0, x1, y1, zf, h, boxColors(wood, false));
    ribsL(p, x0, x1, y1, zf, h, shade(wood, -0.18), 0.07);
    ribsR(p, y0, y1, x1, zf, h, shade(wood, -0.38), 0.07);
    p.leftQuad(x0, x0 + 0.04, zf, h, y1, '#ffffff');
    p.leftQuad(x1 - 0.04, x1, zf, h, y1, '#ffffff');
    p.rightQuad(y0, y0 + 0.04, zf, h, x1, '#e3e6e8');
    p.line([x0, y1, zf], [x1, y1, zf], '#ffffff', 2.5);
    // Trappe à poules et rampe à tasseaux.
    p.leftQuad(0.36, 0.56, zf, zf + 16, y1, '#ffffff');
    p.leftQuad(0.39, 0.53, zf, zf + 13, y1, '#4e342e');
    p.fill(
      [
        [0.39, y1, zf],
        [0.53, y1, zf],
        [0.53, y1 + 0.34, 0],
        [0.39, y1 + 0.34, 0],
      ],
      '#c08a50',
    );
    for (let t = 0.2; t < 1; t += 0.25)
      p.line([0.39, y1 + 0.34 * t, zf * (1 - t)], [0.53, y1 + 0.34 * t, zf * (1 - t)], '#7a5230', 1.6);
    // Pondoir en appentis.
    p.box(0.74, y1, 1.0, y1 + 0.16, zf + 4, zf + 18, boxColors('#c08a50'));
    p.fill(
      [
        [0.72, y1, zf + 24],
        [1.02, y1, zf + 24],
        [1.02, y1 + 0.2, zf + 17],
        [0.72, y1 + 0.2, zf + 17],
      ],
      '#b23a2b',
    );
    p.line([0.72, y1 + 0.2, zf + 17], [1.02, y1 + 0.2, zf + 17], '#ffffff', 2.2);
    for (const dx of [0.8, 0.9]) p.dot(dx, y1 + 0.1, zf + 20, 2.3, '#fff8e1');
    // Fenêtre ronde sur le pignon.
    const [wx, wy] = p.p(x1, 0.53, 26);
    ell(p.ctx, wx, wy, 6, 6.5, '#ffffff');
    ell(p.ctx, wx, wy, 4.2, 4.8, '#ffe082');
    p.line([x1, 0.53, 21.5], [x1, 0.53, 30.5], '#ffffff', 1.4);
    p.gableRoofX(x0, y0, x1, y1, h, 22, '#c94a33', shade(wood, -0.05), 0.12);
    // Girouette à coq.
    p.line([0.64, 0.53, h + 22], [0.64, 0.53, h + 36], '#424242', 2);
    p.line([0.56, 0.53, h + 30], [0.72, 0.53, h + 30], '#424242', 1.4);
    hen(p, 0.64, 0.53, false, '#37474f', false, h + 34);

    // Mangeoire, abreuvoir, paille et volailles.
    p.box(0.62, 1.26, 1.04, 1.4, 0, 7, bc('#8d6e63'));
    p.flat(0.64, 1.28, 1.02, 1.38, 7, '#f2c94c');
    cylinder(p, 1.38, 1.18, 0, 4, 0.11, '#e53935');
    cylinder(p, 1.38, 1.18, 4, 16, 0.06, '#90caf9');
    dome(p, 1.38, 1.18, 16, 0.06, 5, '#e53935');
    hayBale(p, 1.72, 1.2);
    hen(p, 0.3, 1.3, true, '#ffffff', true);
    hen(p, 0.9, 1.14, false, '#ffffff', true);
    hen(p, 1.2, 1.48, false, '#c8743c');
    chick(p, 1.34, 1.58);
    chick(p, 1.42, 1.66, true);
    hen(p, 0.55, 1.62, true);
    hen(p, 1.0, 1.75, false);
    chick(p, 0.78, 1.8);
    hen(p, 1.62, 1.66, true, '#ffffff', true);

    // Clôture avant, portillon et buisson.
    p.fence([0.08, 1.92], [1.92, 1.92], '#ffffff', 10);
    p.fence([1.92, 0.96], [1.92, 1.92], '#ffffff', 10);
    roundBush(p, 0.22, 1.86, 7);
  },
};

// ——— Étable ———

const cowshed: Hero = {
  height: 104,
  draw: (gp, p) => {
    lot(gp, 3, '#9ccf63');
    gp.flat(0.1, 1.3, 2.92, 1.56, 0, '#d8bd8a');
    gp.flat(2.3, 0.4, 2.92, 1.4, 0, '#d8bd8a');
    gp.flat(0.1, 1.56, 2.92, 2.92, 0, '#8fd14f');
    gp.flat(1.1, 2.05, 1.9, 2.55, 0, '#b59a6a');
    speckle(gp, 0.2, 1.7, 2.8, 2.85, 26, '#6fae35', 1.6);
    softShadow(gp, 0.22, 0.18, 2.3, 1.26, 0.3);

    // Grande étable en bois rouge, longue selon x.
    const [x0, y0, x1, y1] = [0.22, 0.18, 2.28, 1.24];
    const h = 40;
    const wall = '#b8402c';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall, false));
    ribsL(p, x0, x1, y1, 8, h, shade(wall, -0.15), 0.07);
    ribsR(p, y0, y1, x1, 8, h, shade(wall, -0.35), 0.07);
    p.leftQuad(x0, x1, 0, 8, y1, '#a8a296');
    p.rightQuad(y0, y1, 0, 8, x1, '#878176');
    for (let z = 2.7; z < 8; z += 2.7) {
      p.line([x0, y1, z], [x1, y1, z], '#c9c3b6', 1);
      p.line([x1, y1, z], [x1, y0, z], '#a29c90', 1);
    }
    p.leftQuad(x0, x0 + 0.05, 8, h, y1, '#ffffff');
    p.leftQuad(x1 - 0.05, x1, 8, h, y1, '#ffffff');
    p.rightQuad(y0, y0 + 0.05, 8, h, x1, '#e3e6e8');
    p.line([x0, y1, h - 1], [x1, y1, h - 1], '#ffffff', 3);
    // Box à vaches : demi-portes avec une tête qui dépasse.
    const stalls = [0.52, 0.98, 1.44, 1.9];
    stalls.forEach((c, i) => {
      p.leftQuad(c - 0.15, c + 0.15, 12, 32, y1, '#ffffff');
      p.leftQuad(c - 0.12, c + 0.12, 14, 30, y1, '#3e2723');
      p.leftQuad(c - 0.12, c + 0.12, 14, 20, y1, '#8e2f20');
      p.line([c - 0.12, y1, 14], [c + 0.12, y1, 20], '#ffffff', 1.6);
      if (i === 1 || i === 3) {
        const [hx, hy] = p.p(c, y1 + 0.04, 26);
        cowHead(p.ctx, hx, hy, i === 1 ? -1 : 1, HOLSTEIN);
      }
    });
    p.gableRoofX(x0, y0, x1, y1, h, 30, '#5f6f7a', wall);
    // Grande porte coulissante et porte du fenil sur le pignon.
    const ym = (y0 + y1) / 2;
    barnDoor(p, 'right', ym - 0.26, ym + 0.26, 32, x1, '#a32519');
    p.box(x1, ym - 0.36, x1 + 0.03, ym + 0.36, 36, 38, boxColors('#455a64', false));
    p.rightQuad(ym - 0.1, ym + 0.1, h + 4, h + 18, x1, '#ffffff');
    p.rightQuad(ym - 0.075, ym + 0.075, h + 5.5, h + 16, x1, '#4e342e');
    for (let i = 0; i < 4; i++) p.dot(x1 + 0.01, ym - 0.06 + i * 0.04, h + 7 + (i % 2) * 2, 2.8, '#f2cf55');
    for (const x of [0.75, 1.75]) cupola(p, x, ym, h + 26, 0.09, '#5f6f7a');

    // Bidons de lait près de la porte, foin.
    milkCan(p, 2.42, 0.5);
    milkCan(p, 2.5, 0.62);
    milkCan(p, 2.4, 0.66);
    squareBale(p, 2.55, 1.0);
    squareBale(p, 2.58, 1.02, 11);

    // Pré clôturé, râtelier, abreuvoir et vaches pie.
    p.fence([0.08, 1.56], [2.92, 1.56], '#ffffff', 12);
    p.fence([0.08, 1.56], [0.08, 2.92], '#ffffff', 12);
    p.box(0.25, 1.72, 0.75, 1.9, 0, 6, bc('#8d6e63'));
    p.box(0.25, 1.72, 0.75, 1.9, 6, 14, bc('#e8c547'));
    for (let x = 0.3; x < 0.75; x += 0.08) p.line([x, 1.9, 6], [x, 1.9, 18], '#6d4c41', 1.6);
    p.line([0.25, 1.9, 18], [0.75, 1.9, 18], '#6d4c41', 2.2);
    trough(p, 2.25, 1.7, 2.75, 1.86);
    softDot(gp, 1.0, 2.05, 0.22);
    cow(p, 1.0, 2.05, HOLSTEIN, false, true);
    softDot(gp, 2.05, 2.0, 0.22);
    cow(p, 2.05, 2.0, HOLSTEIN, true);
    hayBale(p, 2.6, 2.45);
    softDot(gp, 1.45, 2.6, 0.22);
    cow(p, 1.45, 2.6, HOLSTEIN, false);
    roundBush(p, 0.3, 2.75, 8);
    p.fence([0.08, 2.92], [2.92, 2.92], '#ffffff', 12);
    p.fence([2.92, 1.56], [2.92, 2.92], '#ffffff', 12);
  },
};

// ——— Ferme d'élevage ———

const cattleRanch: Hero = {
  height: 156,
  draw: (gp, p) => {
    lot(gp, 3, '#9ccf63');
    gp.flat(0.1, 1.45, 2.92, 2.92, 0, '#c9a46a');
    gp.flat(1.55, 0.85, 2.92, 1.45, 0, '#c9a46a');
    gp.flat(0.5, 1.9, 1.4, 2.4, 0, '#b8925a');
    gp.flat(1.9, 1.1, 2.6, 1.6, 0, '#b8925a');
    gp.flat(0.4, 2.62, 0.95, 2.98, 0, '#d8bd8a');
    speckle(gp, 0.2, 1.5, 2.8, 2.85, 30, '#a07c48', 1.5);
    softShadow(gp, 0.2, 0.2, 1.38, 1.3, 0.3);

    // Grand silo à dôme vert.
    const [sx, sy, sr] = [1.8, 0.42, 0.26];
    cylinder(p, sx, sy, 0, 104, sr, '#c9bfae');
    for (let z = 14; z < 104; z += 15) hoop(p, sx, sy, z, sr, '#a39885', 1.4);
    hoop(p, sx, sy, 100, sr, '#4e7d3a', 5);
    dome(p, sx, sy, 104, sr, 20, '#5b8c3a');
    for (let z = 8; z < 100; z += 7) p.line([sx + 0.16, sy + 0.22, z], [sx + 0.24, sy + 0.18, z], '#5d4037', 1.2);
    p.line([sx + 0.16, sy + 0.22, 2], [sx + 0.16, sy + 0.22, 102], '#5d4037', 1.6);
    p.line([sx + 0.24, sy + 0.18, 2], [sx + 0.24, sy + 0.18, 102], '#5d4037', 1.6);

    // Éolienne de pompage en treillis.
    const [wx, wy] = [2.58, 0.5];
    const top = 92;
    for (const [dx, dy] of [
      [-0.12, -0.12],
      [0.12, -0.12],
      [0.12, 0.12],
      [-0.12, 0.12],
    ] as const)
      p.line([wx + dx, wy + dy, 0], [wx + dx * 0.2, wy + dy * 0.2, top], '#8d6e63', 2.2);
    for (let z = 18; z < top; z += 20) {
      const k = 1 - (z / top) * 0.8;
      p.line([wx - 0.12 * k, wy + 0.12 * k, z], [wx + 0.12 * k, wy + 0.12 * k, z], '#8d6e63', 1.4);
      p.line([wx + 0.12 * k, wy + 0.12 * k, z], [wx + 0.12 * k, wy - 0.12 * k, z], '#8d6e63', 1.4);
    }
    {
      const [hx, hy] = p.p(wx, wy + 0.04, top + 4);
      const { ctx } = p;
      ctx.fillStyle = '#b0bec5';
      ctx.beginPath();
      ctx.moveTo(hx + 2, hy - 2);
      ctx.lineTo(hx + 22, hy - 12);
      ctx.lineTo(hx + 22, hy + 2);
      ctx.lineTo(hx + 2, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = RED;
      ctx.fillRect(hx + 14, hy - 8, 8, 9);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(a);
        ctx.fillStyle = i % 2 ? '#eceff1' : '#cfd8dc';
        ctx.beginPath();
        ctx.moveTo(-1.2, 3);
        ctx.lineTo(-3, 16);
        ctx.lineTo(3, 16);
        ctx.lineTo(1.2, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ell(ctx, hx, hy, 3.4, 3.4, '#455a64');
    }

    // Écurie en bois brun, toit vert, pignon de face.
    const [x0, y0, x1, y1] = [0.2, 0.2, 1.38, 1.28];
    const h = 38;
    const wood = '#9a5b34';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wood, false));
    ribsL(p, x0, x1, y1, 0, h, shade(wood, -0.18), 0.07);
    ribsR(p, y0, y1, x1, 0, h, shade(wood, -0.38), 0.07);
    p.leftQuad(x0, x0 + 0.05, 0, h, y1, '#f3e5c0');
    p.leftQuad(x1 - 0.05, x1, 0, h, y1, '#f3e5c0');
    p.rightQuad(y0, y0 + 0.05, 0, h, x1, '#d8cba8');
    for (const y of [0.45, 0.95]) {
      p.rightQuad(y - 0.12, y + 0.12, 16, 30, x1, '#f3e5c0');
      p.rightQuad(y - 0.09, y + 0.09, 18, 28, x1, '#4e342e');
      p.line([x1, y - 0.09, 18], [x1, y + 0.09, 28], '#f3e5c0', 1.6);
    }
    p.gableRoofY(x0, y0, x1, y1, h, 36, '#5b8c3a', shade(wood, 0.04));
    const xm = (x0 + x1) / 2;
    for (const xe of [x0 - 0.14, x1 + 0.14]) p.line([xe, y1 + 0.14, h - 3], [xm, y1 + 0.14, h + 36], '#f3e5c0', 3.5);
    ribsL(p, x0 + 0.24, x1 - 0.24, y1, h, h + 22, shade(wood, -0.15), 0.07);
    barnDoor(p, 'left', xm - 0.3, xm + 0.3, 30, y1, '#7a4426');
    p.leftQuad(xm - 0.1, xm + 0.1, h + 6, h + 22, y1, '#f3e5c0');
    p.leftQuad(xm - 0.075, xm + 0.075, h + 7.5, h + 19, y1, '#4e342e');
    for (let i = 0; i < 4; i++) p.dot(xm - 0.06 + i * 0.04, y1, h + 9 + (i % 2) * 2, 2.8, '#f2cf55');
    // Fer à cheval porte-bonheur.
    {
      const [hx, hy] = p.p(xm, y1 + 0.01, h + 29);
      const { ctx } = p;
      ctx.strokeStyle = '#90a4ae';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(hx, hy, 4, Math.PI * 0.85, Math.PI * 2.15, true);
      ctx.stroke();
    }

    // Foin et sacs contre l'écurie.
    squareBale(p, 1.44, 0.95);
    squareBale(p, 1.44, 1.12);
    squareBale(p, 1.46, 1.03, 11);
    sack(p, 1.5, 0.3, 0, '#efe3c6', '#43a047');

    // Clôtures arrière du corral (lisses en bois).
    const rail = '#a1673f';
    p.fence([1.56, 0.86], [2.92, 0.86], rail, 13);
    p.fence([1.56, 0.86], [1.56, 1.46], rail, 13);
    p.fence([0.08, 1.46], [1.56, 1.46], rail, 13);
    p.fence([0.08, 1.46], [0.08, 2.92], rail, 13);
    trough(p, 2.2, 1.0, 2.75, 1.16);
    p.line([wx, wy + 0.12, 14], [2.4, 1.0, 10], '#78909c', 2.4);

    // Troupeau de bœufs bruns à tête blanche.
    const herd: [number, number, boolean, boolean][] = [
      [2.4, 1.35, true, true],
      [0.75, 1.85, false, false],
      [1.7, 1.95, true, true],
      [2.45, 2.15, true, false],
      [1.15, 2.5, false, true],
      [2.05, 2.65, false, false],
    ];
    for (const [x, y, flip, graze] of herd) {
      softDot(gp, x, y, 0.22);
      cow(p, x, y, HEREFORD, flip, graze);
    }
    hayBale(p, 0.35, 2.2);

    // Clôtures avant et portail du ranch.
    p.fence([0.08, 2.92], [0.38, 2.92], rail, 13);
    p.fence([0.92, 2.92], [2.92, 2.92], rail, 13);
    p.fence([2.92, 0.86], [2.92, 2.92], rail, 13);
    for (const x of [0.38, 0.92]) p.box(x - 0.035, 2.89, x + 0.035, 2.96, 0, 46, bc('#8d5a3b'));
    p.box(0.3, 2.9, 1.0, 2.95, 46, 51, bc('#8d5a3b'));
    p.box(0.48, 2.95, 0.82, 2.97, 31, 42, bc('#f3e5c0'));
    p.line([0.52, 2.96, 42], [0.52, 2.96, 46], '#5d4037', 1.2);
    p.line([0.78, 2.96, 42], [0.78, 2.96, 46], '#5d4037', 1.2);
    {
      const [hx, hy] = p.p(0.65, 2.98, 36.5);
      cowHead(p.ctx, hx, hy, 1, { coat: '#9a4f2c', face: '#ffffff', horns: true });
    }
  },
};

// ——— Moulin ———

const mill: Hero = {
  height: 150,
  draw: (gp, p) => {
    lot(gp, 2, '#9ccf63');
    gp.flat(0.75, 1.15, 1.15, 1.98, 0, '#d8bd8a');
    gp.flat(1.2, 1.3, 1.9, 1.9, 0, '#cfae74');
    // Chaumes du champ moissonné, où sèchent les gerbes.
    gp.flat(0.06, 1.1, 0.6, 1.94, 0, '#e2bd4f');
    for (let y = 1.18; y < 1.94; y += 0.1) gp.line([0.08, y, 0], [0.58, y, 0], '#c79a2e', 2);
    softDot(gp, 0.8, 0.8, 0.55);

    roundBush(p, 1.7, 0.25, 10, '#5cbf32');
    roundBush(p, 0.25, 0.3, 8);

    // Tour de pierre enduite, légèrement conique.
    const [cx, cy] = [0.8, 0.8];
    const zt = 92;
    cylinder(p, cx, cy, 0, 12, 0.5, '#a1887f');
    for (let z = 4; z < 12; z += 4) hoop(p, cx, cy, z, 0.5, '#7b665d', 1.2);
    frustum(p, cx, cy, 12, zt, 0.44, 0.32, '#f3ead8');
    hoop(p, cx, cy, 13, 0.44, '#d4c6a8', 2);
    // Pierres d'angle apparentes et fenêtres.
    const { ctx } = p;
    const [bx, by] = p.p(cx, cy, 0);
    for (const [dx, z, w] of [
      [-22, 26, 9],
      [-25, 52, 8],
      [18, 40, 8],
      [14, 70, 7],
    ] as const)
      rrect(ctx, bx + dx - w / 2, by - z, w, 5, 1.5, '#d8cbb0');
    for (const [dx, z, w] of [
      [-18, 30, 8],
      [24, 30, 7],
      [-12, 62, 7],
    ] as const) {
      rrect(ctx, bx + dx - w / 2 - 2, by - z - 13, w + 4, 16, 3, '#ffffff');
      rrect(ctx, bx + dx - w / 2, by - z - 11, w, 12, 2, '#4fa8d8');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + dx - 0.6, by - z - 11, 1.2, 12);
    }
    // Porte cintrée.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + 15);
    ctx.lineTo(bx - 4, by - 8);
    ctx.arc(bx + 6, by - 8, 10, Math.PI, 0);
    ctx.lineTo(bx + 16, by + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a4a2a';
    ctx.beginPath();
    ctx.moveTo(bx - 1, by + 14);
    ctx.lineTo(bx - 1, by - 8);
    ctx.arc(bx + 6, by - 8, 7, Math.PI, 0);
    ctx.lineTo(bx + 13, by + 12);
    ctx.closePath();
    ctx.fill();
    ell(ctx, bx + 10, by + 2, 1.4, 1.4, '#ffd54f');
    // Galerie de bois à mi-hauteur.
    hoop(p, cx, cy, 36, 0.5, '#6d4c41', 3.5);
    for (const a of [0.15, 0.32, 0.5, 0.68, 0.85]) {
      const [gx, gy] = p.p(cx, cy, 36);
      const ox = Math.cos(Math.PI * a) * 0.5 * RX;
      const oy = Math.sin(Math.PI * a) * 0.5 * RY;
      ctx.strokeStyle = '#6d4c41';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx + ox, gy + oy);
      ctx.lineTo(gx + ox, gy + oy - 9);
      ctx.stroke();
    }
    hoop(p, cx, cy, 45, 0.5, '#8d6e63', 2.2);
    // Calotte en bardeaux.
    cylinder(p, cx, cy, zt, zt + 4, 0.36, '#6d4c41');
    dome(p, cx, cy, zt + 4, 0.37, 30, '#b5523b');
    for (const k of [0.35, 0.62]) {
      const [kx, ky] = p.p(cx, cy, zt + 4);
      ctx.strokeStyle = 'rgba(80,30,20,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky - 30 * k, 0.37 * RX * Math.sqrt(1 - k * k), 6, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
    p.dot(cx, cy, zt + 36, 3.5, '#6d4c41');

    // Ailes à claire-voie, dans le plan de la façade gauche.
    const yf = cy + 0.46;
    const zh = zt + 6;
    const L = 74;
    const W = 17;
    const fp = (u: number, v: number): V3 => [cx + 0.3 + u / FACE_PX, yf, zh + v];
    p.line([cx, cy, zh], fp(0, 0), '#5d4037', 6);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 2;
      const [ux, uy] = [Math.cos(a), Math.sin(a)];
      const [nx, ny] = [-uy, ux];
      const at = (s: number, w: number) => fp(ux * s + nx * w, uy * s + ny * w);
      p.fill([at(L * 0.22, 0), at(L, 0), at(L, W), at(L * 0.22, W)], '#f7f1e3');
      for (let k = 1; k < 6; k++) {
        const s = L * 0.22 + ((L * 0.78) / 6) * k;
        p.line(at(s, 0), at(s, W), '#8d6e63', 1.2);
      }
      p.line(at(L * 0.22, W * 0.5), at(L, W * 0.5), '#8d6e63', 1);
      p.line(at(L * 0.22, W), at(L, W), '#6d4c41', 1.8);
      p.line(at(L, 0), at(L, W), '#6d4c41', 1.8);
      p.line(at(0, 0), at(L + 3, 0), '#5d4037', 3.5);
    }
    const [hx, hy] = p.p(...fp(0, 0));
    ell(ctx, hx, hy, 6, 6, '#5d4037');
    ell(ctx, hx - 1, hy - 1, 2.4, 2.4, '#a1887f');

    p.fence([1.94, 0.06], [1.94, 1.15], '#ffffff', 11);
    roundBush(p, 1.8, 0.82, 8, '#5cbf32');
    // Sacs de farine, charrette et gerbes.
    sheaf(p, 0.2, 1.4);
    sheaf(p, 0.38, 1.62);
    sheaf(p, 0.18, 1.75);
    p.box(1.3, 1.32, 1.8, 1.62, 9, 15, bc('#a1673f'));
    p.line([1.3, 1.62, 13], [1.0, 1.82, 4], '#6d4c41', 2.5);
    for (const x of [1.36, 1.74]) {
      const [ex, ey] = p.p(x, 1.63, 8);
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6.5, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      p.line([x, 1.63, 1], [x, 1.63, 15], '#5d4037', 1.2);
    }
    sack(p, 1.45, 1.44, 15);
    sack(p, 1.65, 1.44, 15);
    sack(p, 1.55, 1.55, 15);
    sack(p, 1.15, 1.9);
    sack(p, 1.32, 1.88);
    sack(p, 1.22, 1.8, 13);
    // Meule de pierre posée contre la tour.
    const [mx, my] = p.p(1.36, 0.95, 0);
    ell(ctx, mx, my - 12, 9, 12, '#9e9e9e');
    ell(ctx, mx + 2, my - 12, 7, 10, '#bdbdbd');
    ell(ctx, mx + 2, my - 12, 2, 2.6, '#757575');
  },
};

// ——— Fournil ———

const bakehouse: Hero = {
  height: 128,
  draw: (gp, p) => {
    pavedLot(gp, 2, '#e8dfd0', [[0.02, 0.02, 0.18, 1.98]]);
    softShadow(gp, 0.22, 0.2, 1.84, 1.26);

    // Four à pain : annexe de briques, dôme et haute cheminée.
    const brick = '#b5523b';
    const [ax0, ay0, ax1, ay1] = [1.38, 0.3, 1.84, 1.02];
    p.box(1.5, 0.42, 1.68, 0.6, 26, 92, bc(brick));
    bricks(p, 1.5, 0.42, 1.68, 0.6, 26, 92, brick);
    p.box(1.47, 0.39, 1.71, 0.63, 92, 97, bc('#6d4c41'));
    p.box(ax0, ay0, ax1, ay1, 0, 26, bc(brick));
    bricks(p, ax0, ay0, ax1, ay1, 0, 26, brick);
    p.box(ax0 - 0.02, ay0 - 0.02, ax1 + 0.02, ay1 + 0.02, 26, 29, bc('#d7ccc8'));
    // Bouche du four, braises.
    const ym = 0.66;
    p.rightQuad(ym - 0.17, ym + 0.17, 4, 18, ax1, '#efe2cc');
    p.rightQuad(ym - 0.13, ym + 0.13, 6, 15, ax1, '#3e2723');
    p.rightQuad(ym - 0.11, ym + 0.11, 6, 9, ax1, '#ff9800');
    for (let i = 0; i < 4; i++) p.dot(ax1, ym - 0.08 + i * 0.055, 8, 1.6, '#ffeb3b');
    {
      const [ox, oy] = p.p(ax1, ym, 18);
      const { ctx } = p;
      ctx.fillStyle = '#efe2cc';
      ctx.beginPath();
      ctx.ellipse(ox, oy, 12, 7, -0.46, Math.PI, 0);
      ctx.fill();
    }
    smoke(p, 1.59, 0.51, 98);

    // Atelier : enduit crème, colombages, soubassement de briques.
    const [x0, y0, x1, y1] = [0.24, 0.2, 1.38, 1.26];
    const h = 66;
    const wall = '#f6e2b8';
    walls(p, x0, y0, x1, y1, h, wall, '#ffffff', brick);
    p.leftQuad(x0, x1, 0, 6, y1, brick);
    for (const x of [0.62, 0.98]) p.leftQuad(x - 0.02, x + 0.02, 6, h, y1, '#8d5a3b');
    p.leftQuad(x0, x1, 40, 42, y1, '#8d5a3b');
    for (const y of [0.55, 0.95]) {
      p.rightQuad(y - 0.02, y + 0.02, 6, h, x1, '#7a4c31');
      p.window('right', y - 0.15, y - 0.04, 30, 40, x1, '#ffe0b2', '#ffffff');
    }
    p.rightQuad(0.2, 1.26, 40, 42, x1, '#7a4c31');
    // Vitrine à pains et porte.
    shopWindow(p, 'left', 0.34, 0.86, 10, 34, y1, '#ffffff', (sx, sy, row) => {
      const { ctx } = p;
      if (row === 0) {
        ell(ctx, sx, sy - 3.5, 4.6, 3.6, '#c98a3d');
        ell(ctx, sx - 1, sy - 4.6, 2.6, 1.4, '#e8b064');
      } else {
        ell(ctx, sx, sy - 6, 1.9, 6.5, '#d39b4a', -0.6);
        ell(ctx, sx - 0.6, sy - 6.4, 0.7, 4, '#f0c27a', -0.6);
      }
    });
    plankDoor(p, 'left', 1.14, 0.26, 36, y1, '#7a4a2a');
    bulgeAwning(p, 'left', x0 + 0.06, x1 - 0.06, 44, y1, ['#8d5a3b', '#fff3dc'], 0.22, 10);
    reliefSign(p, 'left', 0.36, 1.26, 46, 59, y1, '#6d4c41', '#ffe0b2', 'FOURNIL', '#f6e2b8');
    p.gableRoofX(x0, y0, x1, y1, h, 30, '#c8553d', wall, 0.14);
    p.window('right', 0.66, 0.8, h + 6, h + 16, x1, '#ffe0b2', '#ffffff');

    // Pain géant sur le faîtage : boule farinée et baguette croisée.
    {
      const [gx, gy] = p.p(0.78, 0.73, h + 30);
      const { ctx } = p;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.save();
      ctx.rotate(-0.5);
      ell(ctx, 4, -16, 30, 8, '#c4823a');
      ell(ctx, 3, -18, 27, 5, '#dda25a');
      ctx.strokeStyle = '#f6dca4';
      ctx.lineWidth = 2.2;
      for (const dx of [-14, -3, 8, 19]) {
        ctx.beginPath();
        ctx.moveTo(dx - 4, -17);
        ctx.lineTo(dx + 4, -20);
        ctx.stroke();
      }
      ctx.restore();
      const g = ctx.createRadialGradient(-7, -26, 3, 0, -16, 24);
      g.addColorStop(0, '#f2c27a');
      g.addColorStop(0.7, '#c98234');
      g.addColorStop(1, '#9c5a22');
      ell(ctx, 0, -14, 21, 15, g);
      ctx.strokeStyle = '#f9e6bf';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-10, -22);
      ctx.lineTo(9, -10);
      ctx.moveTo(-12, -13);
      ctx.lineTo(3, -4);
      ctx.moveTo(-3, -26);
      ctx.lineTo(13, -17);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const [dx, dy] of [
        [-8, -22],
        [-2, -25],
        [5, -21],
        [-12, -16],
      ] as const)
        ell(ctx, dx, dy, 1.6, 1.1, 'rgba(255,255,255,0.6)');
      ctx.restore();
    }

    // Étal de pains, bûches, sacs de farine.
    logPile(p, 1.9, 1.2);
    sack(p, 1.66, 1.36);
    sack(p, 1.82, 1.44);
    sack(p, 1.74, 1.52, 0, '#efe3c6', '#e57373');
    chalkboard(gp, p, 1.0, 1.72);
    softDot(gp, 0.42, 1.74, 0.24);
    p.box(0.24, 1.64, 0.62, 1.84, 0, 13, bc('#a1673f'));
    p.box(0.22, 1.62, 0.64, 1.86, 13, 15, bc('#fff3dc'));
    p.leftQuad(0.22, 0.64, 9, 13, 1.86, '#e57373');
    for (const [x, y] of [
      [0.33, 1.72],
      [0.5, 1.74],
    ] as const) {
      p.groundEllipse(x, y, 15, 0.07, '#a1673f');
      p.dot(x - 0.01, y, 20, 5, '#c98a3d');
      p.dot(x - 0.025, y - 0.015, 22, 2.4, '#e8b064');
    }
    for (const x of [0.36, 0.54]) {
      const [bx, by] = p.p(x, 1.66, 20);
      ell(p.ctx, bx, by, 2.2, 8, '#d39b4a', 0.35);
    }
    roundBush(p, 1.86, 1.86, 8);
    roundBush(p, 0.12, 1.86, 7, '#5cbf32');
  },
};

// ——— Fromagerie ———

/** Meule de fromage à pâte pressée (cylindre bas) avec croûte. */
function cheeseWheel(p: IsoPainter, x: number, y: number, z: number, r: number, h: number): void {
  cylinder(p, x, y, z, z + h, r, '#f2b632');
  hoop(p, x, y, z + h * 0.5, r, '#d99a1e', 1.2);
  p.groundEllipse(x, y, z + h, r * 0.82, '#ffe082');
}

/** Pointe de fromage à trous, pointe vers le spectateur. */
function cheeseWedge(p: IsoPainter, x: number, y: number, z: number, s: number, h: number): void {
  const T: V3 = [x + s, y + s, z];
  const A: V3 = [x, y + s * 0.62, z];
  const B: V3 = [x + s * 0.62, y, z];
  const up = (q: V3): V3 => [q[0], q[1], q[2] + h];
  p.fill([A, B, up(B), up(A)], '#f2b632');
  p.fill([A, T, up(T), up(A)], '#ffd54f');
  p.fill([T, B, up(B), up(T)], '#f5c033');
  p.fill([up(A), up(T), up(B)], '#ffe682');
  const { ctx } = p;
  for (const [u, v, r] of [
    [0.3, 0.35, 3.4],
    [0.62, 0.7, 2.6],
    [0.8, 0.3, 2],
  ] as const) {
    const q: V3 = [A[0] + (T[0] - A[0]) * u, A[1] + (T[1] - A[1]) * u, z + h * v];
    const [qx, qy] = p.p(...q);
    ell(ctx, qx, qy, r * 0.8, r, '#e0a21a');
  }
  for (const [u, v, r] of [
    [0.35, 0.6, 3],
    [0.7, 0.3, 2.4],
  ] as const) {
    const q: V3 = [T[0] + (B[0] - T[0]) * u, T[1] + (B[1] - T[1]) * u, z + h * v];
    const [qx, qy] = p.p(...q);
    ell(ctx, qx, qy, r * 0.8, r, '#d99a1e');
  }
  const [cx, cy] = p.p(x + s * 0.45, y + s * 0.5, z + h);
  ell(ctx, cx, cy, 3.6, 1.8, '#f2c94c');
}

const dairy: Hero = {
  height: 120,
  draw: (gp, p) => {
    pavedLot(gp, 2, '#e3e0d6', [[1.8, 0.02, 1.98, 1.98]]);
    softShadow(gp, 0.22, 0.2, 1.56, 1.3);

    const [x0, y0, x1, y1] = [0.22, 0.2, 1.56, 1.3];
    const h = 56;
    const wall = '#fff5dc';
    const blue = '#2f74c0';
    walls(p, x0, y0, x1, y1, h, wall, '#ffffff', '#7fa6c9');
    // Fenêtres à volets bleus sur le côté.
    for (const y of [0.5, 0.98]) {
      p.rightQuad(y - 0.2, y - 0.14, 16, 38, x1, shade(blue, -0.15));
      p.rightQuad(y + 0.14, y + 0.2, 16, 38, x1, shade(blue, -0.15));
      p.window('right', y - 0.12, y + 0.12, 16, 38, x1, '#86d3f5', '#ffffff');
      p.line([x1, y, 16], [x1, y, 38], '#ffffff', 1.6);
    }
    // Vitrine aux fromages et porte.
    shopWindow(p, 'left', 0.34, 0.92, 10, 34, y1, '#ffffff', (sx, sy, row) => {
      const { ctx } = p;
      if (row === 0) {
        ell(ctx, sx, sy - 2.5, 5, 2.4, '#e0a21a');
        ctx.fillStyle = '#f2b632';
        ctx.fillRect(sx - 5, sy - 6.5, 10, 4);
        ell(ctx, sx, sy - 6.5, 5, 2.4, '#ffe082');
      } else {
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx + 4, sy - 7);
        ctx.closePath();
        ctx.fill();
        ell(ctx, sx + 2, sy - 2, 1, 1.2, '#e0a21a');
      }
    });
    plankDoor(p, 'left', 1.22, 0.26, 36, y1, blue);
    bulgeAwning(p, 'left', x0 + 0.06, x1 - 0.06, 47, y1, [blue, '#ffffff'], 0.24, 10);
    // Toit plat à corniche et enseigne en façade.
    band(p, x0, y0, x1, y1, h - 2, h + 3, '#ffffff');
    p.box(x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h + 3, h + 7, bc('#cfd8dc'));
    p.flat(x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, h + 7, '#b0bec5');
    reliefSign(p, 'left', 0.34, 1.44, h - 7, h + 6, y1 + 0.03, '#ffca28', '#5d4037', 'FROMAGERIE', '#ffffff');
    // Fromage géant : meule entière et pointe à trous.
    p.groundEllipse(0.82, 0.72, h + 7, 0.36, 'rgba(0,0,0,0.18)');
    cheeseWheel(p, 0.74, 0.62, h + 7, 0.34, 22);
    cheeseWedge(p, 0.92, 0.86, h + 7, 0.36, 26);

    // Bidons de lait, meules sur tonneau, banc et arbuste.
    milkCan(p, 1.66, 0.42);
    milkCan(p, 1.72, 0.56);
    milkCan(p, 1.62, 0.6);
    softDot(gp, 0.55, 1.65, 0.18);
    cylinder(p, 0.55, 1.62, 0, 18, 0.11, '#8d5a30');
    hoop(p, 0.55, 1.62, 4, 0.11, '#4e342e');
    hoop(p, 0.55, 1.62, 14, 0.11, '#4e342e');
    cheeseWheel(p, 0.55, 1.62, 18, 0.1, 7);
    cheeseWheel(p, 0.55, 1.62, 25, 0.08, 6);
    softDot(gp, 1.05, 1.68, 0.2);
    p.box(0.84, 1.6, 1.24, 1.76, 0, 10, bc('#c48a52'));
    for (const x of [0.92, 1.04, 1.16]) cheeseWheel(p, x, 1.68, 10, 0.055, 5);
    p.leftQuad(0.84, 1.24, 3, 7, 1.76, '#8d5a3b');
    roundBush(p, 1.86, 1.4, 9);
    roundBush(p, 1.86, 1.8, 8, '#5cbf32');
    roundBush(p, 0.12, 1.86, 7);
  },
};

// ——— Conserverie ———

/** Boîte de conserve : corps argenté, étiquette et couvercle à moulures. */
function tinCan(p: IsoPainter, x: number, y: number, z: number, r: number, h: number, label = '#e53935'): void {
  cylinder(p, x, y, z, z + h, r, '#cfd8dc');
  cylinder(p, x, y, z + h * 0.16, z + h * 0.84, r * 1.005, label);
  hoop(p, x, y, z + h * 0.16, r, shade(label, -0.3), 1.2);
  hoop(p, x, y, z + h * 0.84, r, shade(label, -0.3), 1.2);
  p.groundEllipse(x, y, z + h, r * 0.86, '#b0bec5');
  p.groundEllipse(x, y, z + h, r * 0.7, '#e0e6ea');
}

const cannery: Hero = {
  height: 132,
  draw: (gp, p) => {
    lot(gp, 3, '#cfcac0');
    gp.flat(2.15, 0.15, 2.92, 2.92, 0, '#bdb7ab');
    gp.flat(0.1, 2.2, 2.92, 2.92, 0, '#bdb7ab');
    for (const x of [0.45, 0.95]) gp.line([x, 2.3, 0], [x, 2.88, 0], '#ffffff', 2.5);
    gp.line([2.2, 2.25, 0], [2.88, 2.25, 0], '#fdd835', 2.5);
    softShadow(gp, 0.22, 0.2, 2.1, 1.98, 0.3);

    // Haute cheminée de briques à l'arrière.
    const brick = '#b5523b';
    p.box(0.42, 0.34, 0.66, 0.58, 50, 126, bc('#a4472f'));
    bricks(p, 0.42, 0.34, 0.66, 0.58, 50, 126, '#a4472f');
    p.box(0.42, 0.34, 0.66, 0.58, 104, 110, bc('#ffffff'));
    p.box(0.39, 0.31, 0.69, 0.61, 126, 131, bc('#5d4037'));
    smoke(p, 0.54, 0.46, 132);

    // Halle de briques, grandes baies d'usine.
    const [x0, y0, x1, y1] = [0.24, 0.2, 2.08, 1.96];
    const h = 50;
    walls(p, x0, y0, x1, y1, h, brick, '#efe2cc', '#7a3526');
    bricks(p, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, 6, h, brick);
    for (const x of [0.88, 1.44]) p.leftQuad(x - 0.03, x + 0.03, 6, h, y1, '#efe2cc');
    for (const c of [0.56, 1.16]) p.window('left', c - 0.2, c + 0.2, 20, 40, y1, '#9fd8f5', '#eceff1');
    for (const c of [0.56, 1.16]) {
      p.line([c, y1, 20], [c, y1, 40], '#eceff1', 1.6);
      p.line([c - 0.2, y1, 30], [c + 0.2, y1, 30], '#eceff1', 1.6);
    }
    for (const c of [0.5, 0.98]) {
      p.window('right', c - 0.18, c + 0.18, 20, 40, x1, '#9fd8f5', '#eceff1');
      p.line([x1, c, 20], [x1, c, 40], '#eceff1', 1.6);
    }
    // Porte basculante et quai.
    p.leftQuad(1.52, 2.0, 0, 38, y1, '#37474f');
    p.leftQuad(1.55, 1.97, 0, 35, y1, '#eceff1');
    for (let z = 4; z < 35; z += 4) p.line([1.55, y1, z], [1.97, y1, z], '#b0bec5', 1);
    band(p, x0, y0, x1, y1, h - 3, h + 2, '#efe2cc');
    p.box(x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h + 2, h + 6, bc('#8d8a82'));
    p.flat(x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, h + 6, '#9e9a90');
    reliefSign(p, 'left', 0.34, 1.42, 42, 53, y1 + 0.02, '#c62828', '#ffffff', 'CONSERVES', '#ffffff');
    // Verrières et bouches d'aération sur le toit.
    p.box(0.34, 0.8, 0.54, 1.72, h + 6, h + 10, bc('#cfd8dc'));
    p.fill(
      [
        [0.34, 0.8, h + 10],
        [0.54, 0.8, h + 17],
        [0.54, 1.72, h + 17],
        [0.34, 1.72, h + 10],
      ],
      '#81d4fa',
    );
    p.rightQuad(0.8, 1.72, h + 10, h + 17, 0.54, '#4fb3e8');
    for (let y = 1.03; y < 1.7; y += 0.23) p.line([0.34, y, h + 10], [0.54, y, h + 17], '#eceff1', 1.4);
    // Bouches d'aération sur le toit.
    for (const [x, y] of [
      [1.75, 0.45],
      [1.75, 0.8],
    ] as const) {
      p.box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, h + 6, h + 16, bc('#b0bec5'));
      p.line([x - 0.08, y + 0.1, h + 12], [x + 0.08, y + 0.1, h + 12], '#78909c', 1.4);
    }
    // Boîte de conserve géante, étiquette à la tomate.
    p.groundEllipse(1.1, 1.12, h + 6, 0.44, 'rgba(0,0,0,0.2)');
    tinCan(p, 1.05, 1.05, h + 6, 0.38, 58);
    {
      const [lx, ly] = p.p(1.05, 1.05, h + 6 + 29);
      const { ctx } = p;
      rrect(ctx, lx - 24, ly - 9, 30, 18, 4, '#ffffff');
      ell(ctx, lx - 9, ly + 1, 7, 6, '#e53935');
      ell(ctx, lx - 11, ly - 1, 2.2, 1.6, '#ff8a80');
      ell(ctx, lx - 9, ly - 5, 3.2, 1.4, '#43a047');
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(lx - 24, ly + 10, 48, 3);
      ctx.fillRect(lx - 24, ly - 14, 48, 3);
    }
    {
      const [tx, ty] = p.p(1.05, 1.05, h + 64);
      const { ctx } = p;
      ctx.strokeStyle = '#90a4ae';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(tx, ty, 0.5 * 0.38 * RX, 0.5 * 0.38 * RY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#78909c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(tx + 6, ty - 1, 6, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Tapis roulant qui sort de la halle, chargé de boîtes.
    const [cy0, cy1] = [1.32, 1.5];
    const belt = (x: number) => 26 - (x - x1) * 22;
    for (const x of [2.3, 2.62]) p.line([x, cy1 - 0.02, 0], [x, cy1 - 0.02, belt(x)], '#546e7a', 2.5);
    p.rightQuad(cy0 - 0.03, cy1 + 0.03, 22, 34, x1, '#37474f');
    p.fill(
      [
        [x1, cy0, 27],
        [2.8, cy0, belt(2.8) + 1],
        [2.8, cy1, belt(2.8) + 1],
        [x1, cy1, 27],
      ],
      '#455a64',
    );
    p.fill(
      [
        [x1, cy1, 27],
        [2.8, cy1, belt(2.8) + 1],
        [2.8, cy1, belt(2.8) - 3],
        [x1, cy1, 23],
      ],
      '#fdd835',
    );
    for (const x of [2.24, 2.44, 2.64]) tinCan(p, x, (cy0 + cy1) / 2, belt(x) + 1, 0.05, 9);

    // Palettes de boîtes, cagettes de tomates et de poissons.
    const canStack = (x: number, y: number, label: string) => {
      p.box(x, y, x + 0.3, y + 0.3, 0, 4, bc('#b8895a'));
      for (const [dx, dy, dz] of [
        [0.08, 0.08, 4],
        [0.22, 0.08, 4],
        [0.08, 0.22, 4],
        [0.22, 0.22, 4],
        [0.15, 0.15, 14],
      ] as const)
        tinCan(p, x + dx, y + dy, dz, 0.06, 10, label);
    };
    canStack(2.3, 1.75, '#e53935');
    canStack(2.55, 2.05, '#43a047');
    canStack(2.25, 2.4, '#1e88e5');
    produceCrate(p, 0.3, 2.3, '#e53935');
    produceCrate(p, 0.32, 2.3, '#e53935', 9);
    produceCrate(p, 0.6, 2.42, '#ff7043');
    woodCrate(p, 1.0, 2.35, 0.2);
    woodCrate(p, 1.24, 2.4, 0.2);
    woodCrate(p, 1.1, 2.38, 0.18, 12);
    for (const x of [1.6, 1.95]) {
      cylinder(p, x, 2.15, 0, 16, 0.035, '#fdd835');
      cylinder(p, x, 2.15, 5, 9, 0.036, '#263238');
    }
    roundBush(p, 2.8, 0.35, 9);
    roundBush(p, 2.82, 0.9, 8, '#5cbf32');
    roundBush(p, 0.15, 2.85, 7);
  },
};

export const HEROES: Record<string, Hero> = {
  chicken_coop: chickenCoop,
  cowshed,
  cattle_ranch: cattleRanch,
  mill,
  bakehouse,
  dairy,
  cannery,
};
