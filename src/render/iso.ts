/** Projection isométrique 2:1. Une case fait TILE_W × TILE_H unités de monde. */
export const TILE_W = 128;
export const TILE_H = 64;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

export interface Point {
  x: number;
  y: number;
}

/** Coin nord (haut) de la case (x, y) en coordonnées monde. */
export function tileToWorld(x: number, y: number): Point {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

/** Coordonnées de case (fractionnaires) d'un point du monde. */
export function worldToTile(wx: number, wy: number): Point {
  return {
    x: (wx / HALF_W + wy / HALF_H) / 2,
    y: (wy / HALF_H - wx / HALF_W) / 2,
  };
}

/** Centre d'une emprise w × d posée en (x, y). */
export function footprintCenter(x: number, y: number, w: number, d: number): Point {
  return tileToWorld(x + w / 2, y + d / 2);
}

/** Profondeur d'affichage : les objets « devant » (x + y grands) sont dessinés après. */
export function depthOf(x: number, y: number, w: number, d: number): number {
  return 100 + (x + w / 2 + y + d / 2) * 10 + x * 0.01;
}
