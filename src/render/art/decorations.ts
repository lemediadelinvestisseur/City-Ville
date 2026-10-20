import { HALF_H, HALF_W } from '../iso';
import { shade } from './color';
import { boxColors, isoCanvas, type ArtPiece, type IsoPainter, type V3 } from './IsoPainter';
import { broadleafTree, coniferTree } from './nature';
import { roundBush } from './toon';

/**
 * Décorations au style « cartoon » : formes rondes et généreuses, couleurs
 * franches, petits détails amusants (oiseaux, fleurs, guirlandes). Le contour
 * sombre est ajouté par `library.ts`.
 */

const RX = HALF_W * Math.SQRT2;
const RY = HALF_H * Math.SQRT2;
const FLOWERS = ['#e91e63', '#ffeb3b', '#ff7043', '#ab47bc', '#ffffff', '#f06292', '#42a5f5'];
const STONE = '#e3dccd';
const BRONZE_GREEN: readonly [string, string] = ['#7fb39a', '#2f5a48'];

// ——— Outils ———

/** Cylindre (ou tronc de cône si r1 ≠ r0) vertical, rayons en cases. */
function cyl(p: IsoPainter, cx: number, cy: number, z0: number, z1: number, r0: number, color: string, r1 = r0) {
  const { ctx } = p;
  const [bx, by] = p.p(cx, cy, z0);
  const [, ty] = p.p(cx, cy, z1);
  const g = ctx.createLinearGradient(bx - r0 * RX, 0, bx + r0 * RX, 0);
  g.addColorStop(0, shade(color, 0.05));
  g.addColorStop(0.3, shade(color, 0.3));
  g.addColorStop(0.75, shade(color, -0.06));
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(bx, by, r0 * RX, r0 * RY, 0, Math.PI, 0, true);
  ctx.lineTo(bx + r1 * RX, ty);
  ctx.ellipse(bx, ty, r1 * RX, r1 * RY, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.2);
  ctx.beginPath();
  ctx.ellipse(bx, ty, r1 * RX, r1 * RY, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Bande colorée autour d'un cylindre (moitié avant seulement). */
function band(p: IsoPainter, cx: number, cy: number, z0: number, z1: number, r0: number, r1: number, color: string) {
  const { ctx } = p;
  const [bx, by] = p.p(cx, cy, z0);
  const [, ty] = p.p(cx, cy, z1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(bx, by, r0 * RX, r0 * RY, 0, Math.PI, 0, true);
  ctx.lineTo(bx + r1 * RX, ty);
  ctx.ellipse(bx, ty, r1 * RX, r1 * RY, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
}

/** Disque plat (bassin, margelle) avec bord épais. */
function disc(p: IsoPainter, cx: number, cy: number, z0: number, z1: number, r: number, color: string): void {
  cyl(p, cx, cy, z0, z1, r, color);
}

/** Petite fleur à cinq pétales en coordonnées écran. */
function blossom(p: IsoPainter, x: number, y: number, z: number, r: number, color: string): void {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(sx + Math.cos(a) * r * 0.75, sy + Math.sin(a) * r * 0.6, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color === '#ffeb3b' ? '#ff9800' : '#fff59d';
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

/** Touffe de feuillage fleurie. */
function flowerClump(p: IsoPainter, x: number, y: number, r: number, seed: number, z = 0): void {
  p.dot(x, y, z + r * 0.6, r, '#3f8f3a');
  p.dot(x - 0.02, y - 0.02, z + r * 0.9, r * 0.75, '#56a845');
  for (let i = 0; i < 3; i++) {
    const a = seed * 1.7 + i * 2.1;
    blossom(
      p,
      x + Math.cos(a) * 0.035,
      y + Math.sin(a) * 0.035,
      z + r * 1.1 + i * 1.5,
      r * 0.45,
      FLOWERS[(seed + i) % FLOWERS.length] ?? '#fff',
    );
  }
}

/** Petit oiseau posé (moineau ou pigeon). */
function bird(p: IsoPainter, at: V3, color = '#90a4ae', flip = false): void {
  const [sx, sy] = p.p(...at);
  const { ctx } = p;
  const d = flip ? -1 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 4, 5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - d * 4, sy - 5);
  ctx.lineTo(sx - d * 9, sy - 7);
  ctx.lineTo(sx - d * 8, sy - 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + d * 4, sy - 8, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.moveTo(sx + d * 6.5, sy - 8.5);
  ctx.lineTo(sx + d * 9.5, sy - 7.6);
  ctx.lineTo(sx + d * 6.5, sy - 6.8);
  ctx.fill();
  ctx.fillStyle = '#212121';
  ctx.fillRect(sx + d * 4.5 - 0.6, sy - 9.2, 1.3, 1.3);
}

/** Jet d'eau en arc avec gouttelettes. */
function jet(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, rise: number, fall: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dx * 0.45, y - rise, x + dx, y + fall);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(160,220,250,0.9)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(235,250,255,0.95)';
  for (const t of [0.75, 0.9]) {
    const bx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + dx * 0.45) + t * t * (x + dx);
    const by = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y - rise) + t * t * (y + fall);
    ctx.beginPath();
    ctx.arc(bx + dx * 0.08, by + 3, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Ronds dans l'eau autour d'un point. */
function splash(p: IsoPainter, x: number, y: number, z: number, r: number): void {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  for (const k of [1, 0.6]) {
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * k, r * k * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Bassin rond : margelle épaisse, eau dégradée avec reflets. */
function basin(p: IsoPainter, cx: number, cy: number, r: number, h: number): void {
  disc(p, cx, cy, 0, h, r, '#d8d0bf');
  const [sx, sy] = p.p(cx, cy, h);
  const { ctx } = p;
  const g = ctx.createRadialGradient(sx - r * RX * 0.3, sy - r * RY * 0.3, 2, sx, sy, r * RX);
  g.addColorStop(0, '#9be0fb');
  g.addColorStop(1, '#2f9fdc');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 1, (r - 0.1) * RX, (r - 0.1) * RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(sx - r * RX * 0.2, sy - r * RY * 0.15, r * RX * 0.45, r * RY * 0.3, 0, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
}

/** Dalle de pierre carrée avec joints. */
function plaza(p: IsoPainter, size: number, color = '#e8e2d4'): void {
  p.flat(0.05, 0.05, size - 0.05, size - 0.05, 0, color, shade(color, -0.15));
  for (let i = 0.5; i < size - 0.1; i += 0.5) {
    p.line([i, 0.08, 0], [i, size - 0.08, 0], shade(color, -0.07), 1);
    p.line([0.08, i, 0], [size - 0.08, i, 0], shade(color, -0.07), 1);
  }
}

/** Plaque dorée sur une face gauche. */
function plaque(p: IsoPainter, a: number, b: number, za: number, zb: number, y: number): void {
  p.leftQuad(a, b, za, zb, y, '#f9c74f', '#a87b12');
  p.line([a + 0.04, y, (za + zb) / 2 + 1.5], [b - 0.04, y, (za + zb) / 2 + 1.5], '#a87b12', 1);
  p.line([a + 0.06, y, (za + zb) / 2 - 1.5], [b - 0.08, y, (za + zb) / 2 - 1.5], '#a87b12', 1);
}

/** Sommets d'un octogone (ou n-gone) horizontal. */
function ring(cx: number, cy: number, r: number, z: number, n = 8): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
  }
  return pts;
}

/** Visibilité d'une face verticale de normale d'angle a (vers la caméra si > 0). */
const facing = (a: number) => Math.cos(a) + Math.sin(a);

/** Prisme à n côtés (socle, plateforme). */
function prism(p: IsoPainter, cx: number, cy: number, r: number, z0: number, z1: number, color: string, n = 8) {
  const bot = ring(cx, cy, r, z0, n);
  const top = ring(cx, cy, r, z1, n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const m = ((i + 1) * Math.PI * 2) / n;
    if (facing(m) <= 0) continue;
    p.fill([bot[i]!, bot[j]!, top[j]!, top[i]!], shade(color, (Math.sin(m) - Math.cos(m)) * 0.12 - 0.04));
  }
  p.fill(top, shade(color, 0.15));
}

// ——— Décorations ———

function flowerBed(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 30);
  p.groundEllipse(0.55, 0.55, 0, 0.42, 'rgba(0,0,0,0.15)');
  // Jardinière ronde en pierre, terre bombée et fleurs.
  disc(p, 0.5, 0.5, 0, 7, 0.4, '#c9b79a');
  p.groundEllipse(0.5, 0.5, 7, 0.34, '#6b4a2f');
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    const [x, y] = [0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4];
    if (facing(a) > -0.3) p.dot(x, y, 4, 1.6, shade('#c9b79a', -0.25));
  }
  const spots: Array<[number, number]> = [
    [0.32, 0.4],
    [0.5, 0.3],
    [0.66, 0.42],
    [0.38, 0.62],
    [0.62, 0.62],
    [0.5, 0.74],
    [0.28, 0.55],
    [0.74, 0.56],
  ];
  spots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  spots.forEach(([x, y], i) => flowerClump(p, x, y, 5, i, 6));
  // Tournesol au centre.
  p.line([0.5, 0.5, 8], [0.5, 0.5, 24], '#388e3c', 2.5);
  blossom(p, 0.5, 0.5, 25, 6, '#ffeb3b');
  return finish();
}

function bench(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 30);
  p.groundEllipse(0.55, 0.55, 0, 0.32, 'rgba(0,0,0,0.16)');
  roundBush(p, 0.2, 0.2, 7);
  const iron = '#2e3b33';
  // Pieds en fonte recourbés et accoudoirs.
  for (const x of [0.18, 0.82]) {
    p.box(x - 0.03, 0.44, x + 0.03, 0.62, 0, 4, boxColors(iron));
    p.line([x, 0.6, 1], [x, 0.5, 11], iron, 3);
    p.line([x, 0.44, 1], [x, 0.46, 11], iron, 3);
    p.line([x, 0.4, 11], [x, 0.38, 26], iron, 3);
    p.line([x, 0.4, 18], [x, 0.6, 18], iron, 2.5);
    p.dot(x, 0.61, 17, 2.4, iron);
  }
  // Assise et dossier à lattes vertes.
  const slat = '#3f9b4a';
  for (const [y, z] of [
    [0.42, 11],
    [0.5, 11],
    [0.57, 11],
  ] as const)
    p.box(0.13, y, 0.87, y + 0.06, z, z + 2.5, boxColors(slat));
  for (const z of [16, 21]) p.box(0.13, 0.36, 0.87, 0.4, z, z + 3.5, boxColors(slat));
  bird(p, [0.66, 0.5, 13.5], '#8fa5b5');
  return finish();
}

function lamp(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 80);
  p.groundEllipse(0.5, 0.5, 0, 0.16, 'rgba(0,0,0,0.2)');
  const iron = '#2f4a3c';
  prism(p, 0.5, 0.5, 0.11, 0, 5, iron);
  cyl(p, 0.5, 0.5, 5, 14, 0.07, iron, 0.045);
  cyl(p, 0.5, 0.5, 14, 58, 0.035, iron, 0.03);
  band(p, 0.5, 0.5, 30, 33, 0.04, 0.04, '#c9a43a');
  cyl(p, 0.5, 0.5, 58, 62, 0.06, iron);
  // Bras en volute avec panier de fleurs suspendu.
  const [ax, ay] = p.p(0.5, 0.5, 52);
  const { ctx } = p;
  ctx.strokeStyle = iron;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.bezierCurveTo(ax + 6, ay - 4, ax + 14, ay - 2, ax + 15, ay + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ax + 6, ay + 2, 3, Math.PI, Math.PI * 2.4);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax + 15, ay + 4);
  ctx.lineTo(ax + 12, ay + 12);
  ctx.moveTo(ax + 15, ay + 4);
  ctx.lineTo(ax + 18, ay + 12);
  ctx.stroke();
  ctx.fillStyle = '#8d5a30';
  ctx.beginPath();
  ctx.ellipse(ax + 15, ay + 14, 5.5, 3.5, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#43a047';
  ctx.beginPath();
  ctx.ellipse(ax + 15, ay + 12.5, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, c] of [
    [-3, '#e91e63'],
    [1, '#ffeb3b'],
    [4, '#ab47bc'],
  ] as const) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(ax + 15 + dx, ay + 11, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lanterne lumineuse et couronne.
  const [sx, sy] = p.p(0.5, 0.5, 70);
  const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 18);
  glow.addColorStop(0, 'rgba(255,241,170,0.9)');
  glow.addColorStop(1, 'rgba(255,241,170,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = iron;
  ctx.beginPath();
  ctx.moveTo(sx - 5, sy + 8);
  ctx.lineTo(sx + 5, sy + 8);
  ctx.lineTo(sx + 7, sy + 5);
  ctx.lineTo(sx - 7, sy + 5);
  ctx.fill();
  const g = ctx.createLinearGradient(0, sy - 7, 0, sy + 5);
  g.addColorStop(0, '#fffde7');
  g.addColorStop(1, '#ffd54f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(sx - 8, sy - 7);
  ctx.lineTo(sx + 8, sy - 7);
  ctx.lineTo(sx + 6, sy + 5);
  ctx.lineTo(sx - 6, sy + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = iron;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 7);
  ctx.lineTo(sx, sy + 5);
  ctx.stroke();
  ctx.fillStyle = iron;
  ctx.beginPath();
  ctx.moveTo(sx - 11, sy - 7);
  ctx.quadraticCurveTo(sx, sy - 18, sx + 11, sy - 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9a43a';
  ctx.beginPath();
  ctx.arc(sx, sy - 16, 2.6, 0, Math.PI * 2);
  ctx.fill();
  return finish();
}

function flag(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 96);
  p.groundEllipse(0.55, 0.55, 0, 0.4, 'rgba(0,0,0,0.15)');
  // Socle octogonal à deux marches, entouré de fleurs.
  prism(p, 0.5, 0.5, 0.42, 0, 5, '#cfc6b4');
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    if (facing(a) < -0.6) continue;
    flowerClump(p, 0.5 + Math.cos(a) * 0.32, 0.5 + Math.sin(a) * 0.32, 3.5, i, 5);
  }
  prism(p, 0.5, 0.5, 0.2, 5, 14, '#e3dccd');
  // Mât et boule dorée.
  cyl(p, 0.5, 0.5, 14, 90, 0.025, '#cfd8dc', 0.018);
  p.dot(0.5, 0.5, 92, 3.4, '#f9c74f');
  const [sx, sy] = p.p(0.5, 0.5, 87);
  const { ctx } = p;
  // Drapeau ondulant, bande d'ombre, étoile.
  ctx.fillStyle = '#1e63c6';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(sx + 10, sy - 7, sx + 20, sy + 5, sx + 34, sy - 1);
  ctx.lineTo(sx + 34, sy + 19);
  ctx.bezierCurveTo(sx + 20, sy + 25, sx + 10, sy + 13, sx, sy + 20);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,30,0.22)';
  ctx.beginPath();
  ctx.ellipse(sx + 24, sy + 10, 6, 16, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(sx + 10, sy + 6, 4, 14, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  const cx = sx + 15;
  const cy = sy + 9;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 7 : 3;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return finish();
}

function statue(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 86);
  p.groundEllipse(0.55, 0.55, 0, 0.38, 'rgba(0,0,0,0.18)');
  p.box(0.12, 0.12, 0.88, 0.88, 0, 6, boxColors('#cfc6b4'));
  for (const [x, y] of [
    [0.2, 0.8],
    [0.8, 0.2],
    [0.5, 0.82],
    [0.82, 0.5],
    [0.8, 0.8],
  ] as const)
    flowerClump(p, x, y, 3.6, Math.round(x * 10), 6);
  p.box(0.28, 0.28, 0.72, 0.72, 6, 30, boxColors(STONE));
  p.box(0.25, 0.25, 0.75, 0.75, 30, 34, boxColors('#d6cdb9'));
  p.box(0.25, 0.25, 0.75, 0.75, 6, 9, boxColors('#d6cdb9'));
  plaque(p, 0.36, 0.64, 14, 24, 0.72);
  // Le maire en bronze : redingote, haut-de-forme, bras levé pour saluer.
  const [sx, sy] = p.p(0.5, 0.5, 34);
  const { ctx } = p;
  const bronze = ctx.createLinearGradient(sx - 12, sy - 50, sx + 12, sy);
  bronze.addColorStop(0, '#e6b56a');
  bronze.addColorStop(1, '#8a5a24');
  ctx.fillStyle = bronze;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(sx - 6, sy - 14, 4.5, 14);
  ctx.fillRect(sx + 1.5, sy - 14, 4.5, 14);
  ctx.beginPath();
  ctx.moveTo(sx - 10, sy - 10);
  ctx.quadraticCurveTo(sx - 11, sy - 32, sx, sy - 34);
  ctx.quadraticCurveTo(sx + 11, sy - 32, sx + 10, sy - 10);
  ctx.closePath();
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.strokeStyle = bronze;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx + 7, sy - 28);
  ctx.quadraticCurveTo(sx + 15, sy - 34, sx + 14, sy - 46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 7, sy - 28);
  ctx.lineTo(sx - 11, sy - 14);
  ctx.stroke();
  ctx.fillStyle = bronze;
  ctx.beginPath();
  ctx.arc(sx + 14, sy - 48, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy - 39, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5d3a14';
  ctx.fillRect(sx - 8, sy - 45, 16, 2.5);
  ctx.fillRect(sx - 5, sy - 56, 10, 11);
  ctx.fillStyle = 'rgba(255,240,200,0.5)';
  ctx.fillRect(sx - 4, sy - 55, 2, 9);
  ctx.beginPath();
  ctx.ellipse(sx - 3, sy - 26, 2, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  bird(p, [0.68, 0.32, 34], '#b0bec5', true);
  return finish();
}

function fountain(): ArtPiece {
  const { painter: p, finish } = isoCanvas(2, 2, 70);
  plaza(p, 2);
  for (const [x, y] of [
    [0.25, 0.25],
    [1.75, 0.25],
    [0.25, 1.75],
  ] as const) {
    disc(p, x, y, 0, 6, 0.13, '#b56a3c');
    flowerClump(p, x, y, 6, Math.round(x * 3 + y), 6);
  }
  basin(p, 1, 1, 0.78, 10);
  splash(p, 0.7, 1.05, 10, 8);
  splash(p, 1.25, 1.2, 10, 7);
  cyl(p, 1, 1, 10, 30, 0.1, '#d8d0bf', 0.07);
  disc(p, 1, 1, 30, 34, 0.32, '#d8d0bf');
  p.groundEllipse(1, 1, 34, 0.26, '#6cc6f0');
  cyl(p, 1, 1, 34, 44, 0.05, '#d8d0bf');
  p.dot(1, 1, 47, 4.5, '#d8d0bf');
  const [sx, sy] = p.p(1, 1, 48);
  const { ctx } = p;
  for (const dir of [-1, 1]) {
    jet(ctx, sx, sy - 2, dir * 18, 14, 18);
    jet(ctx, sx, sy - 2, dir * 34, 20, 34);
  }
  jet(ctx, sx, sy - 2, 3, 18, 6);
  // Un canard pour sourire.
  const [dx, dy] = p.p(1.35, 0.85, 11);
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.ellipse(dx, dy - 3, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dx + 4, dy - 8, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9800';
  ctx.beginPath();
  ctx.moveTo(dx + 6.5, dy - 8.5);
  ctx.lineTo(dx + 10, dy - 7.5);
  ctx.lineTo(dx + 6.5, dy - 6.5);
  ctx.fill();
  flowerClump(p, 1.75, 1.75, 6, 4, 0);
  return finish();
}

function palm(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 104);
  p.groundEllipse(0.6, 0.6, 0, 0.3, 'rgba(60,40,10,0.2)');
  const { ctx } = p;
  const [bx, by] = p.p(0.5, 0.5, 0);
  // Tronc légèrement courbé, annelé.
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const x = bx + Math.sin(t * 1.4) * 10;
    const y = by - t * 74;
    ctx.fillStyle = i % 2 === 0 ? '#9c7a4f' : '#87663f';
    ctx.beginPath();
    ctx.ellipse(x, y, 4.5 - t * 1.2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tx = bx + Math.sin(1.4) * 10;
  const ty = by - 76;
  const fronds: Array<[number, string]> = [
    [-2.7, '#2e7d32'],
    [-0.4, '#2e7d32'],
    [-2.0, '#43a047'],
    [-1.1, '#43a047'],
    [0.3, '#388e3c'],
    [-3.4, '#388e3c'],
  ];
  for (const [a, color] of fronds) {
    const ex = tx + Math.cos(a) * 34;
    const ey = ty + Math.sin(a) * 14 + 16;
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo((tx + ex) / 2, ty - 12, ex, ey);
    ctx.stroke();
  }
  for (const dx of [-3, 3, 0]) {
    ctx.fillStyle = '#6d4c41';
    ctx.beginPath();
    ctx.arc(tx + dx, ty + 4 + (dx === 0 ? 2 : 0), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish();
}

function lighthouse(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 150);
  p.groundEllipse(0.55, 0.55, 0, 0.44, 'rgba(0,0,0,0.2)');
  // Rochers arrondis à la base.
  for (const [x, y, r, c] of [
    [0.2, 0.3, 9, '#9e9e9e'],
    [0.3, 0.75, 10, '#8d8d8d'],
    [0.78, 0.25, 8, '#a5a5a5'],
    [0.8, 0.72, 11, '#949494'],
    [0.55, 0.85, 8, '#a0a0a0'],
  ] as const) {
    p.dot(x, y, r * 0.5, r, shade(c, -0.1));
    p.dot(x - 0.03, y - 0.03, r * 0.75, r * 0.55, shade(c, 0.25));
  }
  prism(p, 0.5, 0.5, 0.36, 0, 10, '#b8b0a0');
  // Tour effilée à bandes rouges et blanches.
  const r0 = 0.27;
  const r1 = 0.19;
  const z0 = 10;
  const z1 = 112;
  cyl(p, 0.5, 0.5, z0, z1, r0, '#ffffff', r1);
  const bands = 6;
  for (let i = 1; i < bands; i += 2) {
    const a = z0 + ((z1 - z0) * i) / bands;
    const b = z0 + ((z1 - z0) * (i + 1)) / bands;
    const ra = r0 + ((r1 - r0) * (a - z0)) / (z1 - z0);
    const rb = r0 + ((r1 - r0) * (b - z0)) / (z1 - z0);
    band(p, 0.5, 0.5, a, b, ra, rb, '#e53935');
  }
  // Porte cintrée et hublots.
  const [dx, dy] = p.p(0.62, 0.62, 10);
  const { ctx } = p;
  ctx.fillStyle = '#1565c0';
  ctx.beginPath();
  ctx.moveTo(dx - 5, dy + 2);
  ctx.lineTo(dx - 5, dy - 12);
  ctx.arc(dx, dy - 12, 5, Math.PI, 0);
  ctx.lineTo(dx + 5, dy + 1);
  ctx.closePath();
  ctx.fill();
  for (const z of [50, 84]) {
    const [wx, wy] = p.p(0.6, 0.62, z);
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.arc(wx, wy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    ctx.arc(wx, wy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Galerie à balustrade.
  disc(p, 0.5, 0.5, z1, z1 + 4, 0.28, '#37474f');
  const lz = z1 + 4;
  cyl(p, 0.5, 0.5, lz, lz + 16, 0.15, '#fff59d');
  const [lx, ly] = p.p(0.5, 0.5, lz + 9);
  const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 26);
  glow.addColorStop(0, 'rgba(255,250,200,0.95)');
  glow.addColorStop(1, 'rgba(255,245,180,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lx, ly, 26, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI * 0.05 + (i * Math.PI * 0.9) / 4;
    const [px, py] = p.p(0.5, 0.5, lz);
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * 0.15 * RX, py + Math.sin(a) * 0.15 * RY);
    ctx.lineTo(px + Math.cos(a) * 0.15 * RX, py + Math.sin(a) * 0.15 * RY - 16);
    ctx.stroke();
  }
  const [gx, gy] = p.p(0.5, 0.5, lz + 7);
  ctx.strokeStyle = '#263238';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(gx, gy, 0.28 * RX, 0.28 * RY, 0, 0, Math.PI);
  ctx.stroke();
  for (let i = 0; i <= 8; i++) {
    const a = (i * Math.PI) / 8;
    const [px, py] = p.p(0.5, 0.5, lz);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * 0.28 * RX, py + Math.sin(a) * 0.28 * RY);
    ctx.lineTo(px + Math.cos(a) * 0.28 * RX, py + Math.sin(a) * 0.28 * RY - 7);
    ctx.stroke();
  }
  // Coupole rouge et girouette.
  const [cx, cy] = p.p(0.5, 0.5, lz + 16);
  const dome = ctx.createRadialGradient(cx - 5, cy - 9, 1, cx, cy - 4, 16);
  dome.addColorStop(0, '#ff8a80');
  dome.addColorStop(1, '#b71c1c');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 0.2 * RX, 14, 0, Math.PI, 0);
  ctx.ellipse(cx, cy, 0.2 * RX, 0.2 * RY, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#37474f';
  ctx.fillRect(cx - 1, cy - 20, 2, 7);
  ctx.beginPath();
  ctx.arc(cx, cy - 21, 2.4, 0, Math.PI * 2);
  ctx.fill();
  return finish();
}

function tulips(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 26);
  p.box(0.08, 0.08, 0.92, 0.92, 0, 4, boxColors('#a1673f'));
  p.flat(0.12, 0.12, 0.88, 0.88, 4, '#6b4a2f');
  const colors = ['#e53935', '#fdd835', '#ec407a', '#ff7043', '#ab47bc', '#ffffff'];
  let i = 0;
  for (let y = 0.2; y < 0.86; y += 0.15) {
    for (let x = 0.2; x < 0.86; x += 0.15) {
      const z = 4;
      const [bx, by] = p.p(x, y, z);
      const { ctx } = p;
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.ellipse(bx - 3, by - 3, 1.6, 4.5, -0.5, 0, Math.PI * 2);
      ctx.ellipse(bx + 3, by - 3, 1.6, 4.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - 11);
      ctx.stroke();
      const c = colors[(i++ + Math.round(y * 10)) % colors.length] ?? '#fff';
      const [sx, sy] = [bx, by - 13];
      ctx.fillStyle = shade(c, -0.15);
      ctx.beginPath();
      ctx.ellipse(sx, sy, 3.8, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy - 4);
      ctx.lineTo(sx - 2, sy - 1);
      ctx.lineTo(sx, sy - 5);
      ctx.lineTo(sx + 2, sy - 1);
      ctx.lineTo(sx + 4, sy - 4);
      ctx.quadraticCurveTo(sx + 4.5, sy + 4, sx, sy + 4);
      ctx.quadraticCurveTo(sx - 4.5, sy + 4, sx - 4, sy - 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(sx - 1.5, sy, 1, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish();
}

function bandstand(): ArtPiece {
  const { painter: p, finish } = isoCanvas(2, 2, 100);
  p.groundEllipse(1.05, 1.05, 0, 0.92, 'rgba(0,0,0,0.15)');
  const c = 1;
  // Plateforme octogonale avec marches.
  prism(p, c, c, 0.9, 0, 6, '#cbbfa8');
  prism(p, c, c, 0.82, 6, 14, '#efe7d6');
  p.box(1.5, 1.55, 1.75, 1.8, 0, 7, boxColors('#d9cfbb'));
  const cols = ring(c, c, 0.72, 14);
  const colAngle = (i: number) => ((i + 0.5) * Math.PI * 2) / 8;
  const column = (i: number) => {
    const [x, y] = cols[i]!;
    cyl(p, x, y, 14, 60, 0.035, '#ffffff');
  };
  const back = [...cols.keys()].filter((i) => facing(colAngle(i)) <= 0.2);
  const front = [...cols.keys()].filter((i) => facing(colAngle(i)) > 0.2);
  back.forEach(column);
  // Pupitres de musiciens.
  for (const [x, y] of [
    [0.85, 0.9],
    [1.15, 0.85],
  ] as const) {
    p.line([x, y, 14], [x, y, 28], '#37474f', 1.5);
    p.fill(
      [
        [x - 0.06, y + 0.04, 28],
        [x + 0.06, y - 0.04, 28],
        [x + 0.06, y - 0.04, 34],
        [x - 0.06, y + 0.04, 34],
      ],
      '#ffffff',
    );
  }
  // Balustrade avant.
  for (let k = 0; k < 8; k++) {
    const j = (k + 1) % 8;
    const m = ((k + 1) * Math.PI * 2) / 8;
    if (facing(m) <= 0) continue;
    const a = cols[k]!;
    const b = cols[j]!;
    p.line([a[0], a[1], 26], [b[0], b[1], 26], '#ffffff', 2.5);
    for (let t = 0.12; t < 1; t += 0.16) {
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      p.line([x, y, 14], [x, y, 26], '#f3ede0', 1.6);
    }
  }
  front.forEach(column);
  // Toit octogonal à côtes vertes et blanches, lambrequin festonné.
  const eave = ring(c, c, 0.95, 60);
  const apex: V3 = [c, c, 92];
  const faces = [...eave.keys()].sort(
    (a, b) => facing(((a + 1) * Math.PI * 2) / 8) - facing(((b + 1) * Math.PI * 2) / 8),
  );
  for (const k of faces) {
    const j = (k + 1) % 8;
    const m = ((k + 1) * Math.PI * 2) / 8;
    const base = k % 2 ? '#2e7d32' : '#f1f8e9';
    p.fill([eave[k]!, eave[j]!, apex], shade(base, (Math.sin(m) - Math.cos(m)) * 0.1));
    if (facing(m) > 0.5) {
      const a = eave[k]!;
      const b = eave[j]!;
      for (let t = 0; t < 1; t += 0.25) {
        const x = a[0] + (b[0] - a[0]) * (t + 0.125);
        const y = a[1] + (b[1] - a[1]) * (t + 0.125);
        const [sx, sy] = p.p(x, y, 60);
        p.ctx.fillStyle = k % 2 ? '#2e7d32' : '#e8f5e9';
        p.ctx.beginPath();
        p.ctx.arc(sx, sy, 5, 0, Math.PI);
        p.ctx.fill();
      }
    }
  }
  // Fleuron et fanion.
  cyl(p, c, c, 90, 94, 0.05, '#f9c74f');
  p.line([c, c, 94], [c, c, 104], '#9e9e9e', 2);
  const [fx, fy] = p.p(c, c, 104);
  p.ctx.fillStyle = '#e53935';
  p.ctx.beginPath();
  p.ctx.moveTo(fx, fy);
  p.ctx.lineTo(fx + 12, fy + 3);
  p.ctx.lineTo(fx, fy + 7);
  p.ctx.fill();
  // Note de musique qui s'envole.
  const [nx, ny] = p.p(1.55, 0.4, 70);
  p.ctx.fillStyle = '#37474f';
  p.ctx.beginPath();
  p.ctx.ellipse(nx, ny, 3.5, 2.6, -0.4, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillRect(nx + 2.2, ny - 12, 1.6, 12);
  p.ctx.beginPath();
  p.ctx.moveTo(nx + 3.8, ny - 12);
  p.ctx.quadraticCurveTo(nx + 9, ny - 9, nx + 7, ny - 4);
  p.ctx.quadraticCurveTo(nx + 7, ny - 8, nx + 3.8, ny - 8);
  p.ctx.fill();
  roundBush(p, 0.2, 1.75, 7);
  roundBush(p, 1.78, 0.25, 7, '#5cbf32');
  return finish();
}

function arch(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 70);
  p.groundEllipse(0.5, 0.5, 0, 0.42, 'rgba(0,0,0,0.15)');
  p.flat(0.3, 0.38, 0.7, 0.62, 0, '#e9dcc0');
  // Piliers en treillis blanc.
  for (const x of [0.14, 0.86]) {
    p.box(x - 0.06, 0.42, x + 0.06, 0.58, 0, 46, boxColors('#ffffff'));
    for (let z = 6; z < 44; z += 8) {
      p.line([x - 0.06, 0.58, z], [x + 0.06, 0.58, z + 8], '#cfd8dc', 1);
      p.line([x + 0.06, 0.58, z], [x - 0.06, 0.58, z + 8], '#cfd8dc', 1);
    }
    for (const z of [12, 26, 38]) flowerClump(p, x + 0.07, 0.6, 3.6, Math.round(z + x * 10), z - 4);
  }
  const [ax, ay] = p.p(0.14, 0.5, 46);
  const [bx, by] = p.p(0.86, 0.5, 46);
  const top = Math.min(ay, by) - 30;
  const { ctx } = p;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + bx) / 2, top, bx, by);
  ctx.stroke();
  // Guirlande de roses le long de l'arceau.
  const roses = ['#e91e63', '#ff80ab', '#ffffff', '#c2185b', '#ffeb3b'];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * ((ax + bx) / 2) + t * t * bx;
    const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * top + t * t * by;
    ctx.fillStyle = i % 2 ? '#388e3c' : '#4caf50';
    ctx.beginPath();
    ctx.ellipse(x - 2, y + 1, 6, 4.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (i % 2 === 0 || i === 7) {
      const c = roses[i % roses.length] ?? '#fff';
      ctx.fillStyle = shade(c, -0.15);
      ctx.beginPath();
      ctx.arc(x + 1, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + 0.5, y - 2.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Petit cœur suspendu au sommet.
  const hx = (ax + bx) / 2;
  const hy = (ay + top) / 2 + 9;
  ctx.strokeStyle = '#9e9e9e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, hy - 10);
  ctx.lineTo(hx, hy - 3);
  ctx.stroke();
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.moveTo(hx, hy + 6);
  ctx.bezierCurveTo(hx - 7, hy, hx - 4, hy - 5, hx, hy - 2);
  ctx.bezierCurveTo(hx + 4, hy - 5, hx + 7, hy, hx, hy + 6);
  ctx.fill();
  return finish();
}

/** Cheval cabré et cavalier en bronze, en coordonnées écran autour de (sx, sy). */
function rider(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const bronze = ctx.createLinearGradient(sx - 26, sy - 70, sx + 26, sy);
  bronze.addColorStop(0, BRONZE_GREEN[0]);
  bronze.addColorStop(1, BRONZE_GREEN[1]);
  ctx.fillStyle = bronze;
  ctx.strokeStyle = bronze;
  ctx.lineCap = 'round';
  // Pattes arrière ancrées sur le socle.
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx - 12, sy - 22);
  ctx.quadraticCurveTo(sx - 16, sy - 10, sx - 12, sy);
  ctx.moveTo(sx - 6, sy - 22);
  ctx.quadraticCurveTo(sx - 4, sy - 10, sx - 3, sy);
  ctx.stroke();
  // Queue.
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx - 16, sy - 28);
  ctx.quadraticCurveTo(sx - 26, sy - 24, sx - 24, sy - 10);
  ctx.stroke();
  // Corps incliné.
  ctx.save();
  ctx.translate(sx - 2, sy - 32);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Encolure et tête.
  ctx.beginPath();
  ctx.moveTo(sx + 6, sy - 34);
  ctx.quadraticCurveTo(sx + 10, sy - 50, sx + 15, sy - 56);
  ctx.lineTo(sx + 24, sy - 52);
  ctx.quadraticCurveTo(sx + 26, sy - 48, sx + 22, sy - 47);
  ctx.lineTo(sx + 16, sy - 46);
  ctx.quadraticCurveTo(sx + 14, sy - 38, sx + 14, sy - 30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + 14, sy - 56);
  ctx.lineTo(sx + 15, sy - 62);
  ctx.lineTo(sx + 18, sy - 56);
  ctx.fill();
  // Pattes avant levées.
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx + 8, sy - 36);
  ctx.quadraticCurveTo(sx + 20, sy - 34, sx + 20, sy - 26);
  ctx.moveTo(sx + 4, sy - 34);
  ctx.quadraticCurveTo(sx + 14, sy - 28, sx + 12, sy - 20);
  ctx.stroke();
  // Cavalier, bicorne et épée levée.
  ctx.beginPath();
  ctx.moveTo(sx - 6, sy - 40);
  ctx.quadraticCurveTo(sx - 6, sy - 58, sx + 1, sy - 60);
  ctx.quadraticCurveTo(sx + 6, sy - 56, sx + 4, sy - 40);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy - 65, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy - 68);
  ctx.quadraticCurveTo(sx, sy - 78, sx + 9, sy - 68);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy - 56);
  ctx.lineTo(sx + 8, sy - 66);
  ctx.stroke();
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx + 8, sy - 66);
  ctx.lineTo(sx + 14, sy - 84);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx - 6, sy - 38, 5, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function equestrian(): ArtPiece {
  const { painter: p, finish } = isoCanvas(2, 2, 110);
  plaza(p, 2);
  for (const [x, y] of [
    [0.25, 0.25],
    [1.75, 0.25],
    [0.25, 1.75],
    [1.75, 1.75],
  ] as const)
    roundBush(p, x, y, 9, '#3f9b3a');
  for (const [x, y] of [
    [0.45, 1.6],
    [1.6, 0.45],
    [1.6, 1.6],
  ] as const)
    flowerClump(p, x, y, 4.5, Math.round(x * 5 + y), 0);
  p.box(0.42, 0.42, 1.58, 1.58, 0, 8, boxColors('#cbbfa8'));
  p.box(0.56, 0.56, 1.44, 1.44, 8, 14, boxColors('#ddd3bf'));
  p.box(0.66, 0.66, 1.34, 1.34, 14, 42, boxColors(STONE));
  p.box(0.62, 0.62, 1.38, 1.38, 42, 47, boxColors('#d6cdb9'));
  plaque(p, 0.82, 1.18, 22, 34, 1.34);
  // Guirlande de laurier sur la face droite.
  const [gx, gy] = p.p(1.34, 1.0, 30);
  p.ctx.strokeStyle = '#558b2f';
  p.ctx.lineWidth = 3;
  p.ctx.beginPath();
  p.ctx.ellipse(gx, gy, 7, 9, 0, 0, Math.PI * 2);
  p.ctx.stroke();
  p.ctx.fillStyle = '#e53935';
  p.ctx.fillRect(gx - 1.5, gy + 7, 3, 7);
  const [sx, sy] = p.p(1, 1, 47);
  rider(p.ctx, sx, sy);
  return finish();
}

function grandFountain(): ArtPiece {
  const { painter: p, finish } = isoCanvas(3, 3, 100);
  plaza(p, 3);
  for (const [x, y] of [
    [0.3, 0.3],
    [2.7, 0.3],
    [0.3, 2.7],
  ] as const) {
    roundBush(p, x, y, 10, '#43a047');
    flowerClump(p, x + 0.12, y + 0.12, 5, Math.round(x * 3), 0);
  }
  basin(p, 1.5, 1.5, 1.28, 11);
  for (const [x, y] of [
    [0.85, 1.5],
    [1.5, 0.85],
    [2.0, 1.95],
    [1.1, 2.0],
  ] as const)
    splash(p, x, y, 11, 9);
  // Jets latéraux depuis la margelle.
  const { ctx } = p;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    const x = 1.5 + Math.cos(a) * 1.18;
    const y = 1.5 + Math.sin(a) * 1.18;
    const [jx, jy] = p.p(x, y, 12);
    const [tx] = p.p(1.5 + Math.cos(a) * 0.75, 1.5 + Math.sin(a) * 0.75, 12);
    jet(ctx, jx, jy, tx - jx, 16, 8);
  }
  cyl(p, 1.5, 1.5, 11, 42, 0.16, '#ddd6c8', 0.11);
  disc(p, 1.5, 1.5, 42, 47, 0.55, '#ddd6c8');
  p.groundEllipse(1.5, 1.5, 47, 0.47, '#6cc6f0');
  cyl(p, 1.5, 1.5, 47, 64, 0.08, '#ddd6c8', 0.06);
  disc(p, 1.5, 1.5, 64, 68, 0.27, '#ddd6c8');
  p.groundEllipse(1.5, 1.5, 68, 0.21, '#6cc6f0');
  cyl(p, 1.5, 1.5, 68, 76, 0.04, '#ddd6c8');
  p.dot(1.5, 1.5, 79, 5, '#f9c74f');
  const [sx, sy] = p.p(1.5, 1.5, 80);
  for (const dir of [-1, 1]) {
    jet(ctx, sx, sy - 2, dir * 20, 14, 14);
    jet(ctx, sx, sy - 2, dir * 38, 18, 36);
    jet(ctx, sx, sy + 18, dir * 56, 16, 50);
  }
  jet(ctx, sx, sy - 2, 2, 20, 4);
  flowerClump(p, 2.72, 2.72, 7, 3, 0);
  roundBush(p, 2.6, 2.75, 8, '#5cbf32');
  return finish();
}

function triumphArch(): ArtPiece {
  const { painter: p, finish } = isoCanvas(3, 3, 150);
  plaza(p, 3, '#e3ded3');
  const x0 = 0.5;
  const x1 = 2.5;
  const y0 = 1.0;
  const y1 = 2.0;
  const h = 112;
  const stone = '#efe7d6';
  p.box(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, 0, 6, boxColors('#d9cfb9'));
  p.box(x0, y0, x1, y1, 6, h, boxColors(stone, false));
  // Grande arche sur la face avant-gauche, petite arche sur la face droite.
  const { ctx } = p;
  const archPath = (side: 'left' | 'right', c: number, half: number, zTop: number, plane: number) => {
    ctx.beginPath();
    const pt = (u: number, z: number) => (side === 'left' ? p.p(u, plane, z) : p.p(plane, u, z));
    ctx.moveTo(...pt(c - half, 6));
    for (let i = 0; i <= 16; i++) {
      const t = Math.PI - (i * Math.PI) / 16;
      ctx.lineTo(...pt(c + Math.cos(t) * half, zTop + Math.sin(t) * half * 64));
    }
    ctx.lineTo(...pt(c + half, 6));
    ctx.closePath();
  };
  const opening = (side: 'left' | 'right', c: number, half: number, zTop: number, plane: number) => {
    ctx.save();
    archPath(side, c, half, zTop, plane);
    ctx.clip();
    ctx.fillStyle = '#9c8d70';
    ctx.fill();
    if (side === 'left') p.rightQuad(y0, y1, 6, zTop + half * 64, c - half, '#b8aa8c');
    else p.leftQuad(x0, x1, 6, zTop + half * 64, c - half, '#c4b698');
    if (side === 'left') p.flat(c - half, y0, c + half, y1, 6, '#d9cfb9');
    else p.flat(x0, c - half, x1, c + half, 6, '#d9cfb9');
    ctx.restore();
    archPath(side, c, half, zTop, plane);
    ctx.strokeStyle = '#d4c7aa';
    ctx.lineWidth = 4;
    ctx.stroke();
  };
  opening('left', 1.5, 0.34, 58, y1);
  opening('right', 1.5, 0.2, 40, x1);
  // Colonnes engagées et chapiteaux dorés.
  for (const x of [0.62, 1.0, 2.0, 2.38]) {
    p.box(x - 0.05, y1, x + 0.05, y1 + 0.05, 6, 96, boxColors('#fbf6ea'));
    p.box(x - 0.07, y1, x + 0.07, y1 + 0.07, 92, 98, boxColors('#f9c74f'));
  }
  // Bas-reliefs, médaillons et clé de voûte.
  p.leftQuad(0.66, 0.96, 44, 78, y1, '#e0d5bd', '#c9bea6');
  p.leftQuad(2.04, 2.34, 44, 78, y1, '#e0d5bd', '#c9bea6');
  for (const x of [0.81, 2.19]) {
    const [mx, my] = p.p(x, y1, 61);
    ctx.fillStyle = '#558b2f';
    ctx.beginPath();
    ctx.ellipse(mx, my, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0d5bd';
    ctx.beginPath();
    ctx.ellipse(mx, my, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  p.leftQuad(1.44, 1.56, 72, 84, y1, '#f9c74f', '#a87b12');
  // Corniche, attique avec inscription, quadrige doré stylisé.
  p.box(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, h - 6, h, boxColors('#e5dbc4'));
  p.box(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, h, h + 24, boxColors(stone));
  p.leftQuad(0.8, 2.2, h + 6, h + 18, y1 - 0.05, '#e0d5bd', '#c9bea6');
  for (let x = 0.95; x < 2.1; x += 0.14) p.leftQuad(x, x + 0.07, h + 10, h + 14, y1 - 0.05, '#b9a77f');
  p.box(x0, y0, x1, y1, h + 24, h + 28, boxColors('#e5dbc4'));
  p.box(1.3, 1.35, 1.7, 1.65, h + 28, h + 32, boxColors('#d9cfb9'));
  const [qx, qy] = p.p(1.5, 1.5, h + 32);
  const gold = ctx.createLinearGradient(qx - 14, qy - 30, qx + 14, qy);
  gold.addColorStop(0, '#fff3b0');
  gold.addColorStop(1, '#c9971c');
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.ellipse(qx, qy - 6, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(qx - 4, qy - 8);
  ctx.quadraticCurveTo(qx - 4, qy - 26, qx + 2, qy - 28);
  ctx.quadraticCurveTo(qx + 6, qy - 24, qx + 4, qy - 8);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(qx + 1, qy - 31, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(qx + 3, qy - 24);
  ctx.quadraticCurveTo(qx + 12, qy - 30, qx + 14, qy - 18);
  ctx.stroke();
  // Drapeaux sur l'attique.
  for (const [x, y, c] of [
    [0.62, 1.12, '#1e63c6'],
    [2.38, 1.12, '#e53935'],
  ] as const) {
    p.line([x, y, h + 28], [x, y, h + 46], '#9e9e9e', 2);
    const [fx, fy] = p.p(x, y, h + 46);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + 7, fy - 3, fx + 14, fy + 1);
    ctx.lineTo(fx + 14, fy + 9);
    ctx.quadraticCurveTo(fx + 7, fy + 5, fx, fy + 8);
    ctx.fill();
  }
  // Massifs fleuris au pied.
  for (const [x, y] of [
    [0.4, 2.35],
    [2.6, 2.35],
    [2.75, 1.0],
  ] as const)
    flowerClump(p, x, y, 6, Math.round(x * 4 + y), 0);
  roundBush(p, 0.3, 2.65, 9);
  roundBush(p, 2.7, 2.65, 9);
  return finish();
}

const DECORATIONS: Record<string, () => ArtPiece> = {
  tree_oak: () => broadleafTree(0),
  tree_pine: () => coniferTree(0),
  flower_bed: flowerBed,
  bench,
  lamp,
  flag,
  statue,
  fountain,
  palm,
  lighthouse,
  tulips,
  bandstand,
  arch,
  equestrian,
  grand_fountain: grandFountain,
  triumph_arch: triumphArch,
};

export function decorationArt(defId: string): ArtPiece | null {
  const draw = DECORATIONS[defId];
  return draw ? draw() : null;
}
