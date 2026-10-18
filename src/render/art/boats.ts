import { shade } from './color';
import { boxColors, isoCanvas, type ArtPiece, type IsoPainter } from './IsoPainter';

/** Coque orientée selon l'axe x (proue vers l'est), centrée sur (cx, cy). */
function hull(p: IsoPainter, cx: number, cy: number, len: number, wid: number, h: number, color: string): void {
  const x0 = cx - len / 2;
  const x1 = cx + len / 2;
  const y0 = cy - wid / 2;
  const y1 = cy + wid / 2;
  const bow = x1 + wid * 0.6;
  // Flanc avant (visible) puis pont.
  p.fill(
    [
      [x0, y1, 0],
      [x1, y1, 0],
      [bow, cy, 2],
      [bow, cy, h + 3],
      [x1, y1, h],
      [x0, y1, h],
    ],
    color,
    shade(color, -0.4),
  );
  p.fill(
    [
      [x0, y0, 0],
      [x0, y1, 0],
      [x0, y1, h],
      [x0, y0, h],
    ],
    shade(color, -0.2),
    shade(color, -0.4),
  );
  p.fill(
    [
      [x0, y0, h],
      [x1, y0, h],
      [bow, cy, h + 3],
      [x1, y1, h],
      [x0, y1, h],
    ],
    '#d7a86e',
    '#8d5a30',
  );
}

function wake(p: IsoPainter, cx: number, cy: number, r: number): void {
  p.groundEllipse(cx, cy, 0, r, 'rgba(255,255,255,0.35)');
}

/** Barque (ponton). */
function rowboat(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 30);
  wake(p, 0.5, 0.5, 0.42);
  hull(p, 0.45, 0.5, 0.5, 0.3, 9, '#e53935');
  p.line([0.35, 0.42, 9], [0.65, 0.62, 16], '#6d4c41', 2);
  p.box(0.42, 0.45, 0.5, 0.55, 9, 14, boxColors('#1e88e5'));
  return finish();
}

/** Chalutier (port de pêche). */
function trawler(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 64);
  wake(p, 0.5, 0.5, 0.5);
  hull(p, 0.42, 0.5, 0.62, 0.38, 14, '#1565c0');
  p.box(0.22, 0.38, 0.45, 0.62, 14, 34, boxColors('#ffffff'));
  p.flat(0.22, 0.38, 0.45, 0.62, 34, '#e53935');
  p.line([0.62, 0.5, 14], [0.62, 0.5, 58], '#616161', 2.5);
  p.line([0.62, 0.5, 56], [0.85, 0.5, 20], '#9e9e9e', 1.2);
  p.line([0.62, 0.5, 56], [0.3, 0.5, 34], '#9e9e9e', 1.2);
  return finish();
}

/** Navire-usine (port industriel). */
function factoryShip(): ArtPiece {
  const { painter: p, finish } = isoCanvas(1, 1, 80);
  wake(p, 0.5, 0.5, 0.58);
  hull(p, 0.4, 0.5, 0.78, 0.44, 18, '#37474f');
  p.box(0.08, 0.34, 0.36, 0.66, 18, 46, boxColors('#eceff1'));
  p.box(0.12, 0.38, 0.32, 0.62, 46, 58, boxColors('#eceff1'));
  p.box(0.2, 0.46, 0.27, 0.54, 58, 72, boxColors('#e53935'));
  p.box(0.48, 0.38, 0.62, 0.62, 18, 26, boxColors('#fb8c00'));
  p.box(0.62, 0.38, 0.76, 0.62, 18, 26, boxColors('#43a047'));
  return finish();
}

export const BOAT_TIERS = [1, 2, 3] as const;

export function boatArt(tier: number): ArtPiece {
  if (tier >= 3) return factoryShip();
  if (tier === 2) return trawler();
  return rowboat();
}
