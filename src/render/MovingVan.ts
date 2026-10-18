import type Phaser from 'phaser';
import { ArtKey, type ArtLibrary } from './art/library';
import { DEPTH_FX } from './Effects';
import { depthOf, tileToWorld } from './iso';

/** Nombre de cases parcourues par le camion avant et après la maison. */
const RUN_TILES = 6;
const DRIVE_MS = 1600;
const UNLOAD_MS = 2600;

interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
}

/**
 * Camion de déménagement : à l'inauguration d'une maison, il arrive par la
 * route, s'arrête devant (« Emménagement »), puis repart.
 */
export class MovingVan {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly isRoad: (x: number, y: number) => boolean,
  ) {}

  /** Case de route voisine de la maison et sens de circulation, ou null. */
  private findStop(house: Footprint): { x: number; y: number; axis: 'x' | 'y' } | null {
    const candidates: Array<[number, number]> = [];
    for (let i = 0; i < house.w; i++) candidates.push([house.x + i, house.y + house.d], [house.x + i, house.y - 1]);
    for (let j = 0; j < house.d; j++) candidates.push([house.x + house.w, house.y + j], [house.x - 1, house.y + j]);
    for (const [x, y] of candidates) {
      if (!this.isRoad(x, y)) continue;
      const axis = this.isRoad(x + 1, y) || this.isRoad(x - 1, y) ? 'x' : 'y';
      return { x, y, axis };
    }
    return null;
  }

  /** Lance l'animation ; `onArrive` est appelé quand le camion s'arrête devant la maison. */
  play(house: Footprint, label: string, scale: number, onArrive: () => void): void {
    const stop = this.findStop(house);
    const axis = stop?.axis ?? 'x';
    const key = ArtKey.truck(axis);
    const piece = this.art.get(key);
    // Sans route, le camion apparaît simplement à côté de la maison.
    const spot = stop ?? { x: house.x + house.w, y: house.y + house.d - 1 };
    const tile = (offset: number) =>
      axis === 'x' ? { x: spot.x + offset, y: spot.y } : { x: spot.x, y: spot.y + offset };
    const place = (truck: Phaser.GameObjects.Image, t: { x: number; y: number }) => {
      const pos = tileToWorld(t.x, t.y);
      truck.setPosition(pos.x, pos.y).setDepth(depthOf(Math.round(t.x), Math.round(t.y), 1, 1) + 0.5);
    };
    const start = stop ? tile(-RUN_TILES) : tile(0);
    const truck = this.scene.add.image(0, 0, key).setOrigin(piece.originX, piece.originY).setScale(1.3);
    place(truck, start);
    if (!stop) truck.setAlpha(0);
    const progress = { t: 0 };
    const drive = (from: number, to: number, duration: number, ease: string, done: () => void) => {
      progress.t = 0;
      this.scene.tweens.add({
        targets: progress,
        t: 1,
        duration,
        ease,
        onUpdate: () => {
          const offset = from + (to - from) * progress.t;
          place(truck, tile(offset));
        },
        onComplete: done,
      });
    };
    const arrive = () => {
      onArrive();
      this.showLabel(truck, label, scale);
      this.scene.time.delayedCall(UNLOAD_MS, () => {
        if (!stop) {
          this.scene.tweens.add({ targets: truck, alpha: 0, duration: 400, onComplete: () => truck.destroy() });
          return;
        }
        drive(0, RUN_TILES, DRIVE_MS, 'Quad.easeIn', () => {
          this.scene.tweens.add({ targets: truck, alpha: 0, duration: 300, onComplete: () => truck.destroy() });
        });
      });
    };
    if (stop) drive(-RUN_TILES, 0, DRIVE_MS, 'Quad.easeOut', arrive);
    else this.scene.tweens.add({ targets: truck, alpha: 1, duration: 400, onComplete: arrive });
  }

  /** Étiquette « Emménagement » avec une barre qui se remplit, au-dessus du camion. */
  private showLabel(truck: Phaser.GameObjects.Image, text: string, scale: number): void {
    const y = truck.y - truck.displayHeight * truck.originY - 8 * scale;
    const label = this.scene.add
      .text(truck.x, y, text, {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontStyle: '800',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#0b2a4a',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(DEPTH_FX);
    const bar = this.scene.add.graphics().setDepth(DEPTH_FX);
    const width = 90 * scale;
    const height = 9 * scale;
    const progress = { t: 0 };
    this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration: UNLOAD_MS - 300,
      onUpdate: () => {
        bar.clear();
        bar.fillStyle(0x0b2a4a, 0.8).fillRoundedRect(truck.x - width / 2 - 2, y + 4, width + 4, height + 4, 5);
        bar.fillStyle(0x4fc3f7, 1).fillRoundedRect(truck.x - width / 2, y + 6, width * progress.t, height, 4);
      },
      onComplete: () => {
        this.scene.tweens.add({
          targets: [label, bar],
          alpha: 0,
          duration: 300,
          onComplete: () => {
            label.destroy();
            bar.destroy();
          },
        });
      },
    });
  }
}
