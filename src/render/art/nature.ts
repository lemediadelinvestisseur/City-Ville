import { rgba, seeded, shade, toRgb } from './color';
import { isoCanvas, type ArtPiece } from './IsoPainter';
import { clamp01, ramp, type Rgb } from './noise';

/**
 * Végétation et rochers détaillés : feuillus, sapins, buissons, fougères,
 * fleurs sauvages, rochers, souches. La lumière vient du haut à gauche, comme
 * pour les bâtiments ; chaque pièce est posée au centre de sa case.
 */

/** Direction de la lumière à l'écran (x vers la droite, y vers le bas, z vers l'observateur). */
const LIGHT = (() => {
  const v = [-0.55, -0.62, 0.56];
  const n = Math.hypot(...v);
  return v.map((c) => c / n) as [number, number, number];
})();

type Ctx = CanvasRenderingContext2D;

function css([r, g, b]: Readonly<Rgb>): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Ombre portée douce au sol, décalée vers le bas à droite. */
function groundShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  g.addColorStop(0, `rgba(18,34,12,${alpha})`);
  g.addColorStop(0.6, `rgba(18,34,12,${alpha * 0.6})`);
  g.addColorStop(1, 'rgba(18,34,12,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Touffe de feuilles : union de petits disques au contour irrégulier. */
function blob(ctx: Ctx, x: number, y: number, r: number, rand: () => number, lumps = 6): void {
  ctx.beginPath();
  ctx.moveTo(x + r * 0.68, y);
  ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
  for (let k = 0; k < lumps; k++) {
    const a = (k / lumps) * Math.PI * 2 + rand() * 0.9;
    const d = r * (0.42 + rand() * 0.22);
    const rr = r * (0.3 + rand() * 0.2);
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d * 0.85;
    ctx.moveTo(bx + rr, by);
    ctx.arc(bx, by, rr, 0, Math.PI * 2);
  }
  ctx.fill();
}

interface CanopyOptions {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  clusters: number;
  radius: readonly [number, number];
  palette: readonly Rgb[];
  /** Fleurs ou baies semées sur le dessus. */
  dots?: { colors: readonly string[]; count: number };
}

/**
 * Feuillage peint : une masse sombre, puis des touffes éclairées selon leur
 * orientation (les plus proches de l'observateur en dernier), puis le grain
 * des feuilles.
 */
function canopy(ctx: Ctx, rand: () => number, o: CanopyOptions): void {
  const { cx, cy, rx, ry, palette } = o;
  const color: Rgb = [0, 0, 0];
  // Masse du feuillage, dans l'ombre : bouche les trous entre les touffes.
  ctx.fillStyle = css(ramp(palette, 0.22, color));
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.6;
    blob(ctx, cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry, o.radius[1] * 1.3, rand);
  }
  const points = Array.from({ length: o.clusters }, () => {
    const a = rand() * Math.PI * 2;
    const rho = Math.sqrt(rand()) * 0.94;
    return { X: Math.cos(a) * rho, Y: Math.sin(a) * rho, Z: Math.sqrt(Math.max(0, 1 - rho * rho)) };
  }).sort((a, b) => a.Z - b.Z);
  for (const { X, Y, Z } of points) {
    const lit = X * LIGHT[0] + Y * LIGHT[1] + Z * LIGHT[2];
    let s = clamp01(0.42 + lit * 0.62) * (1 - Math.max(0, Y) * 0.22);
    s = clamp01(s + (rand() - 0.5) * 0.12);
    const r = o.radius[0] + rand() * (o.radius[1] - o.radius[0]);
    const x = cx + X * rx;
    const y = cy + Y * ry;
    ctx.fillStyle = css(ramp(palette, s, color));
    blob(ctx, x, y, r, rand);
    // Grain des feuilles : reflets côté lumière, creux côté ombre.
    ctx.fillStyle = css(ramp(palette, Math.min(1, s + 0.22), color));
    for (let m = 0; m < 7; m++) {
      const a = Math.PI * 1.25 + (rand() - 0.5) * 2.2;
      const d = r * (0.15 + rand() * 0.6);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, 1.1 + rand() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = css(ramp(palette, Math.max(0, s - 0.25), color));
    for (let m = 0; m < 4; m++) {
      const a = Math.PI * 0.25 + (rand() - 0.5) * 2;
      const d = r * (0.3 + rand() * 0.45);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, 1 + rand() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Éclats de lumière sur le haut du feuillage.
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 1.25 + (rand() - 0.5) * 1.6;
    const d = Math.sqrt(rand()) * 0.8;
    ctx.fillStyle = css(ramp(palette, 0.92 + rand() * 0.08, color));
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry, 0.9 + rand() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.dots) {
    for (let k = 0; k < o.dots.count; k++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.85;
      const x = cx + Math.cos(a) * d * rx;
      const y = cy + Math.sin(a) * d * ry - (1 - d) * 2;
      ctx.fillStyle = o.dots.colors[k % o.dots.colors.length] ?? '#fff';
      ctx.beginPath();
      ctx.arc(x, y, 1.3 + rand() * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 0.8, y - 0.9, 1, 1);
    }
  }
}

/** Tronc légèrement courbé, écorce éclairée à gauche, racines à la base. */
function trunk(ctx: Ctx, x: number, y: number, h: number, w: number, lean: number, bark: string, rand: () => number) {
  const g = ctx.createLinearGradient(x - w, 0, x + w + lean, 0);
  g.addColorStop(0, shade(bark, 0.25));
  g.addColorStop(0.45, bark);
  g.addColorStop(1, shade(bark, -0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w * 1.7, y + 1);
  ctx.quadraticCurveTo(x - w, y - 2, x - w * 0.9, y - 6);
  ctx.quadraticCurveTo(x - w * 0.7 + lean * 0.4, y - h * 0.55, x - w * 0.45 + lean, y - h);
  ctx.lineTo(x + w * 0.45 + lean, y - h);
  ctx.quadraticCurveTo(x + w * 0.7 + lean * 0.4, y - h * 0.55, x + w * 0.9, y - 6);
  ctx.quadraticCurveTo(x + w, y - 2, x + w * 1.8, y + 1.5);
  ctx.quadraticCurveTo(x, y + 3, x - w * 1.7, y + 1);
  ctx.fill();
  ctx.strokeStyle = rgba(shade(bark, -0.6), 0.45);
  ctx.lineWidth = 0.9;
  for (let k = 0; k < 5; k++) {
    const t = (k + 0.5) / 5;
    const bx = x - w * 0.6 + w * 1.2 * t;
    ctx.beginPath();
    ctx.moveTo(bx, y - 2);
    ctx.quadraticCurveTo(
      bx + (rand() - 0.5) * 2 + lean * 0.3,
      y - h * 0.5,
      bx * 0.5 + (x + lean) * 0.5,
      y - h * (0.6 + rand() * 0.3),
    );
    ctx.stroke();
  }
}

/** Branches qui partent du haut du tronc vers le feuillage. */
function branches(ctx: Ctx, x: number, y: number, spread: number, rise: number, bark: string, rand: () => number) {
  ctx.strokeStyle = shade(bark, -0.25);
  ctx.lineCap = 'round';
  for (const dir of [-1, -0.3, 0.45, 1]) {
    const ex = x + dir * spread * (0.7 + rand() * 0.3);
    const ey = y - rise * (0.6 + rand() * 0.4);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.quadraticCurveTo(x + dir * spread * 0.2, y - rise * 0.4, ex, ey);
    ctx.stroke();
  }
}

const pal = (...hex: string[]): Rgb[] => hex.map(toRgb);

const LEAF_OAK = pal('#18321a', '#28502a', '#3f7531', '#62993c', '#93c45b');
const LEAF_BEECH = pal('#1b3517', '#2f5a22', '#4b8530', '#74ac40', '#a6d062');
const LEAF_MAPLE = pal('#20351a', '#365a26', '#557f32', '#7ea245', '#b3c86a');

const BROADLEAF = [
  { trunk: 36, w: 5.4, rx: 45, ry: 36, clusters: 58, radius: [9, 14] as const, leaves: LEAF_OAK, bark: '#6b5440' },
  { trunk: 42, w: 4.6, rx: 35, ry: 45, clusters: 52, radius: [8, 13] as const, leaves: LEAF_BEECH, bark: '#7d7466' },
  { trunk: 32, w: 5, rx: 40, ry: 33, clusters: 50, radius: [8, 12] as const, leaves: LEAF_MAPLE, bark: '#5f4a38' },
];
export const BROADLEAF_VARIANTS = BROADLEAF.length;

/** Feuillu (chêne, hêtre, érable selon la variante). */
export function broadleafTree(variant: number): ArtPiece {
  const shape = BROADLEAF[variant % BROADLEAF.length]!;
  const rand = seeded(5000 + variant * 97);
  const { painter, finish } = isoCanvas(1, 1, 145, 18);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  groundShadow(ctx, bx + 16, by + 5, shape.rx * 1.15, shape.rx * 0.48, 0.4);
  const lean = (rand() - 0.5) * 6;
  trunk(ctx, bx, by, shape.trunk + 8, shape.w, lean, shape.bark, rand);
  const cx = bx + lean;
  const cy = by - shape.trunk - shape.ry * 0.62;
  branches(ctx, cx, by - shape.trunk, shape.rx * 0.6, shape.ry * 0.7, shape.bark, rand);
  canopy(ctx, rand, {
    cx,
    cy,
    rx: shape.rx,
    ry: shape.ry,
    clusters: shape.clusters,
    radius: shape.radius,
    palette: shape.leaves,
  });
  return finish();
}

const NEEDLES_SPRUCE = pal('#0b2216', '#163c28', '#245638', '#3a7349', '#6a9c62');
const NEEDLES_FIR = pal('#0d2618', '#1a452c', '#2a613c', '#427d4b', '#78a964');
const NEEDLES_PINE = pal('#0e2519', '#1c4330', '#2d5d40', '#467a52', '#7fa96c');

const CONIFER = [
  { height: 150, radius: 31, tiers: 11, needles: NEEDLES_SPRUCE },
  { height: 128, radius: 35, tiers: 9, needles: NEEDLES_FIR },
  { height: 165, radius: 28, tiers: 12, needles: NEEDLES_PINE },
];
export const CONIFER_VARIANTS = CONIFER.length;

/** Sapin ou épicéa : étages de branches tombantes, aiguilles éclairées à gauche. */
export function coniferTree(variant: number): ArtPiece {
  const shape = CONIFER[variant % CONIFER.length]!;
  const rand = seeded(7000 + variant * 53);
  const { painter, finish } = isoCanvas(1, 1, 180, 14);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  const n = shape.needles;
  groundShadow(ctx, bx + 18, by + 5, shape.radius * 1.5, shape.radius * 0.55, 0.4);
  // Tronc visible sous les branches basses.
  const tg = ctx.createLinearGradient(bx - 3, 0, bx + 3, 0);
  tg.addColorStop(0, '#7a5a3e');
  tg.addColorStop(1, '#3b2a1c');
  ctx.fillStyle = tg;
  ctx.fillRect(bx - 2.6, by - 18, 5.2, 19);
  const color: Rgb = [0, 0, 0];
  const sway = (rand() - 0.5) * 3;
  for (let k = 0; k < shape.tiers; k++) {
    const t = k / (shape.tiers - 1);
    const yb = by - 9 - t * (shape.height - 24);
    const r = shape.radius * (1 - t * 0.86) * (0.9 + rand() * 0.2) + 2.5;
    const h = (shape.height / shape.tiers) * 2.05 * (1 - t * 0.25);
    const ax = bx + sway * t;
    const ay = yb - h;
    // Ombre de cet étage sur l'étage du dessous.
    if (k > 0) {
      ctx.fillStyle = 'rgba(6,22,12,0.45)';
      ctx.beginPath();
      ctx.ellipse(bx + 2, yb + 3.5, r * 0.95, r * 0.24 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createLinearGradient(bx - r, 0, bx + r, 0);
    g.addColorStop(0, css(ramp(n, 0.68, color)));
    g.addColorStop(0.5, css(ramp(n, 0.45, color)));
    g.addColorStop(1, css(ramp(n, 0.16, color)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(bx + r * 0.42, ay + h * 0.5, bx + r, yb - 1);
    const tips = Math.max(5, Math.round(r / 2.6));
    for (let m = 0; m <= tips * 2; m++) {
      const s = 1 - m / tips;
      const px = bx + s * r;
      const sag = (1 - s * s) * r * 0.24;
      ctx.lineTo(px, yb + sag + (m % 2 === 0 ? 2.5 + rand() * 1.5 : -1.5));
    }
    ctx.quadraticCurveTo(bx - r * 0.42, ay + h * 0.5, ax, ay);
    ctx.fill();
    // Aiguilles : traits tombants, clairs côté lumière, sombres côté ombre.
    const strokes = Math.round(10 + r * 0.9);
    ctx.lineWidth = 1;
    for (let m = 0; m < strokes; m++) {
      const s = rand() * 2 - 1;
      const depth = 0.25 + rand() * 0.75;
      const sx = ax + (bx + s * r * depth - ax) * depth;
      const sy = ay + (yb + (1 - s * s) * r * 0.2 - ay) * depth;
      const lit = clamp01(0.55 - s * 0.45 + (rand() - 0.5) * 0.25);
      ctx.strokeStyle = css(ramp(n, lit > 0.6 ? Math.min(1, lit + 0.25) : lit * 0.5, color));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + s * 3.5, sy + 4 + rand() * 2);
      ctx.stroke();
    }
  }
  // Pointe.
  ctx.strokeStyle = css(ramp(n, 0.5, color));
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const topY = by - 9 - (shape.height - 24) - (shape.height / shape.tiers) * 2.05 * 0.75;
  ctx.moveTo(bx + sway, topY + 4);
  ctx.lineTo(bx + sway, topY - 5);
  ctx.stroke();
  return finish();
}

// ——————————————————————————————— Sous-bois et rochers ———————————————————————————————

const BUSH_LEAVES = [
  pal('#1a3317', '#2b5224', '#447a31', '#679f42', '#97c660'),
  pal('#1d3418', '#305626', '#4b7d33', '#71a144', '#a2c765'),
  pal('#15301b', '#25502e', '#3b733d', '#5c9750', '#8bbd6c'),
];

function bush(variant: number): ArtPiece {
  const rand = seeded(9100 + variant * 31);
  const { painter, finish } = isoCanvas(1, 1, 40, 4);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  const rx = 19 + rand() * 5;
  groundShadow(ctx, bx + 7, by + 3, rx * 1.15, rx * 0.45, 0.4);
  const dots =
    variant === 1
      ? { colors: ['#fbf6ee', '#f6e9f0'], count: 16 }
      : variant === 2
        ? { colors: ['#c62828', '#e53935'], count: 12 }
        : undefined;
  canopy(ctx, rand, {
    cx: bx,
    cy: by - 11,
    rx,
    ry: 12 + rand() * 3,
    clusters: 16,
    radius: [5, 8],
    palette: BUSH_LEAVES[variant % BUSH_LEAVES.length]!,
    ...(dots ? { dots } : {}),
  });
  return finish();
}

function fern(variant: number): ArtPiece {
  const rand = seeded(9300 + variant * 17);
  const { painter, finish } = isoCanvas(1, 1, 30, 4);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  groundShadow(ctx, bx + 4, by + 2, 18, 7, 0.35);
  const fronds = 9 + Math.floor(rand() * 3);
  const list = Array.from({ length: fronds }, (_, k) => {
    const a = Math.PI + (k / (fronds - 1)) * Math.PI + (rand() - 0.5) * 0.3;
    return { a, len: 15 + rand() * 7, front: Math.sin(a) };
  }).sort((p, q) => p.front - q.front);
  for (const { a, len } of list) {
    const ex = bx + Math.cos(a) * len * 1.15;
    const ey = by - 4 + Math.sin(a) * len * 0.4 - len * 0.1;
    const mx = bx + Math.cos(a) * len * 0.5;
    const my = by - 8 - len * 0.85;
    const lit = clamp01(0.5 - Math.cos(a) * 0.4);
    const base = variant === 1 ? '#5b8f3a' : '#4f8a3a';
    const leaf = lit > 0.5 ? shade(base, 0.25 * lit) : shade(base, -0.3 * (1 - lit));
    ctx.strokeStyle = shade(leaf, -0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by - 2);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    // Folioles le long de la tige.
    ctx.strokeStyle = leaf;
    ctx.lineWidth = 1.6;
    for (let s = 0.15; s < 0.95; s += 0.1) {
      const qx = (1 - s) * (1 - s) * bx + 2 * (1 - s) * s * mx + s * s * ex;
      const qy = (1 - s) * (1 - s) * (by - 2) + 2 * (1 - s) * s * my + s * s * ey;
      const tx = 2 * (1 - s) * (mx - bx) + 2 * s * (ex - mx);
      const ty = 2 * (1 - s) * (my - by) + 2 * s * (ey - my);
      const tl = Math.hypot(tx, ty) || 1;
      const l = (1 - s) * 4.5 + 1;
      ctx.beginPath();
      ctx.moveTo(qx - (ty / tl) * l, qy + (tx / tl) * l * 0.6 + 1);
      ctx.lineTo(qx, qy);
      ctx.lineTo(qx + (ty / tl) * l, qy - (tx / tl) * l * 0.6 + 1);
      ctx.stroke();
    }
  }
  return finish();
}

const FLOWER_SETS = [
  { petals: ['#f7d33b', '#f2c21a'], center: '#c98a12' },
  { petals: ['#fbfaf4', '#f1efe6'], center: '#e8b923' },
  { petals: ['#9d7fd6', '#b49ae3'], center: '#6b4fa8' },
  { petals: ['#e2412f', '#c9302c'], center: '#2a1a14' },
];

function wildflowers(variant: number): ArtPiece {
  const rand = seeded(9500 + variant * 23);
  const set = FLOWER_SETS[variant % FLOWER_SETS.length]!;
  const { painter, finish } = isoCanvas(1, 1, 26, 4);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  groundShadow(ctx, bx + 3, by + 1, 16, 6, 0.25);
  const stems = Array.from({ length: 12 }, () => ({
    x: bx + (rand() - 0.5) * 30,
    y: by + (rand() - 0.5) * 12,
    h: 6 + rand() * 9,
  })).sort((a, b) => a.y - b.y);
  for (const s of stems) {
    ctx.strokeStyle = rand() < 0.5 ? '#4f7f30' : '#6a9a3e';
    ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + k * 2.5, s.y - s.h * 0.55);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + (rand() - 0.5) * 2, s.y - s.h);
    ctx.stroke();
    const fx = s.x;
    const fy = s.y - s.h;
    ctx.fillStyle = set.petals[rand() < 0.5 ? 0 : 1]!;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * 1.6, fy + Math.sin(a) * 1, 1.5, 1, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = set.center;
    ctx.beginPath();
    ctx.arc(fx, fy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish();
}

function tallGrass(variant: number): ArtPiece {
  const rand = seeded(9700 + variant * 13);
  const { painter, finish } = isoCanvas(1, 1, 26, 4);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  groundShadow(ctx, bx + 3, by + 1, 17, 6, 0.3);
  const tones = variant === 1 ? ['#9a9a4e', '#b8b260', '#7d8340'] : ['#5f8f35', '#7fae46', '#4a7529'];
  for (let k = 0; k < 34; k++) {
    const x = bx + (rand() - 0.5) * 28;
    const y = by + (rand() - 0.5) * 8;
    const h = 9 + rand() * 11;
    ctx.strokeStyle = tones[k % tones.length]!;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 4, y - h * 0.6, x + (rand() - 0.3) * 7, y - h);
    ctx.stroke();
    if (variant === 1 && k % 4 === 0) {
      ctx.fillStyle = '#d6c98a';
      ctx.beginPath();
      ctx.ellipse(x + 2, y - h, 1.2, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish();
}

const ROCK_TONES = ['#8f897f', '#9a8f80', '#857f78'];

/** Rocher (ou galet) irrégulier, facette du dessus éclairée, mousse éventuelle. */
function boulder(variant: number, size = 1): ArtPiece {
  const rand = seeded(9900 + variant * 41);
  const { painter, finish } = isoCanvas(1, 1, 40 * size, 6);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  const w = (13 + rand() * 6) * size;
  const h = (11 + rand() * 7) * size;
  const tone = ROCK_TONES[variant % ROCK_TONES.length]!;
  groundShadow(ctx, bx + w * 0.45, by + 2, w * 1.3, w * 0.45, 0.45);
  const pts: Array<[number, number]> = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = Math.PI + (k / (n - 1)) * Math.PI;
    const rr = 0.8 + rand() * 0.3;
    pts.push([bx + Math.cos(a) * w * rr, by - 2 + Math.sin(a) * h * rr - (k > 2 && k < 6 ? h * 0.15 : 0)]);
  }
  const body = ctx.createLinearGradient(bx - w, by - h, bx + w, by);
  body.addColorStop(0, shade(tone, 0.25));
  body.addColorStop(0.5, tone);
  body.addColorStop(1, shade(tone, -0.45));
  ctx.fillStyle = body;
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.quadraticCurveTo(bx + w * 0.4, by + 4 * size, bx, by + 3 * size);
  ctx.quadraticCurveTo(bx - w * 0.5, by + 3 * size, pts[0]![0], pts[0]![1]);
  ctx.fill();
  // Facette supérieure éclairée.
  ctx.fillStyle = rgba(shade(tone, 0.35), 0.75);
  ctx.beginPath();
  const top = pts.slice(2, 7);
  top.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y + 1) : ctx.lineTo(x, y + 1)));
  ctx.quadraticCurveTo(bx + w * 0.1, by - h * 0.35, top[0]![0], top[0]![1] + 1);
  ctx.fill();
  // Fissures.
  ctx.strokeStyle = rgba(shade(tone, -0.6), 0.6);
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 2; k++) {
    const sx = bx + (rand() - 0.3) * w * 0.8;
    const sy = by - h * (0.2 + rand() * 0.4);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (rand() - 0.5) * 6 * size, sy + 4 * size);
    ctx.lineTo(sx + (rand() - 0.5) * 6 * size, sy + 8 * size);
    ctx.stroke();
  }
  // Mousse sur le dessus.
  if (variant !== 2) {
    for (let k = 0; k < 14 * size; k++) {
      const x = bx - w * 0.5 + rand() * w * 0.9;
      const y = by - h * (0.75 + rand() * 0.25);
      ctx.fillStyle = rand() < 0.5 ? 'rgba(92,128,54,0.85)' : 'rgba(126,160,72,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 1 + rand() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish();
}

function fallenLog(): ArtPiece {
  const rand = seeded(9950);
  const { painter, finish } = isoCanvas(1, 1, 24, 4);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  groundShadow(ctx, bx + 4, by + 3, 30, 8, 0.4);
  // Tronc couché le long de l'axe x (vers le bas à droite).
  const ax = bx - 24;
  const ay = by - 10;
  const ex = bx + 20;
  const ey = by + 12;
  const r = 5.5;
  const g = ctx.createLinearGradient(0, ay - r, 0, ay + r);
  g.addColorStop(0, '#8a6a4c');
  g.addColorStop(1, '#3f2e20');
  ctx.strokeStyle = g;
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(ax, ay - r);
  ctx.lineTo(ex, ey - r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,28,18,0.5)';
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 4; k++) {
    const o = (k - 1.5) * 2.2;
    ctx.beginPath();
    ctx.moveTo(ax + 3, ay - r + o);
    ctx.lineTo(ex - 2, ey - r + o);
    ctx.stroke();
  }
  // Section avec cernes.
  ctx.fillStyle = '#c9a77a';
  ctx.beginPath();
  ctx.ellipse(ex, ey - r, 3.2, r, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,84,50,0.7)';
  ctx.beginPath();
  ctx.ellipse(ex, ey - r, 1.6, r * 0.5, -0.45, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(96,134,58,0.9)' : 'rgba(130,166,74,0.9)';
    const t = rand();
    ctx.beginPath();
    ctx.arc(ax + (ex - ax) * t, ay + (ey - ay) * t - r * 2 + 1, 1 + rand() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish();
}

function mushrooms(): ArtPiece {
  const rand = seeded(9970);
  const { painter, finish } = isoCanvas(1, 1, 14, 4);
  const { ctx } = painter;
  const [bx, by] = painter.p(0.5, 0.5, 0);
  for (let k = 0; k < 5; k++) {
    const x = bx + (rand() - 0.5) * 16;
    const y = by + (rand() - 0.5) * 6;
    const s = 0.7 + rand() * 0.6;
    ctx.fillStyle = '#efe6d4';
    ctx.fillRect(x - 1 * s, y - 5 * s, 2 * s, 5 * s);
    ctx.fillStyle = k % 2 ? '#c6382e' : '#b5452a';
    ctx.beginPath();
    ctx.ellipse(x, y - 5 * s, 3.4 * s, 2.4 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1.5 * s, y - 6.5 * s, 1, 1);
    ctx.fillRect(x + 1 * s, y - 6 * s, 1, 1);
  }
  return finish();
}

export type PlantKind = 'bush' | 'fern' | 'flowers' | 'grass' | 'boulder' | 'stone' | 'log' | 'mushrooms';

export const PLANT_VARIANTS: Record<PlantKind, number> = {
  bush: 3,
  fern: 2,
  flowers: 4,
  grass: 2,
  boulder: 3,
  stone: 3,
  log: 1,
  mushrooms: 1,
};

export function plantArt(kind: PlantKind, variant: number): ArtPiece {
  switch (kind) {
    case 'bush':
      return bush(variant);
    case 'fern':
      return fern(variant);
    case 'flowers':
      return wildflowers(variant);
    case 'grass':
      return tallGrass(variant);
    case 'boulder':
      return boulder(variant, 1.5);
    case 'stone':
      return boulder(variant, 0.75);
    case 'log':
      return fallenLog();
    case 'mushrooms':
      return mushrooms();
  }
}
