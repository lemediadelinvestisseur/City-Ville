import { shade } from './color';
import { createCanvas, type ArtPiece } from './IsoPainter';

type Ctx = CanvasRenderingContext2D;

export function drawCoin(ctx: Ctx, cx: number, cy: number, r: number): void {
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.55, '#ffcf3f');
  g.addColorStop(1, '#e09a12');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#a86a00';
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(168,106,0,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  // Étoile en relief.
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r * 0.45 : r * 0.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawCrate(ctx: Ctx, cx: number, cy: number, s: number): void {
  const x = cx - s / 2;
  const y = cy - s / 2;
  ctx.fillStyle = '#c8873f';
  ctx.strokeStyle = '#6d4220';
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#8a5527';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y + s * 0.12);
  ctx.lineTo(x + s * 0.88, y + s * 0.88);
  ctx.moveTo(x + s * 0.88, y + s * 0.12);
  ctx.lineTo(x + s * 0.12, y + s * 0.88);
  ctx.stroke();
  ctx.strokeStyle = '#e8b06a';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
}

function drawHammer(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#a5683a';
  ctx.strokeStyle = '#5d3a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-s * 0.08, -s * 0.15, s * 0.16, s * 0.62, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#90a4ae';
  ctx.strokeStyle = '#37474f';
  ctx.beginPath();
  ctx.roundRect(-s * 0.32, -s * 0.38, s * 0.64, s * 0.24, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBasket(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.fillStyle = '#e53935';
  for (const [dx, dy] of [
    [-0.18, -0.12],
    [0.05, -0.2],
    [0.2, -0.08],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * s, cy + dy * s, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.02, cy - s * 0.3, s * 0.12, s * 0.05, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8873f';
  ctx.strokeStyle = '#6d4220';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.36, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.36, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.26, cy + s * 0.32);
  ctx.lineTo(cx - s * 0.26, cy + s * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#8a5527';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.31, cy + s * 0.13);
  ctx.lineTo(cx + s * 0.31, cy + s * 0.13);
  ctx.stroke();
}

/** Poisson stylisé (pêche à décharger). */
export function drawFish(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  const h = w * 0.45;
  const grad = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  grad.addColorStop(0, '#4fc3f7');
  grad.addColorStop(1, '#0277bd');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#01579b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.32, cy);
  ctx.lineTo(cx + w * 0.52, cy - h * 0.55);
  ctx.lineTo(cx + w * 0.52, cy + h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.06, cy, w * 0.4, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - w * 0.28, cy - h * 0.12, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0d2b45';
  ctx.beginPath();
  ctx.arc(cx - w * 0.28, cy - h * 0.12, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

export type BadgeKind =
  'coin' | 'goods' | 'build' | 'harvest' | 'plant' | 'fish' | 'road' | 'train' | 'meal' | 'visitor';

export const BADGE_KINDS: readonly BadgeKind[] = [
  'coin',
  'goods',
  'build',
  'harvest',
  'plant',
  'fish',
  'road',
  'train',
];

/** Panneau « route manquante » : triangle et tronçon de route. */
function drawRoadSign(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = '#ffca28';
  ctx.strokeStyle = '#c62828';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 17);
  ctx.lineTo(cx + 17, cy + 12);
  ctx.lineTo(cx - 17, cy + 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#424242';
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 7);
  ctx.lineTo(cx + 3, cy - 7);
  ctx.lineTo(cx + 7, cy + 9);
  ctx.lineTo(cx - 7, cy + 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy - 1);
  ctx.moveTo(cx, cy + 2);
  ctx.lineTo(cx, cy + 7);
  ctx.stroke();
}

/** Face avant d'une locomotive. */
function drawTrainFront(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = '#e53935';
  ctx.strokeStyle = '#8e1b1b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 11, cy - 13, 22, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#bbdefb';
  ctx.fillRect(cx - 7, cy - 9, 14, 7);
  ctx.fillStyle = '#fff59d';
  ctx.beginPath();
  ctx.arc(cx - 6, cy + 4, 2, 0, Math.PI * 2);
  ctx.arc(cx + 6, cy + 4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#455a64';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 9);
  ctx.lineTo(cx - 10, cy + 14);
  ctx.moveTo(cx + 7, cy + 9);
  ctx.lineTo(cx + 10, cy + 14);
  ctx.stroke();
}

/** Bulle d'état affichée au-dessus d'une construction. */
export function badge(kind: BadgeKind): ArtPiece {
  const size = 64;
  const { canvas, ctx } = createCanvas(size, size + 12);
  const cx = size / 2;
  const cy = size / 2;
  const border = {
    coin: '#f5a623',
    goods: '#ef6c00',
    build: '#1e88e5',
    harvest: '#43a047',
    plant: '#8d6e63',
    fish: '#0288d1',
    road: '#e53935',
    train: '#c62828',
    meal: '#8e24aa',
    visitor: '#00897b',
  }[kind];
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, size + 7, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 4, 0.62 * Math.PI, 0.38 * Math.PI);
  ctx.lineTo(cx, size + 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (kind === 'coin') drawCoin(ctx, cx, cy, 15);
  else if (kind === 'goods') drawCrate(ctx, cx, cy, 26);
  else if (kind === 'build') drawHammer(ctx, cx, cy + 2, 30);
  else if (kind === 'harvest') drawBasket(ctx, cx, cy + 2, 34);
  else if (kind === 'fish') drawFish(ctx, cx, cy + 1, 34);
  else if (kind === 'road') drawRoadSign(ctx, cx, cy);
  else if (kind === 'meal') {
    // Assiette, fourchette et couteau.
    ctx.fillStyle = '#eceff1';
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#607d8b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 19, cy - 12);
    ctx.lineTo(cx - 19, cy + 13);
    ctx.moveTo(cx + 19, cy - 12);
    ctx.lineTo(cx + 19, cy + 13);
    ctx.stroke();
  } else if (kind === 'visitor') {
    ctx.fillStyle = '#00897b';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + 2);
  } else if (kind === 'train') {
    drawCoin(ctx, cx + 6, cy + 5, 10);
    drawTrainFront(ctx, cx - 4, cy - 1);
  } else {
    // Pousse à planter.
    ctx.fillStyle = '#8b6240';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 9, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#43a047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy - 6);
    ctx.stroke();
    ctx.fillStyle = '#66bb6a';
    ctx.beginPath();
    ctx.ellipse(cx - 7, cy - 6, 7, 4, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + 7, cy - 9, 7, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, originX: 0.5, originY: 1 };
}

export function coinParticle(): ArtPiece {
  const { canvas, ctx } = createCanvas(28, 28);
  drawCoin(ctx, 14, 14, 12);
  return { canvas, originX: 0.5, originY: 0.5 };
}

export function crateParticle(): ArtPiece {
  const { canvas, ctx } = createCanvas(28, 28);
  drawCrate(ctx, 14, 14, 22);
  return { canvas, originX: 0.5, originY: 0.5 };
}

export function starParticle(color = '#ffe066'): ArtPiece {
  const { canvas, ctx } = createCanvas(30, 30);
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 13 : 5.5;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(15 + Math.cos(a) * r, 15 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return { canvas, originX: 0.5, originY: 0.5 };
}

export function puffParticle(): ArtPiece {
  const { canvas, ctx } = createCanvas(48, 48);
  const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 23);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(240,235,225,0.7)');
  g.addColorStop(1, 'rgba(240,235,225,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(24, 24, 23, 0, Math.PI * 2);
  ctx.fill();
  return { canvas, originX: 0.5, originY: 0.5 };
}

const SHIRTS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#f06292'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIR = ['#3e2723', '#212121', '#795548', '#fbc02d', '#d84315'];

/** Petit habitant qui se promène sur les routes. */
export function walker(variant: number): ArtPiece {
  const { canvas, ctx } = createCanvas(22, 44);
  const shirt = SHIRTS[variant % SHIRTS.length] ?? '#e53935';
  const skin = SKINS[variant % SKINS.length] ?? '#f1c27d';
  const hair = HAIR[(variant * 3) % HAIR.length] ?? '#3e2723';
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(11, 41, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8.5, 29);
  ctx.lineTo(8, 40);
  ctx.moveTo(13.5, 29);
  ctx.lineTo(14, 40);
  ctx.stroke();
  ctx.fillStyle = shirt;
  ctx.strokeStyle = shade(shirt, -0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(5, 15, 12, 16, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(11, 10, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(11, 8.5, 5.6, Math.PI, Math.PI * 2);
  ctx.fill();
  return { canvas, originX: 0.5, originY: 41 / 44 };
}

export function cloud(variant: number): ArtPiece {
  const { canvas, ctx } = createCanvas(300, 140);
  const blobs =
    variant % 2 === 0
      ? [
          [80, 85, 48],
          [140, 65, 60],
          [205, 85, 46],
          [120, 95, 44],
          [175, 98, 40],
        ]
      : [
          [70, 90, 40],
          [125, 75, 52],
          [190, 70, 56],
          [240, 92, 38],
          [160, 100, 42],
        ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x ?? 0, (y ?? 0) - 10, 4, x ?? 0, y ?? 0, r ?? 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x ?? 0, y ?? 0, r ?? 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, originX: 0.5, originY: 0.5 };
}

/** Flèche de guidage (tutoriel). */
export function hintArrow(): ArtPiece {
  const { canvas, ctx } = createCanvas(56, 64);
  ctx.fillStyle = '#ffd54f';
  ctx.strokeStyle = '#e65100';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(18, 4);
  ctx.lineTo(38, 4);
  ctx.lineTo(38, 30);
  ctx.lineTo(52, 30);
  ctx.lineTo(28, 60);
  ctx.lineTo(4, 30);
  ctx.lineTo(18, 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(21, 7, 5, 22);
  return { canvas, originX: 0.5, originY: 1 };
}

/** Ouvrier de chantier (casque jaune, gilet orange). */
export function worker(): ArtPiece {
  const { canvas, ctx } = createCanvas(24, 46);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(12, 43, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(9.5, 31);
  ctx.lineTo(9, 42);
  ctx.moveTo(14.5, 31);
  ctx.lineTo(15, 42);
  ctx.stroke();
  ctx.fillStyle = '#ff8f00';
  ctx.strokeStyle = '#b35c00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(6, 17, 12, 16, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff59d';
  ctx.fillRect(6, 25, 12, 2);
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(12, 12, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fdd835';
  ctx.strokeStyle = '#c49000';
  ctx.beginPath();
  ctx.arc(12, 10, 6.5, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(4.5, 9.5, 15, 2);
  return { canvas, originX: 0.5, originY: 43 / 46 };
}

/** Marteau tenu par l'ouvrier (origine au bout du manche, pour le faire pivoter). */
export function hammerTool(): ArtPiece {
  const { canvas, ctx } = createCanvas(24, 24);
  ctx.strokeStyle = '#8d5a30';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(4, 20);
  ctx.lineTo(16, 8);
  ctx.stroke();
  ctx.fillStyle = '#78909c';
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 1;
  ctx.save();
  ctx.translate(17, 7);
  ctx.rotate(-Math.PI / 4);
  ctx.fillRect(-7, -3, 14, 6);
  ctx.strokeRect(-7, -3, 14, 6);
  ctx.restore();
  return { canvas, originX: 4 / 24, originY: 20 / 24 };
}
