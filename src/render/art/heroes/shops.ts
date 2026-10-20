import { HALF_H, HALF_W } from '../../iso';
import { shade } from '../color';
import { type BoxColors, type IsoPainter, type V3 } from '../IsoPainter';
import { cypress, roofProp } from '../toon';
import type { Hero } from './types';
import { signText } from '@/i18n/content';

/**
 * Boutiques « façon CityVille » : grandes vitrines garnies, auvents rayés bombés,
 * enseignes en relief, terrasses, étals et un objet géant sur chaque toit.
 * Chaque commerce a sa propre architecture (mansarde, toit en croupe et serre,
 * toit plat à corniche, pignon à tuiles, fronton, rotonde, pignon hollandais…).
 */

type Side = 'left' | 'right';
type Ctx = CanvasRenderingContext2D;

/** Longueur écran (px) d'une case le long d'une face. */
const FACE_PX = Math.hypot(HALF_W, HALF_H);

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

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Polygone écran à partir de points 3D. */
function poly(p: IsoPainter, pts: readonly V3[], style: string | CanvasGradient): void {
  p.fill(pts, style);
}

/** Demi-cercle d'arcade (polygone) au sommet d'une baie [a, b] posée à la hauteur z. */
function archPts(side: Side, a: number, b: number, z: number, plane: number, rise = 0.85): V3[] {
  const c = (a + b) / 2;
  const r = (b - a) / 2;
  const pts: V3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    pts.push(pt(side, c - r * Math.cos(t), plane, z + r * FACE_PX * rise * Math.sin(t)));
  }
  return pts;
}

// ——— Sol ———

/** Parcelle pavée avec joints, pelouses et ombre douce sous le bâtiment. */
function lot(
  gp: IsoPainter,
  size: number,
  pave: string,
  lawns: readonly (readonly [number, number, number, number])[],
  shadow: readonly [number, number, number, number],
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
  // Bordure de trottoir.
  gp.line([0.02, e, 0], [e, e, 0], shade(pave, 0.35), 3);
  gp.line([e, 0.02, 0], [e, e, 0], shade(pave, -0.15), 3);
  for (const [x0, y0, x1, y1] of lawns) {
    gp.flat(x0, y0, x1, y1, 0, '#8fd14f');
    gp.line([x0, y1, 0], [x1, y1, 0], '#6fae35', 2);
    gp.line([x1, y0, 0], [x1, y1, 0], '#6fae35', 2);
  }
  const [x0, y0, x1, y1] = shadow;
  ctx.save();
  ctx.globalAlpha = 0.26;
  gp.flat(x0 + 0.05, y0 + 0.05, x1 + 0.32, y1 + 0.16, 0, '#2c3a1a');
  ctx.restore();
}

function softDot(gp: IsoPainter, x: number, y: number, r: number): void {
  gp.ctx.save();
  gp.ctx.globalAlpha = 0.2;
  gp.groundEllipse(x + 0.04, y + 0.03, 0, r, '#1d2a12');
  gp.ctx.restore();
}

// ——— Murs ———

/** Corps de bâtiment : murs, soubassement, chaînages d'angle et bandeau haut. */
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

// ——— Vitrines et marchandises ———

type Goods = (p: IsoPainter, side: Side, a: number, b: number, za: number, zb: number, plane: number) => void;

/** Répartit n objets le long de [a, b] à la hauteur z (coordonnées écran). */
function along(
  p: IsoPainter,
  side: Side,
  a: number,
  b: number,
  z: number,
  plane: number,
  n: number,
  draw: (ctx: Ctx, x: number, y: number, i: number) => void,
): void {
  for (let i = 0; i < n; i++) {
    const [x, y] = scr(p, side, a + ((b - a) * (i + 0.5)) / n, plane, z);
    draw(p.ctx, x, y, i);
  }
}

function count(a: number, b: number, per: number): number {
  return Math.max(2, Math.round((b - a) * per));
}

const PASTRIES: Goods = (p, side, a, b, za, zb, plane) => {
  const n = count(a, b, 8);
  const mid = za + (zb - za) * 0.48;
  // Gâteaux sur présentoir en bas, pains en haut.
  along(p, side, a, b, za + 3, plane, n, (ctx, x, y, i) => {
    ctx.fillStyle = '#e8d3b0';
    ctx.fillRect(x - 0.5, y - 4, 1.5, 4);
    ell(ctx, x, y - 4, 5, 1.8, '#ffffff');
    const cream = ['#f48fb1', '#fff3e0', '#8d6e63'][i % 3]!;
    ctx.fillStyle = cream;
    ctx.fillRect(x - 4, y - 10, 8, 6);
    ell(ctx, x, y - 10, 4, 1.8, shade(cream, 0.3));
    ell(ctx, x, y - 12.5, 1.4, 1.4, '#e53935');
  });
  along(p, side, a, b, mid + 2, plane, n, (ctx, x, y, i) => {
    ctx.save();
    ctx.translate(x, y - 3);
    ctx.rotate(i % 2 ? 0.5 : -0.4);
    ell(ctx, 0, 0, 5, 2.6, '#d08a3c');
    ctx.strokeStyle = '#f6d39a';
    ctx.lineWidth = 1;
    for (const dx of [-2, 0.5, 3]) {
      ctx.beginPath();
      ctx.moveTo(dx - 1, -1.5);
      ctx.lineTo(dx + 1, 1.5);
      ctx.stroke();
    }
    ctx.restore();
  });
  shelf(p, side, a, b, mid, plane, '#ffffff');
};

const BOUQUETS: Goods = (p, side, a, b, za, _zb, plane) => {
  const colors = ['#e91e63', '#ffeb3b', '#ff7043', '#ba68c8', '#ffffff', '#f06292'];
  along(p, side, a, b, za + 2, plane, count(a, b, 6), (ctx, x, y, i) => {
    ctx.fillStyle = '#90a4ae';
    ctx.fillRect(x - 3.5, y - 7, 7, 7);
    ell(ctx, x, y - 12, 6, 5.5, '#43a047');
    for (let k = 0; k < 4; k++) {
      const c = colors[(i + k) % colors.length]!;
      ell(ctx, x - 3.5 + (k % 2) * 6, y - 15 + Math.floor(k / 2) * 4, 2.6, 2.4, c);
    }
  });
};

const CUPS: Goods = (p, side, a, b, za, zb, plane) => {
  const mid = za + (zb - za) * 0.5;
  along(p, side, a, b, za + 3, plane, count(a, b, 7), (ctx, x, y, i) => {
    // Croissants et muffins.
    if (i % 2) {
      ell(ctx, x, y - 3, 5, 2.6, '#e0a14a');
      ell(ctx, x - 1, y - 4, 2.5, 1.2, '#f7cd84');
    } else {
      ctx.fillStyle = '#f3e1c4';
      ctx.fillRect(x - 3, y - 5, 6, 5);
      ell(ctx, x, y - 6, 4, 2.8, '#6d4c41');
    }
  });
  along(p, side, a, b, mid + 2, plane, count(a, b, 7), (ctx, x, y) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 7);
    ctx.lineTo(x + 3.5, y - 7);
    ctx.lineTo(x + 2.5, y);
    ctx.lineTo(x - 2.5, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x + 4, y - 4, 2, -1.4, 1.4);
    ctx.stroke();
    ell(ctx, x, y - 7, 3.5, 1.2, '#6d4c41');
  });
  shelf(p, side, a, b, mid, plane, '#6d4c41');
};

const FRUITS: Goods = (p, side, a, b, za, zb, plane) => {
  const fruit = ['#e53935', '#ff9800', '#7cb342', '#fdd835'];
  const mid = za + (zb - za) * 0.5;
  for (const [z, off] of [
    [za + 2, 0],
    [mid + 2, 2],
  ] as const) {
    along(p, side, a, b, z, plane, count(a, b, 5), (ctx, x, y, i) => {
      ctx.fillStyle = '#b07a48';
      ctx.fillRect(x - 6, y - 5, 12, 5);
      const c = fruit[(i + off) % fruit.length]!;
      for (const [dx, dy] of [
        [-3.5, -6],
        [0, -6],
        [3.5, -6],
        [-1.7, -9],
        [1.7, -9],
      ] as const) {
        ell(ctx, x + dx, y + dy, 2.4, 2.4, c);
        ell(ctx, x + dx - 0.8, y + dy - 0.8, 0.8, 0.8, 'rgba(255,255,255,0.6)');
      }
    });
  }
  shelf(p, side, a, b, mid, plane, '#1565c0');
};

const DRESSES: Goods = (p, side, a, b, za, zb, plane) => {
  const colors = ['#e91e63', '#212121', '#ffffff', '#ab47bc', '#ffca28'];
  const top = zb - 5;
  if (side === 'left') p.line([a + 0.02, plane, top], [b - 0.02, plane, top], '#9e9e9e', 1.5);
  else p.line([plane, a + 0.02, top], [plane, b - 0.02, top], '#9e9e9e', 1.5);
  along(p, side, a, b, za + 2, plane, count(a, b, 4.2), (ctx, x, y, i) => {
    const c = colors[i % colors.length]!;
    const h = 26;
    // Mannequin : pied, robe évasée, buste, tête.
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x - 0.7, y - 4, 1.4, 4);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y - h + 10);
    ctx.lineTo(x + 2.5, y - h + 10);
    ctx.lineTo(x + 6, y - 4);
    ctx.quadraticCurveTo(x, y - 2, x - 6, y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 3, y - h + 4, 6, 7);
    ell(ctx, x, y - h + 1, 2.6, 2.8, '#f5d6c0');
  });
};

const BOOKS: Goods = (p, side, a, b, za, zb, plane) => {
  const colors = ['#1e88e5', '#e53935', '#fdd835', '#43a047', '#8e24aa', '#ff7043', '#00897b'];
  const mid = za + (zb - za) * 0.5;
  for (const [z, off] of [
    [za + 1, 0],
    [mid + 1, 3],
  ] as const) {
    along(p, side, a, b, z, plane, count(a, b, 16), (ctx, x, y, i) => {
      const h = 8 + ((i * 5 + off) % 4);
      ctx.fillStyle = colors[(i + off) % colors.length]!;
      ctx.fillRect(x - 1.8, y - h, 3.6, h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 1.8, y - h + 2, 3.6, 1);
    });
  }
  shelf(p, side, a, b, mid, plane, '#5d4037');
};

const DINING: Goods = (p, side, a, b, za, zb, plane) => {
  // Salle : nappes à carreaux et suspensions dorées.
  along(p, side, a, b, za + 4, plane, count(a, b, 3.2), (ctx, x, y) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 7, y - 6, 14, 6);
    ctx.fillStyle = '#e53935';
    for (let k = 0; k < 4; k++) ctx.fillRect(x - 7 + k * 3.5, y - 6 + (k % 2) * 3, 3.5, 3);
    ell(ctx, x, y - 7, 7, 2, '#ffffff');
    ell(ctx, x - 2, y - 9, 1.4, 2.4, '#2e7d32');
  });
  along(p, side, a, b, zb - 4, plane, count(a, b, 3.2), (ctx, x, y) => {
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 2);
    ctx.stroke();
    ell(ctx, x, y + 4, 4, 2.6, '#ffca28');
    ell(ctx, x, y + 5.5, 2.4, 1.2, '#fff59d');
  });
};

/** Tablette de vitrine. */
function shelf(p: IsoPainter, side: Side, a: number, b: number, z: number, plane: number, color: string): void {
  quad(p, side, a, b, z - 1.5, z + 0.5, plane, tone(side, color));
}

/** Grande vitrine éclairée : cadre, intérieur chaud, marchandises, reflet, meneaux et rebord. */
function vitrine(
  p: IsoPainter,
  side: Side,
  a: number,
  b: number,
  za: number,
  zb: number,
  plane: number,
  frame: string,
  goods?: Goods,
  opts: { panes?: number; arch?: boolean; glow?: readonly [string, string] } = {},
): void {
  const { panes = 2, arch = false, glow = ['#fff7e0', '#f3c98d'] } = opts;
  const f = tone(side, frame);
  const pad = 0.035;
  quad(p, side, a - pad, b + pad, za - 3, zb, plane, f);
  if (arch) poly(p, archPts(side, a - pad, b + pad, zb, plane), f);
  const glass = p.gradient(pt(side, a, plane, zb + 10), pt(side, a, plane, za), glow[0], tone(side, glow[1]));
  quad(p, side, a, b, za, zb, plane, glass);
  if (arch) poly(p, archPts(side, a, b, zb, plane), glass);
  goods?.(p, side, a, b, za, zb, plane);
  // Reflet diagonal.
  const { ctx } = p;
  ctx.save();
  ctx.globalAlpha = 0.28;
  const m = (t: number) => a + (b - a) * t;
  poly(
    p,
    [
      pt(side, m(0.55), plane, zb),
      pt(side, m(0.75), plane, zb),
      pt(side, m(0.35), plane, za),
      pt(side, m(0.15), plane, za),
    ],
    '#ffffff',
  );
  ctx.restore();
  for (let i = 1; i < panes; i++) {
    const x = m(i / panes);
    p.line(pt(side, x, plane, za), pt(side, x, plane, zb), f, 2.4);
  }
  if (arch) {
    const r = (b - a) / 2;
    p.line(pt(side, a, plane, zb), pt(side, b, plane, zb), f, 2.2);
    p.line(pt(side, (a + b) / 2, plane, zb), pt(side, (a + b) / 2, plane, zb + r * FACE_PX * 0.85), f, 2.2);
  }
  faceBox(p, side, a - 0.06, b + 0.06, za - 6, za - 2, plane, 0.06, bc(shade(frame, 0.1)));
}

/** Petite fenêtre d'étage à petits bois, volets et jardinière fleurie. */
function smallWindow(
  p: IsoPainter,
  side: Side,
  c: number,
  plane: number,
  za: number,
  zb: number,
  shutter: string | null,
  opts: { flowers?: boolean; arch?: boolean; w?: number } = {},
): void {
  const w = opts.w ?? 0.12;
  if (shutter) {
    quad(p, side, c - w - 0.1, c - w - 0.02, za, zb, plane, tone(side, shutter));
    quad(p, side, c + w + 0.02, c + w + 0.1, za, zb, plane, tone(side, shutter));
  }
  if (opts.arch) poly(p, archPts(side, c - w - 0.03, c + w + 0.03, zb, plane), tone(side, '#ffffff'));
  p.window(side, c - w, c + w, za, zb, plane, '#86d3f5', '#ffffff');
  if (opts.arch) poly(p, archPts(side, c - w, c + w, zb, plane), tone(side, '#a6e1fa'));
  p.line(pt(side, c, plane, za), pt(side, c, plane, zb), '#ffffff', 1.6);
  p.line(pt(side, c - w, plane, (za + zb) / 2), pt(side, c + w, plane, (za + zb) / 2), '#ffffff', 1.6);
  if (opts.flowers) flowerBox(p, side, c - w - 0.05, c + w + 0.05, plane, za - 7);
  else faceBox(p, side, c - w - 0.04, c + w + 0.04, za - 4, za - 1, plane, 0.04, bc('#ffffff'));
}

const FLOWER_COLORS = ['#e91e63', '#ffeb3b', '#ff7043', '#ffffff', '#ba68c8'];

/** Jardinière fleurie posée contre une face. */
function flowerBox(p: IsoPainter, side: Side, a: number, b: number, plane: number, z: number, box = '#8d5a3b') {
  faceBox(p, side, a, b, z, z + 6, plane, 0.09, bc(box));
  const n = Math.max(3, Math.round((b - a) * 16));
  for (let i = 0; i <= n; i++) {
    const t = a + ((b - a) * i) / n;
    const [x, y] = scr(p, side, t, plane + 0.05, z + 8);
    ell(p.ctx, x, y, 3.4, 3, i % 2 ? '#43a047' : '#66bb6a');
  }
  for (let i = 0; i < n; i++) {
    const t = a + ((b - a) * (i + 0.5)) / n;
    const [x, y] = scr(p, side, t, plane + 0.05, z + 10);
    ell(p.ctx, x, y, 2.2, 2, FLOWER_COLORS[i % FLOWER_COLORS.length]!);
  }
}

/** Porte vitrée avec imposte. */
function glassDoor(p: IsoPainter, side: Side, c: number, w: number, h: number, plane: number, color: string) {
  const a = c - w / 2;
  const b = c + w / 2;
  quad(p, side, a - 0.04, b + 0.04, 0, h + 4, plane, tone(side, '#ffffff'));
  quad(p, side, a, b, 0, h, plane, tone(side, color));
  p.window(side, a + 0.04, b - 0.04, 9, h - 4, plane, '#ffe9bf', shade(color, -0.1));
  const [kx, ky] = scr(p, side, b - 0.06, plane, h * 0.42);
  ell(p.ctx, kx, ky, 1.8, 1.8, '#ffd54f');
  faceBox(p, side, a - 0.06, b + 0.06, 0, 3, plane, 0.12, bc('#bdb3a6'));
}

// ——— Auvents, enseignes ———

/** Auvent rayé bombé (profil en quart de cercle) avec lambrequin festonné. */
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
  // Bord avant d'abord (lambrequin), puis la toile par-dessus.
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
      poly(
        p,
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
  // Tringle et embouts.
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
  // Rivets dorés.
  for (const t of [a + 0.06, b - 0.06]) {
    const [x, y] = scr(p, side, t, f, zm);
    ell(p.ctx, x, y, 1.6, 1.6, '#ffd54f');
  }
}

// ——— Mobilier extérieur ———

/** Parasol bombé à pans alternés, festonné. */
function parasol(p: IsoPainter, x: number, y: number, z: number, r: number, c1: string, c2: string): void {
  const [sx, sy] = p.p(x, y, z);
  const ry = r * 0.45;
  const ax = sx;
  const ay = sy - r * 0.6;
  const { ctx } = p;
  const N = 10;
  const rim = (t: number): [number, number] => [sx + r * Math.cos(t), sy + ry * Math.sin(t)];
  const sector = (i: number, base: number) => {
    const t0 = base + (i / N) * Math.PI;
    const t1 = base + ((i + 1) / N) * Math.PI;
    const [x0, y0] = rim(t0);
    const [x1, y1] = rim(t1);
    const light = 0.12 - 0.22 * ((Math.cos((t0 + t1) / 2) + 1) / 2);
    ctx.fillStyle = shade(i % 2 ? c2 : c1, base > 0.1 ? light - 0.15 : -light);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + x0) / 2 + (x0 - sx) * 0.25, (ay + y0) / 2 - 3, x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 4, x1, y1);
    ctx.quadraticCurveTo((ax + x1) / 2 + (x1 - sx) * 0.25, (ay + y1) / 2 - 3, ax, ay);
    ctx.fill();
  };
  for (let i = 0; i < N; i++) sector(i, Math.PI);
  for (let i = 0; i < N; i++) sector(i, 0);
  ell(ctx, ax, ay - 1, 2.2, 2.2, '#ffffff');
}

/** Table de terrasse avec deux chaises et (option) parasol. */
function cafeTable(
  gp: IsoPainter,
  p: IsoPainter,
  x: number,
  y: number,
  c1: string,
  c2: string,
  opts: { chair?: string; cloth?: string; umbrella?: boolean; r?: number } = {},
): void {
  const { chair = '#ffffff', cloth = '#ffffff', umbrella = true, r = 24 } = opts;
  softDot(gp, x, y, 0.2);
  const seat = (cx: number, cy: number, back: 'x' | 'y') => {
    p.line([cx - 0.04, cy, 0], [cx - 0.04, cy, 7], shade(chair, -0.4), 1.5);
    p.line([cx + 0.04, cy, 0], [cx + 0.04, cy, 7], shade(chair, -0.4), 1.5);
    p.box(cx - 0.05, cy - 0.05, cx + 0.05, cy + 0.05, 7, 9, bc(chair));
    if (back === 'x') p.box(cx - 0.05, cy - 0.05, cx - 0.03, cy + 0.05, 9, 17, bc(chair));
    else p.box(cx - 0.05, cy - 0.05, cx + 0.05, cy - 0.03, 9, 17, bc(chair));
  };
  seat(x - 0.15, y, 'x');
  seat(x, y - 0.15, 'y');
  p.line([x, y, 0], [x, y, 12], '#4e342e', 2.5);
  p.groundEllipse(x, y, 12, 0.1, shade(cloth, -0.15));
  p.groundEllipse(x, y, 13, 0.1, cloth);
  p.dot(x - 0.02, y + 0.01, 15, 1.8, '#ffffff');
  if (umbrella) {
    p.line([x, y, 13], [x, y, 40], '#8d6e63', 2);
    parasol(p, x, y, 40, r, c1, c2);
  }
}

function lamp(gp: IsoPainter, p: IsoPainter, x: number, y: number, h = 46): void {
  softDot(gp, x, y, 0.06);
  p.box(x - 0.035, y - 0.035, x + 0.035, y + 0.035, 0, 5, bc('#37474f'));
  p.line([x, y, 4], [x, y, h], '#263238', 3.4);
  p.line([x, y, 4], [x, y, h], '#455a64', 1.6);
  const [sx, sy] = p.p(x, y, h);
  const { ctx } = p;
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.moveTo(sx - 6, sy - 6);
  ctx.lineTo(sx + 6, sy - 6);
  ctx.lineTo(sx, sy - 11);
  ctx.closePath();
  ctx.fill();
  ell(ctx, sx, sy, 5, 5.5, '#fff59d');
  ell(ctx, sx - 1.5, sy - 1.5, 2, 2, '#ffffff');
}

function bench(gp: IsoPainter, p: IsoPainter, x0: number, x1: number, y: number): void {
  softDot(gp, (x0 + x1) / 2, y, 0.15);
  for (const x of [x0 + 0.04, x1 - 0.04]) p.line([x, y, 0], [x, y, 7], '#37474f', 2.5);
  p.box(x0, y - 0.06, x1, y + 0.04, 7, 9, bc('#a1673f'));
  p.box(x0, y - 0.06, x1, y - 0.03, 9, 18, bc('#b97a4a'));
}

/** Cagette de fruits inclinée sur tréteaux. */
function crate(gp: IsoPainter, p: IsoPainter, x: number, y: number, fruit: string, w = 0.13): void {
  softDot(gp, x, y, 0.14);
  p.box(x - w, y - 0.1, x + w, y + 0.1, 0, 8, bc('#8d5a3b'));
  p.box(x - w, y - 0.1, x + w, y + 0.06, 8, 13, bc('#c48a52'));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      const fx = x - w + 0.04 + i * ((2 * w - 0.08) / 3);
      p.dot(fx, y - 0.04 + j * 0.07, 15 + (1 - j) * 2, 3.4, fruit);
      p.dot(fx - 0.01, y - 0.05 + j * 0.07, 16 + (1 - j) * 2, 1.1, 'rgba(255,255,255,0.65)');
    }
  }
}

/** Arbre rond en boule. */
function ballTree(gp: IsoPainter, p: IsoPainter, x: number, y: number, r = 15, color = '#5cb82e'): void {
  softDot(gp, x, y, 0.16);
  p.line([x, y, 0], [x, y, r + 8], '#6d4c2f', 4);
  p.dot(x, y, r + 14, r, shade(color, -0.18));
  p.dot(x - 0.03, y - 0.03, r + 17, r * 0.78, color);
  p.dot(x - 0.06, y - 0.07, r + 21, r * 0.38, shade(color, 0.35));
}

/** Massif arrondi : trois boules de feuillage avec reflets. */
function shrub(p: IsoPainter, x: number, y: number, r = 9, color = '#4caf2a'): void {
  const dark = shade(color, -0.2);
  p.dot(x - 0.05, y + 0.03, r * 0.75, r * 0.72, dark);
  p.dot(x + 0.05, y - 0.02, r * 0.8, r * 0.75, dark);
  p.dot(x, y, r * 1.05, r * 0.85, color);
  p.dot(x - 0.03, y - 0.03, r * 1.35, r * 0.32, shade(color, 0.35));
  p.dot(x + 0.06, y - 0.02, r * 1.05, r * 0.22, shade(color, 0.3));
}

/** Topiaire en pot (boule sur tige). */
function topiary(gp: IsoPainter, p: IsoPainter, x: number, y: number, pot = '#ffffff'): void {
  softDot(gp, x, y, 0.08);
  p.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, 9, bc(pot));
  p.line([x, y, 9], [x, y, 22], '#6d4c2f', 2.2);
  p.dot(x, y, 27, 8, '#3f9a25');
  p.dot(x - 0.015, y - 0.015, 28.5, 6.5, '#5cbf32');
  p.dot(x - 0.03, y - 0.03, 31, 2.5, '#a5e07a');
}

/** Ardoise « menu » sur chevalet. */
function chalkboard(gp: IsoPainter, p: IsoPainter, x: number, y: number): void {
  softDot(gp, x, y, 0.07);
  p.line([x - 0.06, y + 0.04, 0], [x - 0.06, y, 20], '#8d6e63', 2.4);
  p.line([x + 0.06, y + 0.04, 0], [x + 0.06, y, 20], '#8d6e63', 2.4);
  p.leftQuad(x - 0.06, x + 0.06, 5, 20, y + 0.02, '#37474f');
  for (const [z, c] of [
    [16, '#ffffff'],
    [12, '#ffcc80'],
    [8.5, '#ffffff'],
  ] as const) {
    p.line([x - 0.035, y + 0.02, z], [x + 0.035, y + 0.02, z], c, 1.2);
  }
}

/** Pot de fleurs (seau) au sol. */
function bucket(p: IsoPainter, x: number, y: number, flower: string): void {
  p.box(x - 0.045, y - 0.045, x + 0.045, y + 0.045, 0, 8, bc('#90a4ae'));
  p.dot(x, y, 12, 5.5, '#43a047');
  for (const [dx, dz] of [
    [-0.025, 13],
    [0.025, 15],
    [0, 17],
  ] as const) {
    p.dot(x + dx, y - dx, dz, 2.5, flower);
  }
}

// ——— Toits ———

/** Rangées d'écailles (demi-cercles) ou de tuiles rondes, découpées dans un pan. */
function scales(
  p: IsoPainter,
  face: readonly V3[],
  bottom: readonly [V3, V3],
  top: readonly [V3, V3],
  color: string,
  rows: number,
  r = 6,
): void {
  const { ctx } = p;
  ctx.save();
  p.path(face);
  ctx.clip();
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = 1.3;
  const lerp = (a: V3, b: V3, t: number): V3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  for (let row = 0; row < rows; row++) {
    const t = (row + 0.6) / rows;
    const s = lerp(bottom[0], top[0], t);
    const e = lerp(bottom[1], top[1], t);
    const [sx, sy] = p.p(...s);
    const [ex, ey] = p.p(...e);
    const len = Math.hypot(ex - sx, ey - sy);
    const n = Math.max(2, Math.round(len / (r * 1.7)));
    for (let i = -1; i <= n; i++) {
      const k = (i + (row % 2) * 0.5) / n;
      const x = sx + (ex - sx) * k;
      const y = sy + (ey - sy) * k;
      ctx.beginPath();
      ctx.arc(x, y, r, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Lucarne à fronton posée sur un pan (avant gauche, plan y). */
function dormer(p: IsoPainter, side: Side, c: number, plane: number, z: number, wall: string, roof: string): void {
  const w = 0.13;
  const h = 18;
  const back = side === 'left' ? -0.22 : -0.22;
  faceBox(p, side, c - w, c + w, z, z + h, plane + back, 0.22, bc(wall));
  const f = plane;
  p.window(side, c - w + 0.05, c + w - 0.05, z + 3, z + h - 2, f, '#86d3f5', '#ffffff');
  // Fronton triangulaire.
  const ov = 0.03;
  const apex = pt(side, c, f + 0.02, z + h + 13);
  poly(
    p,
    [pt(side, c - w - ov, f + 0.02, z + h - 1), pt(side, c + w + ov, f + 0.02, z + h - 1), apex],
    tone(side, roof),
  );
  p.line(pt(side, c - w - ov, f + 0.03, z + h - 1), apex, '#ffffff', 2.4);
  p.line(apex, pt(side, c + w + ov, f + 0.03, z + h - 1), '#ffffff', 2.4);
}

/** Toit mansardé : brisis à écailles, terrasson plat, glaçage blanc festonné à l'égout. */
function mansard(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  ins = 0.2,
): void {
  const ov = 0.08;
  const A: V3 = [x0 - ov, y1 + ov, z];
  const B: V3 = [x1 + ov, y1 + ov, z];
  const C: V3 = [x1 + ov, y0 - ov, z];
  const a: V3 = [x0 + ins, y1 - ins, z + h];
  const b: V3 = [x1 - ins, y1 - ins, z + h];
  const c: V3 = [x1 - ins, y0 + ins, z + h];
  const left = [A, B, b, a];
  const right = [B, C, c, b];
  poly(p, left, p.gradient(a, A, shade(color, 0.12), shade(color, -0.04)));
  poly(p, right, p.gradient(b, B, shade(color, -0.18), shade(color, -0.3)));
  scales(p, left, [A, B], [a, b], color, 4);
  scales(p, right, [B, C], [b, c], shade(color, -0.25), 4);
  p.box(x0 + ins - 0.02, y0 + ins - 0.02, x1 - ins + 0.02, y1 - ins + 0.02, z + h, z + h + 4, bc(shade(color, -0.1)));
  p.flat(x0 + ins + 0.02, y0 + ins + 0.02, x1 - ins - 0.02, y1 - ins - 0.02, z + h + 4, shade(color, -0.2));
  icing(p, A, B, '#fff8f0');
  icing(p, B, C, '#ead8d0');
  p.line([x0 + ins, y1 - ins, z + h + 4], [x1 - ins, y1 - ins, z + h + 4], '#fff8f0', 2.5);
  p.line([x1 - ins, y1 - ins, z + h + 4], [x1 - ins, y0 + ins, z + h + 4], '#ead8d0', 2.5);
}

/** Bordure festonnée « glaçage » le long d'un égout. */
function icing(p: IsoPainter, from: V3, to: V3, color: string): void {
  const [sx, sy] = p.p(...from);
  const [ex, ey] = p.p(...to);
  const n = Math.max(3, Math.round(Math.hypot(ex - sx, ey - sy) / 9));
  const { ctx } = p;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 3);
  ctx.lineTo(ex, ey - 3);
  ctx.lineTo(ex, ey + 1);
  for (let i = n; i > 0; i--) {
    const k0 = i / n;
    const k1 = (i - 1) / n;
    const x0 = sx + (ex - sx) * k0;
    const y0 = sy + (ey - sy) * k0;
    const x1 = sx + (ex - sx) * k1;
    const y1 = sy + (ey - sy) * k1;
    const drip = i % 3 === 0 ? 9 : 5;
    ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + drip, x1, y1 + 1);
  }
  ctx.closePath();
  ctx.fill();
}

/** Toit en croupe (quatre pans, faîtage selon x) avec rives claires et écailles. */
function hipRoof(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  ov = 0.16,
): [V3, V3] {
  const ym = (y0 + y1) / 2;
  const inset = (y1 - y0) / 2;
  const A: V3 = [x0 - ov, y1 + ov, z - 3];
  const B: V3 = [x1 + ov, y1 + ov, z - 3];
  const C: V3 = [x1 + ov, y0 - ov, z - 3];
  const D: V3 = [x0 - ov, y0 - ov, z - 3];
  const r0: V3 = [Math.min(x0 + inset, (x0 + x1) / 2), ym, z + h];
  const r1: V3 = [Math.max(x1 - inset, (x0 + x1) / 2), ym, z + h];
  poly(p, [D, C, r1, r0], shade(color, 0.12));
  poly(p, [D, A, r0], shade(color, 0.16));
  const front = [A, B, r1, r0];
  const side = [B, C, r1];
  poly(p, front, p.gradient(r0, A, shade(color, 0.14), shade(color, -0.06)));
  poly(p, side, p.gradient(r1, B, shade(color, -0.16), shade(color, -0.3)));
  scales(p, front, [A, B], [r0, r1], color, 5);
  scales(p, side, [B, C], [r1, r1], shade(color, -0.25), 5);
  p.line(A, B, '#ffffff', 3.5);
  p.line(B, C, '#eeeeee', 3.5);
  p.line(A, r0, shade(color, 0.4), 2.5);
  p.line(B, r1, shade(color, -0.12), 1.5);
  p.line(r0, r1, shade(color, -0.35), 4.5);
  p.line(r0, r1, shade(color, 0.3), 1.6);
  return [r0, r1];
}

/** Toit à deux pans (faîtage selon x) en tuiles rondes ; renvoie les deux bouts du faîtage. */
function tiledGableX(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  gable: string,
  ov = 0.16,
): [V3, V3] {
  const ym = (y0 + y1) / 2;
  const A: V3 = [x0 - ov, y1 + ov, z - 4];
  const B: V3 = [x1 + ov, y1 + ov, z - 4];
  const C: V3 = [x1 + ov, y0 - ov, z - 4];
  const r0: V3 = [x0 - ov, ym, z + h];
  const r1: V3 = [x1 + ov, ym, z + h];
  poly(p, [[x0 - ov, y0 - ov, z - 4], C, r1, r0], shade(color, 0.12));
  poly(
    p,
    [
      [x1, y0, z],
      [x1, y1, z],
      [x1, ym, z + h],
    ],
    shade(gable, -0.16),
  );
  const front = [A, B, r1, r0];
  poly(p, front, p.gradient(r0, A, shade(color, 0.14), shade(color, -0.08)));
  scales(p, front, [A, B], [r0, r1], color, 6, 6.5);
  // Rangées verticales de tuiles canal.
  const { ctx } = p;
  ctx.save();
  p.path(front);
  ctx.clip();
  const n = Math.round((x1 - x0 + 2 * ov) * 9);
  for (let i = 1; i < n; i++) {
    const x = x0 - ov + ((x1 - x0 + 2 * ov) * i) / n;
    p.line([x, y1 + ov, z - 4], [x, ym, z + h], shade(color, -0.2), 1);
  }
  ctx.restore();
  p.line(r0, r1, shade(color, -0.35), 5);
  p.line(r0, r1, shade(color, 0.3), 2);
  p.line(A, B, shade(color, 0.4), 3);
  p.line(C, r1, '#f4f4f4', 4);
  p.line(r1, B, '#f4f4f4', 4);
  return [r0, r1];
}

/** Toit à deux pans (faîtage selon y) : le pignon est sur la face gauche. */
function tiledGableY(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  ov = 0.16,
): [V3, V3] {
  const xm = (x0 + x1) / 2;
  const B: V3 = [x1 + ov, y1 + ov, z - 4];
  const C: V3 = [x1 + ov, y0 - ov, z - 4];
  const r0: V3 = [xm, y0 - ov, z + h];
  const r1: V3 = [xm, y1 + ov, z + h];
  poly(p, [[x0 - ov, y0 - ov, z - 4], [x0 - ov, y1 + ov, z - 4], r1, r0], shade(color, 0.14));
  const front = [B, C, r0, r1];
  poly(p, front, p.gradient(r1, B, shade(color, -0.1), shade(color, -0.25)));
  scales(p, front, [B, C], [r1, r0], shade(color, -0.2), 6, 6.5);
  p.line(r0, r1, shade(color, -0.35), 5);
  p.line(r0, r1, shade(color, 0.25), 2);
  p.line(B, C, shade(color, 0.2), 3);
  return [r0, r1];
}

/** Pignon triangulaire (face gauche) avec rives blanches débordantes. */
function gableEnd(p: IsoPainter, x0: number, x1: number, y: number, z: number, h: number, wall: string, roof: string) {
  const xm = (x0 + x1) / 2;
  const ov = 0.16;
  poly(
    p,
    [
      [x0, y, z],
      [x1, y, z],
      [xm, y, z + h],
    ],
    shade(wall, 0.04),
  );
  // Rives de toit vues de face.
  p.line([x0 - ov, y + ov, z - 4], [xm, y + ov, z + h], shade(roof, -0.3), 7);
  p.line([xm, y + ov, z + h], [x1 + ov, y + ov, z - 4], shade(roof, -0.3), 7);
  p.line([x0 - ov, y + ov, z - 4], [xm, y + ov, z + h], '#ffffff', 3.5);
  p.line([xm, y + ov, z + h], [x1 + ov, y + ov, z - 4], '#ffffff', 3.5);
}

/** Corniche à denticules, puis acrotère et terrasse : toit plat « à l'ancienne ». */
function cornice(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  color: string,
  roof: string,
  parapet = 8,
): void {
  const ov = 0.07;
  // Denticules.
  for (let x = x0 + 0.04; x < x1 - 0.02; x += 0.08) p.leftQuad(x, x + 0.04, z - 5, z, y1 + 0.02, shade(color, -0.05));
  for (let y = y0 + 0.04; y < y1 - 0.02; y += 0.08) p.rightQuad(y, y + 0.04, z - 5, z, x1 + 0.02, shade(color, -0.25));
  p.box(x0 - ov, y0 - ov, x1 + ov, y1 + ov, z, z + 5, bc(color));
  p.box(x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, z + 5, z + 5 + parapet, bc(shade(color, -0.06)));
  p.flat(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, z + 5 + parapet, roof);
  p.box(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, z + 5 + parapet, z + 8 + parapet, bc(shade(color, 0.15)));
  p.flat(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, z + 8 + parapet, roof);
}

/** Balustrade blanche le long d'un bord (de a à b), à la hauteur z. */
function balustrade(p: IsoPainter, from: readonly [number, number], to: readonly [number, number], z: number) {
  const [fx, fy] = from;
  const [tx, ty] = to;
  const n = Math.max(2, Math.round(Math.hypot(tx - fx, ty - fy) * 12));
  for (let i = 0; i <= n; i++) {
    const x = fx + ((tx - fx) * i) / n;
    const y = fy + ((ty - fy) * i) / n;
    p.line([x, y, z], [x, y, z + 9], '#f2eee8', 2.6);
    p.dot(x, y, z + 4.5, 1.8, '#ffffff');
  }
  p.line([fx, fy, z + 9], [tx, ty, z + 9], '#ffffff', 3.2);
}

/** Tour ronde (rotonde) : fût cylindrique, fenêtres cintrées, coupole et épi. */
function rotunda(
  p: IsoPainter,
  cx: number,
  cy: number,
  R: number,
  z0: number,
  z1: number,
  wall: string,
  dome: string,
  windows: (z0: number, z1: number) => readonly [number, number],
): readonly [number, number] {
  const at = (phi: number, z: number): V3 => [cx + R * Math.cos(phi), cy + R * Math.sin(phi), z];
  const lo = -Math.PI / 4;
  const hi = (3 * Math.PI) / 4;
  const ring = (z: number, from: number, to: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i <= 24; i++) pts.push(at(from + ((to - from) * i) / 24, z));
    return pts;
  };
  const [lx] = p.p(...at(hi, z0));
  const [rx] = p.p(...at(lo, z0));
  const g = p.ctx.createLinearGradient(lx, 0, rx, 0);
  g.addColorStop(0, shade(wall, 0.18));
  g.addColorStop(0.45, wall);
  g.addColorStop(1, shade(wall, -0.28));
  poly(p, [...ring(z0, lo, hi), ...ring(z1, hi, lo)], g);
  // Fenêtres cintrées.
  const [wa, wb] = windows(z0, z1);
  for (const phi of [Math.PI * 0.05, Math.PI * 0.25, Math.PI * 0.45, Math.PI * 0.65]) {
    const d = 0.13;
    const light = Math.cos(phi - Math.PI * 0.25 + 0.6);
    const glass = shade('#8fd6f7', -0.12 + light * 0.12);
    poly(
      p,
      [...ring(wa - 2, phi - d - 0.03, phi + d + 0.03), ...ring(wb + 2, phi + d + 0.03, phi - d - 0.03)],
      '#ffffff',
    );
    poly(p, [...ring(wa, phi - d, phi + d), ...ring(wb, phi + d, phi - d)], glass);
    const [tx, ty] = p.p(...at(phi, wb));
    ell(p.ctx, tx, ty, 5.5, 5, '#ffffff');
    ell(p.ctx, tx, ty + 0.5, 4, 3.5, glass);
  }
  // Corniche.
  poly(p, [...ring(z1 - 4, lo - 0.05, hi + 0.05), ...ring(z1 + 2, hi + 0.05, lo - 0.05)], '#ffffff');
  poly(p, ring(z1 + 2, 0, Math.PI * 2), '#f3eef0');
  // Coupole.
  const [sx, sy] = p.p(cx, cy, z1 + 2);
  const rxs = R * HALF_W * Math.SQRT2;
  const rys = R * HALF_H * Math.SQRT2;
  const hd = rxs * 1.05;
  const { ctx } = p;
  const dg = ctx.createRadialGradient(sx - rxs * 0.4, sy - hd * 0.7, 2, sx, sy - hd * 0.3, rxs * 1.3);
  dg.addColorStop(0, shade(dome, 0.45));
  dg.addColorStop(0.5, dome);
  dg.addColorStop(1, shade(dome, -0.35));
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.moveTo(sx - rxs, sy);
  ctx.bezierCurveTo(sx - rxs, sy - hd * 0.75, sx - rxs * 0.3, sy - hd, sx, sy - hd);
  ctx.bezierCurveTo(sx + rxs * 0.3, sy - hd, sx + rxs, sy - hd * 0.75, sx + rxs, sy);
  ctx.ellipse(sx, sy, rxs, rys, 0, 0, Math.PI);
  ctx.fill();
  // Côtes de la coupole.
  ctx.strokeStyle = shade(dome, -0.3);
  ctx.lineWidth = 1.2;
  for (const k of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(sx + rxs * k, sy + rys * Math.sqrt(1 - k * k));
    ctx.quadraticCurveTo(sx + rxs * k * 0.9, sy - hd * 0.7, sx, sy - hd);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(sx - 1.2, sy - hd - 12, 2.4, 12);
  ell(ctx, sx, sy - hd - 13, 3.2, 3.2, '#ffd54f');
  return [sx, sy - hd];
}

/** Objet géant sur un mât planté dans le toit. */
function mastProp(
  p: IsoPainter,
  kind: Parameters<typeof roofProp>[1],
  x: number,
  y: number,
  z0: number,
  z1: number,
  s: number,
) {
  p.line([x, y, z0], [x, y, z1 + 4], '#5d4037', 3.5);
  p.line([x, y, z0], [x, y, z1 + 4], '#8d6e63', 1.5);
  roofProp(p, kind, x, y, z1, s);
}

// ——— Boulangerie : mansarde chocolat glacée, lucarnes, cupcake ———

function drawBakery(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.24, 0.18, 1.72, 1.24, 72] as const;
  const wall = '#f7c1d4';
  lot(gp, 2, '#e8dfd0', [[0.02, 0.02, 0.2, 1.98]], [x0, y0, x1, y1]);
  ballTree(gp, p, 1.86, 0.3, 14);
  walls(p, x0, y0, x1, y1, h, wall);
  // Pilastres crème entre les baies.
  for (const x of [0.98]) p.leftQuad(x - 0.03, x + 0.03, 6, h, y1, '#fff3f7');
  vitrine(p, 'left', 0.34, 0.9, 9, 38, y1, '#ffffff', PASTRIES, { panes: 2 });
  glassDoor(p, 'left', 1.3, 0.3, 38, y1, '#8d4a5a');
  vitrine(p, 'right', 0.36, 1.08, 9, 38, x1, '#ffffff', PASTRIES, { panes: 3 });
  band(p, x0, y0, x1, y1, h - 4, h, '#fff3f7');
  bulgeAwning(p, 'left', x0 + 0.04, x1 - 0.04, 54, y1, ['#e84d84', '#ffffff']);
  bulgeAwning(p, 'right', 0.3, 1.14, 54, x1, ['#e84d84', '#ffffff'], 0.22);
  reliefSign(p, 'left', 0.42, 1.54, 57, 69, y1, '#5d4037', '#ffe0b2', 'BOULANGERIE', '#ffffff');
  mansard(p, x0, y0, x1, y1, h, 30, '#8a5a4a', 0.2);
  dormer(p, 'left', 0.62, y1 - 0.06, h + 4, wall, '#8a5a4a');
  dormer(p, 'left', 1.3, y1 - 0.06, h + 4, wall, '#8a5a4a');
  dormer(p, 'right', 0.75, x1 - 0.06, h + 4, wall, '#8a5a4a');
  // Cheminée rose.
  p.box(1.3, 0.38, 1.44, 0.52, h + 30, h + 46, bc('#e57399'));
  p.box(1.28, 0.36, 1.46, 0.54, h + 46, h + 50, bc('#ffffff'));
  roofProp(p, 'cupcake', 0.95, 0.72, h + 34, 1.15);
  // Trottoir : table de terrasse, banc, lampadaire, jardinières.
  cafeTable(gp, p, 0.5, 1.68, '#f06292', '#ffffff', { chair: '#ffffff', cloth: '#fce4ec', r: 22 });
  chalkboard(gp, p, 1.0, 1.6);
  lamp(gp, p, 1.85, 1.85);
  shrub(p, 1.86, 1.3, 9);
  shrub(p, 1.86, 1.55, 8, '#5cbf32');
  bench(gp, p, 1.18, 1.62, 1.86);
}

// ——— Fleuriste : toit en croupe à écailles, serre vitrée, gradins de pots ———

function drawFlowerShop(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.22, 0.2, 1.3, 1.24, 54] as const;
  const wall = '#cfe8b0';
  lot(
    gp,
    2,
    '#e6dccb',
    [
      [0.02, 0.02, 1.98, 0.16],
      [1.84, 0.02, 1.98, 1.98],
    ],
    [x0, y0, 1.86, y1],
  );
  cypress(p, 0.1, 0.12, 40);
  walls(p, x0, y0, x1, y1, h, wall, '#ffffff', '#8d6e63');
  vitrine(p, 'left', 0.3, 0.78, 9, 32, y1, '#ffffff', BOUQUETS, { panes: 2, arch: true });
  glassDoor(p, 'left', 1.05, 0.28, 36, y1, '#2e7d32');
  band(p, x0, y0, x1, y1, h - 4, h, '#ffffff');
  bulgeAwning(p, 'left', x0 + 0.03, x1 - 0.03, 50, y1, ['#3d9a44', '#ffffff']);
  const [r0, r1] = hipRoof(p, x0, y0, x1, y1, h, 34, '#8a5f4c');
  dormer(p, 'left', 0.52, y1 - 0.2, h + 2, wall, '#8a5f4c');
  // Grande fleur au sommet.
  const top: V3 = [(r0[0] + r1[0]) / 2, r0[1], r0[2]];
  mastProp(p, 'flower', top[0], top[1], top[2] - 6, top[2] + 6, 1.05);

  // Serre vitrée en appentis.
  const [sx0, sy0, sx1, sy1] = [x1, 0.34, 1.82, 1.18];
  const glass = '#bfe9f2';
  p.box(sx0, sy0, sx1, sy1, 0, 8, bc('#ffffff'));
  p.leftQuad(sx0, sx1, 8, 38, sy1, glass);
  p.rightQuad(sy0, sy1, 8, 30, sx1, shade(glass, -0.12));
  poly(
    p,
    [
      [sx1, sy1, 30],
      [sx1, sy0, 30],
      [sx0, sy0, 46],
      [sx0, sy1, 46],
    ],
    shade(glass, 0.12),
  );
  poly(
    p,
    [
      [sx0, sy1, 8],
      [sx1, sy1, 8],
      [sx1, sy1, 30],
      [sx0, sy1, 46],
    ],
    glass,
  );
  // Plantes derrière les vitres.
  for (let i = 0; i < 4; i++) {
    const x = sx0 + 0.08 + i * 0.12;
    p.dot(x, sy1, 16 + (i % 2) * 4, 7, i % 2 ? '#66bb6a' : '#43a047');
    p.dot(x - 0.02, sy1, 20 + (i % 2) * 4, 2.4, FLOWER_COLORS[i % 5]!);
  }
  for (let i = 0; i < 4; i++) p.dot(sx1, sy0 + 0.12 + i * 0.2, 16, 6, '#4caf50');
  // Montants blancs.
  for (let i = 0; i <= 4; i++) {
    const x = sx0 + ((sx1 - sx0) * i) / 4;
    const zt = 46 - (16 * i) / 4;
    p.line([x, sy1, 8], [x, sy1, zt], '#ffffff', 2.2);
    p.line([x, sy1, zt], [x, sy0, zt], '#ffffff', 1.6);
  }
  for (let i = 0; i <= 4; i++) {
    const y = sy0 + ((sy1 - sy0) * i) / 4;
    p.line([sx1, y, 8], [sx1, y, 30], '#eeeeee', 2);
  }
  p.line([sx0, sy1, 24], [sx1, sy1, 22], '#ffffff', 1.6);
  p.line([sx1, sy1, 30], [sx1, sy0, 30], '#ffffff', 2.5);
  p.line([sx0, sy1, 46], [sx1, sy1, 30], '#ffffff', 2.5);
  reliefSign(p, 'right', sy0 + 0.1, sy1 - 0.1, 32, 44, sx1, '#2e7d32', '#ffffff', 'FLEURS', '#ffffff');

  // Gradins de pots devant la vitrine.
  for (let k = 0; k < 3; k++) {
    const y = 1.56 + k * 0.12;
    const z = 12 - k * 4;
    p.box(0.22, y - 0.06, 0.82, y + 0.06, 0, z, bc('#a1673f'));
    for (let i = 0; i < 5; i++) {
      const x = 0.28 + i * 0.12;
      p.box(x - 0.035, y - 0.035, x + 0.035, y + 0.035, z, z + 6, bc('#d07a4a'));
      p.dot(x, y, z + 10, 4.6, '#43a047');
      p.dot(x - 0.01, y - 0.01, z + 12, 2.6, FLOWER_COLORS[(i + k * 2) % 5]!);
    }
  }
  bucket(p, 1.25, 1.45, '#e91e63');
  bucket(p, 1.38, 1.5, '#ffeb3b');
  bucket(p, 1.3, 1.62, '#ffffff');
  shrub(p, 1.62, 1.42, 9, '#4caf2a');
  shrub(p, 1.86, 1.62, 10, '#5cbf32');
  p.dot(1.84, 1.6, 18, 2.4, '#f06292');
  p.dot(1.9, 1.66, 15, 2.4, '#ffeb3b');
  lamp(gp, p, 1.9, 1.42, 42);
}

// ——— Café : toit plat à corniche, pilastres, grande terrasse à parasols ———

function drawCafe(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.22, 0.2, 1.48, 1.12, 64] as const;
  const wall = '#d9c6b5';
  lot(gp, 2, '#e4d6c2', [[0.02, 0.02, 1.98, 0.14]], [x0, y0, x1, y1]);
  // Terrasse en lames de bois.
  gp.flat(0.12, 1.24, 1.8, 1.94, 0, '#c9a27a');
  gp.ctx.save();
  gp.ctx.globalAlpha = 0.35;
  for (let x = 0.2; x < 1.8; x += 0.1) gp.line([x, 1.24, 0], [x, 1.94, 0], '#8d6747', 1);
  gp.ctx.restore();
  walls(p, x0, y0, x1, y1, h, wall, '#f3e9dd', '#6d4c41');
  for (const x of [0.62, 1.06]) p.leftQuad(x - 0.035, x + 0.035, 6, h, y1, '#f3e9dd');
  vitrine(p, 'left', 0.3, 0.56, 10, 40, y1, '#4e342e', CUPS, { panes: 1, arch: true });
  vitrine(p, 'left', 0.68, 1.0, 10, 40, y1, '#4e342e', CUPS, { panes: 2, arch: true });
  vitrine(p, 'left', 1.12, 1.4, 10, 40, y1, '#4e342e', CUPS, { panes: 1, arch: true });
  glassDoor(p, 'right', 0.42, 0.28, 38, x1, '#4e342e');
  smallWindow(p, 'right', 0.86, x1, 20, 40, '#6d4c41', { flowers: true });
  bulgeAwning(p, 'left', x0 + 0.03, x1 - 0.03, 54, y1, ['#6d4c41', '#f3e9dd']);
  cornice(p, x0, y0, x1, y1, h, '#f3e9dd', '#7a5a48');
  reliefSign(p, 'right', 0.2, 0.66, 46, 60, x1, '#3e2723', '#ffcc80', 'CAFÉ', '#f3e9dd');
  // Toit : bouches d'aération, tasse géante.
  p.box(1.15, 0.35, 1.3, 0.5, h + 16, h + 26, bc('#bcaaa4'));
  roofProp(p, 'coffee', 0.8, 0.62, h + 16, 1.15);
  // Terrasse : jardinières basses, tables à parasols.
  for (const x of [0.12, 1.7]) {
    p.box(x, 1.26, x + 0.1, 1.92, 0, 7, bc('#8d6e63'));
    for (let y = 1.32; y < 1.9; y += 0.1) shrub(p, x + 0.05, y, 5, y > 1.6 ? '#5cbf32' : '#4caf2a');
  }
  cafeTable(gp, p, 1.76, 0.5, '#ffb74d', '#ffffff', { chair: '#6d4c41', r: 20 });
  cafeTable(gp, p, 0.4, 1.66, '#e57373', '#ffffff', { chair: '#6d4c41', r: 21 });
  chalkboard(gp, p, 0.86, 1.5);
  cafeTable(gp, p, 1.32, 1.7, '#81c784', '#ffffff', { chair: '#6d4c41', r: 21 });
}

// ——— Pizzeria : trattoria à tuiles rondes, baies cintrées, four à bois ———

function drawPizzeria(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.22, 0.24, 1.56, 1.26, 62] as const;
  const wall = '#fff1dc';
  lot(gp, 2, '#e6dccb', [[0.02, 0.02, 1.98, 0.18]], [x0, y0, 1.84, y1]);
  // Four à bois en briques sur le côté (derrière la façade droite).
  walls(p, x0, y0, x1, y1, h, wall, '#f1d8b8', '#b5523b');
  for (const c of [0.48, 0.92]) {
    vitrine(p, 'left', c - 0.15, c + 0.15, 9, 32, y1, '#2e7d32', DINING, { panes: 1, arch: true });
    quad(p, 'left', c - 0.25, c - 0.17, 9, 40, y1, '#43a047');
    quad(p, 'left', c + 0.17, c + 0.25, 9, 40, y1, '#43a047');
  }
  glassDoor(p, 'left', 1.3, 0.28, 36, y1, '#2e7d32');
  vitrine(p, 'right', 0.38, 0.72, 10, 34, x1, '#2e7d32', DINING, { panes: 2, arch: true });
  bulgeAwning(p, 'left', x0 + 0.04, x1 - 0.04, 56, y1, ['#e53935', '#ffffff']);
  // Cheminée du four (briques) côté arrière.
  p.box(0.42, 0.34, 0.62, 0.54, h + 10, h + 56, bc('#b5523b'));
  p.box(0.4, 0.32, 0.64, 0.56, h + 56, h + 60, bc('#6d4c41'));
  const [r0, r1] = tiledGableX(p, x0, y0, x1, y1, h, 34, '#d2452f', wall);
  // Pignon droit : œil-de-bœuf et enseigne.
  const ym = (y0 + y1) / 2;
  reliefSign(p, 'right', ym - 0.32, ym + 0.32, h + 2, h + 16, x1, '#2e7d32', '#ffffff', 'PIZZA', '#ffffff');
  const [gx, gy] = p.p(x1, ym, h + 24);
  ell(p.ctx, gx, gy, 5.5, 6.5, '#ffffff');
  ell(p.ctx, gx, gy, 3.8, 4.8, '#86d3f5');
  // Fumée.
  for (const [dz, r] of [
    [66, 5],
    [74, 6.5],
    [83, 8],
  ] as const) {
    p.dot(0.52 + dz / 900, 0.44, h + dz, r, 'rgba(255,255,255,0.85)');
  }
  mastProp(p, 'pizza', (r0[0] + r1[0]) / 2 + 0.1, r0[1], r0[2] - 4, r0[2] + 8, 1.1);
  // Four extérieur en dôme de briques, côté droit.
  const [fx, fy] = [1.76, 0.86];
  softDot(gp, fx, fy, 0.22);
  p.box(fx - 0.14, fy - 0.18, fx + 0.14, fy + 0.18, 0, 14, bc('#a1887f'));
  const [ox, oy] = p.p(fx, fy, 14);
  const { ctx } = p;
  const dg = ctx.createRadialGradient(ox - 6, oy - 16, 2, ox, oy - 8, 22);
  dg.addColorStop(0, '#e2795e');
  dg.addColorStop(1, '#9c3d27');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.ellipse(ox, oy, 19, 9, 0, 0, Math.PI);
  ctx.bezierCurveTo(ox - 19, oy - 20, ox + 19, oy - 20, ox + 19, oy);
  ctx.fill();
  ell(ctx, ox - 6, oy - 2, 6, 5, '#3e2723');
  ell(ctx, ox - 6, oy, 4, 2.5, '#ff9800');
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (const k of [-8, -14]) {
    ctx.beginPath();
    ctx.ellipse(ox, oy + k * 0.2, 18, 9 + k * 0.1, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  // Terrasse : table à nappe à carreaux, tonneau, pots d'herbes, lampadaire.
  cafeTable(gp, p, 0.55, 1.66, '#2e7d32', '#ffffff', { chair: '#a1673f', cloth: '#ef5350' });
  for (const [x, y] of [
    [1.12, 1.62],
    [1.3, 1.7],
  ] as const) {
    p.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, 8, bc('#c2703d'));
    p.dot(x, y, 12, 5, '#558b2f');
    p.dot(x + 0.01, y, 14, 1.8, '#e53935');
  }
  const [bx, by] = p.p(1.55, 1.68, 0);
  ctx.fillStyle = '#8d5a3b';
  ctx.beginPath();
  ctx.ellipse(bx, by - 9, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37474f';
  ctx.fillRect(bx - 9, by - 15, 18, 2);
  ctx.fillRect(bx - 9, by - 5, 18, 2);
  ell(ctx, bx, by - 19, 7, 2.6, '#a1673f');
  lamp(gp, p, 1.86, 1.86, 44);
  shrub(p, 0.12, 1.88, 8);
}

// ——— Épicerie : fronton chantourné, auvent bleu, étals de fruits ———

function drawGrocery(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.16, 0.2, 1.82, 1.2, 56] as const;
  const wall = '#ffe083';
  lot(gp, 2, '#e3dccd', [], [x0, y0, x1, y1]);
  walls(p, x0, y0, x1, y1, h, wall, '#ffffff', '#1565c0');
  // Toit plat gris derrière le fronton.
  p.box(x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, h + 5, bc('#bdbdbd'));
  p.flat(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, h + 5, '#9e9e9e');
  p.box(1.3, 0.36, 1.6, 0.6, h + 5, h + 15, bc('#cfd8dc'));
  p.flat(1.34, 0.4, 1.56, 0.56, h + 15, '#90a4ae');
  roofProp(p, 'apple', 1.0, 0.5, h + 5, 1.2);
  // Fronton chantourné sur la façade avant.
  const fz = h + 5;
  const xm = (x0 + x1) / 2;
  const prof = (t: number) => {
    // t ∈ [0, 1] le long du fronton : épaulements puis arc central.
    const u = Math.abs(t - 0.5) * 2;
    return 8 + 30 * Math.cos(u * (Math.PI / 2)) ** 1.6 + (u > 0.86 ? (u - 0.86) * 40 : 0);
  };
  const front: V3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    front.push([x0 + (x1 - x0) * t, y1, fz + prof(t)]);
  }
  const outline: V3[] = [[x0, y1, fz - 6], [x1, y1, fz - 6], ...front.reverse()];
  p.box(x0, y1 - 0.08, x1, y1, fz - 6, fz + 10, bc(wall));
  poly(p, outline, shade(wall, 0.06));
  p.ctx.save();
  p.ctx.globalAlpha = 0.9;
  for (let i = 0; i < front.length - 1; i++) p.line(front[i]!, front[i + 1]!, '#1565c0', 4);
  p.ctx.restore();
  reliefSign(p, 'left', xm - 0.5, xm + 0.5, fz - 2, fz + 16, y1, '#1565c0', '#ffffff', 'ÉPICERIE', '#ffffff');
  // Façade : trois vitrines garnies, porte au centre.
  vitrine(p, 'left', 0.26, 0.74, 10, 38, y1, '#1565c0', FRUITS, { panes: 2 });
  glassDoor(p, 'left', 0.99, 0.32, 38, y1, '#1565c0');
  vitrine(p, 'left', 1.24, 1.72, 10, 38, y1, '#1565c0', FRUITS, { panes: 2 });
  vitrine(p, 'right', 0.32, 1.08, 10, 38, x1, '#1565c0', FRUITS, { panes: 3 });
  bulgeAwning(p, 'left', x0 + 0.03, x1 - 0.03, 52, y1, ['#1e88e5', '#ffffff']);
  bulgeAwning(p, 'right', y0 + 0.08, y1 - 0.06, 52, x1, ['#1e88e5', '#ffffff'], 0.18);
  // Étals de fruits sur le trottoir.
  crate(gp, p, 0.32, 1.62, '#e53935');
  crate(gp, p, 0.6, 1.66, '#ff9800');
  crate(gp, p, 1.4, 1.66, '#7cb342');
  crate(gp, p, 1.68, 1.62, '#fdd835');
  crate(gp, p, 1.86, 1.86, '#ab47bc', 0.1);
  shrub(p, 1.92, 1.4, 7);
  shrub(p, 1.92, 1.9, 8, '#5cbf32');
  shrub(p, 0.1, 1.9, 8);
}

// ——— Mode : façade à colonnettes, rotonde à coupole, topiaires ———

function drawFashion(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.4, 0.2, 1.62, 1.16, 62] as const;
  const wall = '#f8bbd0';
  lot(gp, 2, '#e9e1d6', [[0.02, 0.02, 1.98, 0.16]], [0.16, y0, x1, y1 + 0.2]);
  // Tapis rouge.
  gp.flat(1.0, y1, 1.24, 1.98, 0, '#c2185b');
  gp.line([1.0, y1, 0], [1.0, 1.98, 0], '#ffd54f', 1.5);
  gp.line([1.24, y1, 0], [1.24, 1.98, 0], '#ffd54f', 1.5);
  ballTree(gp, p, 1.86, 0.32, 14);
  walls(p, x0, y0, x1, y1, h, wall, '#ffffff', '#ad1457');
  // Façade à colonnettes, vitrines cintrées entre elles.
  vitrine(p, 'left', 0.72, 0.94, 9, 40, y1, '#212121', DRESSES, { panes: 1, arch: true });
  glassDoor(p, 'left', 1.12, 0.26, 38, y1, '#880e4f');
  vitrine(p, 'left', 1.3, 1.52, 9, 40, y1, '#212121', DRESSES, { panes: 1, arch: true });
  vitrine(p, 'right', 0.3, 1.04, 9, 40, x1, '#212121', DRESSES, { panes: 3, arch: false });
  for (const x of [0.66, 0.99, 1.25, 1.58]) {
    faceBox(p, 'left', x - 0.03, x + 0.03, 6, h - 6, y1, 0.06, bc('#ffffff'));
    faceBox(p, 'left', x - 0.05, x + 0.05, 0, 6, y1, 0.08, bc('#f3e5f5'));
    faceBox(p, 'left', x - 0.05, x + 0.05, h - 9, h - 4, y1, 0.08, bc('#f3e5f5'));
  }
  bulgeAwning(p, 'left', 1.0, 1.24, 47, y1 + 0.06, ['#212121', '#ffffff'], 0.22, 10);
  cornice(p, x0, y0, x1, y1, h, '#ffffff', '#ad1457', 4);
  balustrade(p, [x0 + 0.02, y1], [x1 - 0.02, y1], h + 12);
  balustrade(p, [x1, y0 + 0.02], [x1, y1], h + 12);
  roofProp(p, 'handbag', 1.05, 0.6, h + 12, 1.25);
  reliefSign(p, 'left', 0.84, 1.56, h - 18, h - 6, y1 + 0.08, '#212121', '#f8bbd0', 'MODE', '#ffd54f');
  // Rotonde d'angle à coupole.
  softDot(gp, x0, y1, 0.32);
  rotunda(p, x0 - 0.06, y1 + 0.02, 0.24, 0, h + 16, '#f48fb1', '#ad1457', (z0, z1) => [z0 + 12, z1 - 20]);
  // Topiaires, lampadaire, massifs.
  topiary(gp, p, 0.92, 1.4);
  topiary(gp, p, 1.34, 1.42);
  lamp(gp, p, 1.84, 1.5, 46);
  shrub(p, 0.5, 1.72, 9, '#4caf2a');
  shrub(p, 1.7, 1.86, 9, '#5cbf32');
  shrub(p, 0.16, 1.86, 8);
}

// ——— Librairie : pignon hollandais chantourné, étage à jardinières, bacs de livres ———

function drawBookshop(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.26, 0.18, 1.62, 1.22, 76] as const;
  const wall = '#a5d6a7';
  const roof = '#3f7d23';
  lot(gp, 2, '#e6dccb', [[1.76, 0.02, 1.98, 1.98]], [x0, y0, x1, y1]);
  ballTree(gp, p, 1.86, 0.4, 16, '#66bb2e');
  walls(p, x0, y0, x1, y1, h, wall, '#fff8e1', '#5d4037');
  band(p, x0, y0, x1, y1, 40, 44, '#fff8e1');
  // Rez-de-chaussée.
  vitrine(p, 'left', 0.34, 0.74, 8, 32, y1, '#1b5e20', BOOKS, { panes: 2 });
  glassDoor(p, 'left', 0.96, 0.26, 33, y1, '#1b5e20');
  vitrine(p, 'left', 1.18, 1.54, 8, 32, y1, '#1b5e20', BOOKS, { panes: 2 });
  vitrine(p, 'right', 0.3, 1.0, 8, 32, x1, '#1b5e20', BOOKS, { panes: 3 });
  bulgeAwning(p, 'left', x0 + 0.04, x1 - 0.04, 40, y1, ['#2e7d32', '#fff8e1'], 0.3, 12);
  // Étage.
  smallWindow(p, 'left', 0.55, y1, 52, 68, '#1b5e20', { flowers: true, arch: true });
  smallWindow(p, 'left', 1.33, y1, 52, 68, '#1b5e20', { flowers: true, arch: true });
  smallWindow(p, 'right', 0.5, x1, 52, 68, '#1b5e20', { flowers: true });
  reliefSign(p, 'right', 0.8, 1.14, 48, 64, x1, '#1b5e20', '#fff8e1', 'LIVRES', '#fff8e1');
  // Toit derrière, puis pignon chantourné en façade.
  tiledGableY(p, x0, y0, x1, y1, h, 40, roof, 0.1);
  const xm = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const zTop = h + 56;
  const curve: V3[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const u = Math.abs(t - 0.5) * 2;
    // Volutes : épaulement bas, cou, puis tête arrondie.
    let z: number;
    if (u > 0.82) z = h + 6 + (1 - u) * 40;
    else if (u > 0.5) z = h + 14 + 26 * Math.sin(((0.82 - u) / 0.32) * (Math.PI / 2));
    else z = h + 40 + (zTop - h - 40) * Math.cos((u / 0.5) * (Math.PI / 2)) ** 0.6;
    curve.push([xm - half + 2 * half * t, y1, z]);
  }
  p.box(x0, y1 - 0.06, x1, y1, h, h + 6, bc(wall));
  poly(p, [[x0, y1, h], [x1, y1, h], ...[...curve].reverse()], shade(wall, 0.05));
  for (let i = 0; i < curve.length - 1; i++) p.line(curve[i]!, curve[i + 1]!, '#fff8e1', 4);
  band(p, x0, y1 - 0.01, x1, y1, h - 3, h + 1, '#fff8e1');
  // Rosace dans le pignon.
  const [rx, ry] = p.p(xm, y1, h + 34);
  ell(p.ctx, rx, ry, 9, 10, '#fff8e1');
  ell(p.ctx, rx, ry, 6.5, 7.5, '#86d3f5');
  p.ctx.strokeStyle = '#fff8e1';
  p.ctx.lineWidth = 1.4;
  p.ctx.beginPath();
  p.ctx.moveTo(rx - 6.5, ry);
  p.ctx.lineTo(rx + 6.5, ry);
  p.ctx.moveTo(rx, ry - 7.5);
  p.ctx.lineTo(rx, ry + 7.5);
  p.ctx.stroke();
  roofProp(p, 'books', xm + 0.02, y1 - 0.02, zTop - 3, 0.95);
  // Trottoir : bacs de livres, banc, lampadaire.
  for (const x of [0.42, 0.72]) {
    softDot(gp, x, 1.55, 0.14);
    p.box(x - 0.12, 1.48, x + 0.12, 1.62, 0, 12, bc('#6d4c41'));
    for (let i = 0; i < 7; i++) {
      const bx = x - 0.1 + i * 0.033;
      const col = ['#1e88e5', '#e53935', '#fdd835', '#43a047', '#8e24aa'][i % 5]!;
      p.box(bx, 1.5, bx + 0.025, 1.6, 12, 18 + (i % 3) * 2, bc(col));
    }
  }
  bench(gp, p, 1.1, 1.5, 1.6);
  lamp(gp, p, 1.68, 1.8, 46);
  shrub(p, 0.14, 1.4, 8);
  shrub(p, 0.16, 1.82, 9, '#5cbf32');
  shrub(p, 1.9, 1.5, 8);
}

// ——— Restaurant : grande salle à pignon, portique d'entrée, aile basse, terrasse ———

function drawRestaurant(gp: IsoPainter, p: IsoPainter): void {
  const [x0, y0, x1, y1, h] = [0.3, 0.28, 2.14, 1.8, 62] as const;
  const wall = '#fff3e0';
  const roof = '#9c3123';
  lot(gp, 3, '#e6d8c4', [[0.02, 0.02, 2.98, 0.2]], [x0, y0, 2.78, y1]);
  // Terrasse en dallage.
  gp.flat(0.12, 1.94, 2.88, 2.9, 0, '#d8c3a5');
  gp.ctx.save();
  gp.ctx.globalAlpha = 0.3;
  for (let x = 0.3; x < 2.88; x += 0.3) gp.line([x, 1.94, 0], [x, 2.9, 0], '#8d6e63', 1);
  for (let y = 2.1; y < 2.9; y += 0.3) gp.line([0.12, y, 0], [2.88, y, 0], '#8d6e63', 1);
  gp.ctx.restore();
  cypress(p, 0.12, 0.14, 46);
  ballTree(gp, p, 2.82, 0.3, 17);
  walls(p, x0, y0, x1, y1, h, wall, '#ffe0b2', '#6d4c41');
  // Façade : baies cintrées de part et d'autre du portique.
  for (const c of [0.62, 1.82]) {
    vitrine(p, 'left', c - 0.2, c + 0.2, 10, 38, y1, '#5d4037', DINING, { panes: 2, arch: true });
    bulgeAwning(p, 'left', c - 0.26, c + 0.26, 52, y1, ['#9c3123', '#fff3e0'], 0.3, 12);
  }
  vitrine(p, 'right', 0.4, 0.9, 10, 38, x1, '#5d4037', DINING, { panes: 2, arch: true });
  // Cheminée.
  p.box(1.5, 0.5, 1.72, 0.72, h + 10, h + 66, bc('#a1887f'));
  p.box(1.47, 0.47, 1.75, 0.75, h + 66, h + 71, bc('#5d4037'));
  const [r0, r1] = tiledGableY(p, x0, y0, x1, y1, h, 46, roof);
  gableEnd(p, x0, x1, y1, h, 46, wall, roof);
  // Grande baie en demi-lune dans le pignon.
  const xm = (x0 + x1) / 2;
  poly(p, archPts('left', xm - 0.42, xm + 0.42, h + 2, y1, 0.75), '#ffffff');
  poly(
    p,
    archPts('left', xm - 0.36, xm + 0.36, h + 4, y1, 0.75),
    p.gradient([xm, y1, h + 26], [xm, y1, h], '#bfe9fb', '#5fb8e6'),
  );
  for (const k of [-0.18, 0, 0.18])
    p.line([xm, y1, h + 4], [xm + k * 2, y1, h + 4 + 18 - Math.abs(k) * 40], '#ffffff', 2.2);
  mastProp(p, 'burger', xm, (r0[1] + r1[1]) / 2, h + 40, h + 52, 1.35);

  // Aile basse à droite, toit-terrasse avec balustrade.
  const [wx0, wy0, wx1, wy1, wh] = [x1, 0.6, 2.76, 1.66, 44] as const;
  walls(p, wx0, wy0, wx1, wy1, wh, '#ffe0b2', '#ffffff', '#6d4c41');
  vitrine(p, 'left', wx0 + 0.1, wx1 - 0.1, 10, 32, wy1, '#5d4037', DINING, { panes: 2 });
  vitrine(p, 'right', wy0 + 0.12, wy1 - 0.12, 10, 32, wx1, '#5d4037', DINING, { panes: 3 });
  cornice(p, wx0, wy0, wx1, wy1, wh, '#ffffff', '#c8b8a6', 3);
  balustrade(p, [wx0 + 0.04, wy1], [wx1, wy1], wh + 11);
  balustrade(p, [wx1, wy0], [wx1, wy1], wh + 11);
  reliefSign(p, 'right', 0.3, 1.66, h + 4, h + 20, x1 + 0.01, '#3e2723', '#ffcc80', 'RESTAURANT', '#ffcc80');

  // Portique d'entrée à colonnes et petit fronton.
  const [px0, px1, py] = [0.98, 1.46, 2.14] as const;
  glassDoor(p, 'left', 1.22, 0.36, 40, y1, '#5d4037');
  for (const x of [px0 + 0.04, px1 - 0.04]) {
    p.box(x - 0.04, py - 0.06, x + 0.04, py + 0.02, 0, 46, bc('#ffffff'));
    p.box(x - 0.06, py - 0.08, x + 0.06, py + 0.04, 0, 5, bc('#efe6da'));
  }
  p.box(px0 - 0.04, y1, px1 + 0.04, py + 0.06, 46, 52, bc('#ffffff'));
  poly(
    p,
    [
      [px0 - 0.04, py + 0.06, 52],
      [px1 + 0.04, py + 0.06, 52],
      [(px0 + px1) / 2, py + 0.06, 70],
    ],
    '#ffe0b2',
  );
  p.line([px0 - 0.08, py + 0.07, 51], [(px0 + px1) / 2, py + 0.07, 72], '#ffffff', 4);
  p.line([(px0 + px1) / 2, py + 0.07, 72], [px1 + 0.08, py + 0.07, 51], '#ffffff', 4);
  poly(
    p,
    [
      [px1 + 0.04, y1, 52],
      [px1 + 0.04, py + 0.06, 52],
      [px1 + 0.04, py + 0.06, 56],
      [px1 + 0.04, y1, 70],
    ],
    shade(roof, -0.1),
  );

  // Terrasse : guirlande lumineuse, tables à parasols, jardinières.
  const posts: [number, number][] = [
    [0.18, 2.0],
    [0.18, 2.86],
    [2.82, 2.86],
  ];
  for (const [x, y] of posts) p.line([x, y, 0], [x, y, 54], '#5d4037', 3);
  const garland = (a: readonly [number, number], b: readonly [number, number]) => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const sag = Math.sin(t * Math.PI) * 10;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      if (i < 10) {
        const t2 = (i + 1) / 10;
        p.line(
          [x, y, 52 - sag],
          [a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2, 52 - Math.sin(t2 * Math.PI) * 10],
          '#3e2723',
          1.2,
        );
      }
      p.dot(x, y, 50 - sag, 2.4, ['#ffeb3b', '#ff8a65', '#81d4fa'][i % 3]!);
    }
  };
  garland(posts[0]!, posts[1]!);
  garland(posts[1]!, posts[2]!);
  cafeTable(gp, p, 0.6, 2.3, roof, '#fff3e0', { chair: '#5d4037' });
  cafeTable(gp, p, 2.2, 2.3, roof, '#fff3e0', { chair: '#5d4037' });
  cafeTable(gp, p, 0.95, 2.66, '#ffb74d', '#fff3e0', { chair: '#5d4037' });
  cafeTable(gp, p, 1.95, 2.66, '#ffb74d', '#fff3e0', { chair: '#5d4037' });
  chalkboard(gp, p, 1.55, 2.4);
  flowerBox(p, 'left', 0.3, 0.9, 2.88, 0);
  flowerBox(p, 'left', 1.6, 2.7, 2.88, 0);
  shrub(p, 2.86, 2.0, 10);
  shrub(p, 2.88, 1.78, 9, '#5cbf32');
}

export const HEROES: Record<string, Hero> = {
  bakery: { height: 186, draw: drawBakery },
  flower_shop: { height: 150, draw: drawFlowerShop },
  cafe: { height: 160, draw: drawCafe },
  pizzeria: { height: 176, draw: drawPizzeria },
  grocery: { height: 140, draw: drawGrocery },
  fashion: { height: 160, draw: drawFashion },
  bookshop: { height: 180, draw: drawBookshop },
  restaurant: { height: 200, draw: drawRestaurant },
};
