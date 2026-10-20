/** Prototype de direction artistique « cartoon » (outil de développement : /proto.html). */
import { seeded, shade } from '@/render/art/color';
import { boxColors, createCanvas, isoCanvas, type ArtPiece, type IsoPainter, type V3 } from '@/render/art/IsoPainter';
import { ArtKey, ArtLibrary } from '@/render/art/library';
import { HALF_H, HALF_W } from '@/render/iso';
import { grassTile } from '@/render/art/ground';

// ——— Post-traitement générique ———

/** Contour sombre épais autour de la silhouette + couleurs plus franches. */
function toon(piece: ArtPiece, px = 2.2, color = 'rgba(40,28,20,0.85)', sat = 1.25): ArtPiece {
  const { width, height } = piece.canvas;
  const src = createCanvas(width, height);
  src.ctx.drawImage(piece.canvas, 0, 0);
  const img = src.ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    d[i] = Math.min(255, (l + (r - l) * sat) * 1.04);
    d[i + 1] = Math.min(255, (l + (g - l) * sat) * 1.04);
    d[i + 2] = Math.min(255, (l + (b - l) * sat) * 1.04);
  }
  src.ctx.putImageData(img, 0, 0);
  const sil = createCanvas(width, height);
  sil.ctx.drawImage(piece.canvas, 0, 0);
  sil.ctx.globalCompositeOperation = 'source-in';
  sil.ctx.fillStyle = color;
  sil.ctx.fillRect(0, 0, width, height);
  const out = createCanvas(width, height);
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    out.ctx.drawImage(sil.canvas, Math.cos(t) * px, Math.sin(t) * px);
  }
  out.ctx.drawImage(src.canvas, 0, 0);
  return { canvas: out.canvas, originX: piece.originX, originY: piece.originY };
}

/** Superpose un calque objet (contouré) sur un calque sol (non contouré). */
function layered(ground: ArtPiece, objects: ArtPiece): ArtPiece {
  const out = createCanvas(ground.canvas.width, ground.canvas.height);
  out.ctx.drawImage(ground.canvas, 0, 0);
  out.ctx.drawImage(toon(objects, 2.2, 'rgba(45,30,22,0.9)', 1.0).canvas, 0, 0);
  return { canvas: out.canvas, originX: ground.originX, originY: ground.originY };
}

// ——— Détails cartoon ———

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

/** Toit à deux pans (faîtage selon x) avec gros débord, rive blanche et tuiles en écailles. */
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
  // Pignon avec bardage et œil-de-bœuf.
  p.fill(
    [
      [x1, y0, z],
      [x1, y1, z],
      [x1, ym, z + h],
    ],
    shade(gable, -0.18),
  );
  const [gx, gy] = p.p(x1, ym, z + h * 0.42);
  p.ctx.fillStyle = '#ffffff';
  p.ctx.beginPath();
  p.ctx.ellipse(gx, gy, 6.5, 7.5, 0, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillStyle = '#7fd0f5';
  p.ctx.beginPath();
  p.ctx.ellipse(gx, gy, 4.5, 5.5, 0, 0, Math.PI * 2);
  p.ctx.fill();
  p.fill(front, p.gradient([x0, ym, z + h], [x0, y1 + ov, z], shade(color, 0.12), shade(color, -0.08)));
  // Écailles : rangées de demi-cercles.
  const { ctx } = p;
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

function roundBush(p: IsoPainter, x: number, y: number, r: number, color = '#4caf2a') {
  p.dot(x + 0.05, y + 0.05, 2, r * 1.05, 'rgba(20,40,10,0.25)');
  p.dot(x, y, r * 0.7, r, shade(color, -0.15));
  p.dot(x - 0.03, y - 0.03, r * 0.95, r * 0.7, color);
  p.dot(x - 0.06, y - 0.06, r * 1.2, r * 0.35, shade(color, 0.35));
}

function cypress(p: IsoPainter, x: number, y: number, h = 46) {
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

function picket(p: IsoPainter, from: [number, number], to: [number, number]) {
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

// ——— Modèles refaits à la main ———

export function toonCottage(): ArtPiece {
  const H = 150;
  const ground = isoCanvas(2, 2, H);
  const obj = isoCanvas(2, 2, H);
  const gp = ground.painter;
  const p = obj.painter;
  gp.flat(0.02, 0.02, 1.98, 1.98, 0, '#8fd14f');
  gp.flat(0.95, 1.6, 1.25, 1.98, 0, '#e9dcc0');
  gp.ctx.globalAlpha = 0.28;
  gp.flat(0.32, 0.32, 2.0, 1.95, 0, '#2c4a16');
  gp.ctx.globalAlpha = 1;

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
  p.box(0.55, 0.45, 0.78, 0.68, h, h + 52, boxColors('#b5523b'));
  p.box(0.52, 0.42, 0.81, 0.71, h + 52, h + 57, boxColors('#7b3424'));
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
  return layered(ground.finish(), obj.finish());
}

function cupcake(p: IsoPainter, x: number, y: number, z: number) {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  ctx.save();
  ctx.translate(sx, sy);
  // Caissette.
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
  // Glaçage.
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
  // Vermicelles et cerise.
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
  ctx.fillStyle = '#d32f2f';
  ctx.beginPath();
  ctx.arc(1, -58, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-1, -60, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function toonBakery(): ArtPiece {
  const H = 170;
  const ground = isoCanvas(2, 2, H);
  const obj = isoCanvas(2, 2, H);
  const gp = ground.painter;
  const p = obj.painter;
  gp.flat(0.02, 0.02, 1.98, 1.98, 0, '#d8d2c6');
  gp.ctx.globalAlpha = 0.25;
  gp.flat(0.2, 0.2, 2.0, 1.95, 0, '#2c3a26');
  gp.ctx.globalAlpha = 1;
  const x0 = 0.18;
  const x1 = 1.75;
  const y0 = 0.2;
  const y1 = 1.55;
  const h = 62;
  const wall = '#f8b4cc';
  p.box(x0, y0, x1, y1, 0, h, { top: wall, left: wall, right: shade(wall, -0.16) });
  p.leftQuad(x0, x1, 0, 10, y1, '#ffffff');
  p.rightQuad(y0, y1, 0, 10, x1, '#e7e3ea');
  // Vitrines.
  p.window('left', 0.3, 0.85, 12, 40, y1, '#8fd8f8', '#ffffff');
  p.window('right', 0.35, 0.9, 12, 40, x1, '#8fd8f8', '#ffffff');
  p.window('right', 1.0, 1.42, 12, 40, x1, '#8fd8f8', '#ffffff');
  p.door('left', 1.25, 0.3, 36, y1, '#6d3b2a', '#ffffff');
  p.awning('left', x0 + 0.04, x1 - 0.04, 50, y1, ['#ec407a', '#ffffff'], 0.34, 15);
  p.awning('right', y0 + 0.04, y1 - 0.04, 50, x1, ['#ec407a', '#ffffff'], 0.34, 15);
  // Corniche épaisse.
  p.box(x0 - 0.07, y0 - 0.07, x1 + 0.07, y1 + 0.07, h, h + 9, boxColors('#ffffff'));
  p.flat(x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, h + 9, '#c99aa9');
  for (let i = 0; i < 9; i++) {
    const x = x0 + ((i + 0.5) / 9) * (x1 - x0);
    p.dot(x, y1 + 0.07, h + 1, 2.4, '#f48fb1');
  }
  cupcake(p, 0.98, 0.9, h + 9);
  // Tables en terrasse.
  for (const tx of [0.35, 0.75]) {
    p.dot(tx, 1.85, 9, 7, '#ffffff', '#c7c7c7');
    p.line([tx, 1.85, 0], [tx, 1.85, 9], '#9e9e9e', 2);
    p.dot(tx, 1.85, 22, 9, '#ec407a');
    p.line([tx, 1.85, 9], [tx, 1.85, 22], '#bdbdbd', 1.5);
  }
  roundBush(p, 1.85, 0.4, 8);
  roundBush(p, 1.85, 1.1, 7, '#5cbf32');
  return layered(ground.finish(), obj.finish());
}

// ——— Sols et routes ———

const TOON_GRASS = '#7cc443';
const ASPHALT = '#4a5059';
const CURB = '#cfd2d4';

function toonRoad(mask: number): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 6, 2);
  const e = 0.015;
  p.flat(-e, -e, 1 + e, 1 + e, 0, TOON_GRASS);
  const a = 0.16;
  const shapes = (k: number): Array<[number, number, number, number]> => {
    const list: Array<[number, number, number, number]> = [[a - k, a - k, 1 - a + k, 1 - a + k]];
    if (mask & 1) list.push([1 - a, a - k, 1 + e, 1 - a + k]);
    if (mask & 2) list.push([a - k, 1 - a, 1 - a + k, 1 + e]);
    if (mask & 4) list.push([-e, a - k, a, 1 - a + k]);
    if (mask & 8) list.push([a - k, -e, 1 - a + k, a]);
    return list;
  };
  // Trottoir surélevé (tranche + dessus), puis chaussée.
  for (const [x0, y0, x1, y1] of shapes(0.11)) p.flat(x0, y0, x1, y1, 0, '#a9adb0');
  for (const [x0, y0, x1, y1] of shapes(0.1)) p.flat(x0, y0, x1, y1, 0, CURB);
  for (const [x0, y0, x1, y1] of shapes(0.022)) p.flat(x0, y0, x1, y1, 0, '#8a8f93');
  for (const [x0, y0, x1, y1] of shapes(0)) p.flat(x0, y0, x1, y1, 0, ASPHALT);
  const ends: Array<[number, number]> = [];
  if (mask & 1) ends.push([1, 0.5]);
  if (mask & 2) ends.push([0.5, 1]);
  if (mask & 4) ends.push([0, 0.5]);
  if (mask & 8) ends.push([0.5, 0]);
  const { ctx } = p;
  const crossing = ends.length >= 3;
  ctx.save();
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  for (const [ex, ey] of ends) {
    const start: V3 = crossing ? [0.5 + (ex - 0.5) * 0.62, 0.5 + (ey - 0.5) * 0.62, 0] : [0.5, 0.5, 0];
    ctx.beginPath();
    ctx.moveTo(...p.p(...start));
    ctx.lineTo(...p.p(ex, ey));
    ctx.stroke();
  }
  ctx.restore();
  if (crossing) {
    for (const [ex, ey] of ends) {
      for (let i = 0; i < 6; i++) {
        const t = a + 0.04 + i * 0.115;
        const along = 0.5 + (ex - 0.5) * 0.52;
        const across = 0.5 + (ey - 0.5) * 0.52;
        const pts: V3[] =
          ex !== 0.5
            ? [
                [along - 0.03, t, 0],
                [along + 0.03, t, 0],
                [along + 0.03, t + 0.06, 0],
                [along - 0.03, t + 0.06, 0],
              ]
            : [
                [t, across - 0.03, 0],
                [t + 0.06, across - 0.03, 0],
                [t + 0.06, across + 0.03, 0],
                [t, across + 0.03, 0],
              ];
        p.fill(pts, '#f7f7f2');
      }
    }
  }
  return finish();
}

const grassCache = new Map<number, ArtPiece>();
/** Herbe vive : aplat légèrement marbré + touffes et quelques fleurs. */
function toonGrass(x: number, y: number): ArtPiece {
  const v = (x * 7 + y * 13) % 6;
  const hit = grassCache.get(v);
  if (hit) return hit;
  const { painter: p, finish } = isoCanvas(1, 1, 0, 2);
  p.flat(-0.015, -0.015, 1.015, 1.015, 0, TOON_GRASS);
  const rnd = seeded(v + 1);
  const { ctx } = p;
  for (let i = 0; i < 5; i++) {
    const [sx, sy] = p.p(rnd(), rnd(), 0);
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(30,80,10,0.06)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 18 + rnd() * 20, 8 + rnd() * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = p.p(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0);
    ctx.strokeStyle = '#5ea532';
    ctx.lineWidth = 1.4;
    for (const dx of [-3, 0, 3]) {
      ctx.beginPath();
      ctx.moveTo(sx + dx * 0.5, sy);
      ctx.lineTo(sx + dx, sy - 4 - Math.abs(dx) * -0.3);
      ctx.stroke();
    }
  }
  if (rnd() < 0.5) {
    const [sx, sy] = p.p(0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6, 0);
    ctx.fillStyle = rnd() < 0.5 ? '#fff59d' : '#ffffff';
    for (const [dx, dy] of [
      [0, 0],
      [4, 2],
      [-3, 3],
    ] as const) {
      ctx.beginPath();
      ctx.arc(sx + dx, sy + dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const piece = finish();
  grassCache.set(v, piece);
  return piece;
}

// ——— Mini-ville de démonstration ———

type Place = { key: string; x: number; y: number; w: number };
const ROADS = new Set<string>();
for (let i = 0; i < 12; i++) {
  ROADS.add(`${i},4`);
  ROADS.add(`7,${i}`);
}
function roadMask(x: number, y: number): number {
  let m = 0;
  if (ROADS.has(`${x + 1},${y}`)) m |= 1;
  if (ROADS.has(`${x},${y + 1}`)) m |= 2;
  if (ROADS.has(`${x - 1},${y}`)) m |= 4;
  if (ROADS.has(`${x},${y - 1}`)) m |= 8;
  return m;
}

function scene(
  pieces: (key: string) => ArtPiece,
  ground: (x: number, y: number) => ArtPiece,
  road: (m: number) => ArtPiece,
  places: Place[],
): HTMLCanvasElement {
  const N = 12;
  const W = N * 2 * HALF_W;
  const top = 260;
  const { canvas, ctx } = createCanvas(W, N * 2 * HALF_H + top);
  const ox = N * HALF_W;
  const draw = (piece: ArtPiece, x: number, y: number) => {
    const sx = ox + (x - y) * HALF_W;
    const sy = top + (x + y) * HALF_H;
    ctx.drawImage(piece.canvas, sx - piece.originX * piece.canvas.width, sy - piece.originY * piece.canvas.height);
  };
  for (let s = 0; s < 2 * N; s++)
    for (let x = 0; x < N; x++) {
      const y = s - x;
      if (y < 0 || y >= N) continue;
      draw(ROADS.has(`${x},${y}`) ? road(roadMask(x, y)) : ground(x, y), x, y);
    }
  const sorted = [...places].sort((a, b) => a.x + a.y + a.w - (b.x + b.y + b.w));
  for (const pl of sorted) draw(pieces(pl.key), pl.x, pl.y);
  return canvas;
}

export function render(root: HTMLElement): void {
  const lib = ArtLibrary.build();
  const grass = [0, 1, 2].map((i) => [0, 1, 2].map((j) => grassTile(i, j)));
  const before: Place[] = [
    { key: ArtKey.building('cottage'), x: 3, y: 1, w: 2 },
    { key: ArtKey.building('cottage'), x: 5, y: 1, w: 2 },
    { key: ArtKey.building('bakery'), x: 8, y: 2, w: 2 },
    { key: ArtKey.building('hospital'), x: 8, y: 5, w: 3 },
    { key: ArtKey.building('fire_station'), x: 4, y: 5, w: 3 },
    { key: ArtKey.building('bungalow'), x: 1, y: 5, w: 2 },
  ];
  const beforeCanvas = scene(
    (k) => lib.get(k),
    (x, y) => grass[x % 3]![y % 3]!,
    (m) => lib.get(ArtKey.road(m)),
    before,
  );
  const toonCache = new Map<string, ArtPiece>();
  const cottage = toonCottage();
  const bakery = toonBakery();
  const after = scene(
    (k) => {
      if (k === ArtKey.building('cottage')) return cottage;
      if (k === ArtKey.building('bakery')) return bakery;
      let t = toonCache.get(k);
      if (!t) {
        t = toon(lib.get(k));
        toonCache.set(k, t);
      }
      return t;
    },
    (x, y) => toonGrass(x, y),
    (m) => toonRoad(m),
    before,
  );
  for (const [title, c] of [
    ['Actuel', beforeCanvas],
    ['Proposition', after],
  ] as const) {
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = title;
    c.style.width = '100%';
    fig.append(cap, c);
    root.append(fig);
  }
  // Planche des modèles seuls.
  const row = document.createElement('div');
  row.className = 'row';
  for (const piece of [lib.get(ArtKey.building('cottage')), cottage, lib.get(ArtKey.building('bakery')), bakery]) {
    piece.canvas.style.width = `${piece.canvas.width}px`;
    row.append(piece.canvas.cloneNode(true) as HTMLCanvasElement);
    (row.lastChild as HTMLCanvasElement).getContext('2d')?.drawImage(piece.canvas, 0, 0);
  }
  root.append(row);
}

render(document.getElementById('proto')!);
