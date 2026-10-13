/** Planche de contrôle des visuels procéduraux (outil de développement : /art.html). */
import { ArtLibrary } from '@/render/art/library';

const lib = ArtLibrary.build();
const sheet = document.getElementById('sheet');
const filter = new URLSearchParams(location.search).get('only');
for (const [key, piece] of lib.pieces) {
  if (filter && !key.startsWith(filter)) continue;
  const figure = document.createElement('figure');
  piece.canvas.style.width = `${piece.canvas.width / (new URLSearchParams(location.search).has('full') ? 1 : 2)}px`;
  figure.append(piece.canvas);
  const caption = document.createElement('figcaption');
  caption.textContent = key;
  figure.append(caption);
  sheet?.append(figure);
}
