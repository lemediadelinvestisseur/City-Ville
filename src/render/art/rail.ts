import { shade } from './color';
import { boxColors, isoCanvas, type ArtPiece } from './IsoPainter';

const BALLAST = '#9a948a';
const SLEEPER = '#6d4c33';
const STEEL = '#c9ced6';

/** Tronçon de voie ferrée orienté nord-sud (le long de l'axe y) ; `end` : butoir au sud. */
export function railTile(end: boolean): ArtPiece {
  const { painter, finish } = isoCanvas(1, 1, end ? 22 : 4, 2);
  painter.flat(0.18, -0.01, 0.82, 1.01, 0, shade(BALLAST, -0.12));
  painter.flat(0.22, -0.01, 0.78, 1.01, 0.5, BALLAST);
  for (let i = 0; i < 4; i++) {
    const y = 0.08 + i * 0.25;
    painter.box(0.26, y, 0.74, y + 0.09, 0.5, 2, boxColors(SLEEPER, false));
  }
  for (const x of [0.36, 0.64]) painter.box(x - 0.025, -0.01, x + 0.025, 1.01, 2, 4, boxColors(STEEL, false));
  if (end) {
    // Butoir rouge et blanc en fin de ligne.
    painter.box(0.3, 0.8, 0.7, 0.9, 0, 12, boxColors('#c62828'));
    painter.box(0.3, 0.8, 0.7, 0.9, 12, 16, boxColors('#f5f5f5'));
  }
  return finish();
}

/** Train à quai : locomotive au nord puis deux wagons, sur trois cases de voie. */
export function trainArt(): ArtPiece {
  const { painter, finish } = isoCanvas(1, 3, 44, 4);
  painter.shadow(0.25, 0.05, 0.75, 2.95);
  const car = (y0: number, y1: number, color: string, roof: string) => {
    painter.box(0.27, y0, 0.73, y1, 3, 7, boxColors('#37474f'));
    painter.box(0.25, y0 + 0.02, 0.75, y1 - 0.02, 7, 24, boxColors(color));
    painter.box(0.23, y0, 0.77, y1, 24, 27, boxColors(roof));
    for (let y = y0 + 0.14; y < y1 - 0.12; y += 0.24) {
      painter.leftQuad(0.3, 0.7, 13, 19, y, '#bbdefb');
      painter.rightQuad(y, y + 0.14, 13, 19, 0.75, '#90caf9');
    }
  };
  // Locomotive : nez arrondi vers le nord, cabine et phares.
  painter.box(0.27, 0.05, 0.73, 0.95, 3, 7, boxColors('#37474f'));
  painter.box(0.25, 0.2, 0.75, 0.95, 7, 30, boxColors('#e53935'));
  painter.box(0.27, 0.05, 0.73, 0.2, 7, 20, boxColors('#c62828'));
  painter.box(0.23, 0.2, 0.77, 0.95, 30, 33, boxColors('#424242'));
  painter.rightQuad(0.3, 0.6, 18, 26, 0.75, '#bbdefb');
  painter.box(0.45, 0.4, 0.55, 0.5, 33, 40, boxColors('#424242'));
  painter.dot(0.38, 0.05, 12, 1.8, '#fff59d');
  painter.dot(0.62, 0.05, 12, 1.8, '#fff59d');
  // Wagons, du plus éloigné au plus proche.
  car(1.05, 1.95, '#1e88e5', '#cfd8dc');
  car(2.05, 2.95, '#1e88e5', '#cfd8dc');
  return finish();
}
