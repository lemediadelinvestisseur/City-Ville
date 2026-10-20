import { shade } from './color';
import { boxColors, isoCanvas, type ArtPiece, type IsoPainter, type V3 } from './IsoPainter';
import { HEROES } from './heroes';
import { drawCottage, layered, roofProp, type RoofProp } from './toon';
import { signText } from '@/i18n/content';

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
  /** Objet géant posé sur le toit (enseigne ludique des commerces). */
  prop?: { kind: RoofProp; scale?: number; x?: number; y?: number };
  /** Dessin entièrement personnalisé : sol (sans contour) puis objets (contourés). */
  custom?: (ground: IsoPainter, p: IsoPainter) => void;
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
  const propHeight = spec.prop ? 64 * (spec.prop.scale ?? 1) : 0;
  const height = spec.body.h + spec.roof.h + Math.max(spec.extraHeight ?? 0, propHeight) + 12;
  // Deux calques : le sol de la parcelle, puis les volumes, qui reçoivent un contour épais.
  const ground = isoCanvas(size, size, height);
  const { painter: p, finish } = isoCanvas(size, size, height);
  const gp = ground.painter;
  if (spec.custom) {
    spec.custom(gp, p);
    return layered(ground.finish(), finish());
  }

  if (spec.lot) {
    gp.flat(0.02, 0.02, size - 0.02, size - 0.02, 0, spec.lot, shade(spec.lot, -0.18));
  }
  gp.shadow(g.x0, g.y0, g.x1, g.y1, 0.28);
  if (spec.fence) {
    p.fence([0.06, 0.06], [size - 0.06, 0.06], spec.fence);
    p.fence([0.06, 0.06], [0.06, size - 0.06], spec.fence);
  }
  spec.before?.(p, g);
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
    const { side, bg, fg } = spec.sign;
    const text = signText(spec.sign.text);
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

  if (spec.prop) {
    const { kind, scale = 1 } = spec.prop;
    const x = spec.prop.x ?? (g.x0 + g.x1) / 2;
    const y = spec.prop.y ?? (g.y0 + g.y1) / 2;
    // Sur un toit en pente, l'objet est posé sur un mât au-dessus du faîtage.
    const z = type === 'flat' ? roofZ + h : roofZ + h * 0.75;
    if (type !== 'flat') p.line([x, y, roofZ], [x, y, z + 4], '#5d4037', 3);
    roofProp(p, kind, x, y, z, scale);
  }

  if (spec.fence) {
    // Clôture avant, avec un portillon face à la porte.
    p.fence([0.06, size - 0.06], [size * 0.42, size - 0.06], spec.fence);
    p.fence([size * 0.62, size - 0.06], [size - 0.06, size - 0.06], spec.fence);
    p.fence([size - 0.06, 0.06], [size - 0.06, size - 0.06], spec.fence);
  }
  return layered(ground.finish(), finish());
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
    custom: drawCottage,
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
    prop: { kind: 'cupcake' },
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
    prop: { kind: 'flower', scale: 0.9 },
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
    prop: { kind: 'coffee', scale: 0.9 },
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
    prop: { kind: 'pizza', scale: 0.9 },
  },
  grocery: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.25, h: 58, wall: '#ffe083', floors: 1 },
    roof: { type: 'flat', color: '#9e9e9e', h: 8 },
    windows: { glass: '#e3f2fd', frame: '#1565c0', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.5, color: '#1565c0', width: 0.36 },
    awning: { side: 'left', colors: ['#1e88e5', '#ffffff'] },
    sign: { side: 'right', text: 'ÉPICERIE', bg: '#1565c0', fg: '#ffffff' },
    prop: { kind: 'apple', scale: 0.9 },
    before: (p) => {
      // Étals de fruits devant la vitrine.
      for (const [x, color] of [
        [0.4, '#e53935'],
        [0.66, '#ff9800'],
        [1.34, '#7cb342'],
        [1.6, '#fdd835'],
      ] as const) {
        p.box(x - 0.11, 1.8, x + 0.11, 1.95, 0, 9, boxColors('#a1673f'));
        for (const dx of [-0.06, 0, 0.06]) p.dot(x + dx, 1.87, 11, 3, color);
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
      p.sign('left', g.x0 + 0.25, g.x1 - 0.25, 44, 64, g.y1 + 0.02, '#ffca28', '#4a148c', signText('CINÉMA'));
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
    prop: { kind: 'popcorn', scale: 1.1, x: 1.1, y: 1.6 },
  },

  town_hall: {
    size: 4,
    lot: '#e3ded3',
    body: { inset: 0.55, h: 84, wall: '#f2efe8', floors: 2 },
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
    size: 4,
    lot: '#d8d2c6',
    body: { inset: 0.45, h: 74, wall: '#c8603e', floors: 2 },
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
  // ——— Habitations (suite) ———
  residence: {
    size: 3,
    lot: '#cfd8dc',
    body: { inset: 0.35, h: 120, wall: '#f3d9b1', floors: 4 },
    roof: { type: 'gableX', color: '#8d4a36', h: 30 },
    trim: '#ffffff',
    windows: { glass: '#b3e5fc', frame: '#ffffff', perTile: 1.5 },
    door: { side: 'left', at: 0.5, color: '#5d4037', width: 0.4 },
    after: (p) => bush(p, 2.75, 0.4, 8),
  },
  mansion: {
    size: 3,
    lot: '#a8d672',
    fence: '#424242',
    body: { inset: 0.5, h: 80, wall: '#fdfaf2', floors: 2 },
    roof: { type: 'pyramid', color: '#455a64', h: 42 },
    trim: '#d7ccc8',
    windows: { glass: '#cfe8f7', frame: '#ffffff', perTile: 1.4 },
    door: { side: 'left', at: 0.5, color: '#3e2723', width: 0.36 },
    chimney: '#bcaaa4',
    after: (p, g) => {
      for (const x of [g.x0 + 0.5, g.x1 - 0.5])
        p.box(x - 0.06, g.y1 + 0.05, x + 0.06, g.y1 + 0.17, 0, 44, boxColors('#ffffff'));
      p.box(g.x0 + 0.35, g.y1, g.x1 - 0.35, g.y1 + 0.24, 44, 50, boxColors('#f5f0e6'));
      bush(p, 0.4, 2.6, 8, '#2e7d32');
      bush(p, 2.6, 0.4, 8, '#2e7d32');
    },
  },
  lofts: {
    size: 2,
    lot: '#cfcac0',
    body: { inset: 0.25, h: 100, wall: '#b5523b', floors: 3 },
    roof: { type: 'flat', color: '#5d4037', h: 6 },
    trim: '#3e2723',
    windows: { glass: '#a7d8f0', frame: '#263238', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.5, color: '#263238' },
    extraHeight: 18,
    after: (p, g) => p.box(g.x0 + 0.3, g.y0 + 0.3, g.x0 + 0.7, g.y0 + 0.7, g.h + 6, g.h + 22, boxColors('#8d6e63')),
  },
  tower: {
    size: 3,
    lot: '#cfd8dc',
    body: { inset: 0.5, h: 210, wall: '#90caf9', floors: 8 },
    roof: { type: 'flat', color: '#546e7a', h: 8 },
    trim: '#e3f2fd',
    windows: { glass: '#e1f5fe', frame: '#1565c0', perTile: 1.6 },
    door: { side: 'left', at: 0.5, color: '#0d47a1', width: 0.4 },
    extraHeight: 20,
    after: (p, g) => roofUnits(p, g, g.h + 8),
  },
  skyscraper: {
    size: 4,
    lot: '#b0bec5',
    body: { inset: 0.6, h: 390, wall: '#5c7a99', floors: 15 },
    roof: { type: 'flat', color: '#37474f', h: 10 },
    trim: '#cfd8dc',
    windows: { glass: '#b3e5fc', frame: '#263238', perTile: 1.8 },
    door: { side: 'left', at: 0.5, color: '#263238', width: 0.45 },
    extraHeight: 70,
    after: (p, g) => {
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2;
      p.box(cx - 0.4, cy - 0.4, cx + 0.4, cy + 0.4, g.h + 10, g.h + 34, boxColors('#455a64'));
      p.line([cx, cy, g.h + 34], [cx, cy, g.h + 80], '#cfd8dc', 3);
      p.dot(cx, cy, g.h + 82, 3.5, '#ff5252');
    },
  },
  manor: {
    size: 4,
    lot: '#9ccf63',
    fence: '#f5f5f5',
    body: { inset: 0.7, h: 86, wall: '#f6ecd8', floors: 2 },
    roof: { type: 'gableX', color: '#37474f', h: 48 },
    trim: '#ffffff',
    windows: { glass: '#cfe8f7', frame: '#ffffff', perTile: 1.3 },
    door: { side: 'left', at: 0.5, color: '#4e342e', width: 0.4 },
    chimney: '#a1887f',
    before: (p) => {
      p.flat(1.7, 3.3, 2.3, 3.95, 0, '#e0d6c2');
      p.flat(0.3, 3.35, 1.3, 3.85, 0, '#4fc3f7', '#0288d1');
    },
    after: (p) => {
      bush(p, 3.6, 0.5, 9, '#2e7d32');
      bush(p, 3.6, 1.5, 8);
      bush(p, 3.55, 2.6, 9, '#2e7d32');
      flowerPots(p, 2.6, 3.5, 3.7);
    },
  },

  // ——— Commerces (suite) ———
  fashion: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.3, h: 56, wall: '#f8bbd0', floors: 1 },
    roof: { type: 'flat', color: '#ad1457', h: 7 },
    windows: { glass: '#fce4ec', frame: '#ffffff', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.8, color: '#880e4f' },
    awning: { side: 'left', colors: ['#212121', '#ffffff'] },
    sign: { side: 'right', text: 'MODE', bg: '#212121', fg: '#f8bbd0' },
    prop: { kind: 'handbag', scale: 0.9 },
  },
  bookshop: {
    size: 2,
    lot: '#ded8cc',
    body: { inset: 0.3, h: 54, wall: '#a5d6a7', floors: 1 },
    roof: { type: 'gableX', color: '#33691e', h: 28 },
    windows: { glass: '#fff8e1', frame: '#1b5e20', perTile: 1.6, big: true },
    door: { side: 'left', at: 0.2, color: '#1b5e20' },
    awning: { side: 'left', colors: ['#2e7d32', '#fff8e1'] },
    sign: { side: 'right', text: 'LIVRES', bg: '#1b5e20', fg: '#fff8e1' },
    prop: { kind: 'books', scale: 0.85 },
  },
  restaurant: {
    size: 3,
    lot: '#e2d6c4',
    body: { inset: 0.4, h: 60, wall: '#fff3e0', floors: 1 },
    roof: { type: 'gableY', color: '#8d2a1f', h: 32 },
    windows: { glass: '#ffe0b2', frame: '#5d4037', perTile: 1.4, big: true },
    door: { side: 'left', at: 0.5, color: '#5d4037', width: 0.36 },
    awning: { side: 'left', colors: ['#8d2a1f', '#fff3e0'] },
    sign: { side: 'right', text: 'RESTAURANT', bg: '#3e2723', fg: '#ffcc80' },
    chimney: '#8d6e63',
    after: (p) => {
      for (const x of [0.6, 1.5, 2.4]) {
        p.groundEllipse(x, 2.8, 0, 0.12, 'rgba(0,0,0,0.15)');
        p.line([x, 2.8, 0], [x, 2.8, 12], '#5d4037', 2);
        p.groundEllipse(x, 2.8, 12, 0.11, '#ffffff', '#bdbdbd');
      }
    },
    prop: { kind: 'burger', scale: 1.1 },
  },
  supermarket: {
    size: 4,
    lot: '#cfcac0',
    body: { inset: 0.3, h: 70, wall: '#eceff1', floors: 1 },
    roof: { type: 'flat', color: '#9e9e9e', h: 8 },
    trim: '#e53935',
    windows: { glass: '#e3f2fd', frame: '#c62828', perTile: 1.5, big: true },
    door: { side: 'left', at: 0.5, color: '#c62828', width: 0.5 },
    sign: { side: 'left', text: 'SUPERMARCHÉ', bg: '#c62828', fg: '#ffffff' },
    extraHeight: 20,
    after: (p, g) => roofUnits(p, g, g.h + 8),
  },
  hotel: {
    size: 3,
    lot: '#d8d2c6',
    body: { inset: 0.4, h: 170, wall: '#ffe0b2', floors: 6 },
    roof: { type: 'flat', color: '#6d4c41', h: 8 },
    trim: '#ffffff',
    windows: { glass: '#b3e5fc', frame: '#ffffff', perTile: 1.5 },
    door: { side: 'left', at: 0.5, color: '#4e342e', width: 0.42 },
    extraHeight: 34,
    after: (p, g) => {
      p.sign(
        'left',
        g.x0 + 0.3,
        g.x1 - 0.3,
        g.h + 10,
        g.h + 30,
        (g.y0 + g.y1) / 2,
        '#4e342e',
        '#ffd54f',
        signText('HÔTEL ★★★'),
      );
      p.box(g.x0 + 0.5, g.y1, g.x1 - 0.5, g.y1 + 0.35, 30, 34, boxColors('#c62828'));
    },
  },
  mall: {
    size: 5,
    lot: '#cfcac0',
    body: { inset: 0.35, h: 96, wall: '#e1f5fe', floors: 2 },
    roof: { type: 'flat', color: '#90a4ae', h: 8 },
    trim: '#0288d1',
    windows: { glass: '#b3e5fc', frame: '#0277bd', perTile: 1.5, big: true },
    door: { side: 'left', at: 0.5, color: '#01579b', width: 0.6 },
    sign: { side: 'left', text: 'CENTRE COMMERCIAL', bg: '#0277bd', fg: '#ffffff' },
    extraHeight: 34,
    after: (p, g) => {
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2;
      p.pyramidRoof(cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7, g.h + 8, 28, '#81d4fa', 0.02);
      roofUnits(p, g, g.h + 8);
    },
  },
  bowling: {
    size: 3,
    lot: '#d1c4e9',
    body: { inset: 0.35, h: 62, wall: '#5e35b1', floors: 1 },
    roof: { type: 'flat', color: '#311b92', h: 8 },
    door: { side: 'left', at: 0.5, color: '#1a0f4a', width: 0.45 },
    sign: { side: 'right', text: 'BOWLING', bg: '#ffeb3b', fg: '#311b92' },
    extraHeight: 50,
    after: (p, g) => {
      // Quille géante sur le toit.
      const [sx, sy] = p.p((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.h + 8);
      const { ctx } = p;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#9e9e9e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - 8, sy);
      ctx.quadraticCurveTo(sx - 14, sy - 22, sx - 5, sy - 30);
      ctx.quadraticCurveTo(sx - 8, sy - 44, sx, sy - 46);
      ctx.quadraticCurveTo(sx + 8, sy - 44, sx + 5, sy - 30);
      ctx.quadraticCurveTo(sx + 14, sy - 22, sx + 8, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e53935';
      ctx.fillRect(sx - 5, sy - 33, 10, 3);
    },
  },
  amusement_park: {
    size: 5,
    lot: '#c5e1a5',
    fence: '#ffffff',
    body: { inset: 1.8, h: 40, wall: '#ffcc80', floors: 1 },
    roof: { type: 'pyramid', color: '#e53935', h: 30 },
    windows: { glass: '#fff8e1', frame: '#ffffff', perTile: 1.2 },
    door: { side: 'left', at: 0.5, color: '#bf360c' },
    extraHeight: 110,
    before: (p) => {
      // Grande roue à l'arrière.
      const [sx, sy] = p.p(1.1, 1.1, 80);
      const { ctx } = p;
      ctx.strokeStyle = '#9e9e9e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx - 20, sy + 80);
      ctx.lineTo(sx, sy);
      ctx.lineTo(sx + 20, sy + 80);
      ctx.stroke();
      ctx.strokeStyle = '#1e88e5';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 56, 0, Math.PI * 2);
      ctx.stroke();
      const colors = ['#e53935', '#fdd835', '#43a047', '#8e24aa', '#fb8c00', '#00acc1'];
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.strokeStyle = 'rgba(30,136,229,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * 56, sy + Math.sin(a) * 56);
        ctx.stroke();
        ctx.fillStyle = colors[i % colors.length] ?? '#fff';
        ctx.fillRect(sx + Math.cos(a) * 56 - 5, sy + Math.sin(a) * 56 - 2, 10, 9);
      }
    },
    after: (p) => {
      // Manège.
      p.groundEllipse(3.9, 3.9, 0, 0.6, '#fff59d', '#f9a825');
      p.line([3.9, 3.9, 0], [3.9, 3.9, 32], '#fdd835', 3);
      const [sx, sy] = p.p(3.9, 3.9, 32);
      p.ctx.fillStyle = '#ec407a';
      p.ctx.beginPath();
      p.ctx.moveTo(sx - 30, sy + 12);
      p.ctx.lineTo(sx, sy - 12);
      p.ctx.lineTo(sx + 30, sy + 12);
      p.ctx.closePath();
      p.ctx.fill();
      // Montagnes russes le long du côté droit : rail rouge sur piliers.
      const track: V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        track.push([4.45, 0.5 + t * 3.0, 14 + 34 * Math.abs(Math.sin(t * Math.PI * 2.2))]);
      }
      for (let i = 0; i < track.length; i += 3) {
        const [x, y, z] = track[i]!;
        p.line([x, y, 0], [x, y, z], '#90a4ae', 2);
      }
      for (let i = 1; i < track.length; i++) p.line(track[i - 1]!, track[i]!, '#e53935', 4);
      // Stands de barbe à papa et ballons.
      for (const [x, y, color] of [
        [1.2, 4.3, '#f48fb1'],
        [2.0, 4.4, '#4fc3f7'],
      ] as const) {
        p.box(x - 0.15, y - 0.15, x + 0.15, y + 0.15, 0, 16, boxColors(color));
        p.pyramidRoof(x - 0.15, y - 0.15, x + 0.15, y + 0.15, 16, 12, '#ffffff', 0.05);
      }
      for (const [dx, color] of [
        [0, '#e53935'],
        [6, '#fdd835'],
        [-6, '#43a047'],
      ] as const) {
        const [sx, sy] = p.p(2.6, 4.4, 30);
        p.ctx.strokeStyle = '#757575';
        p.ctx.lineWidth = 1;
        p.ctx.beginPath();
        p.ctx.moveTo(sx, sy + 30);
        p.ctx.lineTo(sx + dx, sy);
        p.ctx.stroke();
        p.ctx.fillStyle = color;
        p.ctx.beginPath();
        p.ctx.ellipse(sx + dx, sy - 5, 5, 6.5, 0, 0, Math.PI * 2);
        p.ctx.fill();
      }
      bush(p, 0.4, 4.6, 8);
      bush(p, 4.6, 0.4, 8);
    },
  },
  stadium: {
    size: 6,
    lot: '#cfcac0',
    body: { inset: 0.2, h: 70, wall: '#eceff1', floors: 2 },
    roof: { type: 'flat', color: '#b0bec5', h: 6 },
    trim: '#1e88e5',
    door: { side: 'left', at: 0.5, color: '#1565c0', width: 0.5 },
    extraHeight: 40,
    after: (p, g) => {
      // Pelouse et tribunes vues d'en haut.
      p.flat(g.x0 + 0.35, g.y0 + 0.35, g.x1 - 0.35, g.y1 - 0.35, g.h + 6, '#e53935');
      p.flat(g.x0 + 0.7, g.y0 + 0.7, g.x1 - 0.7, g.y1 - 0.7, g.h + 6, '#43a047', '#ffffff');
      p.line([(g.x0 + g.x1) / 2, g.y0 + 0.7, g.h + 6], [(g.x0 + g.x1) / 2, g.y1 - 0.7, g.h + 6], '#ffffff', 1.5);
      for (const [x, y] of [
        [g.x0 + 0.15, g.y0 + 0.15],
        [g.x1 - 0.15, g.y0 + 0.15],
        [g.x0 + 0.15, g.y1 - 0.15],
        [g.x1 - 0.15, g.y1 - 0.15],
      ] as const) {
        p.line([x, y, g.h], [x, y, g.h + 40], '#9e9e9e', 2.5);
        p.box(x - 0.15, y - 0.08, x + 0.15, y + 0.08, g.h + 40, g.h + 48, boxColors('#fffde7'));
      }
    },
  },

  // ——— Services (suite) ———
  library: {
    size: 3,
    lot: '#e3ded3',
    body: { inset: 0.4, h: 72, wall: '#efe6d2', floors: 2 },
    roof: { type: 'gableY', color: '#6d4c41', h: 28 },
    windows: { glass: '#fff8e1', frame: '#8d6e63', perTile: 1.4 },
    door: { side: 'left', at: 0.5, color: '#5d4037' },
    sign: { side: 'left', text: 'BIBLIOTHÈQUE', bg: '#5d4037', fg: '#fff8e1' },
  },
  hospital: {
    size: 4,
    lot: '#e0e0e0',
    body: { inset: 0.35, h: 150, wall: '#fafafa', floors: 5 },
    roof: { type: 'flat', color: '#b0bec5', h: 8 },
    trim: '#4caf50',
    windows: { glass: '#b2ebf2', frame: '#ffffff', perTile: 1.6 },
    door: { side: 'left', at: 0.5, color: '#00796b', width: 0.45 },
    extraHeight: 24,
    after: (p, g) => {
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2;
      p.flat(cx - 0.45, cy - 0.45, cx + 0.45, cy + 0.45, g.h + 8, '#eceff1', '#9e9e9e');
      p.flat(cx - 0.1, cy - 0.32, cx + 0.1, cy + 0.32, g.h + 8, '#e53935');
      p.flat(cx - 0.32, cy - 0.1, cx + 0.32, cy + 0.1, g.h + 8, '#e53935');
      p.leftQuad(g.x0 + 0.9, g.x1 - 0.9, g.h - 26, g.h - 6, g.y1 + 0.01, '#e53935');
    },
  },
  train_station: {
    size: 3,
    lot: '#d7ccc8',
    body: { inset: 0.35, h: 66, wall: '#d7a86e', floors: 1 },
    roof: { type: 'gableX', color: '#4e342e', h: 36 },
    windows: { glass: '#fff8e1', frame: '#ffffff', perTile: 1.3, big: true },
    door: { side: 'left', at: 0.5, color: '#3e2723', width: 0.4 },
    sign: { side: 'left', text: 'GARE', bg: '#1a237e', fg: '#ffffff' },
    extraHeight: 50,
    after: (p, g) => {
      cupola(p, g.x1 - 0.5, g.y0 + 0.5, g.h + 6, '#d7a86e', '#4e342e', true);
      // Rails le long du bâtiment.
      for (const y of [g.y0 - 0.05, g.y0 - 0.25]) p.line([0.05, y, 0], [2.95, y, 0], '#616161', 2);
    },
  },
  university: {
    size: 5,
    lot: '#a8d672',
    body: { inset: 0.6, h: 110, wall: '#b0412e', floors: 3 },
    roof: { type: 'gableY', color: '#37474f', h: 34 },
    trim: '#f5f0e6',
    windows: { glass: '#cfe8f7', frame: '#ffffff', perTile: 1.4 },
    door: { side: 'left', at: 0.5, color: '#3e2723', width: 0.36 },
    extraHeight: 50,
    after: (p, g) => {
      cupola(p, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.h + 14, '#f5f0e6', '#37474f', true);
      flagPole(p, g.x1 - 0.2, g.y1 - 0.2, 0, 70, '#7b1fa2');
    },
  },
  museum: {
    size: 4,
    lot: '#e8e2d4',
    body: { inset: 0.5, h: 82, wall: '#f5f0e6', floors: 1 },
    roof: { type: 'gableY', color: '#bdb6a8', h: 26 },
    door: { side: 'left', at: 0.5, color: '#5d4037', width: 0.4 },
    sign: { side: 'left', text: 'MUSÉE', bg: '#f5f0e6', fg: '#5d4037' },
    after: (p, g) => {
      const cols = 6;
      for (let i = 0; i < cols; i++) {
        const x = g.x0 + 0.2 + ((g.x1 - g.x0 - 0.4) * i) / (cols - 1);
        p.box(x - 0.05, g.y1 + 0.05, x + 0.05, g.y1 + 0.15, 0, g.h - 4, boxColors('#ffffff'));
      }
      p.box(g.x0 + 0.1, g.y1, g.x1 - 0.1, g.y1 + 0.2, g.h - 6, g.h, boxColors('#ece6d8'));
    },
  },
  convention_center: {
    size: 4,
    lot: '#cfd8dc',
    body: { inset: 0.3, h: 80, wall: '#80cbc4', floors: 2 },
    roof: { type: 'flat', color: '#00695c', h: 8 },
    trim: '#e0f2f1',
    windows: { glass: '#e0f7fa', frame: '#004d40', perTile: 1.8, big: true },
    door: { side: 'left', at: 0.5, color: '#004d40', width: 0.5 },
    sign: { side: 'right', text: 'CONGRÈS', bg: '#004d40', fg: '#ffffff' },
    extraHeight: 20,
    after: (p, g) => roofUnits(p, g, g.h + 8),
  },
  airport: {
    size: 6,
    lot: '#9e9e9e',
    body: { inset: 0.3, h: 64, wall: '#eceff1', floors: 1 },
    roof: { type: 'flat', color: '#cfd8dc', h: 6 },
    trim: '#1565c0',
    windows: { glass: '#b3e5fc', frame: '#1565c0', perTile: 1.8, big: true },
    door: { side: 'left', at: 0.3, color: '#0d47a1', width: 0.5 },
    sign: { side: 'left', text: 'AÉROPORT', bg: '#1565c0', fg: '#ffffff' },
    extraHeight: 90,
    after: (p, g) => {
      // Tour de contrôle.
      const x = g.x1 - 0.7;
      const y = g.y0 + 0.7;
      p.box(x - 0.18, y - 0.18, x + 0.18, y + 0.18, g.h, g.h + 60, boxColors('#eceff1'));
      p.box(x - 0.32, y - 0.32, x + 0.32, y + 0.32, g.h + 60, g.h + 76, boxColors('#4fc3f7'));
      p.flat(x - 0.34, y - 0.34, x + 0.34, y + 0.34, g.h + 78, '#455a64');
      // Petit avion.
      const [sx, sy] = p.p(g.x0 + 1.0, g.y0 + 1.2, g.h + 12);
      const { ctx } = p;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#78909c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 26, 5, -0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy - 2);
      ctx.lineTo(sx + 10, sy - 18);
      ctx.lineTo(sx + 14, sy - 16);
      ctx.lineTo(sx + 6, sy + 2);
      ctx.lineTo(sx + 2, sy + 14);
      ctx.lineTo(sx - 4, sy + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },

  // ——— Stockage (suite) ———
  silo: {
    size: 2,
    lot: '#c9b08a',
    body: { inset: 0.3, h: 40, wall: '#c0392b', floors: 1 },
    roof: { type: 'gableY', color: '#5b4a42', h: 26 },
    trim: '#ffffff',
    extraHeight: 70,
    after: (p) => {
      p.box(1.2, 0.2, 1.8, 0.8, 0, 110, boxColors('#b0bec5'));
      p.pyramidRoof(1.2, 0.2, 1.8, 0.8, 110, 18, '#78909c', 0.02);
      for (let z = 20; z < 110; z += 18) p.leftQuad(1.2, 1.8, z, z + 2, 0.8, '#90a4ae');
    },
  },
  big_warehouse: {
    size: 3,
    lot: '#cfcac0',
    body: { inset: 0.2, h: 70, wall: '#a1887f', floors: 1 },
    roof: { type: 'gableX', color: '#6d4c41', h: 26 },
    trim: '#d7ccc8',
    sign: { side: 'right', text: 'DÉPÔT', bg: '#3e2723', fg: '#ffffff' },
    after: (p, g) => {
      for (const x of [g.x0 + 0.2, g.x0 + 1.1, g.x0 + 2.0]) {
        p.leftQuad(x, x + 0.7, 0, 40, g.y1 + 0.01, '#d7ccc8', '#8d6e63');
        for (let z = 4; z < 40; z += 4) p.line([x, g.y1 + 0.012, z], [x + 0.7, g.y1 + 0.012, z], '#bcaaa4', 1);
      }
    },
  },
  logistics: {
    size: 3,
    lot: '#bdbdbd',
    body: { inset: 0.2, h: 64, wall: '#ffb74d', floors: 1 },
    roof: { type: 'flat', color: '#757575', h: 8 },
    trim: '#e65100',
    sign: { side: 'left', text: 'LOGISTIQUE', bg: '#e65100', fg: '#ffffff' },
    extraHeight: 20,
    after: (p, g) => {
      roofUnits(p, g, g.h + 8);
      for (const y of [g.y0 + 0.2, g.y0 + 1.0, g.y0 + 1.8]) {
        p.rightQuad(y, y + 0.6, 0, 34, g.x1 + 0.01, '#eceff1', '#9e9e9e');
      }
    },
  },

  // ——— Pêche ———
  pier: {
    size: 2,
    lot: null,
    body: { inset: 0.55, h: 34, wall: '#a1673f', floors: 1 },
    roof: { type: 'gableY', color: '#1e88e5', h: 24 },
    windows: { glass: '#fff8e1', frame: '#ffffff', perTile: 1.2 },
    door: { side: 'left', at: 0.3, color: '#5d4037' },
    before: (p) => {
      p.box(0.05, 0.05, 1.95, 1.95, 0, 5, boxColors('#c8914b'));
      for (let x = 0.05; x < 1.95; x += 0.2) p.line([x, 1.95, 5], [x, 0.05, 5], '#a1673f', 1);
    },
    after: (p) => {
      // Casiers et filet.
      p.box(1.6, 1.4, 1.85, 1.65, 5, 14, boxColors('#8d6e63'));
      p.box(0.15, 1.6, 0.4, 1.85, 5, 12, boxColors('#4fc3f7'));
      p.line([1.85, 0.2, 5], [1.85, 0.2, 30], '#6d4c41', 3);
    },
  },
  fishing_port: {
    size: 3,
    lot: '#b0aca4',
    body: { inset: 0.5, h: 54, wall: '#e0e0e0', floors: 1 },
    roof: { type: 'gableX', color: '#1565c0', h: 26 },
    trim: '#1565c0',
    door: { side: 'left', at: 0.3, color: '#0d47a1', width: 0.5 },
    sign: { side: 'right', text: 'CRIÉE', bg: '#0d47a1', fg: '#ffffff' },
    after: (p) => {
      for (const [x, y] of [
        [2.6, 2.6],
        [2.3, 2.75],
        [0.4, 2.7],
      ] as const)
        p.box(x - 0.13, y - 0.13, x + 0.13, y + 0.13, 0, 12, boxColors('#4fc3f7'));
      p.line([2.85, 0.3, 0], [2.85, 0.3, 50], '#9e9e9e', 3);
      p.line([2.85, 0.3, 50], [2.2, 0.3, 46], '#9e9e9e', 2);
    },
  },
  harbor: {
    size: 3,
    lot: '#9e9e9e',
    body: { inset: 0.35, h: 70, wall: '#607d8b', floors: 1 },
    roof: { type: 'gableX', color: '#37474f', h: 22 },
    trim: '#cfd8dc',
    sign: { side: 'left', text: 'PORT', bg: '#263238', fg: '#ffffff' },
    extraHeight: 70,
    after: (p) => {
      // Conteneurs et grue.
      const colors = ['#e53935', '#1e88e5', '#43a047', '#fb8c00'];
      for (let i = 0; i < 4; i++) {
        p.box(0.2 + i * 0.6, 2.7, 0.7 + i * 0.6, 2.95, 0, 16, boxColors(colors[i] ?? '#fff'));
      }
      p.box(2.6, 0.2, 2.75, 0.35, 0, 130, boxColors('#fbc02d'));
      p.box(1.4, 0.2, 2.9, 0.35, 120, 130, boxColors('#fbc02d'));
      p.line([1.5, 0.28, 120], [1.5, 0.28, 90], '#424242', 1.5);
    },
  },
};

export function buildingArt(defId: string): ArtPiece | null {
  const spec = SPECS[defId];
  if (!spec) return null;
  const hero = HEROES[defId];
  if (!hero) return drawBuilding(spec);
  const ground = isoCanvas(spec.size, spec.size, hero.height + 12);
  const objects = isoCanvas(spec.size, spec.size, hero.height + 12);
  hero.draw(ground.painter, objects.painter);
  return layered(ground.finish(), objects.finish());
}

export const BUILDING_ART_IDS = Object.keys(SPECS);
