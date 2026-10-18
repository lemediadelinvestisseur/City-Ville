import { boxColors, isoCanvas, type ArtPiece } from './IsoPainter';
import { broadleafTree, coniferTree } from './nature';

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
  p.groundEllipse(0.55, 0.55, 0, 0.42, 'rgba(0,0,0,0.2)');
  p.box(0.12, 0.12, 0.88, 0.88, 0, 10, boxColors('#9e9e9e'));
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const z0 = 10 + i * 18;
    const inset = 0.22 + i * 0.015;
    p.box(inset, inset, 1 - inset, 1 - inset, z0, z0 + 18, boxColors(i % 2 === 0 ? '#ffffff' : '#e53935'));
  }
  const top = 10 + bands * 18;
  p.box(0.25, 0.25, 0.75, 0.75, top, top + 4, boxColors('#37474f'));
  p.box(0.32, 0.32, 0.68, 0.68, top + 4, top + 18, boxColors('#fff59d'));
  p.pyramidRoof(0.28, 0.28, 0.72, 0.72, top + 18, 14, '#c62828', 0.02);
  const [sx, sy] = p.p(0.5, 0.5, top + 11);
  const glow = p.ctx.createRadialGradient(sx, sy, 2, sx, sy, 22);
  glow.addColorStop(0, 'rgba(255,245,180,0.8)');
  glow.addColorStop(1, 'rgba(255,245,180,0)');
  p.ctx.fillStyle = glow;
  p.ctx.beginPath();
  p.ctx.arc(sx, sy, 22, 0, Math.PI * 2);
  p.ctx.fill();
  return finish();
}

function tulips(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 26);
  p.flat(0.1, 0.1, 0.9, 0.9, 0, '#6b4a2f', '#5a3d26');
  const colors = ['#e53935', '#fdd835', '#ec407a', '#ff7043', '#ab47bc'];
  let i = 0;
  for (let y = 0.2; y < 0.86; y += 0.13) {
    for (let x = 0.2; x < 0.86; x += 0.13) {
      p.line([x, y, 0], [x, y, 10], '#388e3c', 1.5);
      const [sx, sy] = p.p(x, y, 12);
      p.ctx.fillStyle = colors[(i++ + Math.round(y * 10)) % colors.length] ?? '#fff';
      p.ctx.beginPath();
      p.ctx.moveTo(sx - 3, sy - 3);
      p.ctx.lineTo(sx - 1.5, sy + 2);
      p.ctx.lineTo(sx + 1.5, sy + 2);
      p.ctx.lineTo(sx + 3, sy - 3);
      p.ctx.lineTo(sx, sy - 1);
      p.ctx.closePath();
      p.ctx.fill();
    }
  }
  return finish();
}

function bandstand(): ArtPiece {
  const { painter: p, finish } = isoCanvas(2, 2, 96);
  p.groundEllipse(1, 1, 0, 0.9, 'rgba(0,0,0,0.15)');
  p.box(0.15, 0.15, 1.85, 1.85, 0, 12, boxColors('#e0d6c2'));
  const posts: Array<[number, number]> = [
    [0.3, 0.3],
    [1.7, 0.3],
    [0.3, 1.7],
    [1.7, 1.7],
    [1, 0.25],
    [0.25, 1],
  ];
  for (const [x, y] of posts.filter(([x, y]) => x + y < 2.1)) p.line([x, y, 12], [x, y, 56], '#ffffff', 4);
  p.pyramidRoof(0.15, 0.15, 1.85, 1.85, 56, 34, '#2e7d32', 0.08);
  for (const [x, y] of [
    [1.75, 1.0],
    [1.0, 1.75],
    [1.7, 1.7],
  ] as const)
    p.line([x, y, 12], [x, y, 56], '#ffffff', 4);
  p.line([1.0, 1.0, 90], [1.0, 1.0, 100], '#ffd54f', 3);
  return finish();
}

function arch(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 70);
  p.groundEllipse(0.5, 0.5, 0, 0.4, 'rgba(0,0,0,0.15)');
  p.box(0.1, 0.42, 0.22, 0.58, 0, 46, boxColors('#ffffff'));
  p.box(0.78, 0.42, 0.9, 0.58, 0, 46, boxColors('#ffffff'));
  const [ax, ay] = p.p(0.16, 0.5, 46);
  const [bx, by] = p.p(0.84, 0.5, 46);
  const { ctx } = p;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 30, bx, by);
  ctx.stroke();
  const colors = ['#ec407a', '#ffeb3b', '#ab47bc', '#ff7043'];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * ((ax + bx) / 2) + t * t * bx;
    const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * (Math.min(ay, by) - 30) + t * t * by;
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors[i % colors.length] ?? '#fff';
    ctx.beginPath();
    ctx.arc(x + 1, y - 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish();
}

function equestrian(): ArtPiece {
  const { painter: p, finish } = isoCanvas(2, 2, 110);
  p.flat(0.08, 0.08, 1.92, 1.92, 0, '#e3ded3', '#c9c2b4');
  p.box(0.45, 0.45, 1.55, 1.55, 0, 10, boxColors('#bdb6a8'));
  p.box(0.6, 0.6, 1.4, 1.4, 10, 40, boxColors('#d6cfc1'));
  const [sx, sy] = p.p(1, 1, 40);
  const { ctx } = p;
  const bronze = ctx.createLinearGradient(sx - 24, sy - 60, sx + 24, sy);
  bronze.addColorStop(0, '#5f8a74');
  bronze.addColorStop(1, '#2f4f3f');
  ctx.fillStyle = bronze;
  // Cheval cabré et cavalier.
  ctx.beginPath();
  ctx.moveTo(sx - 16, sy);
  ctx.lineTo(sx - 13, sy - 22);
  ctx.lineTo(sx - 20, sy - 28);
  ctx.lineTo(sx - 4, sy - 34);
  ctx.lineTo(sx + 10, sy - 46);
  ctx.lineTo(sx + 20, sy - 56);
  ctx.lineTo(sx + 25, sy - 50);
  ctx.lineTo(sx + 18, sy - 42);
  ctx.lineTo(sx + 16, sy - 28);
  ctx.lineTo(sx + 22, sy - 16);
  ctx.lineTo(sx + 17, sy - 14);
  ctx.lineTo(sx + 9, sy - 24);
  ctx.lineTo(sx - 4, sy - 22);
  ctx.lineTo(sx - 8, sy);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - 2, sy - 34);
  ctx.lineTo(sx, sy - 54);
  ctx.lineTo(sx + 7, sy - 54);
  ctx.lineTo(sx + 6, sy - 36);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + 3, sy - 59, 5, 0, Math.PI * 2);
  ctx.fill();
  return finish();
}

function grandFountain(): ArtPiece {
  const { painter: p, finish } = isoCanvas(3, 3, 100);
  p.flat(0.05, 0.05, 2.95, 2.95, 0, '#e8e2d4', '#cbc3b3');
  p.groundEllipse(1.5, 1.5, 0, 1.3, '#b9b2a4');
  p.groundEllipse(1.5, 1.5, 10, 1.3, '#ddd6c8', '#a59e90');
  p.groundEllipse(1.5, 1.5, 10, 1.16, '#3fa9de');
  p.groundEllipse(1.5, 1.5, 10, 0.85, '#6cc6f0');
  p.box(1.35, 1.35, 1.65, 1.65, 10, 44, boxColors('#ddd6c8'));
  p.groundEllipse(1.5, 1.5, 44, 0.55, '#d3ccbe', '#a59e90');
  p.groundEllipse(1.5, 1.5, 45, 0.45, '#6cc6f0');
  p.box(1.44, 1.44, 1.56, 1.56, 45, 66, boxColors('#ddd6c8'));
  p.groundEllipse(1.5, 1.5, 66, 0.25, '#d3ccbe', '#a59e90');
  const [sx, sy] = p.p(1.5, 1.5, 67);
  const { ctx } = p;
  ctx.strokeStyle = 'rgba(225,245,255,0.95)';
  ctx.lineWidth = 2.5;
  for (const dir of [-1, 1]) {
    for (const spread of [18, 34, 52]) {
      ctx.beginPath();
      ctx.moveTo(sx, sy - 26);
      ctx.quadraticCurveTo(sx + dir * spread * 0.5, sy - 46, sx + dir * spread, sy + 8 + spread * 0.5);
      ctx.stroke();
    }
  }
  for (const [x, y] of [
    [0.25, 0.25],
    [2.75, 0.25],
    [0.25, 2.75],
    [2.75, 2.75],
  ] as const) {
    p.dot(x, y, 8, 9, '#43a047');
    p.dot(x - 0.03, y - 0.03, 12, 4, '#ec407a');
  }
  return finish();
}

function triumphArch(): ArtPiece {
  const { painter: p, finish } = isoCanvas(3, 3, 150);
  p.flat(0.05, 0.05, 2.95, 2.95, 0, '#e3ded3', '#c9c2b4');
  const stone = boxColors('#efe7d6');
  // Deux piles massives, ouverture centrale vers l'avant-gauche.
  p.box(0.6, 1.0, 1.15, 2.0, 0, 100, stone);
  p.box(1.85, 1.0, 2.4, 2.0, 0, 100, stone);
  p.box(0.5, 0.9, 2.5, 2.1, 100, 140, stone);
  p.box(0.45, 0.85, 2.55, 2.15, 140, 146, boxColors('#d9cfb9'));
  // Bas-reliefs.
  p.leftQuad(0.7, 1.05, 50, 85, 2.0, '#d6ccb6');
  p.leftQuad(1.95, 2.3, 50, 85, 2.0, '#d6ccb6');
  p.leftQuad(0.9, 2.1, 110, 130, 2.1, '#d6ccb6');
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
