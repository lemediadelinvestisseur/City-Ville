/** Planche de contrôle des visuels procéduraux (outil de développement : /art.html). */
import {
  GROUND_PERIOD,
  grassFringe,
  grassTile,
  rockTile,
  sandTile,
  shoreOverlay,
  waterTile,
} from '@/render/art/ground';
import { ArtKey, ArtLibrary } from '@/render/art/library';
import { MOUNTAIN_VARIANTS, mountainArt } from '@/render/art/mountains';
import { PLANT_VARIANTS, plantArt, type PlantKind } from '@/render/art/nature';

const params = new URLSearchParams(location.search);
const lib = ArtLibrary.build();
// Visuels que la carte dessine à la demande.
for (let i = 0; i < GROUND_PERIOD; i++) {
  for (let j = 0; j < GROUND_PERIOD; j++) {
    lib.getOrCreate(ArtKey.ground('grass', i, j), () => grassTile(i, j));
    lib.getOrCreate(ArtKey.ground('sand', i, j), () => sandTile(i, j));
    lib.getOrCreate(ArtKey.ground('rock', i, j), () => rockTile(i, j));
    lib.getOrCreate(ArtKey.ground('water', i, j), () => waterTile(i, j));
  }
}
for (const [kind, count] of Object.entries(PLANT_VARIANTS) as Array<[PlantKind, number]>) {
  for (let i = 0; i < count; i++) lib.getOrCreate(ArtKey.plant(kind, i), () => plantArt(kind, i));
}
for (let v = 0; v < MOUNTAIN_VARIANTS; v++) lib.getOrCreate(ArtKey.mountain(v), () => mountainArt(v));
for (const mask of [1, 3, 7, 5]) {
  lib.getOrCreate(ArtKey.shore(mask, 'sand', 0, 0), () => shoreOverlay(mask, 'sand', 0, 0));
  lib.getOrCreate(ArtKey.fringe(mask, false, 0, 0), () => grassFringe(mask, false, 0, 0));
}
const sheet = document.getElementById('sheet');
const filter = params.get('only');
for (const [key, piece] of lib.pieces) {
  if (filter && !key.startsWith(filter)) continue;
  const figure = document.createElement('figure');
  piece.canvas.style.width = `${piece.canvas.width / (params.has('full') ? 1 : 2)}px`;
  figure.append(piece.canvas);
  const caption = document.createElement('figcaption');
  caption.textContent = key;
  figure.append(caption);
  sheet?.append(figure);
}
