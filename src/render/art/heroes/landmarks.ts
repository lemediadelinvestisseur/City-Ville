import { shade } from '../color';
import { boxColors, type IsoPainter, type V3 } from '../IsoPainter';
import { roofProp, roundBush } from '../toon';
import type { Hero } from './types';
import { signText } from '@/i18n/content';

/**
 * Grands bâtiments festifs (cinéma, supermarché, hôtel, centre commercial,
 * bowling, parc d'attractions, stade), dessinés à la main dans le style cartoon.
 */

type Side = 'left' | 'right';
type Painter = IsoPainter;

const BULB = '#fff59d';
const GLASS = '#8fd3f4';

// ——— Petits outils de dessin ———

/** Point d'une face : `u` le long de la face, `z` en hauteur. */
function fp(side: Side, plane: number, u: number, z: number): V3 {
  return side === 'left' ? [u, plane, z] : [plane, u, z];
}

function quad(p: Painter, side: Side): Painter['leftQuad'] {
  return side === 'left' ? p.leftQuad.bind(p) : p.rightQuad.bind(p);
}

/** Polygone plaqué sur une face à partir de points (u, z). */
function facePoly(p: Painter, side: Side, plane: number, pts: readonly (readonly [number, number])[], style: string | CanvasGradient) {
  p.fill(
    pts.map(([u, z]) => fp(side, plane, u, z)),
    style,
  );
}

/** Rectangle surmonté d'un arc en plein cintre, sur une face. */
function archPts(a: number, b: number, za: number, zb: number, rise: number): [number, number][] {
  const pts: [number, number][] = [
    [a, za],
    [b, za],
  ];
  const c = (a + b) / 2;
  const r = (b - a) / 2;
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    pts.push([c + r * Math.cos(t), zb + rise * Math.sin(t)]);
  }
  return pts;
}

/** Disque plaqué sur une face (hublot, rosace). */
function faceDisc(p: Painter, side: Side, plane: number, u: number, z: number, r: number, style: string) {
  const pts: [number, number][] = [];
  const ru = r / 71.6;
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    pts.push([u + ru * Math.cos(t), z + r * Math.sin(t)]);
  }
  facePoly(p, side, plane, pts, style);
}

/** Exécute un dessin en coordonnées écran centrées sur un point 3D. */
function screen(p: Painter, x: number, y: number, z: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  ctx.restore();
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Boîte aux couleurs dérivées d'une teinte. */
function block(p: Painter, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, color: string) {
  p.box(x0, y0, x1, y1, z0, z1, boxColors(color));
}

/** Toit plat encaissé derrière un acrotère (à appeler juste après la boîte du corps). */
function deck(p: Painter, x0: number, y0: number, x1: number, y1: number, z: number, rim: string, roof: string, lip = 0.09) {
  p.flat(x0 + lip, y0 + lip, x1 - lip, y1 - lip, z - 4, roof);
  p.leftQuad(x0 + lip, x1 - lip, z - 4, z, y0 + lip, shade(rim, -0.22));
  p.rightQuad(y0 + lip, y1 - lip, z - 4, z, x0 + lip, shade(rim, -0.32));
  p.flat(x0, y1 - lip, x1, y1, z, shade(rim, 0.18));
  p.flat(x1 - lip, y0, x1, y1, z, shade(rim, 0.18));
}

/** Bandeau horizontal sur les deux faces visibles d'un volume. */
function band(p: Painter, x0: number, y0: number, x1: number, y1: number, za: number, zb: number, color: string) {
  p.leftQuad(x0, x1, za, zb, y1 + 0.004, color);
  p.rightQuad(y0, y1, za, zb, x1 + 0.004, shade(color, -0.18));
}

/** Rangée régulière de fenêtres sur une face. */
function windowRow(
  p: Painter,
  side: Side,
  a: number,
  b: number,
  n: number,
  za: number,
  zb: number,
  plane: number,
  glass = GLASS,
  frame = '#ffffff',
  fill = 0.5,
) {
  const slot = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const c = a + slot * (i + 0.5);
    p.window(side, c - (slot * fill) / 2, c + (slot * fill) / 2, za, zb, plane, glass, frame);
  }
}

/** Ampoules alignées le long d'une face. */
function bulbs(p: Painter, side: Side, a: number, b: number, z: number, plane: number, n: number, color = BULB) {
  for (let i = 0; i <= n; i++) {
    const [x, y] = side === 'left' ? [a + ((b - a) * i) / n, plane] : [plane, a + ((b - a) * i) / n];
    p.dot(x, y, z, 2.6, color);
  }
}

/** Arbre rond (feuillage en boules). */
function tree(p: Painter, x: number, y: number, s = 1, color = '#5cb83a') {
  p.line([x, y, 0], [x, y, 20 * s], '#6d4c2f', 6 * s);
  screen(p, x, y, 26 * s, (ctx) => {
    ell(ctx, 0, 0, 20 * s, 18 * s, shade(color, -0.22));
    ell(ctx, -7 * s, -7 * s, 15 * s, 14 * s, color);
    ell(ctx, 8 * s, -10 * s, 11 * s, 10 * s, shade(color, 0.08));
    ell(ctx, -9 * s, -12 * s, 6 * s, 5 * s, shade(color, 0.35));
  });
}

/** Lampadaire à globe. */
function lamp(p: Painter, x: number, y: number, h = 44, globe = BULB) {
  p.line([x, y, 0], [x, y, 4], '#37474f', 7);
  p.line([x, y, 0], [x, y, h], '#455a64', 3.5);
  p.dot(x, y, h + 4, 6, globe);
  p.dot(x - 0.01, y - 0.01, h + 6, 2.4, '#ffffff');
  p.dot(x, y, h + 10, 2.6, '#455a64');
}

/** Drapeau flottant au bout d'un mât. */
function flag(p: Painter, x: number, y: number, z: number, h: number, cloth: string) {
  p.line([x, y, z], [x, y, z + h], '#9e9e9e', 2.5);
  screen(p, x, y, z + h, (ctx) => {
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(12, -5, 24, 1);
    ctx.lineTo(24, 14);
    ctx.quadraticCurveTo(12, 8, 0, 13);
    ctx.closePath();
    ctx.fill();
  });
  p.dot(x, y, z + h + 2, 2.5, '#ffd54f');
}

/** Ballon gonflable relié au sol par une ficelle. */
function balloon(p: Painter, x: number, y: number, z: number, color: string, dx = 0) {
  const [bx, by] = p.p(x, y, 0);
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.strokeStyle = '#757575';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bx + dx * 0.3, (by + sy) / 2, sx + dx, sy);
  ctx.stroke();
  ell(ctx, sx + dx, sy - 9, 9, 11, color);
  ell(ctx, sx + dx - 3, sy - 13, 2.6, 3.6, 'rgba(255,255,255,0.6)');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(sx + dx - 3, sy + 3);
  ctx.lineTo(sx + dx + 3, sy + 3);
  ctx.lineTo(sx + dx, sy - 1);
  ctx.fill();
}

/** Parasol à quartiers alternés. */
function parasol(p: Painter, x: number, y: number, z: number, h: number, colors: readonly [string, string], r = 22) {
  p.line([x, y, z], [x, y, z + h], '#eceff1', 2.5);
  screen(p, x, y, z + h, (ctx) => {
    const top = -r * 0.6;
    for (let i = 0; i < 8; i++) {
      const xa = -r + (i * r) / 4;
      const xb = xa + r / 4;
      ctx.fillStyle = i % 2 ? shade(colors[i % 2]!, -0.04) : colors[0];
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(xa, 4);
      ctx.quadraticCurveTo((xa + xb) / 2, 9, xb, 4);
      ctx.closePath();
      ctx.fill();
    }
    ell(ctx, 0, top, 2.6, 2.6, colors[0]);
  });
}

/** Voiture vue en isométrique (axe y si `alongY`). */
function car(p: Painter, x: number, y: number, color: string, alongY = true) {
  const [hx, hy] = alongY ? [0.13, 0.26] : [0.26, 0.13];
  p.groundEllipse(x + 0.04, y + 0.04, 0, 0.2, 'rgba(0,0,0,0.18)');
  block(p, x - hx, y - hy, x + hx, y + hy, 4, 15, color);
  const [cx, cy] = alongY ? [hx * 0.85, hy * 0.5] : [hx * 0.5, hy * 0.85];
  p.box(x - cx, y - cy, x + cx, y + cy, 15, 25, { top: shade(color, 0.2), left: '#b3e5fc', right: '#81d4fa', outline: shade(color, -0.45) });
  p.leftQuad(x - hx + 0.03, x - hx + 0.08, 9, 13, y + hy + 0.003, '#fff59d');
  p.leftQuad(x + hx - 0.08, x + hx - 0.03, 9, 13, y + hy + 0.003, '#fff59d');
}

/** Caddie de supermarché. */
function caddie(p: Painter, x: number, y: number) {
  for (const [dx, dy] of [
    [-0.06, -0.05],
    [0.06, -0.05],
    [-0.06, 0.05],
    [0.06, 0.05],
  ] as const) {
    p.dot(x + dx, y + dy, 2, 2, '#37474f');
  }
  p.box(x - 0.08, y - 0.06, x + 0.08, y + 0.06, 6, 18, {
    top: '#eceff1',
    left: '#cfd8dc',
    right: '#b0bec5',
    outline: '#78909c',
  });
  for (const dx of [-0.04, 0, 0.04]) p.line([x + dx, y + 0.06, 7], [x + dx, y + 0.06, 17], '#90a4ae', 1);
  p.line([x + 0.08, y - 0.08, 22], [x + 0.08, y + 0.08, 22], '#e53935', 3.5);
}

/** Caisse de fruits devant une boutique. */
function crate(p: Painter, x: number, y: number, fruit: string) {
  block(p, x - 0.1, y - 0.07, x + 0.1, y + 0.07, 0, 10, '#c48a4a');
  for (const dx of [-0.05, 0, 0.05]) p.dot(x + dx, y, 13, 4, fruit);
  p.dot(x - 0.02, y - 0.03, 15, 4, shade(fruit, 0.15));
}

/** Pavage : dalle et joints. */
function pave(g: Painter, x0: number, y0: number, x1: number, y1: number, color: string, step = 0.5) {
  g.flat(x0, y0, x1, y1, 0, color);
  const joint = shade(color, -0.07);
  for (let x = x0 + step; x < x1 - 0.01; x += step) g.line([x, y0, 0], [x, y1, 0], joint, 1);
  for (let y = y0 + step; y < y1 - 0.01; y += step) g.line([x0, y, 0], [x1, y, 0], joint, 1);
}

/** Ombre douce au sol. */
function shadowAt(g: Painter, x0: number, y0: number, x1: number, y1: number, alpha = 0.26) {
  g.shadow(x0, y0, x1, y1, alpha);
}

/** Lettres empilées verticalement sur une face droite (enseigne en drapeau). */
function verticalText(p: Painter, text: string, u: number, plane: number, zTop: number, zBottom: number, fill: string) {
  const chars = [...text];
  const step = (zTop - zBottom) / Math.max(1, chars.length);
  const size = Math.min(15, step * 0.95);
  chars.forEach((ch, i) => {
    p.faceText('right', ch, u, plane, zTop - step * (i + 0.5), `900 ${size}px system-ui, sans-serif`, fill);
  });
}

/** Étoile à cinq branches en coordonnées écran. */
function star(ctx: CanvasRenderingContext2D, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Néon lumineux (trait avec halo) entre deux points. */
function neon(p: Painter, a: V3, b: V3, color: string, width = 3) {
  const { ctx } = p;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  p.line(a, b, color, width);
  ctx.restore();
  p.line(a, b, shade(color, 0.6), width * 0.4);
}

// ——— Cinéma ———

function drawCinema(g: Painter, p: Painter) {
  pave(g, 0.02, 0.02, 2.98, 2.98, '#d6cfe0', 0.4);
  g.flat(1.28, 2.15, 1.72, 2.98, 0, '#ffca28');
  g.flat(1.32, 2.15, 1.68, 2.98, 0, '#c62828');
  shadowAt(g, 0.3, 0.25, 2.7, 2.2);

  tree(p, 2.82, 0.3, 0.85);
  // Grande salle.
  const wall = '#7e57c2';
  block(p, 0.3, 0.25, 2.7, 1.85, 0, 82, wall);
  for (let y = 0.45; y < 1.8; y += 0.45) p.rightQuad(y - 0.03, y + 0.03, 0, 82, 2.704, shade(wall, -0.05));
  band(p, 0.3, 0.25, 2.7, 1.85, 74, 80, '#ffca28');
  // Affiches lumineuses sur le flanc.
  const posters = ['#e53935', '#29b6f6', '#66bb6a'];
  posters.forEach((color, i) => {
    const y = 0.5 + i * 0.45;
    p.rightQuad(y - 0.16, y + 0.16, 14, 62, 2.705, '#ffca28');
    p.rightQuad(y - 0.13, y + 0.13, 18, 58, 2.71, color);
    screen(p, 2.71, y, 44, (ctx) => star(ctx, 7, '#fff59d'));
    p.rightQuad(y - 0.1, y + 0.1, 22, 27, 2.712, '#ffffff');
    bulbs(p, 'right', y - 0.16, y + 0.16, 65, 2.71, 4);
  });
  deck(p, 0.3, 0.25, 2.7, 1.85, 82, '#9575cd', '#4a2a86');
  block(p, 0.55, 0.45, 0.95, 0.8, 78, 92, '#b0bec5');
  p.flat(0.6, 0.5, 0.9, 0.75, 92, '#78909c');
  roofProp(p, 'popcorn', 2.05, 0.75, 78, 1.45);

  // Façade Art déco à gradins.
  const front = '#9575cd';
  block(p, 0.5, 1.85, 2.5, 2.15, 0, 98, front);
  block(p, 0.85, 1.85, 2.15, 2.15, 98, 110, wall);
  block(p, 1.2, 1.85, 1.8, 2.15, 110, 124, '#673ab7');
  bulbs(p, 'left', 0.5, 0.85, 99, 2.16, 3);
  bulbs(p, 'left', 2.15, 2.5, 99, 2.16, 3);
  bulbs(p, 'left', 0.85, 1.2, 111, 2.16, 3);
  bulbs(p, 'left', 1.8, 2.15, 111, 2.16, 3);
  bulbs(p, 'left', 1.2, 1.8, 125, 2.16, 5);
  screen(p, 1.5, 2.0, 138, (ctx) => star(ctx, 12, '#ffd54f'));
  for (const x of [0.62, 0.72, 2.28, 2.38]) p.leftQuad(x - 0.015, x + 0.015, 60, 96, 2.152, '#ffca28');
  faceDisc(p, 'left', 2.152, 1.5, 88, 11, '#ffca28');
  faceDisc(p, 'left', 2.153, 1.5, 88, 7, '#4a148c');

  // Entrée : portes vitrées et vitrines d'affiches.
  for (const c of [1.24, 1.5, 1.76]) p.door('left', c, 0.22, 32, 2.15, '#3b1f8f', '#ffca28');
  for (const [a, color] of [
    [0.6, '#e53935'],
    [2.05, '#29b6f6'],
  ] as const) {
    p.leftQuad(a, a + 0.35, 4, 36, 2.152, '#ffca28');
    p.leftQuad(a + 0.03, a + 0.32, 7, 33, 2.155, color);
    screen(p, a + 0.175, 2.155, 22, (ctx) => star(ctx, 6, '#ffffff'));
  }

  // Marquise à ampoules.
  p.box(0.6, 2.15, 2.4, 2.62, 40, 60, boxColors('#ffca28'));
  p.flat(0.66, 2.2, 2.34, 2.57, 60, '#ffb300');
  p.sign('left', 0.72, 2.28, 43, 57, 2.625, '#fff8e1', '#4a148c', signText('CINÉMA'));
  bulbs(p, 'left', 0.62, 2.38, 58.5, 2.63, 14);
  bulbs(p, 'left', 0.62, 2.38, 41.5, 2.63, 14);
  bulbs(p, 'right', 2.18, 2.6, 50, 2.405, 3);

  // Enseigne en drapeau.
  p.box(2.28, 2.15, 2.4, 2.66, 62, 146, boxColors('#e53935'));
  verticalText(p, signText('CINÉMA'), 2.405, 2.405, 140, 68, '#fff59d');
  for (let z = 66; z <= 142; z += 8) {
    p.dot(2.405, 2.18, z, 2.2, BULB);
    p.dot(2.405, 2.63, z, 2.2, BULB);
  }
  screen(p, 2.34, 2.4, 152, (ctx) => star(ctx, 10, '#ffd54f'));

  // Parvis : cordons, plantes, lampadaires.
  for (const x of [1.18, 1.82]) {
    for (const y of [2.72, 2.95]) {
      p.line([x, y, 0], [x, y, 14], '#ffca28', 3.5);
      p.dot(x, y, 15, 3, '#ffd54f');
    }
    p.line([x, 2.72, 11], [x, 2.95, 11], '#c62828', 2.5);
  }
  roundBush(p, 0.35, 2.4, 11, '#5cbf32');
  roundBush(p, 2.75, 2.35, 10);
  lamp(p, 0.4, 2.85);
  lamp(p, 2.6, 2.85);
  roundBush(p, 2.85, 1.3, 9, '#5cbf32');
  tree(p, 0.18, 2.8, 0.7);
}

// ——— Supermarché ———

/** Caddie géant posé sur le toit. */
function giantCaddie(p: Painter, x: number, y: number, z: number) {
  p.groundEllipse(x, y, z, 0.35, 'rgba(0,0,0,0.18)');
  screen(p, x, y, z, (ctx) => {
    ctx.fillStyle = '#263238';
    for (const wx of [-20, 18]) ell(ctx, wx, -4, 6, 6, '#263238');
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-22, -6);
    ctx.lineTo(22, -6);
    ctx.stroke();
    // Panier.
    ctx.beginPath();
    ctx.moveTo(-30, -52);
    ctx.lineTo(34, -52);
    ctx.lineTo(24, -12);
    ctx.lineTo(-24, -12);
    ctx.closePath();
    ctx.fillStyle = '#e53935';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#ffcdd2';
    ctx.lineWidth = 2;
    for (let i = -30; i <= 34; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, -52);
      ctx.lineTo(i * 0.8, -12);
      ctx.stroke();
    }
    for (let j = -44; j < -12; j += 8) {
      ctx.beginPath();
      ctx.moveTo(-34, j);
      ctx.lineTo(34, j);
      ctx.stroke();
    }
    ctx.restore();
    // Courses qui dépassent.
    ell(ctx, -14, -56, 9, 8, '#ff7043');
    ell(ctx, 2, -60, 10, 9, '#8bc34a');
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(10, -72, 10, 20);
    ell(ctx, 15, -72, 5, 2.5, '#fbc02d');
    ell(ctx, -4, -54, 6, 5, '#e53935');
    // Poignée.
    ctx.strokeStyle = '#b71c1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(34, -52);
    ctx.lineTo(44, -62);
    ctx.stroke();
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(40, -66);
    ctx.lineTo(50, -58);
    ctx.stroke();
  });
}

function drawSupermarket(g: Painter, p: Painter) {
  pave(g, 0.02, 0.02, 3.98, 2.72, '#ddd8cc', 0.5);
  // Parking.
  g.flat(0.02, 2.72, 3.98, 3.98, 0, '#7d848c');
  g.line([0.02, 2.72, 0], [3.98, 2.72, 0], '#f5f5f5', 3);
  for (let x = 0.2; x <= 3.85; x += 0.45) {
    g.line([x, 2.82, 0], [x, 3.3, 0], '#ffffff', 2);
    g.line([x, 3.45, 0], [x, 3.93, 0], '#ffffff', 2);
  }
  g.line([0.1, 3.375, 0], [3.9, 3.375, 0], '#ffd54f', 2);
  shadowAt(g, 0.25, 0.25, 3.75, 2.35);

  tree(p, 3.88, 0.25, 0.8);
  const wall = '#eceff1';
  block(p, 0.25, 0.25, 3.75, 2.35, 0, 66, wall);
  band(p, 0.25, 0.25, 3.75, 2.35, 50, 58, '#e53935');
  band(p, 0.25, 0.25, 3.75, 2.35, 0, 5, '#b0bec5');
  // Quai de livraison sur le flanc.
  for (const y of [0.55, 1.25]) {
    p.rightQuad(y, y + 0.5, 0, 36, 3.752, '#90a4ae');
    for (let z = 4; z < 36; z += 5) p.line([3.755, y, z], [3.755, y + 0.5, z], '#607d8b', 1.2);
  }
  block(p, 3.75, 0.45, 3.95, 1.85, 0, 8, '#9e9e9e');
  block(p, 3.78, 1.95, 3.94, 2.1, 0, 12, '#c48a4a');
  windowRow(p, 'right', 0.4, 2.2, 4, 40, 46, 3.752, '#e3f2fd', '#c62828', 0.6);
  // Grandes vitrines et auvents.
  for (const a of [0.4, 2.65]) {
    p.leftQuad(a, a + 0.95, 6, 42, 2.352, '#c62828');
    p.window('left', a + 0.04, a + 0.91, 9, 39, 2.354, '#e3f2fd', '#c62828');
    for (let k = 1; k < 4; k++) p.line([a + 0.04 + k * 0.218, 2.356, 9], [a + 0.04 + k * 0.218, 2.356, 39], '#c62828', 2);
    p.awning('left', a - 0.02, a + 0.97, 48, 2.35, ['#e53935', '#ffffff'], 0.3, 14);
  }
  windowRow(p, 'right', 0.4, 2.2, 4, 10, 32, 3.752, '#e3f2fd', '#c62828', 0.6);
  deck(p, 0.25, 0.25, 3.75, 2.35, 66, '#cfd8dc', '#a7adb2');
  block(p, 0.6, 0.5, 1.2, 0.95, 62, 76, '#cfd8dc');
  p.flat(0.68, 0.57, 1.12, 0.88, 76, '#90a4ae');
  block(p, 1.4, 0.5, 1.6, 0.7, 62, 80, '#9e9e9e');
  giantCaddie(p, 2.9, 1.0, 62);

  // Sas d'entrée rouge et grande enseigne bombée.
  block(p, 1.5, 2.35, 2.5, 2.7, 0, 50, '#e53935');
  p.window('left', 1.62, 1.98, 3, 34, 2.702, '#e3f2fd', '#ffffff');
  p.window('left', 2.02, 2.38, 3, 34, 2.702, '#e3f2fd', '#ffffff');
  p.window('right', 2.42, 2.62, 10, 34, 2.502, '#e3f2fd', '#ffffff');
  p.flat(1.5, 2.35, 2.5, 2.7, 50, '#ef5350');
  const sign = archPts(0.95, 3.05, 64, 96, 20);
  p.fill(
    sign.map(([u, z]) => fp('left', 2.24, u, z)),
    '#c62828',
  );
  p.rightQuad(2.18, 2.24, 64, 96, 3.05, '#8e1b1b');
  p.fill(
    archPts(1.0, 3.0, 67, 96, 17).map(([u, z]) => fp('left', 2.245, u, z)),
    '#e53935',
  );
  p.sign('left', 1.08, 2.92, 72, 92, 2.25, '#e53935', '#ffffff', signText('SUPERMARCHÉ'));
  bulbs(p, 'left', 1.05, 2.95, 66, 2.25, 12, '#ffffff');
  screen(p, 2.0, 2.25, 105, (ctx) => star(ctx, 7, '#ffd54f'));

  // Trottoir : étals, caddies.
  crate(p, 0.55, 2.5, '#ff7043');
  crate(p, 0.8, 2.5, '#8bc34a');
  crate(p, 1.05, 2.5, '#e53935');
  crate(p, 1.3, 2.5, '#ffeb3b');
  for (let i = 0; i < 4; i++) caddie(p, 2.75 + i * 0.13, 2.52);
  p.line([2.65, 2.62, 10], [3.3, 2.62, 10], '#c62828', 3);
  roundBush(p, 3.55, 2.52, 10);
  // Voitures et lampadaires.
  car(p, 0.42, 3.08, '#1e88e5');
  car(p, 1.32, 3.7, '#fdd835');
  car(p, 2.67, 3.08, '#43a047');
  car(p, 3.57, 3.7, '#e53935');
  caddie(p, 1.9, 3.2);
  lamp(p, 1.8, 3.375, 58);
  lamp(p, 3.1, 3.375, 58);
  tree(p, 0.15, 3.85, 0.7, '#6fbf3a');
  roundBush(p, 3.9, 2.85, 9, '#5cbf32');
}

// ——— Hôtel ———

/** Balcon (dalle + garde-corps) devant une face. */
function balcony(p: Painter, side: Side, a: number, b: number, z: number, plane: number) {
  const d = 0.13;
  if (side === 'left') {
    p.box(a, plane, b, plane + d, z, z + 3, boxColors('#ffffff'));
    for (let u = a + 0.04; u < b; u += 0.06) p.line([u, plane + d, z + 3], [u, plane + d, z + 13], '#ffffff', 1.4);
    p.line([a, plane + d, z + 13], [b, plane + d, z + 13], '#ffffff', 2.6);
    p.line([b, plane, z + 13], [b, plane + d, z + 13], '#eeeeee', 2.4);
  } else {
    p.box(plane, a, plane + d, b, z, z + 3, boxColors('#ffffff'));
    for (let u = a + 0.04; u < b; u += 0.06) p.line([plane + d, u, z + 3], [plane + d, u, z + 13], '#eeeeee', 1.4);
    p.line([plane + d, a, z + 13], [plane + d, b, z + 13], '#f2f2f2', 2.6);
    p.line([plane, b, z + 13], [plane + d, b, z + 13], '#ffffff', 2.4);
  }
}

function drawHotel(g: Painter, p: Painter) {
  pave(g, 0.02, 0.02, 2.98, 2.98, '#ddd6c8', 0.38);
  g.flat(0.02, 2.55, 0.9, 2.98, 0, '#8fd14f');
  g.flat(2.1, 2.55, 2.98, 2.98, 0, '#8fd14f');
  g.flat(2.75, 0.02, 2.98, 2.55, 0, '#8fd14f');
  g.flat(1.3, 2.4, 1.7, 2.98, 0, '#c62828');
  shadowAt(g, 0.3, 0.3, 2.7, 2.4);

  // Socle (rez-de-chaussée) et tour.
  const wall = '#ffe0b2';
  const base = '#f3c48b';
  block(p, 0.3, 0.3, 2.7, 2.4, 0, 34, base);
  for (const [a, b] of [
    [0.42, 0.82],
    [2.18, 2.58],
  ] as const) {
    p.fill(
      archPts(a, b, 6, 22, 8).map(([u, z]) => fp('left', 2.402, u, z)),
      '#ffffff',
    );
    p.fill(
      archPts(a + 0.03, b - 0.03, 8, 22, 6).map(([u, z]) => fp('left', 2.404, u, z)),
      '#b3e5fc',
    );
  }
  for (const c of [0.65, 1.15, 1.65, 2.15]) {
    p.fill(
      archPts(c - 0.17, c + 0.17, 6, 22, 7).map(([u, z]) => fp('right', 2.702, u, z)),
      '#ffffff',
    );
    p.fill(
      archPts(c - 0.14, c + 0.14, 8, 22, 5).map(([u, z]) => fp('right', 2.704, u, z)),
      '#9fd3ee',
    );
  }
  p.door('left', 1.5, 0.42, 28, 2.4, '#4e342e', '#ffd54f');
  p.line([1.5, 2.402, 0], [1.5, 2.402, 28], '#ffd54f', 2);
  p.flat(0.3, 0.3, 2.7, 2.4, 34, shade(base, 0.2));

  const x0 = 0.5;
  const y0 = 0.45;
  const x1 = 2.5;
  const y1 = 2.2;
  const top = 176;
  block(p, x0, y0, x1, y1, 34, top, wall);
  // Pilastres d'angle et bandeaux d'étage.
  p.leftQuad(x0, x0 + 0.08, 34, top, y1 + 0.003, '#fff3e0');
  p.leftQuad(x1 - 0.08, x1, 34, top, y1 + 0.003, '#fff3e0');
  p.rightQuad(y0, y0 + 0.08, 34, top, x1 + 0.003, '#f2d3a7');
  const floors = 5;
  const fh = (top - 34) / floors;
  for (let f = 0; f < floors; f++) {
    const z = 34 + f * fh;
    band(p, x0, y0, x1, y1, z, z + 2.5, '#ffffff');
    windowRow(p, 'left', x0 + 0.1, x1 - 0.1, 4, z + 9, z + 23, y1, '#b3e5fc', '#ffffff', 0.55);
    windowRow(p, 'right', y0 + 0.1, y1 - 0.1, 4, z + 9, z + 23, x1, '#b3e5fc', '#ffffff', 0.55);
  }
  for (let f = 0; f < floors; f++) {
    const z = 34 + f * fh + 2;
    balcony(p, 'left', 0.72, 1.18, z, y1);
    balcony(p, 'left', 1.82, 2.28, z, y1);
    balcony(p, 'right', 0.95, 1.37, z, x1);
  }
  // Corniche et toit-terrasse avec piscine.
  block(p, x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, top, top + 7, '#ffffff');
  deck(p, x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, top + 7, '#ffffff', '#c8a27a');
  p.flat(0.75, 0.62, 2.05, 1.55, top + 3.2, '#ffffff');
  p.flat(0.82, 0.69, 1.98, 1.48, top + 3.3, p.gradient([0.82, 0.69, top + 3], [1.98, 1.48, top + 3], '#81d4fa', '#29b6f6'));
  for (const [a, b] of [
    [1.0, 0.85],
    [1.5, 1.15],
    [1.2, 1.3],
  ] as const) {
    p.line([a, b, top + 3.4], [a + 0.25, b, top + 3.4], 'rgba(255,255,255,0.8)', 1.6);
  }
  block(p, 0.62, 1.78, 0.82, 2.06, top + 3, top + 6, '#ff8a65');
  block(p, 1.02, 1.78, 1.22, 2.06, top + 3, top + 6, '#4fc3f7');
  block(p, 1.42, 1.78, 1.62, 2.06, top + 3, top + 6, '#ff8a65');
  // Cabane de plage et drapeau sur le toit.
  block(p, 0.45, 0.4, 0.85, 0.75, top + 3, top + 24, '#4fc3f7');
  p.pyramidRoof(0.45, 0.4, 0.85, 0.75, top + 24, 16, '#e53935', 0.06);
  flag(p, 2.45, 0.5, top + 3, 40, '#e53935');
  parasol(p, 2.25, 1.0, top + 3, 30, ['#e53935', '#ffffff'], 28);
  parasol(p, 2.25, 1.65, top + 3, 30, ['#29b6f6', '#ffffff'], 28);
  parasol(p, 1.75, 1.95, top + 3, 28, ['#ffca28', '#ffffff'], 26);

  // Auvent d'entrée avec l'enseigne.
  for (const x of [0.95, 2.05]) p.line([x, 2.86, 0], [x, 2.86, 34], '#ffd54f', 4);
  p.box(0.86, 2.4, 2.14, 2.92, 34, 52, boxColors('#c62828'));
  p.flat(0.9, 2.44, 2.1, 2.88, 52, '#b71c1c');
  p.sign('left', 0.92, 2.08, 36, 50, 2.922, '#4e342e', '#ffd54f', signText('HÔTEL ★★★'));
  p.line([0.86, 2.925, 52], [2.14, 2.925, 52], '#ffd54f', 2.5);
  p.line([2.14, 2.4, 52], [2.14, 2.92, 52], '#ffd54f', 2.5);
  // Drapeaux, buissons et arbres.
  flag(p, 0.3, 2.8, 0, 66, '#e53935');
  flag(p, 0.55, 2.86, 0, 70, '#1e88e5');
  flag(p, 2.45, 2.86, 0, 70, '#43a047');
  flag(p, 2.7, 2.8, 0, 66, '#fdd835');
  roundBush(p, 1.15, 2.6, 8);
  roundBush(p, 1.85, 2.6, 8);
  tree(p, 2.86, 1.0, 0.8);
  tree(p, 2.86, 2.0, 0.75, '#6fbf3a');
}

// ——— Centre commercial ———

/** Verrière en berceau, axe selon y. */
function glassVault(
  p: Painter,
  xc: number,
  rx: number,
  ya: number,
  yb: number,
  z: number,
  rz: number,
  glass = '#4fc3f7',
  rib = '#ffffff',
) {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t0 = Math.PI - (i / n) * Math.PI;
    const t1 = Math.PI - ((i + 1) / n) * Math.PI;
    const a = [xc + rx * Math.cos(t0), z + rz * Math.sin(t0)] as const;
    const b = [xc + rx * Math.cos(t1), z + rz * Math.sin(t1)] as const;
    const light = 0.35 - (i / n) * 0.45;
    p.fill(
      [
        [a[0], ya, a[1]],
        [b[0], ya, b[1]],
        [b[0], yb, b[1]],
        [a[0], yb, a[1]],
      ],
      shade(glass, light),
    );
  }
  for (let y = ya; y <= yb + 0.01; y += (yb - ya) / 6) {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = Math.PI - (i / n) * Math.PI;
      pts.push([xc + rx * Math.cos(t), y, z + rz * Math.sin(t)]);
    }
    for (let i = 1; i < pts.length; i++) p.line(pts[i - 1]!, pts[i]!, rib, 2);
  }
  p.line([xc, ya, z + rz], [xc, yb, z + rz], rib, 2.5);
}

/** Vitrine de boutique avec auvent coloré. */
function storefront(p: Painter, side: Side, a: number, b: number, plane: number, color: string) {
  quad(p, side)(a, b, 2, 40, plane, shade(color, -0.25));
  p.window(side, a + 0.05, b - 0.05, 6, 32, plane + 0.002 * (side === 'left' ? 1 : 1), '#e1f5fe', '#ffffff');
  p.awning(side, a, b, 40, plane, [color, '#ffffff'], 0.25, 11);
}

function drawMall(g: Painter, p: Painter) {
  pave(g, 0.02, 0.02, 4.98, 4.98, '#d9d4c8', 0.5);
  // Parvis en damier.
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2) g.flat(1.2 + i * 0.43, 3.95 + j * 0.33, 1.63 + i * 0.43, 4.28 + j * 0.33, 0, '#ece6d6');
    }
  }
  g.flat(0.05, 3.7, 0.95, 4.95, 0, '#8fd14f');
  g.flat(4.05, 3.7, 4.95, 4.95, 0, '#8fd14f');
  shadowAt(g, 0.3, 0.3, 4.7, 3.5, 0.28);

  const wall = '#e1f5fe';
  const trim = '#0288d1';
  const x0 = 0.3;
  const y0 = 0.3;
  const x1 = 4.7;
  const y1 = 3.5;
  const h = 92;
  block(p, x0, y0, x1, y1, 0, h, wall);
  band(p, x0, y0, x1, y1, 44, 50, trim);
  band(p, x0, y0, x1, y1, h - 6, h, trim);
  // Étage : bandeau vitré.
  windowRow(p, 'left', x0 + 0.1, 1.8, 3, 56, 80, y1, '#b3e5fc', '#0277bd', 0.82);
  windowRow(p, 'left', 3.2, x1 - 0.1, 3, 56, 80, y1, '#b3e5fc', '#0277bd', 0.82);
  windowRow(p, 'right', y0 + 0.1, y1 - 0.1, 6, 56, 80, x1, '#b3e5fc', '#0277bd', 0.82);
  // Rez-de-chaussée : boutiques.
  const shops = ['#ec407a', '#ffca28', '#66bb6a', '#ff7043'];
  storefront(p, 'left', 0.42, 1.08, y1, shops[0]!);
  storefront(p, 'left', 1.14, 1.8, y1, shops[1]!);
  storefront(p, 'left', 3.2, 3.86, y1, shops[2]!);
  storefront(p, 'left', 3.92, 4.58, y1, shops[3]!);
  [0.45, 1.25, 2.05, 2.85].forEach((a, i) => storefront(p, 'right', a, a + 0.66, x1, shops[(i + 2) % 4]!));

  deck(p, x0, y0, x1, y1, h, '#cfd8dc', '#90a4ae');
  // Toit : machines, pyramide de verre, verrière, sac géant.
  block(p, 3.9, 0.5, 4.4, 0.85, 88, 100, '#cfd8dc');
  block(p, 0.5, 0.5, 0.75, 0.75, 88, 104, '#9e9e9e');
  p.box(3.35, 1.0, 4.35, 2.0, 88, 92, boxColors('#b0bec5'));
  p.pyramidRoof(3.4, 1.05, 4.3, 1.95, 92, 34, '#81d4fa', 0.02);
  glassVault(p, 2.5, 0.65, 0.7, 3.5, 88, 30);
  roofProp(p, 'handbag', 1.05, 1.5, 88, 1.6);

  // Entrée monumentale : portique voûté, grande baie en éventail et enseigne.
  const portal = '#0277bd';
  const pz = 108;
  block(p, 1.75, 3.5, 3.25, 3.9, 0, pz, portal);
  glassVault(p, 2.5, 0.75, 3.5, 3.9, pz, 34, '#0288d1', '#81d4fa');
  p.fill(
    archPts(1.75, 3.25, 0, pz, 34).map(([u, z]) => fp('left', 3.9, u, z)),
    '#0288d1',
  );
  p.fill(
    archPts(1.88, 3.12, 0, 82, 0).map(([u, z]) => fp('left', 3.902, u, z)),
    p.gradient([2.5, 3.9, 82], [2.5, 3.9, 0], '#e1f5fe', '#4fc3f7'),
  );
  for (let k = 1; k < 5; k++) {
    const u = 1.88 + (k * 1.24) / 5;
    p.line([u, 3.904, 34], [u, 3.904, 82], '#ffffff', 2);
  }
  p.line([1.88, 3.904, 56], [3.12, 3.904, 56], '#ffffff', 2);
  // Baie en éventail au-dessus de l'enseigne.
  const fan = archPts(1.95, 3.05, 108, 110, 26);
  p.fill(
    fan.map(([u, z]) => fp('left', 3.903, u, z)),
    p.gradient([2.5, 3.9, 136], [2.5, 3.9, 108], '#fff8e1', '#81d4fa'),
  );
  for (let k = 1; k < 6; k++) {
    const t = Math.PI - (k / 6) * Math.PI;
    p.line([2.5, 3.905, 108], [2.5 + 0.55 * Math.cos(t), 3.905, 110 + 26 * Math.sin(t)], '#ffffff', 2);
  }
  p.box(1.95, 3.9, 3.05, 4.02, 0, 34, { top: '#e1f5fe', left: '#b3e5fc', right: '#81d4fa', outline: '#0277bd' });
  p.door('left', 2.25, 0.36, 30, 4.02, '#4fc3f7', '#ffffff');
  p.door('left', 2.75, 0.36, 30, 4.02, '#4fc3f7', '#ffffff');
  // Enseigne en bandeau, plus large que le portique.
  p.box(1.45, 3.88, 3.55, 3.98, 86, 106, boxColors('#01579b'));
  p.sign('left', 1.5, 3.5, 88, 104, 3.982, '#0277bd', '#ffffff', signText('CENTRE COMMERCIAL'));
  bulbs(p, 'left', 1.48, 3.52, 107.5, 3.985, 12, '#ffffff');
  flag(p, 2.5, 3.7, pz + 34, 28, '#ffca28');
  flag(p, 1.85, 3.7, pz + 14, 22, '#ec407a');
  flag(p, 3.15, 3.7, pz + 14, 22, '#66bb6a');

  // Parvis : jardinières, bancs, fontaine, arbres, lampadaires.
  for (const x of [1.35, 3.65]) {
    p.box(x - 0.22, 3.95, x + 0.22, 4.35, 0, 10, boxColors('#bcaaa4'));
    roundBush(p, x, 4.15, 14, '#5cbf32');
    p.dot(x - 0.05, 4.1, 26, 3, '#ec407a');
    p.dot(x + 0.06, 4.18, 22, 3, '#ffeb3b');
  }
  p.groundEllipse(0.6, 4.25, 0, 0.36, '#b0bec5');
  p.groundEllipse(0.6, 4.25, 6, 0.33, '#90a4ae');
  p.groundEllipse(0.6, 4.25, 8, 0.28, '#4fc3f7');
  p.line([0.6, 4.25, 8], [0.6, 4.25, 30], '#e1f5fe', 5);
  p.dot(0.6, 4.25, 32, 6, '#e1f5fe');
  tree(p, 4.4, 3.95, 1.0);
  tree(p, 4.75, 4.6, 0.85, '#6fbf3a');
  tree(p, 0.25, 4.75, 0.85, '#6fbf3a');
  for (const x of [1.0, 4.0]) {
    block(p, x - 0.2, 4.7, x + 0.2, 4.8, 6, 9, '#8d6e63');
    p.line([x - 0.17, 4.75, 0], [x - 0.17, 4.75, 6], '#5d4037', 2);
    p.line([x + 0.17, 4.75, 0], [x + 0.17, 4.75, 6], '#5d4037', 2);
  }
  lamp(p, 1.75, 4.75, 54);
  lamp(p, 3.25, 4.75, 54);
  roundBush(p, 4.85, 1.2, 10);
  roundBush(p, 4.85, 2.4, 10, '#5cbf32');
}

// ——— Bowling ———

function giantPin(p: Painter, x: number, y: number, z: number, s: number) {
  p.groundEllipse(x, y, z, 0.2 * s, 'rgba(0,0,0,0.2)');
  screen(p, x, y, z, (ctx) => {
    ctx.scale(s, s);
    const g = ctx.createLinearGradient(-16, 0, 16, 0);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#f5f5f5');
    g.addColorStop(1, '#cfd8dc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.bezierCurveTo(-20, -18, -18, -34, -7, -44);
    ctx.bezierCurveTo(-4, -50, -11, -58, -9, -66);
    ctx.bezierCurveTo(-7, -78, 7, -78, 9, -66);
    ctx.bezierCurveTo(11, -58, 4, -50, 7, -44);
    ctx.bezierCurveTo(18, -34, 20, -18, 9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.fillRect(-8, -52, 16, 3.5);
    ctx.fillRect(-8.5, -46, 17, 3.5);
    ell(ctx, -5, -66, 2.5, 5, 'rgba(255,255,255,0.9)');
    ell(ctx, -9, -26, 3, 10, 'rgba(255,255,255,0.9)');
  });
}

function giantBall(p: Painter, x: number, y: number, z: number, r: number) {
  p.groundEllipse(x, y, z, 0.18, 'rgba(0,0,0,0.25)');
  screen(p, x, y, z - r + 4, (ctx) => {
    const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 2, 0, 0, r);
    g.addColorStop(0, '#80d8ff');
    g.addColorStop(0.45, '#1e88e5');
    g.addColorStop(1, '#0d2c6b');
    ell(ctx, 0, 0, r, r, g);
    ell(ctx, -3, -8, 3.2, 3.2, '#0a1a3a');
    ell(ctx, 5, -7, 3.2, 3.2, '#0a1a3a');
    ell(ctx, 1, 1, 3.6, 3.6, '#0a1a3a');
    ell(ctx, -r * 0.45, -r * 0.5, r * 0.18, r * 0.12, 'rgba(255,255,255,0.7)');
  });
}

/** Étoile « googie » en éventail, au sommet d'un mât. */
function starburst(p: Painter, x: number, y: number, z: number, r: number) {
  screen(p, x, y, z, (ctx) => {
    ctx.save();
    ctx.shadowColor = '#ff4081';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ff80ab';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ell(ctx, Math.cos(a) * r, Math.sin(a) * r, 3.4, 3.4, '#fff59d');
    }
    ell(ctx, 0, 0, 6, 6, '#ffeb3b');
  });
}

function drawBowling(g: Painter, p: Painter) {
  pave(g, 0.02, 0.02, 2.98, 2.3, '#d8cdee', 0.4);
  g.flat(0.02, 2.3, 2.98, 2.98, 0, '#7d848c');
  for (let x = 0.2; x <= 2.9; x += 0.45) g.line([x, 2.4, 0], [x, 2.92, 0], '#ffffff', 2);
  g.flat(1.2, 2.1, 1.8, 2.98, 0, '#d8cdee');
  shadowAt(g, 0.3, 0.3, 2.55, 2.1);

  const wall = '#5e35b1';
  const x0 = 0.3;
  const y0 = 0.3;
  const x1 = 2.55;
  const y1 = 2.1;
  const h = 64;
  block(p, x0, y0, x1, y1, 0, h, wall);
  // Bandes en damier en pied de mur.
  for (let i = 0; i < 18; i++) {
    const a = x0 + (i * (x1 - x0)) / 18;
    p.leftQuad(a, a + (x1 - x0) / 18, 0, 6, y1 + 0.002, i % 2 ? '#ffffff' : '#212121');
  }
  for (let i = 0; i < 14; i++) {
    const a = y0 + (i * (y1 - y0)) / 14;
    p.rightQuad(a, a + (y1 - y0) / 14, 0, 6, x1 + 0.002, i % 2 ? '#e0e0e0' : '#1a1a1a');
  }
  // Hublots.
  for (const u of [0.55, 0.85]) {
    faceDisc(p, 'left', y1 + 0.003, u, 30, 9, '#ffffff');
    faceDisc(p, 'left', y1 + 0.005, u, 30, 6.5, '#80deea');
  }
  for (const u of [2.15, 2.4]) {
    faceDisc(p, 'left', y1 + 0.003, u - 0.1, 30, 9, '#ffffff');
    faceDisc(p, 'left', y1 + 0.005, u - 0.1, 30, 6.5, '#80deea');
  }
  // Enseigne latérale lumineuse.
  p.rightQuad(0.45, 1.95, 20, 46, x1 + 0.004, '#ffeb3b', '#f9a825');
  p.sign('right', 0.52, 1.88, 24, 42, x1 + 0.008, '#ffeb3b', '#311b92', signText('BOWLING'));
  bulbs(p, 'right', 0.45, 1.95, 48.5, x1 + 0.01, 12, '#ffffff');
  bulbs(p, 'right', 0.45, 1.95, 17.5, x1 + 0.01, 12, '#ffffff');
  // Néons.
  neon(p, [x0, y1 + 0.01, 54], [x1, y1 + 0.01, 54], '#ff4081');
  neon(p, [x1 + 0.01, y1, 54], [x1 + 0.01, y0, 54], '#ff4081');
  neon(p, [x0, y1 + 0.01, 50], [x1, y1 + 0.01, 50], '#18ffff', 2);
  neon(p, [x1 + 0.01, y1, 50], [x1 + 0.01, y0, 50], '#18ffff', 2);

  deck(p, x0, y0, x1, y1, h, '#7e57c2', '#311b92');
  block(p, 0.55, 0.5, 0.95, 0.8, 60, 72, '#b0bec5');
  giantPin(p, 1.35, 0.95, 60, 1.25);
  giantBall(p, 2.05, 1.45, 60, 22);
  giantPin(p, 0.75, 1.55, 60, 0.75);

  // Entrée sous un auvent « googie » relevé.
  p.door('left', 1.35, 0.26, 34, y1, '#80deea', '#ffffff');
  p.door('left', 1.65, 0.26, 34, y1, '#80deea', '#ffffff');
  for (const x of [1.0, 2.0]) p.line([x, 2.5, 0], [x, 2.55, 50], '#cfd8dc', 3.5);
  const canopy: V3[] = [
    [0.95, y1, 42],
    [2.05, y1, 42],
    [2.2, 2.65, 56],
    [0.8, 2.65, 56],
  ];
  p.fill(canopy, '#ff4081');
  p.fill(
    [
      [0.8, 2.65, 56],
      [2.2, 2.65, 56],
      [2.2, 2.65, 50],
      [0.8, 2.65, 50],
    ],
    '#c2185b',
  );
  bulbs(p, 'left', 0.84, 2.16, 53, 2.655, 10);
  // Mât à étoile, voiture, buissons.
  p.line([0.18, 2.55, 0], [0.18, 2.55, 92], '#9575cd', 5);
  p.line([0.18, 2.55, 0], [0.18, 2.55, 92], '#d1c4e9', 2);
  starburst(p, 0.18, 2.55, 104, 18);
  car(p, 2.45, 2.66, '#ffca28');
  car(p, 0.65, 2.66, '#26c6da');
  roundBush(p, 2.75, 0.5, 10);
  roundBush(p, 2.75, 1.3, 9, '#5cbf32');
  roundBush(p, 1.0, 2.25, 8);
  roundBush(p, 2.0, 2.25, 8);
  lamp(p, 2.78, 1.9, 44, '#ff80ab');
}

// ——— Parc d'attractions ———

function ferrisWheel(p: Painter, x: number, y: number) {
  const hub = 100;
  const r = 82;
  block(p, x - 0.35, y - 0.35, x + 0.35, y + 0.35, 0, 8, '#90a4ae');
  // Pieds en A.
  for (const [fx, fy] of [
    [x - 0.3, y + 0.3],
    [x + 0.3, y - 0.3],
  ] as const) {
    p.line([fx, fy, 8], [x, y, hub], '#78909c', 6);
    p.line([fx, fy, 8], [x, y, hub], '#b0bec5', 2.5);
  }
  screen(p, x, y, hub, (ctx) => {
    ctx.strokeStyle = '#1e88e5';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1565c0';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#64b5f6';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1e88e5';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16;
      ell(ctx, Math.cos(a) * r, Math.sin(a) * r, 1.8, 1.8, BULB);
    }
    const colors = ['#e53935', '#fdd835', '#43a047', '#8e24aa', '#fb8c00', '#00acc1', '#ec407a', '#7cb342'];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      const color = colors[i]!;
      ctx.strokeStyle = '#455a64';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + 6);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy + 6);
      ctx.lineTo(cx + 9, cy + 6);
      ctx.lineTo(cx + 8, cy + 20);
      ctx.quadraticCurveTo(cx, cy + 24, cx - 8, cy + 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(color, -0.25);
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy + 7);
      ctx.quadraticCurveTo(cx, cy - 2, cx + 11, cy + 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e1f5fe';
      ctx.fillRect(cx - 6, cy + 10, 12, 5);
    }
    ell(ctx, 0, 0, 9, 9, '#fdd835');
    ell(ctx, 0, 0, 4, 4, '#f57f17');
  });
}

/** Courbe lissée passant par des points 3D (Catmull-Rom). */
function smoothPath(points: readonly V3[], steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: 0 | 1 | 2) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1), c(2)]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

function rollerCoaster(p: Painter) {
  const track = smoothPath(
    [
      [2.3, 0.45, 16],
      [2.9, 0.45, 124],
      [3.4, 0.45, 40],
      [3.95, 0.5, 86],
      [4.5, 0.6, 36],
      [4.55, 1.2, 60],
      [4.55, 1.9, 20],
      [4.55, 2.55, 54],
      [4.5, 3.1, 14],
    ],
    6,
  );
  track.forEach(([x, y, z], i) => {
    if (i % 3) return;
    p.line([x, y, 0], [x, y, z], '#78909c', 3.5);
    p.line([x, y, 0], [x, y, z], '#cfd8dc', 1.4);
  });
  for (let i = 1; i < track.length; i++) {
    p.line(track[i - 1]!, track[i]!, '#8e0000', 8);
  }
  for (let i = 1; i < track.length; i++) {
    p.line(track[i - 1]!, track[i]!, '#e53935', 4.5);
    if (i % 2 === 0) p.dot(...track[i]!, 1.6, '#ffcdd2');
  }
  // Wagonnets sur la descente.
  const cars = ['#fdd835', '#29b6f6', '#66bb6a'];
  cars.forEach((color, k) => {
    const pt = track[9 + k * 2]!;
    p.dot(pt[0], pt[1], pt[2] + 7, 7.5, color);
    p.dot(pt[0] - 0.02, pt[1], pt[2] + 13, 3.2, '#ffe0b2');
  });
}

function carousel(p: Painter, x: number, y: number) {
  p.groundEllipse(x, y, 0, 0.78, '#f9a825');
  p.groundEllipse(x, y, 6, 0.74, '#fff59d', '#f9a825');
  // Mâts et chevaux.
  const horses = ['#ffffff', '#f48fb1', '#81d4fa', '#ffe082', '#ce93d8', '#a5d6a7'];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.3;
    const hx = x + Math.cos(a) * 0.52;
    const hy = y + Math.sin(a) * 0.52;
    if (hx + hy < x + y - 0.2) {
      p.line([hx, hy, 6], [hx, hy, 50], '#ffd54f', 2.5);
      p.dot(hx, hy, 24 + (i % 2) * 6, 6, horses[i]!);
    }
  }
  p.line([x, y, 6], [x, y, 52], '#ec407a', 18);
  p.line([x, y, 6], [x, y, 52], '#f48fb1', 8);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.3;
    const hx = x + Math.cos(a) * 0.52;
    const hy = y + Math.sin(a) * 0.52;
    if (hx + hy >= x + y - 0.2) {
      p.line([hx, hy, 6], [hx, hy, 50], '#ffd54f', 2.5);
      screen(p, hx, hy, 24 + (i % 2) * 6, (ctx) => {
        ell(ctx, 0, 0, 9, 5.5, horses[i]!);
        ell(ctx, 7, -6, 3.5, 5, horses[i]!);
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(-7, 3, 2, 6);
        ctx.fillRect(5, 3, 2, 6);
      });
    }
  }
  // Toit en chapiteau rayé.
  screen(p, x, y, 50, (ctx) => {
    const r = 0.8 * 64 * Math.SQRT2;
    const ry = r / 2;
    for (let k = 0; k < 24; k++) {
      // Moitié arrière d'abord, puis moitié avant.
      const i = (k + 12) % 24;
      const a0 = (i * Math.PI) / 12;
      const a1 = ((i + 1) * Math.PI) / 12;
      ctx.fillStyle = i % 2 ? (i >= 12 ? '#e0e0e0' : '#ffffff') : i >= 12 ? '#c62828' : '#e53935';
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * ry);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * ry);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 12 + Math.PI / 24;
      ctx.fillStyle = i % 2 ? '#e53935' : '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * ry + 1, 9, 0, Math.PI);
      ctx.fill();
    }
    for (let i = 0; i <= 12; i++) {
      const a = (i * Math.PI) / 12;
      ell(ctx, Math.cos(a) * r, Math.sin(a) * ry, 2.2, 2.2, BULB);
    }
  });
  flag(p, x, y, 96, 18, '#fdd835');
}

/** Stand de friandises : comptoir et auvent rayé. */
function stand(p: Painter, x: number, y: number, color: string, treat: string) {
  block(p, x - 0.2, y - 0.17, x + 0.2, y + 0.17, 0, 22, color);
  p.leftQuad(x - 0.15, x + 0.15, 12, 22, y + 0.172, '#fff8e1');
  block(p, x - 0.22, y - 0.19, x + 0.22, y + 0.19, 22, 24, '#ffffff');
  for (const [dx, dy] of [
    [-0.16, 0.14],
    [0.16, 0.14],
    [0.16, -0.14],
  ] as const) {
    p.line([x + dx, y + dy, 24], [x + dx, y + dy, 44], '#ffffff', 2.5);
  }
  p.pyramidRoof(x - 0.2, y - 0.17, x + 0.2, y + 0.17, 44, 16, color, 0.06);
  p.awning('left', x - 0.2, x + 0.2, 44, y + 0.17, [color, '#ffffff'], 0.12, 8);
  p.dot(x, y, 66, 8, treat);
  p.dot(x - 0.02, y - 0.02, 69, 3.5, '#ffffff');
}

function dropTower(p: Painter, x: number, y: number) {
  block(p, x - 0.22, y - 0.22, x + 0.22, y + 0.22, 0, 10, '#7e57c2');
  for (let z = 10; z < 168; z += 14) {
    p.line([x, y, z], [x, y, z + 7], '#e53935', 11);
    p.line([x, y, z + 7], [x, y, z + 14], '#ffffff', 11);
  }
  p.groundEllipse(x, y, 112, 0.3, '#ffca28', '#f57f17');
  p.groundEllipse(x, y, 106, 0.3, '#ffa000');
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI) / 4.5 + 0.2;
    p.dot(x + Math.cos(a) * 0.27, y + Math.sin(a) * 0.27, 101, 4, ['#29b6f6', '#66bb6a', '#ec407a', '#ffeb3b', '#ab47bc'][i]!);
  }
  p.dot(x, y, 172, 9, '#7e57c2');
  p.dot(x, y, 176, 4, BULB);
}

function ticketBooth(p: Painter) {
  block(p, 0.45, 3.55, 1.25, 4.2, 0, 34, '#ffcc80');
  p.window('left', 0.58, 0.88, 12, 28, 4.2, '#fff8e1', '#ffffff');
  p.door('left', 1.06, 0.2, 26, 4.2, '#bf360c');
  p.window('right', 3.7, 4.05, 12, 28, 1.25, '#fff8e1', '#ffffff');
  p.pyramidRoof(0.45, 3.55, 1.25, 4.2, 34, 30, '#e53935', 0.1);
  p.dot(0.85, 3.875, 68, 4, '#ffd54f');
}

function drawAmusementPark(g: Painter, p: Painter) {
  g.flat(0.02, 0.02, 4.98, 4.98, 0, '#9ad35a', shade('#9ad35a', -0.15));
  // Allées.
  const path = '#f1dfb4';
  g.flat(2.15, 3.5, 2.75, 4.98, 0, path);
  g.flat(1.2, 1.9, 1.8, 3.6, 0, path);
  g.flat(0.4, 3.35, 4.2, 3.75, 0, path);
  g.flat(2.0, 1.1, 4.2, 1.5, 0, path);
  g.groundEllipse(2.75, 2.65, 0, 0.98, path);
  g.groundEllipse(1.4, 1.35, 0, 0.62, path);

  // Clôtures arrière.
  p.fence([0.06, 0.06], [4.94, 0.06], '#ffffff', 14);
  p.fence([0.06, 0.06], [0.06, 4.94], '#ffffff', 14);
  tree(p, 0.35, 0.4, 0.8, '#6fbf3a');
  ferrisWheel(p, 1.35, 1.3);
  rollerCoaster(p);
  tree(p, 0.35, 2.15, 0.85);
  dropTower(p, 0.65, 2.95);
  // Petite aire de pique-nique.
  for (const [x, y, c] of [
    [3.3, 1.95, '#e53935'],
    [3.85, 2.3, '#29b6f6'],
  ] as const) {
    block(p, x - 0.12, y - 0.12, x + 0.12, y + 0.12, 8, 11, '#ffffff');
    p.line([x, y, 0], [x, y, 8], '#9e9e9e', 2);
    parasol(p, x, y, 11, 26, [c, '#ffffff'], 22);
  }
  roundBush(p, 2.3, 1.75, 10);
  carousel(p, 2.75, 2.65);
  // Gare des montagnes russes.
  block(p, 4.15, 2.95, 4.85, 3.45, 0, 20, '#ffcc80');
  p.pyramidRoof(4.15, 2.95, 4.85, 3.45, 20, 18, '#29b6f6', 0.08);
  ticketBooth(p);
  stand(p, 3.45, 4.25, '#f48fb1', '#f8bbd0');
  stand(p, 4.3, 3.95, '#4fc3f7', '#fff59d');
  // Bouquet de ballons.
  const colors = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ab47bc', '#ff7043'];
  colors.forEach((c, i) => balloon(p, 3.1, 4.5, 52 + (i % 3) * 10, c, (i - 2.5) * 6));
  roundBush(p, 1.75, 4.6, 8, '#5cbf32');

  // Clôtures avant et portique d'entrée.
  p.fence([0.06, 4.94], [2.05, 4.94], '#ffffff', 14);
  p.fence([2.85, 4.94], [4.94, 4.94], '#ffffff', 14);
  p.fence([4.94, 0.06], [4.94, 4.94], '#ffffff', 14);
  for (const x of [2.05, 2.85]) {
    block(p, x - 0.08, 4.86, x + 0.08, 5.0, 0, 64, '#7e57c2');
    p.dot(x, 4.93, 70, 7, '#fdd835');
  }
  p.fill(
    archPts(1.97, 2.93, 56, 66, 16).map(([u, z]) => fp('left', 4.94, u, z)),
    '#e53935',
  );
  p.fill(
    archPts(2.13, 2.77, 56, 62, 9).map(([u, z]) => fp('left', 4.945, u, z)),
    '#fdd835',
  );
  bulbs(p, 'left', 2.0, 2.9, 67, 4.95, 6);
  screen(p, 2.45, 4.95, 90, (ctx) => star(ctx, 10, '#fdd835'));
  tree(p, 4.6, 4.6, 0.85);
  tree(p, 0.35, 4.6, 0.8, '#6fbf3a');
  roundBush(p, 4.7, 2.0, 10, '#5cbf32');
  lamp(p, 1.75, 4.45, 46);
}

// ——— Stade ———

function drawStadium(g: Painter, p: Painter) {
  pave(g, 0.02, 0.02, 5.98, 5.98, '#d8d3c7', 0.5);
  shadowAt(g, 0.35, 0.35, 5.65, 5.65, 0.22);

  const x0 = 0.35;
  const y0 = 0.35;
  const x1 = 5.65;
  const y1 = 5.65;
  const wb = 1.25; // profondeur des tribunes arrière
  const wf = 0.6; // profondeur des tribunes avant
  const hb = 92;
  const steps = 7;
  const seat = ['#1e88e5', '#e53935', '#fdd835', '#43a047'];
  const bg = '#eceff1';

  // Mâts d'éclairage arrière.
  floodlight(p, 0.2, 0.2, 196);

  // Tribune nord-ouest (le long de x0) puis nord-est (le long de y0), en gradins.
  const sideSteps = (alongX: boolean) => {
    for (let k = 0; k < steps; k++) {
      const d0 = (k * wb) / steps;
      const d1 = ((k + 1) * wb) / steps;
      const z = hb - (k * (hb - 14)) / steps;
      const color = seat[k % seat.length]!;
      if (alongX) {
        p.box(x0 + d0, y0 + d0, x1 - wf, y0 + d1, 0, z, { top: '#dfe4e8', left: color, right: shade(color, -0.25) });
        for (let s = x0 + d1 + 0.08; s < x1 - wf; s += 0.1) {
          p.dot(s, y0 + d1 + 0.003, z - 5, 1.6, shade(color, 0.35));
          p.dot(s, (y0 + d0 + y0 + d1) / 2, z + 1.5, 2.2, shade(color, 0.2));
        }
      } else {
        p.box(x0 + d0, y0 + d0, x0 + d1, y1 - wf, 0, z, { top: '#dfe4e8', left: shade(color, 0.1), right: shade(color, -0.12) });
        for (let s = y0 + d1 + 0.08; s < y1 - wf; s += 0.1) {
          p.dot(x0 + d1 + 0.003, s, z - 5, 1.6, shade(color, 0.4));
          p.dot((x0 + d0 + x0 + d1) / 2, s, z + 1.5, 2.2, shade(color, 0.25));
        }
      }
    }
  };
  // Mur extérieur arrière (dépasse au-dessus des gradins).
  block(p, x0, y0, x1, y0 + 0.06, 0, hb + 8, '#cfd8dc');
  block(p, x0, y0, x0 + 0.06, y1, 0, hb + 8, '#cfd8dc');
  sideSteps(true);
  sideSteps(false);
  // Toiture suspendue au-dessus de la tribune arrière.
  p.fill(
    [
      [x0 + 0.4, y0, hb + 30],
      [x1 - wf - 0.3, y0, hb + 30],
      [x1 - wf - 0.3, y0 + 0.8, hb + 22],
      [x0 + 0.4, y0 + 0.8, hb + 22],
    ],
    'rgba(236,239,241,0.95)',
  );
  p.leftQuad(x0 + 0.4, x1 - wf - 0.3, hb + 19, hb + 22, y0 + 0.8, '#1e88e5');
  for (const x of [1.2, 2.4, 3.6, 4.6]) p.line([x, y0 + 0.05, hb + 6], [x, y0 + 0.05, hb + 30], '#90a4ae', 2.5);

  // Piste et pelouse rayée.
  const fx0 = x0 + wb;
  const fy0 = y0 + wb;
  const fx1 = x1 - wf;
  const fy1 = y1 - wf;
  p.flat(fx0, fy0, fx1, fy1, 2, '#e57347');
  for (let i = 1; i < 4; i++) {
    const d = i * 0.08;
    p.line([fx0 + d, fy0 + d, 2], [fx1, fy0 + d, 2], 'rgba(255,255,255,0.6)', 1);
    p.line([fx0 + d, fy0 + d, 2], [fx0 + d, fy1, 2], 'rgba(255,255,255,0.6)', 1);
  }
  const px0 = fx0 + 0.35;
  const py0 = fy0 + 0.35;
  const px1 = fx1 - 0.12;
  const py1 = fy1 - 0.12;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = px0 + ((px1 - px0) * i) / n;
    p.flat(a, py0, a + (px1 - px0) / n, py1, 2.5, i % 2 ? '#4caf50' : '#66bb6a');
  }
  const line = '#ffffff';
  const mx = (px0 + px1) / 2;
  const my = (py0 + py1) / 2;
  p.line([px0 + 0.06, py0 + 0.06, 3], [px1 - 0.06, py0 + 0.06, 3], line, 2);
  p.line([px1 - 0.06, py0 + 0.06, 3], [px1 - 0.06, py1 - 0.06, 3], line, 2);
  p.line([px1 - 0.06, py1 - 0.06, 3], [px0 + 0.06, py1 - 0.06, 3], line, 2);
  p.line([px0 + 0.06, py1 - 0.06, 3], [px0 + 0.06, py0 + 0.06, 3], line, 2);
  p.line([mx, py0 + 0.06, 3], [mx, py1 - 0.06, 3], line, 2);
  const ring: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    ring.push([mx + Math.cos(t) * 0.38, my + Math.sin(t) * 0.38, 3]);
  }
  for (let i = 1; i < ring.length; i++) p.line(ring[i - 1]!, ring[i]!, line, 2);
  for (const [a, b] of [
    [px0 + 0.06, px0 + 0.4],
    [px1 - 0.4, px1 - 0.06],
  ] as const) {
    p.line([a, my - 0.45, 3], [b, my - 0.45, 3], line, 2);
    p.line([b, my - 0.45, 3], [b, my + 0.45, 3], line, 2);
    p.line([b, my + 0.45, 3], [a, my + 0.45, 3], line, 2);
  }
  // Buts.
  for (const xg of [px0 + 0.06, px1 - 0.06]) {
    p.line([xg, my - 0.2, 3], [xg, my - 0.2, 20], '#ffffff', 3);
    p.line([xg, my + 0.2, 3], [xg, my + 0.2, 20], '#ffffff', 3);
    p.line([xg, my - 0.2, 20], [xg, my + 0.2, 20], '#ffffff', 3);
  }
  // Écran géant dans l'angle arrière.
  const scr = (x0 + x1 - wf) / 2;
  p.line([scr - 0.6, y0 + 0.1, hb + 30], [scr - 0.6, y0 + 0.1, hb + 40], '#607d8b', 3);
  p.line([scr + 0.6, y0 + 0.1, hb + 30], [scr + 0.6, y0 + 0.1, hb + 40], '#607d8b', 3);
  p.box(scr - 0.8, y0 + 0.02, scr + 0.8, y0 + 0.14, hb + 38, hb + 76, boxColors('#37474f'));
  p.leftQuad(scr - 0.74, scr + 0.74, hb + 42, hb + 72, y0 + 0.142, p.gradient([scr, y0, hb + 72], [scr, y0, hb + 42], '#4fc3f7', '#1565c0'));
  p.faceText('left', '2 - 1', scr, y0 + 0.143, hb + 57, '900 20px system-ui, sans-serif', '#ffffff');

  // Tribunes avant (on n'en voit que le dos) et mur d'enceinte.
  const hf = 40;
  p.box(fx1, y0, x1, y1, 0, hf, boxColors(bg));
  p.box(x0, fy1, fx1, y1, 0, hf, boxColors(bg));
  // Rangées de sièges vues de dos sur le dessus des tribunes avant.
  for (let k = 0; k < 4; k++) {
    const d = 0.1 + k * 0.12;
    const color = seat[k % seat.length]!;
    p.line([fx1 + d, y0 + 0.1, hf + 1], [fx1 + d, y1 - 0.05, hf + 1], color, 4);
    p.line([x0 + 0.05, fy1 + d, hf + 1], [fx1 + d, fy1 + d, hf + 1], color, 4);
  }
  // Façade : arcades, bandeaux bleus, entrées.
  band(p, x0, y0, x1, y1, hf - 8, hf - 3, '#1e88e5');
  band(p, x0, y0, x1, y1, 0, 4, '#90a4ae');
  for (let u = x0 + 0.3; u < x1 - 0.2; u += 0.42) {
    p.fill(
      archPts(u - 0.12, u + 0.12, 4, 18, 7).map(([a, z]) => fp('left', y1 + 0.003, a, z)),
      '#78909c',
    );
  }
  for (let u = y0 + 0.3; u < y1 - 0.2; u += 0.42) {
    p.fill(
      archPts(u - 0.12, u + 0.12, 4, 18, 7).map(([a, z]) => fp('right', x1 + 0.003, a, z)),
      '#607d8b',
    );
  }
  // Grandes entrées.
  for (const [side, c] of [
    ['left', 3.0],
    ['right', 3.0],
  ] as const) {
    const plane = side === 'left' ? y1 : x1;
    p.fill(
      archPts(c - 0.4, c + 0.4, 0, 30, 12).map(([a, z]) => fp(side, plane + 0.004, a, z)),
      '#1565c0',
    );
    p.fill(
      archPts(c - 0.32, c + 0.32, 0, 26, 9).map(([a, z]) => fp(side, plane + 0.006, a, z)),
      '#0d47a1',
    );
  }
  // Drapeaux sur l'enceinte.
  const flags = ['#e53935', '#fdd835', '#1e88e5', '#43a047'];
  for (let i = 0; i < 6; i++) {
    flag(p, x0 + 0.5 + i * 0.85, y1 - 0.05, hf, 28, flags[i % 4]!);
  }
  for (let i = 0; i < 6; i++) {
    flag(p, x1 - 0.05, y0 + 0.5 + i * 0.85, hf, 28, flags[(i + 2) % 4]!);
  }
  floodlight(p, 5.8, 0.2, 170);
  floodlight(p, 0.2, 5.8, 170);
  floodlight(p, 5.8, 5.8, 150);
  tree(p, 5.85, 3.0, 0.7);
  tree(p, 3.0, 5.85, 0.7, '#6fbf3a');
}

/** Mât d'éclairage avec sa rampe de projecteurs. */
function floodlight(p: Painter, x: number, y: number, h: number) {
  p.line([x, y, 0], [x, y, h], '#546e7a', 7);
  p.line([x, y, 0], [x, y, h], '#b0bec5', 3);
  for (let z = 20; z < h; z += 18) {
    p.line([x - 0.04, y + 0.04, z], [x + 0.04, y - 0.04, z + 9], '#78909c', 1.5);
  }
  p.box(x - 0.22, y - 0.03, x + 0.22, y + 0.03, h, h + 26, boxColors('#455a64'));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      p.dot(x - 0.16 + c * 0.105, y + 0.035, h + 5 + r * 8, 3, '#fffde7');
    }
  }
}

export const HEROES: Record<string, Hero> = {
  cinema: { height: 168, draw: drawCinema },
  supermarket: { height: 150, draw: drawSupermarket },
  hotel: { height: 220, draw: drawHotel },
  mall: { height: 200, draw: drawMall },
  bowling: { height: 150, draw: drawBowling },
  amusement_park: { height: 200, draw: drawAmusementPark },
  stadium: { height: 230, draw: drawStadium },
};
