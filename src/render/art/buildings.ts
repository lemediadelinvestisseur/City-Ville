import { shade } from './color';
import { boxColors, isoCanvas, type ArtPiece, type IsoPainter } from './IsoPainter';

type Side = 'left' | 'right';

interface Geo {
  size: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  h: number;
}

interface BuildingSpec {
  size: number;
  /** Sol de la parcelle (null = herbe naturelle). */
  lot: string | null;
  fence?: string;
  body: { inset: number; h: number; wall: string; floors: number };
  roof: { type: 'pyramid' | 'gableX' | 'gableY' | 'flat'; color: string; h: number };
  trim?: string;
  windows?: { glass: string; frame: string; perTile: number; big?: boolean };
  door?: { side: Side; at: number; color: string; width?: number };
  awning?: { side: Side; colors: readonly [string, string] };
  sign?: { side: Side; text: string; bg: string; fg: string };
  chimney?: string;
  /** Hauteur supplémentaire au-dessus du toit (tours, enseignes…). */
  extraHeight?: number;
  /** Dessiné avant le bâtiment (piscine, allée…). */
  before?: (p: IsoPainter, g: Geo) => void;
  /** Dessiné après le bâtiment (colonnes, clocher, terrasse…). */
  after?: (p: IsoPainter, g: Geo) => void;
}

const GLASS = '#8fd3f4';

function drawWindows(p: IsoPainter, spec: BuildingSpec, g: Geo, side: Side): void {
  const win = spec.windows;
  if (!win) return;
  const span = side === 'left' ? g.x1 - g.x0 : g.y1 - g.y0;
  const start = side === 'left' ? g.x0 : g.y0;
  const plane = side === 'left' ? g.y1 : g.x1;
  const count = Math.max(1, Math.round(span * win.perTile));
  const slot = span / count;
  const floorH = g.h / spec.body.floors;
  const doorSlot = spec.door && spec.door.side === side ? Math.min(count - 1, Math.floor(spec.door.at * count)) : -1;
  for (let floor = 0; floor < spec.body.floors; floor++) {
    const base = floor * floorH;
    const big = win.big && floor === 0;
    const za = base + floorH * (big ? 0.12 : 0.32);
    const zb = base + floorH * (big ? 0.66 : 0.78);
    for (let i = 0; i < count; i++) {
      if (floor === 0 && i === doorSlot) continue;
      const center = start + slot * (i + 0.5);
      const half = slot * (big ? 0.38 : 0.24);
      p.window(side, center - half, center + half, za, zb, plane, win.glass, win.frame);
    }
  }
}

function drawBuilding(spec: BuildingSpec): ArtPiece {
  const { size } = spec;
  const inset = spec.body.inset;
  const g: Geo = { size, x0: inset, y0: inset, x1: size - inset, y1: size - inset, h: spec.body.h };
  const height = spec.body.h + spec.roof.h + (spec.extraHeight ?? 0) + 12;
  const { painter: p, finish } = isoCanvas(size, size, height);

  if (spec.lot) {
    p.flat(0.02, 0.02, size - 0.02, size - 0.02, 0, spec.lot, shade(spec.lot, -0.18));
  }
  if (spec.fence) {
    p.fence([0.06, 0.06], [size - 0.06, 0.06], spec.fence);
    p.fence([0.06, 0.06], [0.06, size - 0.06], spec.fence);
  }
  spec.before?.(p, g);
  p.shadow(g.x0, g.y0, g.x1, g.y1);
  p.box(g.x0, g.y0, g.x1, g.y1, 0, g.h, boxColors(spec.body.wall));

  // Bandeaux entre les étages et en haut des murs.
  const trim = spec.trim ?? shade(spec.body.wall, 0.5);
  const floorH = g.h / spec.body.floors;
  for (let floor = 1; floor <= spec.body.floors; floor++) {
    const z = floor * floorH;
    p.leftQuad(g.x0, g.x1, z - 3.5, z, g.y1, trim);
    p.rightQuad(g.y0, g.y1, z - 3.5, z, g.x1, shade(trim, -0.15));
  }
  // Soubassement.
  p.leftQuad(g.x0, g.x1, 0, 4, g.y1, shade(spec.body.wall, -0.3));
  p.rightQuad(g.y0, g.y1, 0, 4, g.x1, shade(spec.body.wall, -0.4));

  drawWindows(p, spec, g, 'left');
  drawWindows(p, spec, g, 'right');

  if (spec.door) {
    const { side, at, color, width = 0.3 } = spec.door;
    const span = side === 'left' ? g.x1 - g.x0 : g.y1 - g.y0;
    const start = side === 'left' ? g.x0 : g.y0;
    const count = spec.windows ? Math.max(1, Math.round(span * spec.windows.perTile)) : 1;
    const slot = span / count;
    const center = spec.windows
      ? start + slot * (Math.min(count - 1, Math.floor(at * count)) + 0.5)
      : start + span * at;
    p.door(side, center, width, Math.min(30, floorH * 0.72), side === 'left' ? g.y1 : g.x1, color);
  }

  if (spec.awning) {
    const { side, colors } = spec.awning;
    const zTop = floorH * 0.7;
    if (side === 'left') p.awning('left', g.x0 + 0.05, g.x1 - 0.05, zTop, g.y1, colors);
    else p.awning('right', g.y0 + 0.05, g.y1 - 0.05, zTop, g.x1, colors);
  }

  const roofZ = g.h;
  const { type, color, h } = spec.roof;
  if (type === 'pyramid') p.pyramidRoof(g.x0, g.y0, g.x1, g.y1, roofZ, h, color);
  else if (type === 'gableX') p.gableRoofX(g.x0, g.y0, g.x1, g.y1, roofZ, h, color, shade(spec.body.wall, -0.2));
  else if (type === 'gableY') p.gableRoofY(g.x0, g.y0, g.x1, g.y1, roofZ, h, color, spec.body.wall);
  else {
    // Toit plat avec acrotère.
    p.box(g.x0 - 0.03, g.y0 - 0.03, g.x1 + 0.03, g.y1 + 0.03, roofZ, roofZ + h, boxColors(shade(color, 0.15)));
    p.flat(g.x0 + 0.08, g.y0 + 0.08, g.x1 - 0.08, g.y1 - 0.08, roofZ + h, color);
  }

  if (spec.chimney && type !== 'flat') {
    const cx = g.x0 + (g.x1 - g.x0) * 0.68;
    const cy = g.y0 + (g.y1 - g.y0) * 0.22;
    p.box(cx, cy, cx + 0.2, cy + 0.2, roofZ, roofZ + h * 0.95, boxColors(spec.chimney));
    p.box(
      cx - 0.03,
      cy - 0.03,
      cx + 0.23,
      cy + 0.23,
      roofZ + h * 0.95,
      roofZ + h * 0.95 + 4,
      boxColors(shade(spec.chimney, -0.25)),
    );
  }

  if (spec.sign) {
    const { side, text, bg, fg } = spec.sign;
    let za: number;
    let zb: number;
    if (spec.awning) {
      za = floorH * 0.74;
      zb = floorH * 0.97;
    } else if (type === 'flat') {
      za = g.h + 1;
      zb = g.h + 15;
    } else if (spec.body.floors > 1) {
      za = floorH - 6;
      zb = floorH + 7;
    } else {
      za = g.h - 20;
      zb = g.h - 6;
    }
    if (side === 'left') p.sign('left', g.x0 + 0.18, g.x1 - 0.18, za, zb, g.y1 + 0.01, bg, fg, text);
    else p.sign('right', g.y0 + 0.18, g.y1 - 0.18, za, zb, g.x1 + 0.01, bg, fg, text);
  }

  spec.after?.(p, g);

  if (spec.fence) {
    // Clôture avant, avec un portillon face à la porte.
    p.fence([0.06, size - 0.06], [size * 0.42, size - 0.06], spec.fence);
    p.fence([size * 0.62, size - 0.06], [size - 0.06, size - 0.06], spec.fence);
    p.fence([size - 0.06, 0.06], [size - 0.06, size - 0.06], spec.fence);
  }
  return finish();
}

// ——— Détails réutilisables ———

function bush(p: IsoPainter, x: number, y: number, r = 7, color = '#43a047'): void {
  p.dot(x, y, r * 0.6, r, shade(color, -0.2));
  p.dot(x - 0.03, y - 0.03, r * 0.9, r * 0.75, color);
  p.dot(x - 0.06, y - 0.06, r * 1.15, r * 0.4, shade(color, 0.25));
}

function flowerPots(p: IsoPainter, from: number, to: number, y: number): void {
  const colors = ['#e91e63', '#ffeb3b', '#ff7043', '#ba68c8', '#ffffff'];
  for (let i = 0, x = from; x <= to; x += 0.22, i++) {
    p.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, 7, boxColors('#a1673f', false));
    p.dot(x, y, 11, 5, '#388e3c');
    p.dot(x - 0.02, y - 0.02, 13, 2.6, colors[i % colors.length] ?? '#fff');
  }
}

function cupola(p: IsoPainter, cx: number, cy: number, z: number, wall: string, roof: string, clock = false): void {
  const r = 0.28;
  p.box(cx - r, cy - r, cx + r, cy + r, z, z + 26, boxColors(wall));
  if (clock) {
    const [sx, sy] = p.p(cx, cy + r, z + 14);
    p.ctx.fillStyle = '#fffde7';
    p.ctx.strokeStyle = '#5d4037';
    p.ctx.lineWidth = 1.5;
    p.ctx.beginPath();
    p.ctx.ellipse(sx - 2, sy, 6, 7, 0, 0, Math.PI * 2);
    p.ctx.fill();
    p.ctx.stroke();
    p.ctx.beginPath();
    p.ctx.moveTo(sx - 2, sy);
    p.ctx.lineTo(sx - 2, sy - 5);
    p.ctx.moveTo(sx - 2, sy);
    p.ctx.lineTo(sx + 1, sy + 1);
    p.ctx.stroke();
  }
  p.pyramidRoof(cx - r, cy - r, cx + r, cy + r, z + 26, 22, roof, 0.05);
}

function roofUnits(p: IsoPainter, g: Geo, z: number): void {
  p.box(g.x1 - 0.85, g.y0 + 0.3, g.x1 - 0.35, g.y0 + 0.7, z, z + 12, boxColors('#cfd8dc'));
  p.flat(g.x1 - 0.78, g.y0 + 0.37, g.x1 - 0.42, g.y0 + 0.63, z + 12, '#90a4ae');
  p.box(g.x0 + 0.45, g.y0 + 0.35, g.x0 + 0.6, g.y0 + 0.5, z, z + 16, boxColors('#9e9e9e'));
}

function flagPole(p: IsoPainter, x: number, y: number, z: number, height: number, cloth: string): void {
  p.line([x, y, z], [x, y, z + height], '#9e9e9e', 2);
  const [sx, sy] = p.p(x, y, z + height);
  p.ctx.fillStyle = cloth;
  p.ctx.beginPath();
  p.ctx.moveTo(sx, sy);
  p.ctx.quadraticCurveTo(sx + 10, sy - 3, sx + 20, sy + 2);
  p.ctx.lineTo(sx + 20, sy + 12);
  p.ctx.quadraticCurveTo(sx + 10, sy + 7, sx, sy + 10);
  p.ctx.closePath();
  p.ctx.fill();
}

// ——— Catalogue ———

const SPECS: Record<string, BuildingSpec> = {
  cottage: {
    size: 2,
    lot: '#9ccf63',
    fence: '#ffffff',
    body: { inset: 0.4, h: 40, wall: '#f4ead5', floors: 1 },
    roof: { type: 'gableX', color: '#d64933', h: 36 },
    windows: { glass: GLASS, frame: '#ffffff', perTile: 1.6 },
    door: { side: 'left', at: 0.75, color: '#8d5a3b' },
    chimney: '#a1887f',
    after: (p) => {
      bush(p, 0.35, 1.7, 7);
      bush(p, 1.7, 0.4, 6, '#66bb6a');
    },
  },
  bungalow: {
    size: 2,
    lot: '#a5d46d',
    fence: '#fffaf0',
    body: { inset: 0.35, h: 38, wall: '#ffd75e', floors: 1 },
    roof: { type: 'pyramid', color: '#7b4b3a', h: 30 },
    windows: { glass: GLASS, frame: '#ffffff', perTile: 1.4 },
    door: { side: 'left', at: 0.2, color: '#4e7d3a' },
    after: (p) => {
      flowerPots(p, 0.4, 1.0, 1.82);
      bush(p, 1.75, 0.35, 6);
    },
  },
  townhouse: {
    size: 2,
    lot: '#cfd8dc',
    body: { inset: 0.32, h: 74, wall: '#8ec5f2', floors: 2 },
    roof: { type: 'gableY', color: '#50636e', h: 32 },
    trim: '#ffffff',
    windows: { glass: '#b3e5fc', frame: '#ffffff', perTile: 1.5 },
    door: { side: 'left', at: 0.5, color: '#37474f' },
    chimney: '#90a4ae',
  },
  villa: {
    size: 3,
    lot: '#a8d672',
    fence: '#ffffff',
    body: { inset: 0.55, h: 68, wall: '#fff6e3', floors: 2 },
    roof: { type: 'pyramid', color: '#c8623a', h: 38 },
    windows: { glass: GLASS, frame: '#8d6e63', perTile: 1.3 },
    door: { side: 'left', at: 0.5, color: '#6d4c41' },
    before: (p) => {
      // Piscine.
      p.flat(0.25, 2.35, 1.6, 2.85, 0, '#e0e0e0');
      p.flat(0.32, 2.42, 1.53, 2.78, 0, '#4fc3f7', '#0288d1');
    },
    after: (p) => {
      bush(p, 2.7, 0.4, 8);
      bush(p, 2.75, 1.3, 7, '#66bb6a');
    },
  },
  apartments: {
    size: 3,
    lot: '#cfcac0',
    body: { inset: 0.35, h: 150, wall: '#c9a98f', floors: 5 },
    roof: { type: 'flat', color: '#8a8a8a', h: 6 },
    trim: '#efe6dc',
    windows: { glass: '#a7d8f0', frame: '#f5f5f5', perTile: 1.7 },
    door: { side: 'left', at: 0.5, color: '#455a64', width: 0.4 },
    extraHeight: 26,
    after: (p, g) => {
      const z = g.h + 6;
      p.box(g.x0 + 0.4, g.y0 + 0.4, g.x0 + 0.9, g.y0 + 0.9, z, z + 18, boxColors('#b0bec5'));
      p.box(g.x1 - 0.8, g.y1 - 0.7, g.x1 - 0.35, g.y1 - 0.3, z, z + 10, boxColors('#eceff1'));
    },
  },
  chalet: {
    size: 2,
    lot: '#9ccf63',
    fence: '#8d6e63',
    body: { inset: 0.35, h: 46, wall: '#a8693c', floors: 1 },
    roof: { type: 'gableY', color: '#37474f', h: 44 },
    windows: { glass: '#ffe08a', frame: '#fff3e0', perTile: 1.5 },
    door: { side: 'left', at: 0.5, color: '#4e342e' },
    chimney: '#9e9e9e',
    after: (p) => {
      bush(p, 1.75, 0.35, 7, '#2e7d32');
      // Étoile premium.
      const [sx, sy] = p.p(1, 1, 112);
      const { ctx } = p;
      ctx.fillStyle = '#ffd54f';
      ctx.strokeStyle = '#ff8f00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 9 : 4;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
    extraHeight: 18,
  },

  bakery: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.3, h: 54, wall: '#f7c1d4', floors: 1 },
    roof: { type: 'flat', color: '#a1887f', h: 7 },
    windows: { glass: '#fff1d6', frame: '#ffffff', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.8, color: '#6d4c41' },
    awning: { side: 'left', colors: ['#e84d84', '#ffffff'] },
    sign: { side: 'left', text: 'BOULANGERIE', bg: '#5d4037', fg: '#ffe0b2' },
    extraHeight: 26,
    after: (p, g) => {
      // Gros pain décoratif sur le toit.
      const [sx, sy] = p.p((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.h + 18);
      const { ctx } = p;
      const grad = ctx.createLinearGradient(sx, sy - 10, sx, sy + 10);
      grad.addColorStop(0, '#f6c66b');
      grad.addColorStop(1, '#c9822c');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#8d5a1f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 22, 10, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#fff2c9';
      ctx.lineWidth = 2;
      for (const dx of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.moveTo(sx + dx - 3, sy + 3);
        ctx.lineTo(sx + dx + 4, sy - 5);
        ctx.stroke();
      }
    },
  },
  flower_shop: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.32, h: 50, wall: '#cfe8b0', floors: 1 },
    roof: { type: 'pyramid', color: '#7d5a4a', h: 26 },
    windows: { glass: '#e8f5e9', frame: '#ffffff', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.2, color: '#2e7d32' },
    awning: { side: 'left', colors: ['#3d9a44', '#ffffff'] },
    sign: { side: 'right', text: 'FLEURS', bg: '#2e7d32', fg: '#ffffff' },
    after: (p) => flowerPots(p, 0.75, 1.65, 1.85),
  },
  cafe: {
    size: 2,
    lot: '#e2d6c4',
    body: { inset: 0.42, h: 52, wall: '#d9c6b5', floors: 1 },
    roof: { type: 'flat', color: '#7a5a48', h: 7 },
    windows: { glass: '#ffe9c4', frame: '#4e342e', perTile: 1.5, big: true },
    door: { side: 'right', at: 0.3, color: '#4e342e' },
    awning: { side: 'left', colors: ['#6d4c41', '#f3e9dd'] },
    sign: { side: 'right', text: 'CAFÉ', bg: '#3e2723', fg: '#ffcc80' },
    after: (p) => {
      // Terrasse : tables et parasols.
      for (const [x, y] of [
        [0.55, 1.82],
        [1.2, 1.82],
      ] as const) {
        p.groundEllipse(x, y, 0, 0.1, 'rgba(0,0,0,0.15)');
        p.line([x, y, 0], [x, y, 14], '#5d4037', 2);
        p.groundEllipse(x, y, 14, 0.09, '#fafafa', '#9e9e9e');
        p.line([x, y, 14], [x, y, 34], '#8d6e63', 1.5);
        const [sx, sy] = p.p(x, y, 34);
        p.ctx.fillStyle = x < 1 ? '#e57373' : '#81c784';
        p.ctx.beginPath();
        p.ctx.moveTo(sx - 16, sy + 7);
        p.ctx.quadraticCurveTo(sx, sy - 9, sx + 16, sy + 7);
        p.ctx.closePath();
        p.ctx.fill();
      }
    },
  },
  pizzeria: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.3, h: 52, wall: '#fff1dc', floors: 1 },
    roof: { type: 'gableX', color: '#c0392b', h: 30 },
    windows: { glass: '#ffe0b2', frame: '#2e7d32', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.8, color: '#2e7d32' },
    awning: { side: 'left', colors: ['#e53935', '#ffffff'] },
    sign: { side: 'right', text: 'PIZZA', bg: '#2e7d32', fg: '#ffffff' },
    chimney: '#8d6e63',
  },
  grocery: {
    size: 3,
    lot: '#ded8cc',
    body: { inset: 0.35, h: 60, wall: '#ffe083', floors: 1 },
    roof: { type: 'flat', color: '#9e9e9e', h: 8 },
    windows: { glass: '#e3f2fd', frame: '#1565c0', perTile: 1.4, big: true },
    door: { side: 'left', at: 0.5, color: '#1565c0', width: 0.45 },
    awning: { side: 'left', colors: ['#1e88e5', '#ffffff'] },
    sign: { side: 'right', text: 'ÉPICERIE', bg: '#1565c0', fg: '#ffffff' },
    extraHeight: 20,
    after: (p, g) => {
      roofUnits(p, g, g.h + 8);
      for (const [x, color] of [
        [0.6, '#e53935'],
        [0.95, '#ff9800'],
        [2.15, '#7cb342'],
        [2.5, '#fdd835'],
      ] as const) {
        p.box(x - 0.13, 2.72, x + 0.13, 2.9, 0, 9, boxColors('#a1673f'));
        for (const dx of [-0.07, 0, 0.07]) p.dot(x + dx, 2.8, 11, 3.2, color);
      }
    },
  },
  cinema: {
    size: 3,
    lot: '#cfc8d8',
    body: { inset: 0.35, h: 82, wall: '#7e57c2', floors: 1 },
    roof: { type: 'flat', color: '#4a2a86', h: 8 },
    door: { side: 'left', at: 0.5, color: '#311b92', width: 0.5 },
    extraHeight: 20,
    after: (p, g) => {
      roofUnits(p, g, g.h + 8);
      // Marquise lumineuse.
      p.sign('left', g.x0 + 0.25, g.x1 - 0.25, 44, 64, g.y1 + 0.02, '#ffca28', '#4a148c', 'CINÉMA');
      for (let i = 0; i <= 14; i++) {
        const x = g.x0 + 0.25 + ((g.x1 - g.x0 - 0.5) * i) / 14;
        p.dot(x, g.y1 + 0.03, 66, 1.8, '#fff59d');
        p.dot(x, g.y1 + 0.03, 42, 1.8, '#fff59d');
      }
      // Affiches.
      for (const y of [g.y0 + 0.5, g.y0 + 1.25]) {
        p.rightQuad(y, y + 0.4, 18, 56, g.x1 + 0.01, '#fff8e1');
        p.rightQuad(y + 0.04, y + 0.36, 22, 52, g.x1 + 0.015, y < 1.2 ? '#e53935' : '#29b6f6');
      }
    },
  },

  town_hall: {
    size: 3,
    lot: '#e3ded3',
    body: { inset: 0.42, h: 70, wall: '#f2efe8', floors: 2 },
    roof: { type: 'gableY', color: '#6f8a99', h: 34 },
    trim: '#d7cfc0',
    windows: { glass: '#b3d9ef', frame: '#ffffff', perTile: 1.3 },
    door: { side: 'left', at: 0.5, color: '#6d4c41', width: 0.36 },
    extraHeight: 50,
    after: (p, g) => {
      // Perron et colonnade.
      p.box(g.x0 + 0.2, g.y1, g.x1 - 0.2, g.y1 + 0.3, 0, 4, boxColors('#d6d0c4'));
      p.box(g.x0 + 0.3, g.y1, g.x1 - 0.3, g.y1 + 0.18, 4, 8, boxColors('#e0dacd'));
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const x = g.x0 + 0.3 + ((g.x1 - g.x0 - 0.6) * i) / (cols - 1);
        p.box(x - 0.05, g.y1 + 0.06, x + 0.05, g.y1 + 0.16, 8, g.h - 2, boxColors('#fbfaf6'));
      }
      p.box(g.x0 + 0.22, g.y1, g.x1 - 0.22, g.y1 + 0.2, g.h - 4, g.h + 2, boxColors('#e8e2d6'));
      cupola(p, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.h + 14, '#f2efe8', '#5d7380', true);
      flagPole(p, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.h + 62, 22, '#1e63c6');
    },
  },
  school: {
    size: 3,
    lot: '#d8d2c6',
    body: { inset: 0.4, h: 62, wall: '#c8603e', floors: 2 },
    roof: { type: 'gableX', color: '#4f5f69', h: 32 },
    trim: '#f3ede3',
    windows: { glass: '#cfe8f7', frame: '#ffffff', perTile: 1.4 },
    door: { side: 'left', at: 0.5, color: '#1e4f8c', width: 0.36 },
    sign: { side: 'left', text: 'ÉCOLE', bg: '#ffffff', fg: '#b71c1c' },
    extraHeight: 34,
    after: (p, g) => {
      cupola(p, (g.x0 + g.x1) / 2 + 0.3, (g.y0 + g.y1) / 2, g.h + 10, '#f3ede3', '#4f5f69');
    },
  },
  post_office: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.3, h: 56, wall: '#fff6dc', floors: 1 },
    roof: { type: 'flat', color: '#3f51b5', h: 7 },
    trim: '#1e3a8a',
    windows: { glass: '#e3f2fd', frame: '#1e3a8a', perTile: 1.4, big: true },
    door: { side: 'left', at: 0.8, color: '#1e3a8a' },
    sign: { side: 'left', text: 'POSTE', bg: '#ffd600', fg: '#1a237e' },
    after: (p) => {
      p.box(1.72, 1.72, 1.86, 1.86, 0, 18, boxColors('#ffd600'));
      p.flat(1.72, 1.72, 1.86, 1.86, 18, '#1e3a8a');
    },
  },
  police: {
    size: 3,
    lot: '#d5d9de',
    body: { inset: 0.4, h: 64, wall: '#e8f1fb', floors: 2 },
    roof: { type: 'flat', color: '#1e5aa8', h: 8 },
    trim: '#1e5aa8',
    windows: { glass: '#bbdefb', frame: '#0d47a1', perTile: 1.4 },
    door: { side: 'left', at: 0.5, color: '#0d47a1', width: 0.4 },
    sign: { side: 'left', text: 'POLICE', bg: '#0d47a1', fg: '#ffffff' },
    extraHeight: 16,
    after: (p, g) => {
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2;
      p.box(cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12, g.h + 8, g.h + 16, boxColors('#37474f'));
      p.dot(cx, cy, g.h + 22, 6, '#42a5f5', '#0d47a1');
      p.dot(cx - 0.02, cy - 0.02, g.h + 24, 2.5, '#e3f2fd');
    },
  },
  fire_station: {
    size: 3,
    lot: '#d8d2c6',
    body: { inset: 0.35, h: 64, wall: '#d6453d', floors: 2 },
    roof: { type: 'flat', color: '#4a4a4a', h: 8 },
    trim: '#f5f5f5',
    windows: { glass: '#ffe0b2', frame: '#ffffff', perTile: 1.3 },
    door: { side: 'left', at: 0.15, color: '#5d4037' },
    sign: { side: 'left', text: 'POMPIERS', bg: '#ffffff', fg: '#c62828' },
    extraHeight: 40,
    after: (p, g) => {
      // Portes de garage.
      for (const y of [g.y0 + 0.2, g.y0 + 1.15]) {
        p.rightQuad(y, y + 0.8, 0, 30, g.x1 + 0.01, '#eceff1', '#9e9e9e');
        for (let z = 5; z < 30; z += 5) p.line([g.x1 + 0.012, y, z], [g.x1 + 0.012, y + 0.8, z], '#b0bec5', 1);
      }
      // Tour d'exercice.
      p.box(g.x0 + 0.12, g.y0 + 0.12, g.x0 + 0.55, g.y0 + 0.55, g.h + 8, g.h + 40, boxColors('#d6453d'));
      p.window('left', g.x0 + 0.24, g.x0 + 0.43, g.h + 22, g.h + 34, g.y0 + 0.55, '#ffe0b2', '#ffffff');
      p.pyramidRoof(g.x0 + 0.12, g.y0 + 0.12, g.x0 + 0.55, g.y0 + 0.55, g.h + 40, 16, '#424242', 0.04);
    },
  },

  barn: {
    size: 2,
    lot: '#c9b08a',
    body: { inset: 0.25, h: 50, wall: '#c0392b', floors: 1 },
    roof: { type: 'gableY', color: '#5b4a42', h: 38 },
    trim: '#ffffff',
    extraHeight: 4,
    after: (p, g) => {
      // Grande porte de grange avec croix blanche.
      const a = 0.62;
      const b = 1.38;
      p.leftQuad(a - 0.04, b + 0.04, 0, 36, g.y1, '#ffffff');
      p.leftQuad(a, b, 0, 33, g.y1, '#9e2a20');
      p.line([a, g.y1, 1], [b, g.y1, 32], '#ffffff', 2.5);
      p.line([b, g.y1, 1], [a, g.y1, 32], '#ffffff', 2.5);
      p.line([(a + b) / 2, g.y1, 0], [(a + b) / 2, g.y1, 33], '#ffffff', 2);
      // Lucarne du fenil.
      p.leftQuad(0.85, 1.15, 52, 66, g.y1, '#ffffff');
      p.leftQuad(0.89, 1.11, 54, 64, g.y1, '#5b4a42');
      // Bottes de foin.
      p.box(1.79, 1.15, 1.95, 1.5, 0, 12, boxColors('#e8c547'));
    },
  },
  warehouse: {
    size: 3,
    lot: '#cfcac0',
    body: { inset: 0.3, h: 58, wall: '#90a4ae', floors: 1 },
    roof: { type: 'gableX', color: '#607d8b', h: 22 },
    trim: '#cfd8dc',
    sign: { side: 'left', text: 'ENTREPÔT', bg: '#37474f', fg: '#ffffff' },
    after: (p, g) => {
      for (const x of [g.x0 + 0.25, g.x0 + 1.3]) {
        p.leftQuad(x, x + 0.8, 0, 34, g.y1 + 0.01, '#eceff1', '#78909c');
        for (let z = 4; z < 34; z += 4) p.line([x, g.y1 + 0.012, z], [x + 0.8, g.y1 + 0.012, z], '#b0bec5', 1);
      }
    },
  },
};

export function buildingArt(defId: string): ArtPiece | null {
  const spec = SPECS[defId];
  return spec ? drawBuilding(spec) : null;
}

export const BUILDING_ART_IDS = Object.keys(SPECS);
