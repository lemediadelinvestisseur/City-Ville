import { shade } from './color';
import { boxColors, createCanvas, type ArtPiece, type IsoPainter, type V3 } from './IsoPainter';

/**
 * Style « cartoon » façon city-builder des années 2010 : contour sombre épais
 * autour des silhouettes, couleurs franches, détails ronds et objets géants
 * posés sur les toits des commerces.
 */

const OUTLINE = 'rgba(46,30,22,0.9)';

/** Contour épais autour de la silhouette d'un calque ; `saturate` ravive les couleurs. */
export function outlined(piece: ArtPiece, px = 2.2, saturate = 1.12, color = OUTLINE): ArtPiece {
  const { width, height } = piece.canvas;
  const pad = Math.ceil(px) + 1;
  const src = piece.canvas;
  if (saturate !== 1) {
    const ctx = src.getContext('2d');
    if (ctx) {
      const img = ctx.getImageData(0, 0, width, height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const r = d[i]!;
        const g = d[i + 1]!;
        const b = d[i + 2]!;
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        d[i] = l + (r - l) * saturate;
        d[i + 1] = l + (g - l) * saturate;
        d[i + 2] = l + (b - l) * saturate;
      }
      ctx.putImageData(img, 0, 0);
    }
  }
  const sil = createCanvas(width, height);
  sil.ctx.drawImage(src, 0, 0);
  sil.ctx.globalCompositeOperation = 'source-in';
  sil.ctx.fillStyle = color;
  sil.ctx.fillRect(0, 0, width, height);
  const out = createCanvas(width + pad * 2, height + pad * 2);
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    out.ctx.drawImage(sil.canvas, pad + Math.cos(t) * px, pad + Math.sin(t) * px);
  }
  out.ctx.drawImage(src, pad, pad);
  return {
    canvas: out.canvas,
    originX: (piece.originX * width + pad) / out.canvas.width,
    originY: (piece.originY * height + pad) / out.canvas.height,
  };
}

/** Superpose un calque d'objets (contouré) sur un calque de sol (non contouré) de mêmes dimensions. */
export function layered(ground: ArtPiece, objects: ArtPiece, px = 2.2): ArtPiece {
  const top = outlined(objects, px);
  const pad = (top.canvas.width - ground.canvas.width) / 2;
  const { canvas, ctx } = createCanvas(top.canvas.width, top.canvas.height);
  ctx.drawImage(ground.canvas, pad, pad);
  ctx.drawImage(top.canvas, 0, 0);
  return { canvas, originX: top.originX, originY: top.originY };
}

// ——— Détails ———

export function roundBush(p: IsoPainter, x: number, y: number, r: number, color = '#4caf2a'): void {
  p.dot(x, y, r * 0.7, r, shade(color, -0.15));
  p.dot(x - 0.03, y - 0.03, r * 0.95, r * 0.7, color);
  p.dot(x - 0.06, y - 0.06, r * 1.2, r * 0.35, shade(color, 0.35));
}

export function cypress(p: IsoPainter, x: number, y: number, h = 46): void {
  p.line([x, y, 0], [x, y, 8], '#6d4c2f', 3);
  const [sx, sy] = p.p(x, y, 4);
  const { ctx } = p;
  const g = ctx.createLinearGradient(sx - 9, 0, sx + 9, 0);
  g.addColorStop(0, '#9ccc3c');
  g.addColorStop(0.5, '#6fae2a');
  g.addColorStop(1, '#3f7f1f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.bezierCurveTo(sx + 12, sy - h * 0.6, sx + 11, sy - 6, sx, sy - 4);
  ctx.bezierCurveTo(sx - 11, sy - 6, sx - 12, sy - h * 0.6, sx, sy - h);
  ctx.fill();
}

/** Palissade blanche à piquets. */
export function picket(p: IsoPainter, from: readonly [number, number], to: readonly [number, number]): void {
  const [fx, fy] = from;
  const [tx, ty] = to;
  const n = Math.max(2, Math.round(Math.hypot(tx - fx, ty - fy) * 9));
  p.line([fx, fy, 6], [tx, ty, 6], '#e6e6e6', 2.2);
  p.line([fx, fy, 11], [tx, ty, 11], '#e6e6e6', 2.2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = fx + (tx - fx) * t;
    const y = fy + (ty - fy) * t;
    p.line([x, y, 0], [x, y, 14], '#ffffff', 2.6);
  }
}

function siding(p: IsoPainter, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, wall: string) {
  for (let z = z0 + 5; z < z1 - 2; z += 5) {
    p.line([x0, y1, z], [x1, y1, z], shade(wall, -0.1), 1);
    p.line([x1, y1, z], [x1, y0, z], shade(wall, -0.3), 1);
  }
}

function cornerBoards(p: IsoPainter, x0: number, x1: number, y0: number, y1: number, h: number) {
  p.leftQuad(x0, x0 + 0.06, 0, h, y1, '#ffffff');
  p.leftQuad(x1 - 0.06, x1, 0, h, y1, '#f3f3f3');
  p.rightQuad(y1 - 0.06, y1, 0, h, x1, '#dfe3e6');
  p.rightQuad(y0, y0 + 0.06, 0, h, x1, '#d8dde0');
}

/** Fenêtre à petits bois avec volets. */
function cuteWindow(
  p: IsoPainter,
  side: 'left' | 'right',
  c: number,
  plane: number,
  za: number,
  zb: number,
  shutter: string,
) {
  const quad = side === 'left' ? p.leftQuad.bind(p) : p.rightQuad.bind(p);
  const w = 0.13;
  const k = side === 'left' ? 0 : -0.12;
  quad(c - w - 0.1, c - w - 0.02, za, zb, plane, shade(shutter, k));
  quad(c + w + 0.02, c + w + 0.1, za, zb, plane, shade(shutter, k));
  p.window(side, c - w, c + w, za, zb, plane, '#7fd0f5', '#ffffff');
  const mz = (za + zb) / 2;
  if (side === 'left') {
    p.line([c, plane, za], [c, plane, zb], '#ffffff', 1.8);
    p.line([c - w, plane, mz], [c + w, plane, mz], '#ffffff', 1.8);
  } else {
    p.line([plane, c, za], [plane, c, zb], '#ffffff', 1.8);
    p.line([plane, c - w, mz], [plane, c + w, mz], '#ffffff', 1.8);
  }
  quad(c - w - 0.04, c + w + 0.04, za - 4, za - 1, plane, side === 'left' ? '#ffffff' : '#e3e6e8');
}

/** Toit à deux pans (faîtage selon x) avec gros débord, rives blanches et tuiles en écailles. */
function cuteGableX(
  p: IsoPainter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  h: number,
  color: string,
  gable: string,
) {
  const ov = 0.17;
  const ym = (y0 + y1) / 2;
  const back: V3[] = [
    [x0 - ov, y0 - ov, z - 4],
    [x1 + ov, y0 - ov, z - 4],
    [x1 + ov, ym, z + h],
    [x0 - ov, ym, z + h],
  ];
  const front: V3[] = [
    [x0 - ov, y1 + ov, z - 4],
    [x1 + ov, y1 + ov, z - 4],
    [x1 + ov, ym, z + h],
    [x0 - ov, ym, z + h],
  ];
  p.fill(back, shade(color, 0.15));
  // Pignon avec œil-de-bœuf.
  p.fill(
    [
      [x1, y0, z],
      [x1, y1, z],
      [x1, ym, z + h],
    ],
    shade(gable, -0.18),
  );
  const { ctx } = p;
  const [gx, gy] = p.p(x1, ym, z + h * 0.42);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(gx, gy, 6.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7fd0f5';
  ctx.beginPath();
  ctx.ellipse(gx, gy, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  p.fill(front, p.gradient([x0, ym, z + h], [x0, y1 + ov, z], shade(color, 0.12), shade(color, -0.08)));
  // Écailles : rangées de demi-cercles.
  ctx.save();
  p.path(front);
  ctx.clip();
  const rows = 7;
  for (let r = 1; r <= rows; r++) {
    const t = r / (rows + 0.5);
    const yy = ym + (y1 + ov - ym) * t;
    const zz = z + h + (z - 4 - (z + h)) * t;
    const n = Math.round((x1 - x0 + 2 * ov) * 9);
    for (let i = 0; i <= n; i++) {
      const xx = x0 - ov + ((i + (r % 2) * 0.5) / n) * (x1 - x0 + 2 * ov);
      const [sx, sy] = p.p(xx, yy, zz);
      ctx.beginPath();
      ctx.arc(sx, sy, 6.2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = shade(color, -0.22);
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }
  ctx.restore();
  // Faîtage et rives.
  p.line([x0 - ov, ym, z + h], [x1 + ov, ym, z + h], shade(color, -0.35), 5);
  p.line([x0 - ov, ym, z + h + 1], [x1 + ov, ym, z + h + 1], shade(color, 0.3), 2);
  p.line([x0 - ov, y1 + ov, z - 4], [x1 + ov, y1 + ov, z - 4], '#ffffff', 3.5);
  p.line([x1 + ov, y0 - ov, z - 4], [x1 + ov, ym, z + h], '#f4f4f4', 4.5);
  p.line([x1 + ov, ym, z + h], [x1 + ov, y1 + ov, z - 4], '#f4f4f4', 4.5);
}

// ——— Maisonnette ———

/** Maisonnette en bardage bleu, toit en écailles, porche à colonnes et palissade (calque objets). */
export function drawCottage(gp: IsoPainter, p: IsoPainter): void {
  gp.flat(0.02, 0.02, 1.98, 1.98, 0, '#8fd14f', shade('#8fd14f', -0.15));
  gp.flat(0.95, 1.6, 1.25, 1.98, 0, '#e9dcc0');
  gp.ctx.save();
  gp.ctx.globalAlpha = 0.25;
  gp.flat(0.32, 0.32, 2.0, 1.95, 0, '#2c4a16');
  gp.ctx.restore();

  const x0 = 0.28;
  const x1 = 1.72;
  const y0 = 0.3;
  const y1 = 1.32;
  const h = 50;
  const wall = '#9fd0e8';
  picket(p, [0.06, 0.06], [1.94, 0.06]);
  picket(p, [0.06, 0.06], [0.06, 1.94]);
  p.box(x0, y0, x1, y1, 0, h, { top: wall, left: wall, right: shade(wall, -0.18) });
  siding(p, x0, x1, y0, y1, 4, h, wall);
  p.leftQuad(x0, x1, 0, 5, y1, '#c7b8a3');
  p.rightQuad(y0, y1, 0, 5, x1, '#a99a86');
  cornerBoards(p, x0, x1, y0, y1, h);
  cuteWindow(p, 'left', 0.55, y1, 18, 38, '#2f6fb3');
  cuteWindow(p, 'right', 0.62, x1, 18, 38, '#2f6fb3');
  cuteWindow(p, 'right', 1.05, x1, 18, 38, '#2f6fb3');
  p.door('left', 1.1, 0.26, 32, y1, '#c0392b', '#ffffff');

  // Cheminée.
  p.box(0.55, 0.45, 0.78, 0.68, h, h + 46, boxColors('#b5523b'));
  p.box(0.52, 0.42, 0.81, 0.71, h + 46, h + 51, boxColors('#7b3424'));
  cuteGableX(p, x0, y0, x1, y1, h, 38, '#f0a27a', wall);

  // Porche : terrasse, colonnes et petit toit.
  p.box(0.85, y1, 1.62, y1 + 0.34, 0, 6, boxColors('#c8a27a'));
  p.box(1.0, y1 + 0.34, 1.2, y1 + 0.46, 0, 3, boxColors('#bfa58a'));
  for (const cx of [0.9, 1.57]) p.box(cx - 0.035, y1 + 0.27, cx + 0.035, y1 + 0.33, 6, 34, boxColors('#ffffff', false));
  p.fill(
    [
      [0.82, y1, 38],
      [1.65, y1, 38],
      [1.65, y1 + 0.38, 32],
      [0.82, y1 + 0.38, 32],
    ],
    '#e58d63',
  );
  p.line([0.82, y1 + 0.38, 32], [1.65, y1 + 0.38, 32], '#ffffff', 3);
  p.line([1.65, y1, 38], [1.65, y1 + 0.38, 32], '#f2f2f2', 3);

  picket(p, [0.06, 1.94], [0.92, 1.94]);
  picket(p, [1.28, 1.94], [1.94, 1.94]);
  picket(p, [1.94, 0.06], [1.94, 1.94]);
  roundBush(p, 0.45, 1.6, 9);
  roundBush(p, 1.62, 1.68, 8, '#5cbf32');
  cypress(p, 1.83, 0.4, 50);
  cypress(p, 0.4, 1.83, 40);
}

// ——— Objets géants sur les toits ———

type Prop = (ctx: CanvasRenderingContext2D) => void;

function at(p: IsoPainter, x: number, y: number, z: number, scale: number, draw: Prop): void {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  draw(ctx);
  ctx.restore();
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

const cupcake: Prop = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(-16, -26);
  ctx.lineTo(16, -26);
  ctx.lineTo(11, 0);
  ctx.lineTo(-11, 0);
  ctx.closePath();
  ctx.fillStyle = '#ffd54f';
  ctx.fill();
  ctx.strokeStyle = '#e0a800';
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 4.6, -26);
    ctx.lineTo(i * 3.2, 0);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(-6, -44, 2, 0, -34, 24);
  g.addColorStop(0, '#ffd1e3');
  g.addColorStop(1, '#f06292');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-19, -24);
  ctx.bezierCurveTo(-24, -40, -10, -42, -8, -46);
  ctx.bezierCurveTo(-6, -58, 8, -58, 9, -46);
  ctx.bezierCurveTo(18, -44, 24, -36, 19, -24);
  ctx.quadraticCurveTo(0, -18, -19, -24);
  ctx.fill();
  const sprinkles = ['#4fc3f7', '#fff176', '#81c784', '#ffffff'];
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = sprinkles[i % 4]!;
    ctx.lineWidth = 2;
    const a = -16 + ((i * 37) % 32);
    const b = -27 - ((i * 13) % 20);
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(a + 3, b - 1.5);
    ctx.stroke();
  }
  ellipse(ctx, 1, -58, 5, 5, '#d32f2f');
  ellipse(ctx, -1, -60, 1.6, 1.6, 'rgba(255,255,255,0.7)');
};

const burger: Prop = (ctx) => {
  const bun = ctx.createLinearGradient(0, -52, 0, -28);
  bun.addColorStop(0, '#ffb74d');
  bun.addColorStop(1, '#e08a1e');
  ellipse(ctx, 0, -6, 24, 7, '#d98a2b');
  ctx.fillStyle = '#e39a3b';
  ctx.fillRect(-24, -12, 48, 6);
  ellipse(ctx, 0, -12, 24, 6, '#f0b25a');
  ellipse(ctx, 0, -17, 26, 7, '#6d3b1f');
  ctx.fillStyle = '#ffca28';
  ctx.beginPath();
  ctx.moveTo(-24, -22);
  ctx.lineTo(24, -22);
  ctx.lineTo(18, -14);
  ctx.lineTo(8, -20);
  ctx.lineTo(-4, -13);
  ctx.lineTo(-14, -20);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 0, -24, 27, 6, '#66bb6a');
  ctx.fillStyle = bun;
  ctx.beginPath();
  ctx.moveTo(-25, -26);
  ctx.bezierCurveTo(-25, -54, 25, -54, 25, -26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3d6';
  for (const [x, y] of [
    [-10, -40],
    [2, -45],
    [12, -38],
    [-2, -34],
    [-16, -32],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, 2.2, 1.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
};

const pizza: Prop = (ctx) => {
  ctx.save();
  ctx.transform(1, 0, -0.25, 1, 0, 0);
  ellipse(ctx, 0, -26, 26, 26, '#d9902e');
  ellipse(ctx, 0, -26, 21, 21, '#f4c84a');
  ctx.fillStyle = '#e53935';
  ctx.globalAlpha = 0.35;
  ellipse(ctx, 0, -26, 20, 20, '#e53935');
  ctx.globalAlpha = 1;
  for (const [x, y] of [
    [-9, -32],
    [7, -36],
    [10, -20],
    [-6, -17],
    [0, -27],
  ] as const) {
    ellipse(ctx, x, y, 4.2, 4.2, '#c62828');
    ellipse(ctx, x - 1, y - 1, 1.3, 1.3, '#ef9a9a');
  }
  ctx.strokeStyle = '#a86a1c';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 21, -26 + Math.sin(a) * 21);
    ctx.lineTo(-Math.cos(a) * 21, -26 - Math.sin(a) * 21);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(-2, -2, 4, 4);
};

const coffee: Prop = (ctx) => {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(17, -18, 8, -1.2, 1.4);
  ctx.stroke();
  const g = ctx.createLinearGradient(-16, 0, 16, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d7dde0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-17, -34);
  ctx.lineTo(17, -34);
  ctx.quadraticCurveTo(15, -2, 0, -2);
  ctx.quadraticCurveTo(-15, -2, -17, -34);
  ctx.fill();
  ellipse(ctx, 0, -34, 17, 5, '#ffffff');
  ellipse(ctx, 0, -34, 14, 3.6, '#6d4c41');
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  for (const dx of [-6, 4]) {
    ctx.beginPath();
    ctx.moveTo(dx, -40);
    ctx.bezierCurveTo(dx - 6, -48, dx + 6, -52, dx, -60);
    ctx.stroke();
  }
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.bezierCurveTo(-8, -18, -4, -26, 0, -20);
  ctx.bezierCurveTo(4, -26, 8, -18, 0, -12);
  ctx.fill();
};

const flower: Prop = (ctx) => {
  ctx.strokeStyle = '#388e3c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-4, -18, 0, -34);
  ctx.stroke();
  ctx.fillStyle = '#66bb6a';
  ctx.beginPath();
  ctx.ellipse(-8, -14, 9, 4, -0.6, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.fillStyle = i % 2 ? '#ff80ab' : '#f06292';
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 11, -44 + Math.sin(a) * 11, 9, 6, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ellipse(ctx, 0, -44, 8, 8, '#ffd54f');
  ellipse(ctx, -2, -46, 3, 3, '#fff59d');
};

const books: Prop = (ctx) => {
  const colors = ['#1e88e5', '#e53935', '#fdd835'];
  for (let i = 0; i < 3; i++) {
    const y = -i * 11;
    const w = 26 - i * 3;
    ctx.save();
    ctx.translate(i % 2 ? 3 : -2, 0);
    ctx.fillStyle = '#fff8e1';
    ctx.fillRect(-w, y - 10, w * 2, 8);
    ctx.fillStyle = colors[i]!;
    ctx.fillRect(-w - 2, y - 11, w * 2 + 2, 3);
    ctx.fillRect(-w - 2, y - 3, w * 2 + 2, 3);
    ctx.fillRect(w - 2, y - 11, 4, 11);
    ctx.restore();
  }
  // Livre ouvert au sommet.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.quadraticCurveTo(-12, -44, -24, -40);
  ctx.lineTo(-24, -32);
  ctx.quadraticCurveTo(-12, -36, 0, -30);
  ctx.quadraticCurveTo(12, -36, 24, -32);
  ctx.lineTo(24, -40);
  ctx.quadraticCurveTo(12, -44, 0, -36);
  ctx.fill();
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(0, -30);
  ctx.stroke();
};

const popcorn: Prop = (ctx) => {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-16, -34);
  ctx.lineTo(16, -34);
  ctx.lineTo(11, 0);
  ctx.lineTo(-11, 0);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-20, -40, 40, 44);
  ctx.fillStyle = '#e53935';
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(i * 4.6 - 2.3, -40, 4.6, 44);
  ctx.restore();
  for (const [x, y] of [
    [-12, -36],
    [-4, -40],
    [5, -38],
    [12, -35],
    [-8, -46],
    [2, -48],
    [9, -44],
    [-1, -54],
  ] as const) {
    ellipse(ctx, x, y, 6, 5.4, '#fff8e1');
    ellipse(ctx, x - 1.5, y - 1.5, 2.5, 2, '#ffe082');
  }
};

const apple: Prop = (ctx) => {
  const g = ctx.createRadialGradient(-7, -30, 3, 0, -22, 26);
  g.addColorStop(0, '#ff8a80');
  g.addColorStop(1, '#c62828');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.bezierCurveTo(-14, -48, -30, -32, -22, -14);
  ctx.bezierCurveTo(-16, -2, -6, -2, 0, -6);
  ctx.bezierCurveTo(6, -2, 16, -2, 22, -14);
  ctx.bezierCurveTo(30, -32, 14, -48, 0, -38);
  ctx.fill();
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -37);
  ctx.lineTo(2, -48);
  ctx.stroke();
  ctx.fillStyle = '#66bb6a';
  ctx.beginPath();
  ctx.ellipse(10, -46, 9, 4.5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ellipse(ctx, -9, -30, 4, 6, 'rgba(255,255,255,0.45)');
};

const handbag: Prop = (ctx) => {
  ctx.strokeStyle = '#212121';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -30, 12, Math.PI, 0);
  ctx.stroke();
  const g = ctx.createLinearGradient(-20, 0, 20, 0);
  g.addColorStop(0, '#f48fb1');
  g.addColorStop(1, '#c2185b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-20, -30);
  ctx.lineTo(20, -30);
  ctx.lineTo(24, 0);
  ctx.lineTo(-24, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(-4, -24, 8, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-16, -28, 4, 24);
};

export const ROOF_PROPS = {
  cupcake,
  burger,
  pizza,
  coffee,
  flower,
  books,
  popcorn,
  apple,
  handbag,
} as const satisfies Record<string, Prop>;

export type RoofProp = keyof typeof ROOF_PROPS;

/** Pose un objet géant au point (x, y, z) d'un toit. */
export function roofProp(p: IsoPainter, kind: RoofProp, x: number, y: number, z: number, scale = 1): void {
  // Petit socle sombre pour l'ancrer au toit.
  p.groundEllipse(x, y, z, 0.14 * scale, 'rgba(0,0,0,0.18)');
  at(p, x, y, z, scale, ROOF_PROPS[kind]);
}
