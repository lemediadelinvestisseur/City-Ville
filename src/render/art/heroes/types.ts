import type { IsoPainter } from '../IsoPainter';

/**
 * Bâtiment dessiné entièrement à la main, dans le style « cartoon » :
 * - `ground` : sol de la parcelle (allées, pelouse, ombre portée), sans contour ;
 * - `p` : volumes et détails, qui reçoivent ensuite le contour épais (`toon.ts`).
 * Les deux pinceaux partagent le même repère : (0, 0, 0) est le coin nord de
 * l'emprise, x et y en cases, z en pixels au-dessus du sol.
 */
export interface Hero {
  /** Hauteur dessinée au-dessus du sol (px), objets sur le toit compris. */
  height: number;
  draw: (ground: IsoPainter, p: IsoPainter) => void;
}
