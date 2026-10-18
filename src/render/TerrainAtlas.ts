import type Phaser from 'phaser';
import { createCanvas, type ArtPiece } from './art/IsoPainter';

/** Espace vide entre deux pièces, pour que le filtrage ne mélange pas leurs bords. */
const GAP = 2;

interface Page {
  key: string;
  texture: Phaser.Textures.CanvasTexture;
  x: number;
  y: number;
  rowHeight: number;
  dirty: boolean;
}

/** Retire les marges transparentes d'une pièce (moins de place dans l'atlas, moins de pixels à dessiner). */
function trim(piece: ArtPiece): ArtPiece {
  const { canvas } = piece;
  const ctx = canvas.getContext('2d');
  if (!ctx) return piece;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < 3) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  if (maxX < 0) return piece;
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  const w = Math.min(width, maxX + 2) - minX;
  const h = Math.min(height, maxY + 2) - minY;
  if (w === width && h === height) return piece;
  const out = createCanvas(w, h);
  out.ctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return {
    canvas: out.canvas,
    originX: (piece.originX * width - minX) / w,
    originY: (piece.originY * height - minY) / h,
  };
}

export interface AtlasFrame {
  texture: string;
  frame: string;
  piece: ArtPiece;
}

/**
 * Regroupe les visuels du paysage (sols, rivages, arbres, montagnes…) dans
 * quelques grandes textures : le GPU dessine alors des milliers de cases en
 * une poignée d'appels au lieu d'un par texture. Les pièces sont ajoutées à la
 * première demande, rangées en étagères ; les pages modifiées sont envoyées au
 * GPU en une fois par `flush`.
 */
export class TerrainAtlas {
  private pages: Page[] = [];
  private frames = new Map<string, AtlasFrame>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly name: string,
    private readonly size: number,
    /** Recadrer les pièces sur leur contenu (objets posés au sol, pas les cases). */
    private readonly trimPieces = false,
  ) {}

  has(frame: string): boolean {
    return this.frames.has(frame);
  }

  /** Cadre d'une pièce, dessinée et rangée dans l'atlas si besoin. */
  get(frame: string, make: () => ArtPiece): AtlasFrame {
    let entry = this.frames.get(frame);
    if (!entry) {
      const piece = this.trimPieces ? trim(make()) : make();
      const page = this.place(piece.canvas.width, piece.canvas.height);
      page.texture.context.drawImage(piece.canvas, page.x, page.y);
      page.texture.add(frame, 0, page.x, page.y, piece.canvas.width, piece.canvas.height);
      page.x += piece.canvas.width + GAP;
      page.dirty = true;
      entry = { texture: page.key, frame, piece };
      this.frames.set(frame, entry);
    }
    return entry;
  }

  /** Page (et position dans `page.x`, `page.y`) où ranger une pièce w × h. */
  private place(w: number, h: number): Page {
    let page = this.pages[this.pages.length - 1];
    if (page && page.x + w > this.size) {
      page.y += page.rowHeight + GAP;
      page.x = 0;
      page.rowHeight = 0;
    }
    if (!page || page.y + h > this.size) {
      const key = `${this.name}_${this.pages.length}`;
      const texture = this.scene.textures.createCanvas(key, this.size, this.size);
      if (!texture) throw new Error(`Atlas impossible : ${key}`);
      page = { key, texture, x: 0, y: 0, rowHeight: 0, dirty: true };
      this.pages.push(page);
    }
    page.rowHeight = Math.max(page.rowHeight, h);
    return page;
  }

  /** Envoie au GPU les pages qui ont reçu de nouvelles pièces. */
  flush(): void {
    for (const page of this.pages) {
      if (!page.dirty) continue;
      page.texture.refresh();
      page.dirty = false;
    }
  }
}
