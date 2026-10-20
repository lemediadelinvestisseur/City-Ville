import { HALF_H, HALF_W } from '../../iso';
import { shade } from '../color';
import { boxColors, type IsoPainter, type V3 } from '../IsoPainter';
import { roundBush } from '../toon';
import type { Hero } from './types';
import { signText } from '@/i18n/content';

/**
 * Bâtiments agricoles, entrepôts et ports redessinés à la main (style cartoon) :
 * grange rouge, silo à dôme, entrepôts avec quais de chargement, camions et
 * chariots élévateurs, ponton et ports posés au bord de l'eau.
 */

const RX = HALF_W * Math.SQRT2;
const RY = HALF_H * Math.SQRT2;
const WATER = '#3fa9de';

// ——— Sol ———

function lot(gp: IsoPainter, size: number, color: string): void {
  gp.flat(0.02, 0.02, size - 0.02, size - 0.02, 0, color, shade(color, -0.15));
}

function softShadow(gp: IsoPainter, x0: number, y0: number, x1: number, y1: number, alpha = 0.26): void {
  gp.ctx.save();
  gp.ctx.globalAlpha = alpha;
  gp.flat(x0 + 0.05, y0 + 0.05, x1 + 0.3, y1 + 0.22, 0, '#24301a');
  gp.ctx.restore();
}

/** Lignes peintes au sol (places de stationnement, bandes jaunes). */
function paintLine(gp: IsoPainter, a: V3, b: V3, color = '#fdd835'): void {
  gp.line(a, b, color, 2.5);
}

/** Petite darse : bassin d'eau creusé dans le quai, avec murs de pierre et rides. */
function slip(gp: IsoPainter, x0: number, y0: number, x1: number, y1: number): void {
  const z = -5;
  gp.leftQuad(x0, x1, z, 0, y0, '#8d8a82');
  gp.rightQuad(y0, y1, z, 0, x0, '#6f6c66');
  gp.flat(x0, y0, x1, y1, z, gp.gradient([x0, y0, z], [x1, y1, z], '#62c6f2', WATER));
  ripples(gp, x0, y0, x1, y1, z);
  // Margelle claire.
  gp.line([x0, y0, 0], [x1, y0, 0], '#e0dcd2', 3);
  gp.line([x0, y0, 0], [x0, y1, 0], '#d2cdc2', 3);
}

function ripples(gp: IsoPainter, x0: number, y0: number, x1: number, y1: number, z: number): void {
  gp.ctx.save();
  gp.ctx.globalAlpha = 0.7;
  const w = x1 - x0;
  const d = y1 - y0;
  for (const [u, v] of [
    [0.2, 0.3],
    [0.65, 0.2],
    [0.4, 0.75],
    [0.85, 0.65],
    [0.15, 0.85],
  ] as const) {
    const x = x0 + w * u;
    const y = y0 + d * v;
    gp.line([x, y, z], [x + 0.12, y - 0.0, z], '#e1f5fe', 1.6);
  }
  gp.ctx.restore();
}

// ——— Volumes génériques ———

/** Nervures verticales (bardage métallique ou planches) sur la face gauche. */
function ribsL(p: IsoPainter, x0: number, x1: number, y: number, z0: number, z1: number, c: string, step = 0.08) {
  for (let x = x0 + step; x < x1 - step / 3; x += step) p.line([x, y, z0], [x, y, z1], c, 1);
}

function ribsR(p: IsoPainter, y0: number, y1: number, x: number, z0: number, z1: number, c: string, step = 0.08) {
  for (let y = y0 + step; y < y1 - step / 3; y += step) p.line([x, y, z0], [x, y, z1], c, 1);
}

/** Porte basculante à lames, avec cadre sombre. */
function rollDoor(
  p: IsoPainter,
  side: 'left' | 'right',
  a: number,
  b: number,
  z0: number,
  z1: number,
  plane: number,
  color: string,
): void {
  const quad = side === 'left' ? p.leftQuad.bind(p) : p.rightQuad.bind(p);
  quad(a - 0.035, b + 0.035, z0, z1 + 3, plane, '#37474f');
  quad(a, b, z0, z1, plane, side === 'left' ? color : shade(color, -0.12));
  for (let z = z0 + 3.5; z < z1; z += 3.5) {
    if (side === 'left') p.line([a, plane, z], [b, plane, z], shade(color, -0.2), 1);
    else p.line([plane, a, z], [plane, b, z], shade(color, -0.3), 1);
  }
  const m = (a + b) / 2;
  if (side === 'left') p.line([m - 0.04, plane, z0 + 4], [m + 0.04, plane, z0 + 4], '#455a64', 2);
  else p.line([plane, m - 0.04, z0 + 4], [plane, m + 0.04, z0 + 4], '#455a64', 2);
}

/** Cylindre vertical (silo, cuve, bitte d'amarrage) ; r en cases. */
function cylinder(p: IsoPainter, cx: number, cy: number, z0: number, z1: number, r: number, color: string): void {
  const { ctx } = p;
  const [bx, by] = p.p(cx, cy, z0);
  const [, ty] = p.p(cx, cy, z1);
  const rx = r * RX;
  const ry = r * RY;
  const g = ctx.createLinearGradient(bx - rx, 0, bx + rx, 0);
  g.addColorStop(0, shade(color, 0.05));
  g.addColorStop(0.3, shade(color, 0.32));
  g.addColorStop(0.75, shade(color, -0.08));
  g.addColorStop(1, shade(color, -0.32));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(bx, by, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(bx + rx, ty);
  ctx.ellipse(bx, ty, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.22);
  ctx.beginPath();
  ctx.ellipse(bx, ty, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
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

/** Toit en voûte (tôle cintrée), faîtage selon x ; pignon cintré sur la face droite. */
function barrelRoofX(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  gable: string,
): void {
  const ov = 0.1;
  const n = 12;
  const prof = (i: number, extra: number): [number, number] => {
    const t = (Math.PI * i) / n;
    return [y0 - extra + (y1 - y0 + 2 * extra) * ((1 - Math.cos(t)) / 2), z + h * Math.sin(t) + (extra ? -2 : 0)];
  };
  // Pignon cintré, avec un oculus.
  const cap: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const [y, zz] = prof(i, 0);
    cap.push([x1, y, zz]);
  }
  p.fill(cap, shade(gable, -0.22));
  ribsR(p, y0, y1, x1, z, z + h * 0.6, shade(gable, -0.35), 0.1);
  const [ox, oy] = p.p(x1, (y0 + y1) / 2, z + h * 0.45);
  p.ctx.fillStyle = '#ffffff';
  p.ctx.beginPath();
  p.ctx.ellipse(ox, oy, 7, 8, 0, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillStyle = '#81d4fa';
  p.ctx.beginPath();
  p.ctx.ellipse(ox, oy, 5, 6, 0, 0, Math.PI * 2);
  p.ctx.fill();
  // Lés de tôle, de l'arrière vers l'avant.
  for (let i = 0; i < n; i++) {
    const [ya, za] = prof(i, ov);
    const [yb, zb] = prof(i + 1, ov);
    const t = (i + 0.5) / n;
    const k = t < 0.5 ? 0.08 + t * 0.3 : 0.23 - (t - 0.5) * 0.55;
    p.fill(
      [
        [x0 - ov, ya, za],
        [x1 + ov, ya, za],
        [x1 + ov, yb, zb],
        [x0 - ov, yb, zb],
      ],
      shade(color, k),
    );
  }
  // Nervures de la tôle.
  const step = 0.16;
  for (let x = x0 - ov + step; x < x1 + ov; x += step) {
    for (let i = n / 2; i < n; i++) {
      const [ya, za] = prof(i, ov);
      const [yb, zb] = prof(i + 1, ov);
      p.line([x, ya, za], [x, yb, zb], shade(color, -0.2), 1);
    }
  }
  // Rive cintrée et égout.
  p.ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const [y, zz] = prof(i, ov);
    const [sx, sy] = p.p(x1 + ov, y, zz);
    if (i === 0) p.ctx.moveTo(sx, sy);
    else p.ctx.lineTo(sx, sy);
  }
  p.ctx.strokeStyle = '#eceff1';
  p.ctx.lineWidth = 3.5;
  p.ctx.stroke();
  p.line([x0 - ov, y1 + ov, z - 2], [x1 + ov, y1 + ov, z - 2], shade(color, 0.45), 2.5);
}

/** Toit mansardé « de grange » (faîtage selon y), pignon sur la face gauche. */
function gambrelRoofY(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  gable: string,
  decorate: () => void,
): void {
  const ov = 0.13;
  const w = x1 - x0;
  const xm = (x0 + x1) / 2;
  const ka = x0 + w * 0.15;
  const kb = x1 - w * 0.15;
  const zk = z + h * 0.6;
  const quad = (xa: number, za: number, xb: number, zb: number, c: string) =>
    p.fill(
      [
        [xa, y0 - ov, za],
        [xb, y0 - ov, zb],
        [xb, y1 + ov, zb],
        [xa, y1 + ov, za],
      ],
      c,
    );
  quad(x0 - ov, z - 3, ka - 0.02, zk, shade(color, 0.08));
  quad(ka - 0.02, zk, xm, z + h, shade(color, 0.2));
  p.fill(
    [
      [x0, y1, z],
      [ka, y1, zk],
      [xm, y1, z + h],
      [kb, y1, zk],
      [x1, y1, z],
    ],
    gable,
  );
  decorate();
  quad(xm, z + h, kb + 0.02, zk, shade(color, -0.08));
  quad(kb + 0.02, zk, x1 + ov, z - 3, shade(color, -0.24));
  // Rangs de bardeaux sur les pans avant.
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const xa = xm + (kb - xm) * t;
    const xb = kb + (x1 + ov - kb) * t;
    p.line([xa, y0 - ov, z + h + (zk - z - h) * t], [xa, y1 + ov, z + h + (zk - z - h) * t], shade(color, -0.2), 1);
    p.line([xb, y0 - ov, zk + (z - 3 - zk) * t], [xb, y1 + ov, zk + (z - 3 - zk) * t], shade(color, -0.38), 1);
  }
  // Rives blanches façon grange.
  p.ctx.beginPath();
  const pts: V3[] = [
    [x0 - ov, y1 + ov, z - 3],
    [ka - 0.02, y1 + ov, zk],
    [xm, y1 + ov, z + h],
    [kb + 0.02, y1 + ov, zk],
    [x1 + ov, y1 + ov, z - 3],
  ];
  pts.forEach((pt, i) => {
    const [sx, sy] = p.p(...pt);
    if (i === 0) p.ctx.moveTo(sx, sy);
    else p.ctx.lineTo(sx, sy);
  });
  p.ctx.strokeStyle = '#ffffff';
  p.ctx.lineWidth = 4.5;
  p.ctx.stroke();
  p.line([xm, y0 - ov, z + h], [xm, y1 + ov, z + h], shade(color, 0.35), 2.5);
  p.line([x1 + ov, y0 - ov, z - 3], [x1 + ov, y1 + ov, z - 3], '#f2f2f2', 3);
}

// ——— Accessoires ———

function woodCrate(p: IsoPainter, x: number, y: number, s: number, z = 0, color = '#c8914b'): void {
  p.box(x, y, x + s, y + s, z, z + s * 60, boxColors(color));
  const h = s * 60;
  p.line([x, y + s, z], [x + s, y + s, z + h], shade(color, -0.3), 1.5);
  p.line([x + s, y + s, z], [x + s, y, z + h], shade(color, -0.45), 1.5);
  p.line([x, y + s, z + h / 2], [x + s, y + s, z + h / 2], shade(color, -0.25), 1);
}

/** Palette chargée de cartons filmés. */
function palletStack(p: IsoPainter, x: number, y: number, s = 0.3, levels = 2, color = '#d7a86e'): void {
  p.box(x, y, x + s, y + s, 0, 4, boxColors('#b8895a'));
  const top = 4 + levels * 11;
  p.box(x + 0.02, y + 0.02, x + s - 0.02, y + s - 0.02, 4, top, boxColors(color));
  for (let l = 1; l < levels; l++) {
    p.line([x + 0.02, y + s - 0.02, 4 + l * 11], [x + s - 0.02, y + s - 0.02, 4 + l * 11], shade(color, -0.3), 1);
    p.line([x + s - 0.02, y + s - 0.02, 4 + l * 11], [x + s - 0.02, y + 0.02, 4 + l * 11], shade(color, -0.4), 1);
  }
  const m = x + s / 2;
  p.leftQuad(m - 0.02, m + 0.02, top - 6, top, y + s - 0.02, '#f5e1b8');
  p.line([m, y + 0.02, top], [m, y + s - 0.02, top], '#f5e1b8', 2.5);
}

/** Caisse bleue remplie de poissons. */
function fishCrate(p: IsoPainter, x: number, y: number, z = 0, color = '#29b6f6'): void {
  const s = 0.22;
  p.box(x, y, x + s, y + s, z, z + 8, boxColors(color));
  p.flat(x + 0.02, y + 0.02, x + s - 0.02, y + s - 0.02, z + 8, '#e1f5fe');
  const { ctx } = p;
  for (const [u, v, a] of [
    [0.3, 0.35, 0.4],
    [0.65, 0.5, -0.3],
    [0.4, 0.72, 0.2],
  ] as const) {
    const [sx, sy] = p.p(x + s * u, y + s * v, z + 9);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.fillStyle = '#90a4ae';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(9, -2.5);
    ctx.lineTo(9, 2.5);
    ctx.fill();
    ctx.fillStyle = '#eceff1';
    ctx.fillRect(-4, -1.2, 6, 1);
    ctx.fillStyle = '#263238';
    ctx.fillRect(-4.5, -0.8, 1, 1);
    ctx.restore();
  }
}

function barrel(p: IsoPainter, x: number, y: number, z = 0, color = '#8d5a30'): void {
  cylinder(p, x, y, z, z + 18, 0.08, color);
  hoop(p, x, y, z + 4, 0.08, '#4e342e');
  hoop(p, x, y, z + 14, 0.08, '#4e342e');
}

function bollard(p: IsoPainter, x: number, y: number, z = 0): void {
  cylinder(p, x, y, z, z + 7, 0.045, '#37474f');
  cylinder(p, x, y, z + 7, z + 9, 0.065, '#455a64');
}

/** Bouée de sauvetage rouge et blanche en coordonnées écran. */
function lifeRing(p: IsoPainter, at: V3, r = 7): void {
  const [sx, sy] = p.p(...at);
  const { ctx } = p;
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = i % 2 ? '#ffffff' : '#e53935';
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 0.8, r, 0, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
    ctx.stroke();
  }
}

/** Bouée de chenal flottante. */
function buoy(p: IsoPainter, x: number, y: number, z = -4, color = '#e53935'): void {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 4, 6, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx - 6, sy - 5, 12, 3);
  ctx.fillStyle = shade(color, -0.2);
  ctx.beginPath();
  ctx.moveTo(sx - 2, sy - 9);
  ctx.lineTo(sx, sy - 18);
  ctx.lineTo(sx + 2, sy - 9);
  ctx.fill();
  ctx.fillStyle = '#fff59d';
  ctx.beginPath();
  ctx.arc(sx, sy - 19, 2, 0, Math.PI * 2);
  ctx.fill();
}

function seagull(p: IsoPainter, at: V3): void {
  const [sx, sy] = p.p(...at);
  const { ctx } = p;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(sx, sy - 4, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + 4, sy - 8, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#90a4ae';
  ctx.beginPath();
  ctx.ellipse(sx - 2, sy - 5, 4, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.moveTo(sx + 6, sy - 8.5);
  ctx.lineTo(sx + 9.5, sy - 7.5);
  ctx.lineTo(sx + 6, sy - 7);
  ctx.fill();
}

function hayBale(p: IsoPainter, x: number, y: number): void {
  const [sx, sy] = p.p(x, y, 9);
  const { ctx } = p;
  ctx.fillStyle = '#d9ad3c';
  ctx.beginPath();
  ctx.ellipse(sx - 5, sy, 11, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(sx - 5, sy - 9.5, 9, 19);
  ctx.fillStyle = '#f3d57c';
  ctx.beginPath();
  ctx.ellipse(sx + 4, sy, 7.5, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
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

function squareBale(p: IsoPainter, x: number, y: number, z = 0): void {
  p.box(x, y, x + 0.24, y + 0.16, z, z + 11, boxColors('#e8c547'));
  p.line([x + 0.07, y + 0.16, z], [x + 0.07, y + 0.16, z + 11], '#b8902a', 1.2);
  p.line([x + 0.17, y + 0.16, z], [x + 0.17, y + 0.16, z + 11], '#b8902a', 1.2);
}

/** Camion semi-remorque ; la cabine regarde vers +x ou +y. */
function truck(
  p: IsoPainter,
  x: number,
  y: number,
  axis: 'x' | 'y',
  len: number,
  cab: string,
  box = '#f5f5f5',
  stripe = '#e53935',
): void {
  const w = 0.34;
  const wheel = (at: V3) => {
    const [sx, sy] = p.p(...at);
    p.ctx.fillStyle = '#263238';
    p.ctx.beginPath();
    p.ctx.ellipse(sx, sy, 4.5, 5, 0, 0, Math.PI * 2);
    p.ctx.fill();
    p.ctx.fillStyle = '#b0bec5';
    p.ctx.beginPath();
    p.ctx.ellipse(sx, sy, 1.8, 2, 0, 0, Math.PI * 2);
    p.ctx.fill();
  };
  if (axis === 'y') {
    const e = y + len;
    const c0 = e + 0.03;
    const c1 = e + 0.27;
    p.box(x + 0.04, y + 0.05, x + w - 0.04, c1 - 0.02, 3, 8, boxColors('#37474f'));
    p.box(x, y, x + w, e, 8, 38, boxColors(box));
    p.rightQuad(y + 0.04, e - 0.04, 20, 27, x + w, shade(stripe, -0.15));
    p.leftQuad(x, x + w, 20, 27, e, stripe);
    p.box(x, c0, x + w, c1, 5, 26, boxColors(cab));
    p.box(x + 0.02, c0, x + w - 0.02, c1 - 0.1, 26, 33, boxColors(shade(cab, -0.1)));
    p.leftQuad(x + 0.04, x + w - 0.04, 15, 24, c1, '#b3e5fc');
    p.rightQuad(c0 + 0.04, c1 - 0.08, 15, 23, x + w, '#4fc3f7');
    p.leftQuad(x + 0.02, x + w - 0.02, 5, 8, c1, '#cfd8dc');
    p.dot(x + 0.06, c1, 10, 2.2, '#fff59d');
    p.dot(x + w - 0.06, c1, 10, 2.2, '#fff59d');
    for (const yy of [y + 0.1, y + 0.24, c1 - 0.08]) wheel([x + w, yy, 4]);
  } else {
    const e = x + len;
    const c0 = e + 0.03;
    const c1 = e + 0.27;
    p.box(x + 0.05, y + 0.04, c1 - 0.02, y + w - 0.04, 3, 8, boxColors('#37474f'));
    p.box(x, y, e, y + w, 8, 38, boxColors(box));
    p.leftQuad(x + 0.04, e - 0.04, 20, 27, y + w, stripe);
    p.rightQuad(y, y + w, 20, 27, e, shade(stripe, -0.15));
    p.box(c0, y, c1, y + w, 5, 26, boxColors(cab));
    p.box(c0, y + 0.02, c1 - 0.1, y + w - 0.02, 26, 33, boxColors(shade(cab, -0.1)));
    p.rightQuad(y + 0.04, y + w - 0.04, 15, 24, c1, '#81d4fa');
    p.leftQuad(c0 + 0.04, c1 - 0.08, 15, 23, y + w, '#b3e5fc');
    p.rightQuad(y + 0.02, y + w - 0.02, 5, 8, c1, '#cfd8dc');
    p.dot(c1, y + 0.06, 10, 2.2, '#fff59d');
    p.dot(c1, y + w - 0.06, 10, 2.2, '#fff59d');
    for (const xx of [x + 0.1, x + 0.24, c1 - 0.08]) wheel([xx, y + w, 4]);
  }
}

/** Chariot élévateur jaune, fourches vers +y, avec un conducteur casqué. */
function forklift(p: IsoPainter, x: number, y: number, load = true): void {
  const w = 0.22;
  const yellow = '#fbc02d';
  p.box(x, y, x + w, y + 0.26, 3, 15, boxColors(yellow));
  p.box(x + 0.01, y, x + w - 0.01, y + 0.07, 15, 22, boxColors('#424242'));
  p.box(x + 0.06, y + 0.09, x + 0.16, y + 0.17, 15, 21, boxColors('#263238'));
  p.dot(x + 0.11, y + 0.13, 27, 4, '#ffcc80');
  p.dot(x + 0.105, y + 0.125, 31, 3.6, '#ff7043');
  for (const [cx, cy] of [
    [x + 0.015, y + 0.05],
    [x + w - 0.015, y + 0.05],
    [x + 0.015, y + 0.24],
    [x + w - 0.015, y + 0.24],
  ] as const)
    p.line([cx, cy, 15], [cx, cy, 36], '#37474f', 2);
  p.box(x, y + 0.03, x + w, y + 0.26, 36, 38, boxColors(yellow));
  for (const yy of [y + 0.06, y + 0.21]) {
    const [sx, sy] = p.p(x + w, yy, 4);
    p.ctx.fillStyle = '#212121';
    p.ctx.beginPath();
    p.ctx.ellipse(sx, sy, 4, 4.5, 0, 0, Math.PI * 2);
    p.ctx.fill();
  }
  p.line([x + 0.04, y + 0.29, 2], [x + 0.04, y + 0.29, 42], '#455a64', 3);
  p.line([x + w - 0.04, y + 0.29, 2], [x + w - 0.04, y + 0.29, 42], '#455a64', 3);
  p.line([x + 0.04, y + 0.29, 40], [x + w - 0.04, y + 0.29, 40], '#455a64', 2);
  const fz = load ? 10 : 4;
  p.box(x + 0.03, y + 0.29, x + 0.07, y + 0.52, fz, fz + 2, boxColors('#37474f'));
  p.box(x + 0.15, y + 0.29, x + 0.19, y + 0.52, fz, fz + 2, boxColors('#37474f'));
  if (load) {
    p.box(x - 0.01, y + 0.3, x + w + 0.01, y + 0.54, fz + 2, fz + 5, boxColors('#b8895a'));
    p.box(x + 0.01, y + 0.32, x + w - 0.01, y + 0.52, fz + 5, fz + 20, boxColors('#d7a86e'));
    p.line([x + w / 2, y + 0.32, fz + 20], [x + w / 2, y + 0.52, fz + 20], '#f5e1b8', 2.5);
  }
}

/** Plots jaunes et noirs de sécurité. */
function safetyPost(p: IsoPainter, x: number, y: number): void {
  cylinder(p, x, y, 0, 16, 0.035, '#fdd835');
  cylinder(p, x, y, 5, 9, 0.036, '#263238');
}

/** Coque de bateau orientée selon x (proue vers +x). */
function hull(p: IsoPainter, x0: number, y0: number, x1: number, y1: number, h: number, color: string, deck: string) {
  const ym = (y0 + y1) / 2;
  const bow = x1 + (y1 - y0) * 0.75;
  const zb = -4;
  p.fill(
    [
      [x1, y0, zb],
      [bow, ym, zb + 2],
      [bow, ym, h + 4],
      [x1, y0, h],
    ],
    shade(color, -0.3),
  );
  p.fill(
    [
      [x0 + 0.04, y1 - 0.02, zb],
      [x1, y1, zb],
      [bow, ym, zb + 2],
      [bow, ym, h + 4],
      [x1, y1, h],
      [x0, y1, h],
    ],
    p.gradient([x0, y1, h], [x0, y1, zb], shade(color, 0.12), shade(color, -0.12)),
  );
  p.fill(
    [
      [x0, y0, h],
      [x1, y0, h],
      [bow, ym, h + 4],
      [x1, y1, h],
      [x0, y1, h],
    ],
    deck,
  );
  p.line([x0, y1, h], [x1, y1, h], '#ffffff', 2.2);
  p.line([x1, y1, h], [bow, ym, h + 4], '#ffffff', 2.2);
  p.line([x0, y1, zb + 3], [x1, y1, zb + 3], shade(color, -0.45), 2.5);
}

/** Barque à rames. */
function rowboat(p: IsoPainter, x0: number, y0: number, len: number, color: string): void {
  const w = 0.3;
  hull(p, x0, y0, x0 + len, y0 + w, 9, color, '#a1673f');
  for (const u of [0.25, 0.6]) p.box(x0 + len * u, y0 + 0.03, x0 + len * u + 0.07, y0 + w - 0.03, 7, 10, boxColors('#d7b48a'));
  p.line([x0 + len * 0.5, y0 + w - 0.02, 11], [x0 + len * 0.35, y0 + w + 0.22, -2], '#8d6e63', 2.5);
  p.line([x0 + len * 0.5, y0 + 0.02, 11], [x0 + len * 0.6, y0 - 0.15, 2], '#8d6e63', 2.5);
}

// ——— Grange ———

const barn: Hero = {
  height: 136,
  draw: (gp, p) => {
    lot(gp, 2, '#9ccf63');
    gp.flat(0.25, 1.25, 1.6, 1.98, 0, '#d8bd8a');
    gp.flat(0.5, 1.5, 1.3, 1.98, 0, '#cfae74');
    softShadow(gp, 0.28, 0.2, 1.85, 1.32);

    p.fence([0.06, 0.06], [1.94, 0.06], '#ffffff', 12);
    p.fence([0.06, 0.06], [0.06, 1.94], '#ffffff', 12);

    const x0 = 0.28;
    const x1 = 1.5;
    const y0 = 0.2;
    const y1 = 1.32;
    const h = 44;
    const red = '#c62f22';
    const xm = (x0 + x1) / 2;
    p.box(x0, y0, x1, y1, 0, h, boxColors(red, false));
    ribsL(p, x0, x1, y1, 0, h, shade(red, -0.15), 0.07);
    ribsR(p, y0, y1, x1, 0, h, shade(red, -0.35), 0.07);
    p.leftQuad(x0, x1, 0, 4, y1, '#8d8a82');
    p.rightQuad(y0, y1, 0, 4, x1, '#6f6c66');
    p.leftQuad(x0, x0 + 0.05, 0, h, y1, '#ffffff');
    p.leftQuad(x1 - 0.05, x1, 0, h, y1, '#ffffff');
    p.rightQuad(y0, y0 + 0.05, 0, h, x1, '#e3e6e8');
    // Fenêtre à croix sur le côté.
    p.rightQuad(0.3, 0.58, 16, 36, x1, '#ffffff');
    p.rightQuad(0.33, 0.55, 18.5, 33.5, x1, '#5d4037');
    p.line([x1, 0.33, 18.5], [x1, 0.55, 33.5], '#ffffff', 2);
    p.line([x1, 0.55, 18.5], [x1, 0.33, 33.5], '#ffffff', 2);

    gambrelRoofY(p, x0, y0, x1, y1, h, 48, '#6d5d55', red, () => {
      ribsL(p, x0 + 0.05, x1 - 0.05, y1, h, h + 40, shade(red, -0.15), 0.07);
      p.line([x0, y1, h], [x1, y1, h], '#ffffff', 3);
      // Porte du fenil, foin qui dépasse, poutre et poulie.
      p.leftQuad(xm - 0.15, xm + 0.15, h + 6, h + 26, y1, '#ffffff');
      p.leftQuad(xm - 0.12, xm + 0.12, h + 8, h + 24, y1, '#4e342e');
      for (let i = 0; i < 6; i++) p.dot(xm - 0.1 + i * 0.04, y1, h + 9 + (i % 2) * 2, 3.2, '#f2cf55');
      p.box(xm - 0.03, y1, xm + 0.03, y1 + 0.22, h + 30, h + 34, boxColors('#8d6e63'));
      p.line([xm, y1 + 0.2, h + 30], [xm, y1 + 0.2, h + 18], '#424242', 1.2);
      p.dot(xm, y1 + 0.2, h + 17, 2, '#9e9e9e');
    });

    // Grande porte double à croix blanches.
    const a = xm - 0.31;
    const b = xm + 0.31;
    p.leftQuad(a - 0.04, b + 0.04, 0, 36, y1, '#ffffff');
    for (const [s, e] of [
      [a, xm - 0.01],
      [xm + 0.01, b],
    ] as const) {
      p.leftQuad(s, e, 0, 32, y1, '#a32519');
      ribsL(p, s, e, y1, 0, 32, '#8e1f15', 0.06);
      p.leftQuad(s, e, 0, 2.5, y1, '#ffffff');
      p.leftQuad(s, e, 29.5, 32, y1, '#ffffff');
      p.line([s + 0.01, y1, 2], [e - 0.01, y1, 30], '#ffffff', 2.6);
      p.line([e - 0.01, y1, 2], [s + 0.01, y1, 30], '#ffffff', 2.6);
    }
    p.box(a - 0.06, y1, b + 0.06, y1 + 0.04, 36, 39, boxColors('#ffffff', false));

    // Lucarne d'aération et girouette au coq.
    const cy = 0.68;
    p.box(xm - 0.1, cy, xm + 0.1, cy + 0.2, h + 40, h + 58, boxColors('#ffffff', false));
    for (let z = h + 44; z < h + 56; z += 3) p.line([xm - 0.07, cy + 0.2, z], [xm + 0.07, cy + 0.2, z], '#9e9e9e', 1);
    p.pyramidRoof(xm - 0.1, cy, xm + 0.1, cy + 0.2, h + 58, 12, '#6d5d55', 0.04);
    const top = h + 70;
    p.line([xm, cy + 0.1, top], [xm, cy + 0.1, top + 16], '#424242', 2);
    p.line([xm - 0.1, cy, top + 9], [xm + 0.1, cy + 0.2, top + 9], '#424242', 1.6);
    const [vx, vy] = p.p(xm, cy + 0.1, top + 16);
    const { ctx } = p;
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.moveTo(vx - 8, vy + 1);
    ctx.quadraticCurveTo(vx - 6, vy - 7, vx, vy - 4);
    ctx.lineTo(vx + 4, vy - 10);
    ctx.lineTo(vx + 7, vy - 8);
    ctx.lineTo(vx + 6, vy - 3);
    ctx.quadraticCurveTo(vx + 6, vy + 2, vx, vy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(vx + 5, vy - 11, 2, 0, Math.PI * 2);
    ctx.fill();

    // Appentis sur le côté, rempli de foin.
    const lx = 1.82;
    p.box(x1, 0.72, lx, 1.3, 0, 24, boxColors(red, false));
    ribsR(p, 0.72, 1.3, lx, 0, 24, shade(red, -0.35), 0.07);
    p.leftQuad(x1 + 0.04, lx - 0.04, 0, 22, 1.3, '#4e342e');
    squareBale(p, x1 + 0.05, 1.12, 0);
    squareBale(p, x1 + 0.05, 1.12, 11);
    p.fill(
      [
        [x1, 0.66, 32],
        [x1, 1.38, 32],
        [lx + 0.08, 1.38, 22],
        [lx + 0.08, 0.66, 22],
      ],
      '#7d6d64',
    );
    p.line([lx + 0.08, 0.66, 22], [lx + 0.08, 1.38, 22], '#ffffff', 2.5);
    p.line([x1, 1.38, 32], [lx + 0.08, 1.38, 22], '#ffffff', 2.5);

    // Foin, bidons de lait et clôture avant.
    squareBale(p, 0.1, 1.5);
    squareBale(p, 0.12, 1.66);
    squareBale(p, 0.12, 1.55, 11);
    for (const [x, y] of [
      [1.3, 1.5],
      [1.38, 1.6],
    ] as const) {
      cylinder(p, x, y, 0, 13, 0.05, '#cfd8dc');
      cylinder(p, x, y, 13, 16, 0.03, '#b0bec5');
    }
    hayBale(p, 1.72, 1.6);
    hayBale(p, 1.55, 1.82);
    roundBush(p, 0.3, 1.88, 7);
    p.fence([0.06, 1.94], [0.42, 1.94], '#ffffff', 12);
    p.fence([1.94, 0.06], [1.94, 1.94], '#ffffff', 12);
  },
};

// ——— Silo ———

const silo: Hero = {
  height: 150,
  draw: (gp, p) => {
    lot(gp, 2, '#9ccf63');
    gp.flat(0.12, 0.12, 1.9, 1.9, 0, '#cdb38a');
    softShadow(gp, 0.2, 0.2, 1.8, 1.7);

    // Grand silo de béton à dôme argenté, avec échelle.
    const sx = 1.32;
    const sy = 0.58;
    const r = 0.36;
    const top = 106;
    cylinder(p, sx, sy, 0, top, r, '#b8c4ca');
    for (let z = 14; z < top; z += 15) hoop(p, sx, sy, z, r, '#8fa1a9', 1.4);
    hoop(p, sx, sy, top - 4, r, '#c0392b', 5);
    dome(p, sx, sy, top, r, 24, '#cfd8dc');
    cylinder(p, sx, sy - 0.04, top + 20, top + 28, 0.06, '#90a4ae');
    const lx = sx + 0.2;
    const ly = sy + 0.3;
    p.line([lx, ly, 2], [lx, ly, top + 2], '#546e7a', 1.6);
    p.line([lx + 0.08, ly - 0.03, 2], [lx + 0.08, ly - 0.03, top + 2], '#546e7a', 1.6);
    for (let z = 8; z < top; z += 7) p.line([lx, ly, z], [lx + 0.08, ly - 0.03, z], '#546e7a', 1.2);

    // Petite grange rouge au toit mansardé.
    const x0 = 0.18;
    const x1 = 1.0;
    const y0 = 0.82;
    const y1 = 1.66;
    const h = 30;
    const red = '#c62f22';
    const xm = (x0 + x1) / 2;
    p.box(x0, y0, x1, y1, 0, h, boxColors(red, false));
    ribsL(p, x0, x1, y1, 0, h, shade(red, -0.15), 0.07);
    ribsR(p, y0, y1, x1, 0, h, shade(red, -0.35), 0.07);
    p.leftQuad(x0, x0 + 0.04, 0, h, y1, '#ffffff');
    p.leftQuad(x1 - 0.04, x1, 0, h, y1, '#ffffff');
    p.rightQuad(1.05, 1.35, 12, 24, x1, '#ffffff');
    p.rightQuad(1.08, 1.32, 14, 22, x1, '#5d4037');
    gambrelRoofY(p, x0, y0, x1, y1, h, 32, '#6d5d55', red, () => {
      ribsL(p, x0 + 0.04, x1 - 0.04, y1, h, h + 26, shade(red, -0.15), 0.07);
      p.leftQuad(xm - 0.09, xm + 0.09, h + 6, h + 18, y1, '#ffffff');
      p.leftQuad(xm - 0.065, xm + 0.065, h + 7.5, h + 16.5, y1, '#4e342e');
    });
    const a = xm - 0.2;
    const b = xm + 0.2;
    p.leftQuad(a - 0.03, b + 0.03, 0, 25, y1, '#ffffff');
    p.leftQuad(a, b, 0, 22, y1, '#a32519');
    p.line([a, y1, 1], [b, y1, 21], '#ffffff', 2.2);
    p.line([b, y1, 1], [a, y1, 21], '#ffffff', 2.2);

    // Cuve à grain en tôle ondulée, toit conique, et vis d'alimentation.
    const bx = 1.52;
    const by = 1.4;
    const br = 0.27;
    cylinder(p, bx, by, 0, 50, br, '#cfd8dc');
    for (let z = 4; z < 50; z += 4) hoop(p, bx, by, z, br, '#a7b6bd', 1);
    dome(p, bx, by, 50, br, 20, '#b0bec5', true);
    cylinder(p, bx, by, 70, 74, 0.04, '#90a4ae');
    p.line([bx, by, 72], [sx + 0.05, sy + 0.08, top + 16], '#78909c', 4);
    p.line([bx, by, 72], [sx + 0.05, sy + 0.08, top + 16], '#b0bec5', 2);
    p.line([bx + 0.22, by + 0.12, 0], [bx, by, 70], '#78909c', 2);

    // Foin, sacs et buissons.
    hayBale(p, 0.35, 1.84);
    squareBale(p, 1.05, 1.72);
    squareBale(p, 1.08, 1.75, 11);
    for (const [x, y] of [
      [1.78, 1.85],
      [1.66, 1.92],
    ] as const) {
      p.dot(x, y, 5, 6, '#efe3c6');
      p.dot(x - 0.01, y - 0.01, 10, 4, '#f7eed8');
    }
    roundBush(p, 0.2, 0.3, 8);
    roundBush(p, 0.42, 0.2, 6, '#5cbf32');
  },
};

// ——— Entrepôt ———

const warehouse: Hero = {
  height: 102,
  draw: (gp, p) => {
    lot(gp, 3, '#cfcac0');
    gp.flat(0.1, 2.3, 2.9, 2.92, 0, '#b8b2a6');
    for (const x of [0.5, 1.0, 2.1, 2.6]) paintLine(gp, [x, 2.4, 0], [x, 2.88, 0], '#ffffff');
    softShadow(gp, 0.3, 0.2, 2.45, 2.25);

    const x0 = 0.3;
    const x1 = 2.45;
    const y0 = 0.22;
    const y1 = 1.95;
    const h = 58;
    const wall = '#90a4ae';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall, false));
    ribsL(p, x0, x1, y1, 0, h, shade(wall, -0.12));
    ribsR(p, y0, y1, x1, 0, h, shade(wall, -0.35));
    p.leftQuad(x0, x1, 0, 5, y1, '#78909c');
    p.rightQuad(y0, y1, 0, 5, x1, '#607d8b');
    p.leftQuad(x0, x1, h - 3, h, y1, '#cfd8dc');
    // Fenêtres hautes et porte de service côté droit.
    for (const y of [0.45, 0.85, 1.25]) p.window('right', y - 0.12, y + 0.12, 36, 48, x1, '#b3e5fc', '#eceff1');
    p.door('right', 1.68, 0.2, 26, x1, '#1e88e5');
    p.awning('right', 1.52, 1.84, 34, x1, ['#1e88e5', '#ffffff'], 0.18, 7);

    barrelRoofX(p, x0, y0, x1, y1, h, 30, '#5f7d8c', wall);
    for (const x of [0.8, 1.4, 2.0]) {
      cylinder(p, x, (y0 + y1) / 2, h + 28, h + 34, 0.07, '#b0bec5');
      dome(p, x, (y0 + y1) / 2, h + 34, 0.07, 6, '#eceff1');
    }

    // Quai de chargement surélevé, auvent et portes.
    p.box(x0, y1, x1, y1 + 0.3, 0, 9, boxColors('#bdb5a6'));
    p.leftQuad(x0, x1, 7, 9, y1 + 0.3, '#fdd835');
    for (const x of [0.62, 1.3, 1.62, 2.3]) p.leftQuad(x - 0.03, x + 0.03, 1, 7, y1 + 0.3, '#212121');
    rollDoor(p, 'left', 0.55, 1.15, 9, 38, y1, '#eceff1');
    rollDoor(p, 'left', 1.5, 2.1, 9, 38, y1, '#eceff1');
    p.fill(
      [
        [x0 - 0.02, y1, 44],
        [x1 + 0.02, y1, 44],
        [x1 + 0.02, y1 + 0.34, 39],
        [x0 - 0.02, y1 + 0.34, 39],
      ],
      '#455a64',
    );
    p.line([x0 - 0.02, y1 + 0.34, 39], [x1 + 0.02, y1 + 0.34, 39], '#fdd835', 2.5);
    p.sign('left', 0.7, 2.05, 45, 56, y1 + 0.01, '#37474f', '#ffffff', signText('ENTREPÔT'));

    // Palettes, chariot élévateur et camion à quai.
    palletStack(p, 0.38, y1 + 0.02, 0.24, 1);
    p.box(0.38, y1 + 0.02, 0.62, y1 + 0.26, 9, 9, boxColors('#bdb5a6'));
    palletStack(p, 0.06, 2.35, 0.28, 2);
    palletStack(p, 0.06, 2.65, 0.28, 1, '#c99a5e');
    truck(p, 1.62, 2.27, 'y', 0.42, '#e53935');
    forklift(p, 0.75, 2.32);
    palletStack(p, 2.55, 2.4, 0.28, 2);
    safetyPost(p, 2.5, 2.1);
    safetyPost(p, 2.85, 2.1);
    roundBush(p, 2.75, 0.4, 9);
    roundBush(p, 2.8, 1.0, 8, '#5cbf32');
  },
};

// ——— Grand dépôt ———

const bigWarehouse: Hero = {
  height: 104,
  draw: (gp, p) => {
    lot(gp, 3, '#cfcac0');
    softShadow(gp, 0.2, 0.2, 2.35, 2.15);
    for (const x of [0.85, 1.6]) paintLine(gp, [x, 2.3, 0], [x, 2.92, 0]);
    paintLine(gp, [2.45, 0.3, 0], [2.92, 0.3, 0], '#ffffff');

    const x0 = 0.2;
    const x1 = 2.35;
    const y0 = 0.2;
    const y1 = 2.12;
    const h = 62;
    const wall = '#a1887f';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall, false));
    ribsL(p, x0, x1, y1, 14, h, shade(wall, -0.12), 0.09);
    ribsR(p, y0, y1, x1, 14, h, shade(wall, -0.35), 0.09);
    // Soubassement en brique.
    p.leftQuad(x0, x1, 0, 14, y1, '#8d4e3b');
    p.rightQuad(y0, y1, 0, 14, x1, '#6e3b2c');
    for (let z = 3.5; z < 14; z += 3.5) {
      p.line([x0, y1, z], [x1, y1, z], '#b0705a', 1);
      p.line([x1, y1, z], [x1, y0, z], '#8d5444', 1);
    }
    for (const x of [x0, 0.9, 1.65, x1 - 0.06]) p.leftQuad(x, x + 0.06, 0, h, y1, '#d7ccc8');
    // Toit en dents de scie avec verrières.
    const teeth = 4;
    const tw = (x1 - x0) / teeth;
    const rz = 24;
    for (let i = 0; i < teeth; i++) {
      const xa = x0 + i * tw;
      const xb = xa + tw;
      p.fill(
        [
          [xa, y0, h],
          [xb, y0, h + rz],
          [xb, y1, h + rz],
          [xa, y1, h],
        ],
        p.gradient([xa, y1, h], [xb, y1, h + rz], shade('#6d4c41', 0.05), shade('#6d4c41', 0.25)),
      );
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        p.line([xa + tw * t, y0, h + rz * t], [xa + tw * t, y1, h + rz * t], shade('#6d4c41', -0.15), 1);
      }
      p.rightQuad(y0, y1, h, h + rz, xb, '#455a64');
      for (let y = y0 + 0.06; y < y1 - 0.1; y += 0.24) p.window('right', y + 0.04, y + 0.18, h + 5, h + rz - 4, xb, '#9fd8f5', '#d7ccc8');
      p.fill(
        [
          [xa, y1, h],
          [xb, y1, h],
          [xb, y1, h + rz],
        ],
        shade(wall, 0.05),
      );
      p.line([xa - 0.01, y1 + 0.01, h], [xb + 0.01, y1 + 0.01, h + rz], '#efebe9', 3);
      p.line([xb, y0, h + rz], [xb, y1, h + rz], '#efebe9', 2.5);
    }

    // Trois portes de quai sous un long auvent.
    const doors = [0.35, 1.02, 1.69] as const;
    for (const a of doors) rollDoor(p, 'left', a, a + 0.5, 0, 38, y1, '#d7ccc8');
    p.fill(
      [
        [x0 - 0.02, y1, 47],
        [x1 + 0.02, y1, 47],
        [x1 + 0.02, y1 + 0.32, 41],
        [x0 - 0.02, y1 + 0.32, 41],
      ],
      '#5d4037',
    );
    p.line([x0 - 0.02, y1 + 0.32, 41], [x1 + 0.02, y1 + 0.32, 41], '#ffb74d', 2.5);
    for (const a of doors) {
      p.leftQuad(a - 0.02, a + 0.02, 2, 12, y1 + 0.01, '#212121');
      p.leftQuad(a + 0.48, a + 0.52, 2, 12, y1 + 0.01, '#212121');
    }
    // Enseigne et bureau côté droit.
    p.sign('right', 0.45, 1.85, 30, 46, x1 + 0.01, '#3e2723', '#ffffff', signText('DÉPÔT'));
    p.door('right', 0.75, 0.2, 24, x1, '#ff8f00');
    p.window('right', 1.2, 1.5, 14, 24, x1, '#b3e5fc', '#efebe9');
    p.window('right', 1.65, 1.95, 14, 24, x1, '#b3e5fc', '#efebe9');
    p.awning('right', 0.6, 0.9, 28, x1, ['#ff8f00', '#ffffff'], 0.16, 6);

    // Camion à quai, chariot et palettes.
    truck(p, 1.1, 2.18, 'y', 0.46, '#1e88e5', '#fff8e1', '#ff8f00');
    palletStack(p, 0.3, 2.3, 0.28, 2);
    palletStack(p, 0.3, 2.62, 0.28, 1, '#c99a5e');
    woodCrate(p, 0.65, 2.55, 0.2);
    forklift(p, 2.52, 1.0);
    palletStack(p, 2.5, 1.65, 0.3, 2);
    palletStack(p, 2.5, 2.05, 0.3, 3, '#c99a5e');
    woodCrate(p, 2.0, 2.5, 0.22);
    woodCrate(p, 2.03, 2.53, 0.16, 13);
    roundBush(p, 2.7, 0.55, 8);
  },
};

// ——— Plateforme logistique ———

const logistics: Hero = {
  height: 112,
  draw: (gp, p) => {
    lot(gp, 3, '#bdbdbd');
    gp.flat(2.15, 0.1, 2.95, 2.95, 0, '#a7a7a7');
    for (const y of [0.3, 0.9, 1.5, 2.1]) paintLine(gp, [2.2, y, 0], [2.92, y, 0]);
    softShadow(gp, 0.2, 0.2, 2.15, 2.15);

    const x0 = 0.2;
    const x1 = 2.12;
    const y0 = 0.2;
    const y1 = 2.12;
    const h = 56;
    const wall = '#ffb74d';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall, false));
    ribsL(p, x0, x1, y1, 0, h, shade(wall, -0.1), 0.1);
    ribsR(p, y0, y1, x1, 0, h, shade(wall, -0.3), 0.1);
    p.leftQuad(x0, x1, 0, 6, y1, '#e65100');
    p.rightQuad(y0, y1, 0, 6, x1, '#bf4300');
    // Toit plat à acrotère, verrières, climatiseurs et carton géant.
    p.box(x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, h + 7, boxColors('#e65100'));
    p.flat(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, h + 7, '#8a8a8a');
    for (const [a, b] of [
      [0.45, 0.85],
      [1.05, 1.45],
    ] as const) {
      p.box(a, 0.4, b, 0.62, h + 7, h + 12, boxColors('#cfd8dc'));
      p.flat(a + 0.03, 0.43, b - 0.03, 0.59, h + 12, '#81d4fa');
    }
    p.box(1.6, 0.35, 1.95, 0.65, h + 7, h + 19, boxColors('#cfd8dc'));
    p.groundEllipse(1.775, 0.5, h + 19, 0.11, '#78909c');
    p.box(0.4, 0.9, 0.6, 1.1, h + 7, h + 15, boxColors('#9e9e9e'));
    const bx0 = 1.0;
    const by0 = 1.0;
    const bs = 0.7;
    const bz = h + 7;
    p.box(bx0, by0, bx0 + bs, by0 + bs, bz, bz + 38, boxColors('#d7a05a'));
    p.leftQuad(bx0 + bs / 2 - 0.05, bx0 + bs / 2 + 0.05, bz + 24, bz + 38, by0 + bs, '#f5d9a8');
    p.line([bx0 + bs / 2, by0, bz + 38], [bx0 + bs / 2, by0 + bs, bz + 38], '#f5d9a8', 6);
    p.line([bx0, by0 + bs / 2, bz + 38], [bx0 + bs, by0 + bs / 2, bz + 38], '#c58a45', 1.5);
    // Flèche « livraison » et pictogramme verre.
    const [ax, ay] = p.p(bx0 + bs * 0.45, by0 + bs, bz + 14);
    const { ctx } = p;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.fillStyle = '#e65100';
    ctx.beginPath();
    ctx.moveTo(-14, -3);
    ctx.lineTo(4, -3);
    ctx.lineTo(4, -8);
    ctx.lineTo(14, 0);
    ctx.lineTo(4, 8);
    ctx.lineTo(4, 3);
    ctx.lineTo(-14, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    p.rightQuad(by0 + 0.2, by0 + 0.5, bz + 10, bz + 22, bx0 + bs, '#b07a3c');

    p.sign('left', 1.2, 2.05, 38, 52, y1 + 0.01, '#e65100', '#ffffff', signText('LOGISTIQUE'));
    // Bureaux vitrés à l'angle avant-gauche.
    const ox0 = 0.12;
    const ox1 = 0.82;
    const oy0 = 1.62;
    const oy1 = 2.42;
    p.box(ox0, oy0, ox1, oy1, 0, 78, boxColors('#eceff1'));
    for (const z of [8, 30, 52]) {
      p.leftQuad(ox0 + 0.05, ox1 - 0.05, z, z + 16, oy1, p.gradient([0, oy1, z + 16], [0, oy1, z], '#bfe7fb', '#4fa8d8'));
      p.rightQuad(oy0 + 0.05, oy1 - 0.05, z, z + 16, ox1, p.gradient([ox1, 0, z + 16], [ox1, 0, z], '#a5d6f0', '#3b8fbf'));
      for (const u of [0.35, 0.6]) p.line([ox0 + u, oy1, z], [ox0 + u, oy1, z + 16], '#eceff1', 1.5);
      p.line([ox1, oy0 + 0.4, z], [ox1, oy0 + 0.4, z + 16], '#cfd8dc', 1.5);
    }
    p.box(ox0 - 0.03, oy0 - 0.03, ox1 + 0.03, oy1 + 0.03, 78, 83, boxColors('#e65100'));
    p.door('left', 0.47, 0.22, 8, oy1, '#90caf9');
    p.line([0.35, 1.9, 83], [0.35, 1.9, 104], '#9e9e9e', 2);
    p.dot(0.35, 1.9, 105, 2.5, '#e53935');

    // Quais côté droit avec deux camions.
    const bays = [0.38, 0.98, 1.58] as const;
    for (const a of bays) rollDoor(p, 'right', a, a + 0.44, 0, 34, x1, '#eceff1');
    for (const a of bays) p.fill(
        [
          [x1, a - 0.04, 40],
          [x1, a + 0.48, 40],
          [x1 + 0.16, a + 0.48, 36],
          [x1 + 0.16, a - 0.04, 36],
        ],
        '#bf4300',
      );
    truck(p, 2.18, 0.42, 'x', 0.42, '#1565c0', '#ffffff', '#ff9800');
    palletStack(p, 2.3, 1.05, 0.28, 2);
    truck(p, 2.18, 1.62, 'x', 0.42, '#43a047', '#ffffff', '#ff9800');
    forklift(p, 1.2, 2.25);
    palletStack(p, 0.95, 2.62, 0.26, 2);
    palletStack(p, 1.55, 2.6, 0.26, 1);
    safetyPost(p, 2.2, 2.4);
    safetyPost(p, 2.45, 2.65);
    roundBush(p, 2.75, 2.6, 9);
  },
};

// ——— Ponton de pêche ———

const pier: Hero = {
  height: 72,
  draw: (gp, p) => {
    // Pas de parcelle d'herbe : un plancher sur pilotis au-dessus de l'eau.
    const wx0 = 0.72;
    const wy0 = 1.22;
    gp.flat(wx0, wy0, 1.98, 1.98, 0, gp.gradient([wx0, wy0, 0], [1.98, 1.98, 0], '#62c6f2', WATER));
    ripples(gp, wx0, wy0, 1.98, 1.98, 0);

    const dz = 8;
    const deck = '#c8914b';
    const plank = (x0: number, y0: number, x1: number, y1: number) => {
      p.box(x0, y0, x1, y1, dz - 4, dz, boxColors(deck));
      for (let x = x0 + 0.1; x < x1; x += 0.1) p.line([x, y0, dz], [x, y1, dz], '#a8743a', 1);
    };
    // Pilotis visibles sous le plancher, du côté de l'eau.
    for (let x = 0.75; x < 1.96; x += 0.3) p.box(x, 1.18, x + 0.06, 1.24, -3, dz - 4, boxColors('#6d4c41'));
    for (let y = 1.4; y < 1.96; y += 0.3) p.box(0.68, y, 0.74, y + 0.06, -3, dz - 4, boxColors('#6d4c41'));
    plank(0.04, 0.04, 1.96, 1.2);
    plank(0.04, 1.2, 0.7, 1.96);

    // Cabane de pêcheur.
    const x0 = 0.42;
    const x1 = 1.36;
    const y0 = 0.16;
    const y1 = 0.92;
    const h = dz + 32;
    const wood = '#a1673f';
    p.box(x0, y0, x1, y1, dz, h, boxColors(wood, false));
    for (let z = dz + 4; z < h; z += 4) {
      p.line([x0, y1, z], [x1, y1, z], shade(wood, -0.18), 1);
      p.line([x1, y1, z], [x1, y0, z], shade(wood, -0.38), 1);
    }
    p.window('left', 0.52, 0.72, dz + 12, dz + 24, y1, '#fff3c4', '#ffffff');
    p.door('left', 1.08, 0.22, 24, y1, '#1565c0', '#ffffff');
    p.leftQuad(0.96, 1.2, dz, dz + 0.1, y1, '#1565c0');
    p.window('right', 0.4, 0.62, dz + 12, dz + 24, x1, '#fff3c4', '#ffffff');
    p.gableRoofY(x0, y0, x1, y1, h, 22, '#1e88e5', shade(wood, 0.1), 0.12);
    p.line([0.62, 0.42, h + 10], [0.62, 0.42, h + 26], '#5d4037', 3);
    cylinder(p, 0.62, 0.42, h + 14, h + 24, 0.05, '#8d6e63');
    lifeRing(p, [0.85, y1, dz + 20]);
    // Filet de pêche suspendu sur le côté.
    p.ctx.save();
    p.ctx.globalAlpha = 0.85;
    for (let i = 0; i <= 5; i++) {
      const y = 0.28 + i * 0.08;
      p.line([x1 + 0.01, y, dz + 30], [x1 + 0.01, y + 0.06, dz + 6], '#5d7c8a', 1);
      p.line([x1 + 0.01, y + 0.06, dz + 30], [x1 + 0.01, y, dz + 6], '#5d7c8a', 1);
    }
    p.ctx.restore();
    p.line([x1 + 0.01, 0.26, dz + 30], [x1 + 0.01, 0.74, dz + 30], '#8d6e63', 2);

    // Caisses de poissons, tonneau, cannes à pêche et bittes d'amarrage.
    fishCrate(p, 1.5, 0.3, dz);
    fishCrate(p, 1.52, 0.56, dz, '#ffa726');
    fishCrate(p, 1.5, 0.3, dz + 8);
    woodCrate(p, 0.12, 1.0, 0.2, dz);
    p.box(0.15, 1.35, 0.35, 1.55, dz, dz + 8, boxColors('#4fc3f7'));
    barrel(p, 0.5, 1.75, dz);
    for (const [x, y] of [
      [1.9, 1.15],
      [0.66, 1.9],
      [1.25, 1.15],
    ] as const)
      bollard(p, x, y, dz);
    p.line([1.86, 0.9, dz], [1.7, 1.4, dz + 40], '#6d4c41', 1.8);
    p.line([1.7, 1.4, dz + 40], [1.9, 1.75, 0], '#eceff1', 0.8);
    p.line([1.6, 0.95, dz], [1.38, 1.38, dz + 38], '#6d4c41', 1.8);

    // Barque amarrée et bouée.
    rowboat(p, 0.92, 1.42, 0.62, '#ef5350');
    p.line([1.25, 1.17, dz + 6], [1.05, 1.45, 8], '#d7ccc8', 1.2);
    buoy(p, 1.82, 1.88, 0);
    // Poteau d'éclairage et mouette.
    p.line([0.12, 0.12, dz], [0.12, 0.12, dz + 46], '#5d4037', 3);
    p.dot(0.12, 0.12, dz + 49, 4.5, '#fff59d', '#795548');
    seagull(p, [1.9, 1.15, dz + 9]);
  },
};

// ——— Port de pêche (criée) ———

const fishingPort: Hero = {
  height: 104,
  draw: (gp, p) => {
    lot(gp, 3, '#bdb8ae');
    for (let x = 0.3; x < 2.9; x += 0.3) gp.line([x, 1.6, 0], [x, 2.95, 0], '#aaa59a', 1);
    slip(gp, 1.7, 2.0, 2.98, 2.98);
    softShadow(gp, 0.3, 0.2, 2.3, 1.4);

    // Halle de la criée : murs blancs, grand toit bleu à lanterneau.
    const x0 = 0.3;
    const x1 = 2.3;
    const y0 = 0.2;
    const y1 = 1.4;
    const h = 46;
    const wall = '#f2f2f2';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall, false));
    p.leftQuad(x0, x1, 0, 6, y1, '#1565c0');
    p.rightQuad(y0, y1, 0, 6, x1, '#0d47a1');
    p.leftQuad(x0, x1, h - 4, h, y1, '#90caf9');
    p.door('right', 0.5, 0.26, 28, x1, '#0d47a1');
    p.window('right', 0.95, 1.2, 14, 28, x1, '#b3e5fc', '#ffffff');
    p.sign('right', 0.32, 1.28, 32, 43, x1 + 0.01, '#0d47a1', '#ffffff', signText('CRIÉE'));
    // Étals sous un auvent rayé bleu et blanc.
    p.door('left', 0.55, 0.36, 32, y1, '#0d47a1');
    for (const a of [0.85, 1.4, 1.95]) p.window('left', a - 0.18, a + 0.18, 14, 30, y1, '#b3e5fc', '#ffffff');
    p.gableRoofX(x0, y0, x1, y1, h, 28, '#1976d2', '#e3e3e3', 0.16);
    const ym = (y0 + y1) / 2;
    p.box(0.8, ym - 0.16, 1.9, ym + 0.16, h + 22, h + 32, boxColors('#ffffff'));
    for (let x = 0.88; x < 1.86; x += 0.12) p.leftQuad(x, x + 0.06, h + 24, h + 30, ym + 0.16, '#90a4ae');
    p.gableRoofX(0.8, ym - 0.16, 1.9, ym + 0.16, h + 32, 10, '#1976d2', '#e3e3e3', 0.08);
    p.awning('left', 0.65, 2.25, 34, y1, ['#1565c0', '#ffffff'], 0.34, 12);
    for (const a of [0.8, 1.35, 1.9]) {
      p.box(a - 0.18, y1 + 0.06, a + 0.18, y1 + 0.3, 0, 12, boxColors('#90a4ae'));
      fishCrate(p, a - 0.16, y1 + 0.08, 12, a > 1.5 ? '#ffa726' : '#29b6f6');
      fishCrate(p, a - 0.0, y1 + 0.08, 12);
    }
    // Petite grue de déchargement au bord de la darse.
    p.box(1.58, 1.82, 1.7, 1.94, 0, 6, boxColors('#9e9e9e'));
    p.line([1.64, 1.88, 6], [1.64, 1.88, 66], '#fbc02d', 4);
    p.line([1.64, 1.88, 62], [2.25, 2.3, 58], '#fbc02d', 3.5);
    p.line([1.64, 1.88, 66], [2.25, 2.3, 58], '#f57f17', 1.5);
    p.line([2.25, 2.3, 58], [2.25, 2.3, 28], '#424242', 1.2);
    p.box(2.17, 2.22, 2.33, 2.38, 18, 28, boxColors('#29b6f6'));

    // Chalutier dans la darse.
    hull(p, 1.85, 2.18, 2.45, 2.66, 16, '#1e88e5', '#eceff1');
    p.box(1.92, 2.27, 2.2, 2.55, 16, 36, boxColors('#ffffff'));
    p.window('left', 1.96, 2.16, 26, 33, 2.55, '#4fc3f7', '#ffffff');
    p.box(1.9, 2.25, 2.22, 2.57, 36, 39, boxColors('#e53935'));
    cylinder(p, 2.05, 2.36, 39, 48, 0.04, '#e53935');
    p.line([2.35, 2.42, 16], [2.35, 2.42, 70], '#795548', 2.5);
    p.line([2.35, 2.42, 68], [2.72, 2.42, 18], '#d7ccc8', 1);
    p.line([2.35, 2.42, 68], [1.9, 2.42, 40], '#d7ccc8', 1);
    p.line([2.35, 2.42, 50], [2.6, 2.6, 30], '#795548', 2);
    buoy(p, 2.8, 2.15, -5, '#ff9800');

    // Quai : caisses, tonneaux, bouée, bittes et mouette.
    fishCrate(p, 0.2, 1.75);
    fishCrate(p, 0.45, 1.75, 0, '#ffa726');
    fishCrate(p, 0.32, 1.75, 8);
    woodCrate(p, 0.25, 2.3, 0.22);
    barrel(p, 0.7, 2.5);
    barrel(p, 0.85, 2.62);
    for (const [x, y] of [
      [1.7, 2.3],
      [1.7, 2.75],
      [2.1, 1.95],
      [2.6, 1.95],
    ] as const)
      bollard(p, x, y);
    p.line([2.1, 1.95, 6], [2.1, 2.18, 12], '#d7ccc8', 1.2);
    p.line([1.7, 2.75, 6], [1.85, 2.6, 10], '#d7ccc8', 1.2);
    p.line([1.15, 2.55, 0], [1.15, 2.55, 30], '#e0e0e0', 2);
    lifeRing(p, [1.15, 2.55, 26], 6);
    seagull(p, [2.6, 1.95, 9]);
    roundBush(p, 2.75, 0.4, 8);
    roundBush(p, 2.7, 1.1, 7, '#5cbf32');
  },
};

// ——— Port industriel ———

const harbor: Hero = {
  height: 150,
  draw: (gp, p) => {
    lot(gp, 3, '#a8a8a8');
    slip(gp, 0.9, 2.3, 2.98, 2.98);
    gp.line([0.1, 2.2, 0], [0.85, 2.2, 0], '#fdd835', 2.5);
    gp.line([1.6, 0.15, 0], [1.6, 1.4, 0], '#fdd835', 2.5);
    softShadow(gp, 0.2, 0.2, 1.5, 1.3);

    // Hangar portuaire gris.
    const x0 = 0.2;
    const x1 = 1.5;
    const y0 = 0.2;
    const y1 = 1.3;
    const h = 50;
    const wall = '#607d8b';
    p.box(x0, y0, x1, y1, 0, h, boxColors(wall, false));
    ribsL(p, x0, x1, y1, 0, h, shade(wall, -0.12));
    ribsR(p, y0, y1, x1, 0, h, shade(wall, -0.32));
    p.leftQuad(x0, x1, 0, 5, y1, '#455a64');
    p.rightQuad(y0, y1, 0, 5, x1, '#37474f');
    rollDoor(p, 'left', 0.35, 0.95, 0, 30, y1, '#cfd8dc');
    p.door('left', 1.25, 0.2, 22, y1, '#fbc02d');
    rollDoor(p, 'right', 0.4, 0.95, 0, 30, x1, '#cfd8dc');
    p.sign('left', 0.32, 1.38, 34, 46, y1 + 0.01, '#263238', '#ffffff', signText('PORT'));
    p.gableRoofX(x0, y0, x1, y1, h, 20, '#37474f', shade(wall, -0.2), 0.12);

    // Piles de conteneurs colorés.
    const container = (x: number, y: number, z: number, axis: 'x' | 'y', color: string, len = 0.62) => {
      const [dx, dy] = axis === 'x' ? [len, 0.25] : [0.25, len];
      p.box(x, y, x + dx, y + dy, z, z + 16, boxColors(color));
      if (axis === 'x') {
        ribsL(p, x, x + dx, y + dy, z + 1, z + 15, shade(color, -0.2), 0.05);
        p.rightQuad(y + 0.03, y + dy - 0.03, z + 2, z + 14, x + dx, shade(color, -0.35));
        p.line([x + dx, y + dy / 2, z + 2], [x + dx, y + dy / 2, z + 14], shade(color, -0.5), 1);
      } else {
        ribsR(p, y, y + dy, x + dx, z + 1, z + 15, shade(color, -0.4), 0.05);
        p.leftQuad(x + 0.03, x + dx - 0.03, z + 2, z + 14, y + dy, shade(color, -0.15));
        p.line([x + dx / 2, y + dy, z + 2], [x + dx / 2, y + dy, z + 14], shade(color, -0.4), 1);
      }
    };
    container(1.75, 0.2, 0, 'y', '#1e88e5');
    container(2.05, 0.2, 0, 'y', '#e53935');
    container(2.35, 0.2, 0, 'y', '#43a047');
    container(2.65, 0.2, 0, 'y', '#fb8c00');
    container(1.75, 0.2, 16, 'y', '#fdd835');
    container(2.05, 0.2, 16, 'y', '#8e24aa');
    container(2.35, 0.2, 16, 'y', '#1e88e5');
    container(2.05, 0.2, 32, 'y', '#e53935');
    container(1.75, 0.95, 0, 'y', '#00897b');
    container(2.05, 0.95, 0, 'y', '#fb8c00');
    container(2.35, 0.95, 0, 'y', '#e53935');
    container(2.05, 0.95, 16, 'y', '#43a047');
    container(0.15, 1.5, 0, 'x', '#fb8c00');
    container(0.15, 1.8, 0, 'x', '#1e88e5');
    container(0.15, 1.5, 16, 'x', '#43a047');

    // Grue portuaire sur portique.
    const cx = 1.25;
    const cy = 1.75;
    const yellow = '#fbc02d';
    for (const [lx, ly] of [
      [cx - 0.2, cy - 0.2],
      [cx + 0.2, cy - 0.2],
      [cx - 0.2, cy + 0.2],
      [cx + 0.2, cy + 0.2],
    ] as const) {
      p.box(lx - 0.03, ly - 0.03, lx + 0.03, ly + 0.03, 0, 40, boxColors(yellow));
      p.box(lx - 0.05, ly - 0.05, lx + 0.05, ly + 0.05, 0, 3, boxColors('#424242'));
    }
    p.line([cx - 0.2, cy + 0.2, 4], [cx + 0.2, cy + 0.2, 36], '#f9a825', 2);
    p.line([cx + 0.2, cy - 0.2, 4], [cx + 0.2, cy + 0.2, 36], '#f9a825', 2);
    p.box(cx - 0.24, cy - 0.24, cx + 0.24, cy + 0.24, 40, 47, boxColors(yellow));
    p.box(cx - 0.08, cy - 0.08, cx + 0.08, cy + 0.08, 47, 106, boxColors(yellow));
    for (let z = 52; z < 104; z += 12) {
      p.line([cx - 0.08, cy + 0.08, z], [cx + 0.08, cy + 0.08, z + 12], '#f57f17', 1.4);
      p.line([cx + 0.08, cy + 0.08, z], [cx + 0.08, cy - 0.08, z + 12], '#e65100', 1.4);
    }
    // Contre-flèche et contrepoids.
    p.line([cx, cy, 116], [cx - 0.45, cy - 0.45, 116], '#f9a825', 4);
    p.box(cx - 0.55, cy - 0.55, cx - 0.35, cy - 0.35, 104, 116, boxColors('#78909c'));
    // Cabine.
    p.box(cx - 0.14, cy - 0.12, cx + 0.14, cy + 0.14, 106, 124, boxColors(yellow));
    p.window('left', cx - 0.1, cx + 0.1, 112, 121, cy + 0.14, '#4fc3f7', '#ffffff');
    p.window('right', cy - 0.08, cy + 0.08, 112, 121, cx + 0.14, '#4fc3f7', '#ffffff');
    // Flèche en treillis vers le navire.
    const tip: V3 = [2.62, 1.92, 138];
    const base: V3 = [cx + 0.1, cy + 0.12, 122];
    const baseLow: V3 = [cx + 0.1, cy + 0.12, 112];
    p.line(base, tip, '#f9a825', 5);
    p.line(baseLow, [tip[0], tip[1], tip[2] - 5], '#f9a825', 3);
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6;
      const t1 = (i + 1) / 6;
      const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      p.line(lerp(base, tip, t0), lerp(baseLow, [tip[0], tip[1], tip[2] - 5], t1), '#f57f17', 1.4);
    }
    p.line([cx, cy, 124], [cx, cy, 142], '#f9a825', 3);
    p.line([cx, cy, 142], tip, '#424242', 1);
    p.line([cx, cy, 142], [cx - 0.45, cy - 0.45, 116], '#424242', 1);
    p.dot(cx, cy, 143, 2.5, '#e53935');

    // Cargo dans la darse avec conteneurs en pontée.
    hull(p, 1.0, 2.4, 2.5, 2.88, 14, '#c62828', '#90a4ae');
    p.line([1.0, 2.88, 10], [2.5, 2.88, 10], '#212121', 3);
    p.box(1.05, 2.45, 1.35, 2.83, 14, 44, boxColors('#ffffff'));
    p.window('left', 1.09, 1.31, 34, 40, 2.83, '#4fc3f7', '#ffffff');
    p.window('right', 2.5, 2.78, 34, 40, 1.35, '#4fc3f7', '#ffffff');
    p.box(1.03, 2.43, 1.37, 2.85, 44, 47, boxColors('#e0e0e0'));
    cylinder(p, 1.15, 2.6, 47, 60, 0.05, '#ffb300');
    p.line([1.2, 2.64, 47], [1.2, 2.64, 66], '#eceff1', 1.5);
    const deck = ['#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#8e24aa'];
    for (let i = 0; i < 3; i++) container(1.42 + i * 0.36, 2.52, 14, 'x', deck[i] ?? '#ffffff', 0.34);
    container(1.6, 2.52, 30, 'x', deck[4] ?? '#ffffff', 0.34);
    // Conteneur suspendu au crochet.
    p.line(tip, [tip[0], tip[1], 116], '#263238', 2);
    p.line([tip[0], tip[1], 116], [tip[0] - 0.08, tip[1] - 0.18, 110], '#263238', 1.2);
    p.line([tip[0], tip[1], 116], [tip[0] + 0.08, tip[1] + 0.18, 110], '#263238', 1.2);
    p.box(tip[0] - 0.09, tip[1] - 0.2, tip[0] + 0.09, tip[1] + 0.2, 100, 110, boxColors('#00acc1'));
    ribsR(p, tip[1] - 0.2, tip[1] + 0.2, tip[0] + 0.09, 101, 109, '#00838f', 0.05);

    // Bittes d'amarrage, bouée et mouette.
    for (const x of [0.95, 1.7, 2.6]) bollard(p, x, 2.24);
    p.line([1.7, 2.24, 6], [1.8, 2.42, 12], '#d7ccc8', 1.2);
    buoy(p, 2.85, 2.4, -5);
    seagull(p, [0.95, 2.24, 9]);
  },
};

export const HEROES: Record<string, Hero> = {
  barn,
  silo,
  warehouse,
  big_warehouse: bigWarehouse,
  logistics,
  pier,
  fishing_port: fishingPort,
  harbor,
};
