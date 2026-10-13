import { shade } from './color';
import { boxColors, isoCanvas, type ArtPiece, type IsoPainter } from './IsoPainter';

function blob(p: IsoPainter, x: number, y: number, z: number, r: number, color: string): void {
  const [sx, sy] = p.p(x, y, z);
  const { ctx } = p;
  const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.4, r * 0.15, sx, sy, r);
  g.addColorStop(0, shade(color, 0.3));
  g.addColorStop(0.7, color);
  g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
}

function oak(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 92);
  p.groundEllipse(0.6, 0.6, 0, 0.32, 'rgba(20,40,10,0.25)');
  p.box(0.45, 0.45, 0.55, 0.55, 0, 34, boxColors('#7b5130'));
  const green = '#4d9a3a';
  blob(p, 0.38, 0.5, 52, 21, shade(green, -0.1));
  blob(p, 0.62, 0.42, 54, 20, shade(green, -0.05));
  blob(p, 0.55, 0.6, 46, 22, green);
  blob(p, 0.45, 0.45, 70, 19, shade(green, 0.05));
  blob(p, 0.6, 0.6, 66, 16, shade(green, 0.12));
  return finish();
}

function pine(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 100);
  p.groundEllipse(0.6, 0.6, 0, 0.28, 'rgba(20,40,10,0.25)');
  p.box(0.46, 0.46, 0.54, 0.54, 0, 20, boxColors('#6d4426'));
  const [sx, sy] = p.p(0.5, 0.5, 0);
  const { ctx } = p;
  const layers = [
    { y: 18, w: 26, h: 34, c: '#2f7d44' },
    { y: 40, w: 21, h: 30, c: '#358a4b' },
    { y: 60, w: 15, h: 28, c: '#3d9a55' },
  ];
  for (const layer of layers) {
    const top = sy - layer.y - layer.h;
    const base = sy - layer.y;
    ctx.fillStyle = shade(layer.c, -0.2);
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + layer.w, base);
    ctx.lineTo(sx, base + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = layer.c;
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx, base + 5);
    ctx.lineTo(sx - layer.w, base);
    ctx.closePath();
    ctx.fill();
  }
  return finish();
}

function flowerBed(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 24);
  p.box(0.08, 0.08, 0.92, 0.92, 0, 6, boxColors('#b9a58a'));
  p.flat(0.14, 0.14, 0.86, 0.86, 6, '#6b4a2f');
  const colors = ['#e91e63', '#ffeb3b', '#ff7043', '#ab47bc', '#ffffff', '#f06292'];
  let i = 0;
  for (let y = 0.22; y < 0.85; y += 0.16) {
    for (let x = 0.22; x < 0.85; x += 0.16) {
      p.dot(x, y, 9, 4.2, '#3f8f3a');
      p.dot(x - 0.02, y - 0.02, 12, 3, colors[i++ % colors.length] ?? '#fff');
    }
  }
  return finish();
}

function bench(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 30);
  p.groundEllipse(0.55, 0.55, 0, 0.3, 'rgba(0,0,0,0.15)');
  for (const x of [0.2, 0.8]) p.box(x - 0.03, 0.42, x + 0.03, 0.58, 0, 10, boxColors('#424242'));
  p.box(0.15, 0.4, 0.85, 0.6, 10, 13, boxColors('#a0693c'));
  p.box(0.15, 0.36, 0.85, 0.42, 13, 26, boxColors('#8d5a30'));
  return finish();
}

function lamp(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 80);
  p.groundEllipse(0.5, 0.5, 0, 0.12, 'rgba(0,0,0,0.2)');
  p.box(0.44, 0.44, 0.56, 0.56, 0, 6, boxColors('#37474f'));
  p.line([0.5, 0.5, 6], [0.5, 0.5, 66], '#263238', 4);
  p.line([0.5, 0.5, 6], [0.5, 0.5, 66], '#546e7a', 2);
  const [sx, sy] = p.p(0.5, 0.5, 70);
  const { ctx } = p;
  const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 16);
  glow.addColorStop(0, 'rgba(255,241,170,0.9)');
  glow.addColorStop(1, 'rgba(255,241,170,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff59d';
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 6, sy - 6);
  ctx.lineTo(sx + 6, sy - 6);
  ctx.lineTo(sx + 4, sy + 5);
  ctx.lineTo(sx - 4, sy + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy - 6);
  ctx.lineTo(sx, sy - 13);
  ctx.lineTo(sx + 9, sy - 6);
  ctx.closePath();
  ctx.fill();
  return finish();
}

function flag(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 96);
  p.groundEllipse(0.5, 0.5, 0, 0.16, 'rgba(0,0,0,0.2)');
  p.box(0.38, 0.38, 0.62, 0.62, 0, 8, boxColors('#bdbdbd'));
  p.line([0.5, 0.5, 8], [0.5, 0.5, 92], '#757575', 3);
  const [sx, sy] = p.p(0.5, 0.5, 90);
  const { ctx } = p;
  ctx.fillStyle = '#1e63c6';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(sx + 14, sy - 5, sx + 30, sy + 2);
  ctx.lineTo(sx + 30, sy + 20);
  ctx.quadraticCurveTo(sx + 14, sy + 13, sx, sy + 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  const cx = sx + 15;
  const cy = sy + 10;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6 : 2.6;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return finish();
}

function statue(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 82);
  p.groundEllipse(0.55, 0.55, 0, 0.3, 'rgba(0,0,0,0.2)');
  p.box(0.15, 0.15, 0.85, 0.85, 0, 8, boxColors('#bdb6a8'));
  p.box(0.28, 0.28, 0.72, 0.72, 8, 30, boxColors('#d6cfc1'));
  const [sx, sy] = p.p(0.5, 0.5, 30);
  const { ctx } = p;
  const bronze = ctx.createLinearGradient(sx - 10, sy - 50, sx + 10, sy);
  bronze.addColorStop(0, '#d4a35c');
  bronze.addColorStop(1, '#7a5426');
  ctx.fillStyle = bronze;
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy);
  ctx.lineTo(sx - 7, sy - 26);
  ctx.lineTo(sx - 12, sy - 34);
  ctx.lineTo(sx - 4, sy - 33);
  ctx.lineTo(sx + 4, sy - 33);
  ctx.lineTo(sx + 9, sy - 48);
  ctx.lineTo(sx + 12, sy - 46);
  ctx.lineTo(sx + 8, sy - 30);
  ctx.lineTo(sx + 7, sy);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy - 39, 5.5, 0, Math.PI * 2);
  ctx.fill();
  return finish();
}

function fountain(): ArtPiece {
  const { painter: p, finish } = isoCanvas(2, 2, 70);
  p.flat(0.04, 0.04, 1.96, 1.96, 0, '#e3ded3', '#c9c2b4');
  p.groundEllipse(1, 1, 0, 0.82, '#b9b2a4');
  p.groundEllipse(1, 1, 9, 0.82, '#d7d1c4', '#a59e90');
  p.groundEllipse(1, 1, 9, 0.7, '#4fb3e8');
  p.groundEllipse(1, 1, 9, 0.5, '#6cc6f0');
  p.box(0.9, 0.9, 1.1, 1.1, 9, 34, boxColors('#d7d1c4'));
  p.groundEllipse(1, 1, 34, 0.32, '#cfc8ba', '#a59e90');
  p.groundEllipse(1, 1, 35, 0.26, '#6cc6f0');
  const [sx, sy] = p.p(1, 1, 36);
  const { ctx } = p;
  ctx.strokeStyle = 'rgba(225,245,255,0.95)';
  ctx.lineWidth = 2.5;
  for (const dir of [-1, 1]) {
    for (const spread of [16, 28]) {
      ctx.beginPath();
      ctx.moveTo(sx, sy - 22);
      ctx.quadraticCurveTo(sx + dir * spread * 0.5, sy - 40, sx + dir * spread, sy + 2 + spread * 0.25);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(235,250,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(sx, sy - 24, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  return finish();
}

const DECORATIONS: Record<string, () => ArtPiece> = {
  tree_oak: oak,
  tree_pine: pine,
  flower_bed: flowerBed,
  bench,
  lamp,
  flag,
  statue,
  fountain,
};

export function decorationArt(defId: string): ArtPiece | null {
  const draw = DECORATIONS[defId];
  return draw ? draw() : null;
}
