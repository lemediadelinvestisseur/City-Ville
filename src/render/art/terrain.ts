import { HALF_H, HALF_W, TILE_H, TILE_W } from '../iso';
import { seeded, shade } from './color';
import { createCanvas, isoCanvas, type ArtPiece, type V3 } from './IsoPainter';
import { t } from '@/i18n';

const SIDEWALK = '#d3d6d8';
const SIDEWALK_EDGE = '#a9adb0';
const CURB = '#868b8f';
const ASPHALT = '#4a5059';

/** Tronçon de route selon le masque de connexion (1 : x+1, 2 : y+1, 4 : x−1, 8 : y−1). */
export function roadTile(mask: number): ArtPiece {
  const { painter, finish } = isoCanvas(1, 1, 0, 2);
  const e = 0.015;
  const a = 0.16;
  painter.flat(-e, -e, 1 + e, 1 + e, 0, SIDEWALK_EDGE);
  painter.flat(0.015, 0.015, 0.985, 0.985, 0, SIDEWALK);
  // Chaussée = carré central + bandes vers les côtés connectés ; trottoirs et bordure = la même forme élargie.
  const shapes = (k: number): Array<[number, number, number, number]> => {
    const list: Array<[number, number, number, number]> = [[a - k, a - k, 1 - a + k, 1 - a + k]];
    if (mask & 1) list.push([1 - a, a - k, 1 + e, 1 - a + k]);
    if (mask & 2) list.push([a - k, 1 - a, 1 - a + k, 1 + e]);
    if (mask & 4) list.push([-e, a - k, a, 1 - a + k]);
    if (mask & 8) list.push([a - k, -e, 1 - a + k, a]);
    return list;
  };
  // Les trottoirs se prolongent jusqu'au bord de la case du côté des routes voisines.
  for (const [x0, y0, x1, y1] of shapes(a - 0.015)) painter.flat(x0, y0, x1, y1, 0, SIDEWALK);
  // Joints de dalles du trottoir.
  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    painter.line([t, 0, 0], [t, a, 0], SIDEWALK_EDGE, 1);
    painter.line([t, 1 - a, 0], [t, 1, 0], SIDEWALK_EDGE, 1);
    painter.line([0, t, 0], [a, t, 0], SIDEWALK_EDGE, 1);
    painter.line([1 - a, t, 0], [1, t, 0], SIDEWALK_EDGE, 1);
  }
  ctx.restore();
  for (const [x0, y0, x1, y1] of shapes(0.025)) painter.flat(x0, y0, x1, y1, 0, CURB);
  for (const [x0, y0, x1, y1] of shapes(0)) painter.flat(x0, y0, x1, y1, 0, ASPHALT);
  // Marquage au sol : ligne médiane jaune et passages piétons aux carrefours.
  const ends: Array<[number, number]> = [];
  if (mask & 1) ends.push([1, 0.5]);
  if (mask & 2) ends.push([0.5, 1]);
  if (mask & 4) ends.push([0, 0.5]);
  if (mask & 8) ends.push([0.5, 0]);
  const crossing = ends.length >= 3;
  ctx.save();
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  for (const [ex, ey] of ends) {
    const start: V3 = crossing ? [0.5 + (ex - 0.5) * 0.62, 0.5 + (ey - 0.5) * 0.62, 0] : [0.5, 0.5, 0];
    ctx.beginPath();
    ctx.moveTo(...painter.p(...start));
    ctx.lineTo(...painter.p(ex, ey));
    ctx.stroke();
  }
  ctx.restore();
  if (crossing) {
    for (const [ex, ey] of ends) {
      const along = 0.5 + (ex - 0.5) * 0.5;
      const across = 0.5 + (ey - 0.5) * 0.5;
      for (let i = 0; i < 6; i++) {
        const t = a + 0.04 + i * 0.115;
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
        painter.fill(pts, '#f7f7f2');
      }
    }
  }
  return finish();
}

const SOIL = '#8b6240';

/** Champ labouré 1 × 1. */
export function plotTile(): ArtPiece {
  const { painter, finish } = isoCanvas(1, 1, 6);
  painter.flat(0.02, 0.02, 0.98, 0.98, 0, shade(SOIL, -0.25));
  painter.box(0.05, 0.05, 0.95, 0.95, 0, 3, { top: SOIL, left: shade(SOIL, -0.15), right: shade(SOIL, -0.3) });
  for (let i = 0; i < 3; i++) {
    const y = 0.13 + i * 0.27;
    painter.fill(
      [
        [0.1, y, 3],
        [0.9, y, 3],
        [0.9, y + 0.11, 3],
        [0.1, y + 0.11, 3],
      ],
      shade(SOIL, -0.18),
    );
    painter.fill(
      [
        [0.1, y + 0.11, 3],
        [0.9, y + 0.11, 3],
        [0.9, y + 0.14, 3],
        [0.1, y + 0.14, 3],
      ],
      shade(SOIL, 0.12),
    );
  }
  return finish();
}

type CropStage = 'sprout' | 'growing' | 'ripe';

/** Positions des plants d'un champ, de l'arrière vers l'avant. */
function plantPositions(): Array<[number, number]> {
  const list: Array<[number, number]> = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      list.push([0.2 + col * 0.3, 0.19 + row * 0.27]);
    }
  }
  return list.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
}

const PLANT_SCALE = 0.72;

/** Cultures posées sur un champ (même cadrage que `plotTile`). */
export function cropOverlay(cropId: string, stage: CropStage): ArtPiece {
  const { painter, finish } = isoCanvas(1, 1, 30);
  const { ctx } = painter;
  const rand = seeded(cropId.length * 31 + stage.length);
  const leaf = '#4caf50';
  const leafDark = '#2e7d32';
  ctx.save();
  for (const [x, y] of plantPositions()) {
    const [px, py] = painter.p(x, y, 3);
    // Plants à l'échelle d'un champ d'une case (dessinés autour de leur pied).
    ctx.restore();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(PLANT_SCALE, PLANT_SCALE);
    const sx = 0;
    const sy = 0;
    const j = (rand() - 0.5) * 3;
    if (stage === 'sprout') {
      ctx.fillStyle = '#7cd16b';
      ctx.beginPath();
      ctx.ellipse(sx - 2 + j, sy - 2, 2.5, 1.5, -0.6, 0, Math.PI * 2);
      ctx.ellipse(sx + 2 + j, sy - 2, 2.5, 1.5, 0.6, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (stage === 'growing') {
      ctx.fillStyle = leafDark;
      ctx.beginPath();
      ctx.ellipse(sx + j, sy - 4, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.ellipse(sx + j - 1, sy - 6, 4.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    switch (cropId) {
      case 'strawberry': {
        ctx.fillStyle = leafDark;
        ctx.beginPath();
        ctx.ellipse(sx + j, sy - 4, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.ellipse(sx + j - 1, sy - 6, 6, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [bx, by] of [
          [-4, -3],
          [3, -2],
          [0, -7],
        ] as const) {
          ctx.fillStyle = '#e53935';
          ctx.beginPath();
          ctx.arc(sx + bx + j, sy + by, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(sx + bx + j - 1, sy + by - 1.5, 1, 1);
        }
        break;
      }
      case 'wheat': {
        for (let k = -2; k <= 2; k++) {
          ctx.strokeStyle = '#c9a227';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(sx + k * 2 + j, sy);
          ctx.lineTo(sx + k * 3 + j, sy - 20);
          ctx.stroke();
          ctx.fillStyle = '#f2cf4a';
          ctx.beginPath();
          ctx.ellipse(sx + k * 3 + j, sy - 22, 1.8, 4.5, k * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'carrot': {
        ctx.fillStyle = '#ef6c00';
        ctx.beginPath();
        ctx.ellipse(sx + j, sy - 1, 3.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 2;
        for (const dx of [-4, 0, 4]) {
          ctx.beginPath();
          ctx.moveTo(sx + j, sy - 2);
          ctx.lineTo(sx + j + dx, sy - 12);
          ctx.stroke();
        }
        break;
      }
      case 'corn': {
        ctx.strokeStyle = '#388e3c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx + j, sy);
        ctx.lineTo(sx + j, sy - 30);
        ctx.stroke();
        ctx.fillStyle = '#66bb6a';
        ctx.beginPath();
        ctx.ellipse(sx + j - 5, sy - 16, 7, 2.2, -0.5, 0, Math.PI * 2);
        ctx.ellipse(sx + j + 5, sy - 22, 7, 2.2, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fdd835';
        ctx.beginPath();
        ctx.ellipse(sx + j + 3, sy - 18, 2.6, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pumpkin': {
        ctx.fillStyle = leafDark;
        ctx.beginPath();
        ctx.ellipse(sx + j - 4, sy - 3, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(sx + j - 2, sy - 8, 1, sx + j, sy - 5, 9);
        g.addColorStop(0, '#ffb74d');
        g.addColorStop(1, '#e65100');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx + j, sy - 5, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,50,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + j, sy - 11);
        ctx.lineTo(sx + j, sy + 1);
        ctx.stroke();
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(sx + j - 1, sy - 13, 2, 3);
        break;
      }
      case 'tomato': {
        ctx.strokeStyle = '#8d6e63';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + j, sy);
        ctx.lineTo(sx + j, sy - 22);
        ctx.stroke();
        ctx.fillStyle = leafDark;
        ctx.beginPath();
        ctx.ellipse(sx + j, sy - 10, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [bx, by] of [
          [-3, -8],
          [3, -12],
          [0, -16],
        ] as const) {
          ctx.fillStyle = '#e53935';
          ctx.beginPath();
          ctx.arc(sx + bx + j, sy + by, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'sunflower': {
        ctx.strokeStyle = '#558b2f';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx + j, sy);
        ctx.lineTo(sx + j, sy - 28);
        ctx.stroke();
        ctx.fillStyle = '#ffca28';
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          ctx.beginPath();
          ctx.ellipse(sx + j + Math.cos(a) * 5, sy - 30 + Math.sin(a) * 5, 3.2, 1.8, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.arc(sx + j, sy - 30, 3.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'grape': {
        ctx.strokeStyle = '#6d4c41';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + j, sy);
        ctx.lineTo(sx + j, sy - 18);
        ctx.stroke();
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.ellipse(sx + j, sy - 20, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7b1fa2';
        for (const [bx, by] of [
          [-2, -14],
          [2, -14],
          [0, -11],
          [-1, -8],
          [1.5, -8],
        ] as const) {
          ctx.beginPath();
          ctx.arc(sx + bx + j, sy + by, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'apple': {
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(sx + j - 1.5, sy - 14, 3, 14);
        ctx.fillStyle = leafDark;
        ctx.beginPath();
        ctx.ellipse(sx + j, sy - 22, 10, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.ellipse(sx + j - 2, sy - 25, 7, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [bx, by] of [
          [-5, -20],
          [4, -18],
          [1, -27],
        ] as const) {
          ctx.fillStyle = '#d32f2f';
          ctx.beginPath();
          ctx.arc(sx + bx + j, sy + by, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default:
        break;
    }
  }
  ctx.restore();
  return finish();
}

/** Chantier (fondations + échafaudage) pour une emprise carrée. */
export function constructionSite(size: number): ArtPiece {
  const height = 60 + size * 10;
  const { painter, finish } = isoCanvas(size, size, height + 10);
  const m = 0.12;
  const s = size - m;
  painter.flat(0.03, 0.03, size - 0.03, size - 0.03, 0, '#c9b38f');
  painter.box(m, m, s, s, 0, 7, { top: '#b0aca4', left: '#9a958c', right: '#85807a', outline: '#6d6963' });
  const wood = '#c8914b';
  const dark = '#7a5226';
  const posts: Array<[number, number]> = [];
  const inner0 = m + 0.18;
  const inner1 = s - 0.18;
  const steps = Math.max(2, size);
  for (let i = 0; i <= steps; i++) {
    const t = inner0 + ((inner1 - inner0) * i) / steps;
    posts.push([t, inner0], [inner0, t], [t, inner1], [inner1, t]);
  }
  const unique = [...new Map(posts.map((p) => [`${p[0].toFixed(2)},${p[1].toFixed(2)}`, p])).values()].sort(
    (a, b) => a[0] + a[1] - (b[0] + b[1]),
  );
  // Arrière d'abord, avant ensuite.
  const back = unique.filter(([x, y]) => x === inner0 || y === inner0);
  const front = unique.filter(([x, y]) => !(x === inner0 || y === inner0));
  const beam = (z: number, edge: 'back' | 'front') => {
    const pts: Array<[V3, V3]> =
      edge === 'back'
        ? [
            [
              [inner0, inner0, z],
              [inner1, inner0, z],
            ],
            [
              [inner0, inner0, z],
              [inner0, inner1, z],
            ],
          ]
        : [
            [
              [inner0, inner1, z],
              [inner1, inner1, z],
            ],
            [
              [inner1, inner0, z],
              [inner1, inner1, z],
            ],
          ];
    for (const [a, b] of pts) {
      painter.line(a, b, dark, 5);
      painter.line(a, b, wood, 3);
    }
  };
  for (const [x, y] of back) {
    painter.line([x, y, 7], [x, y, height], dark, 5);
    painter.line([x, y, 7], [x, y, height], wood, 3);
  }
  beam(height * 0.5, 'back');
  beam(height, 'back');
  // Planches et parpaings au centre.
  const c = size / 2;
  painter.box(c - 0.45, c - 0.2, c + 0.15, c + 0.2, 7, 17, {
    top: '#e0b27a',
    left: '#c48f52',
    right: '#a5733c',
    outline: dark,
  });
  painter.box(c + 0.05, c + 0.15, c + 0.45, c + 0.5, 7, 21, {
    top: '#cfd8dc',
    left: '#b0bec5',
    right: '#90a4ae',
    outline: '#607d8b',
  });
  for (const [x, y] of front) {
    painter.line([x, y, 7], [x, y, height], dark, 5);
    painter.line([x, y, 7], [x, y, height], wood, 3);
  }
  beam(height * 0.5, 'front');
  beam(height, 'front');
  // Croisillons sur la face avant-gauche.
  painter.line([inner0, inner1, 10], [inner1, inner1, height * 0.5], wood, 2.5);
  painter.line([inner1, inner0, 10], [inner1, inner1, height * 0.5], wood, 2.5);
  // Cône de chantier.
  const [cx, cy] = painter.p(size - 0.12, size - 0.12, 0);
  const { ctx } = painter;
  ctx.fillStyle = '#ff7043';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx, cy - 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 3.5, cy - 8, 7, 2.5);
  return finish();
}

/** Panneau « À vendre » planté au centre d'une zone achetable. */
export function forSaleSign(): ArtPiece {
  const { canvas, ctx } = createCanvas(110, 96);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(55, 88, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(30, 36, 6, 52);
  ctx.fillRect(74, 36, 6, 52);
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(10, 8, 90, 42);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(13, 11, 84, 36);
  ctx.fillStyle = '#d84315';
  ctx.font = '900 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('world.forSale'), 55, 23, 80);
  ctx.fillStyle = '#5d4037';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText(t('world.expandHere'), 55, 38, 80);
  return { canvas, originX: 0.5, originY: 88 / 96 };
}

/** Losange de sélection (contour) de taille unitaire, réutilisé en mise à l'échelle. */
export function tileHighlight(): ArtPiece {
  const { canvas, ctx } = createCanvas(TILE_W + 4, TILE_H + 4);
  ctx.beginPath();
  ctx.moveTo(2 + HALF_W, 2);
  ctx.lineTo(2 + TILE_W, 2 + HALF_H);
  ctx.lineTo(2 + HALF_W, 2 + TILE_H);
  ctx.lineTo(2, 2 + HALF_H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  return { canvas, originX: 0.5, originY: 0 };
}
