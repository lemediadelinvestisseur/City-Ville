import type Phaser from 'phaser';
import { roadMask } from '@/core/grid';
import { CHUNK_SIZE, MAP_H, MAP_W } from '@/data/balance';
import { isSceneryRoad, mountainPeaks, sceneryOf } from '@/data/scenery';
import { hash2, isShallow, terrainAt } from '@/data/terrain';
import { ArtKey, GRASS_VARIANTS, ROCK_VARIANTS, SAND_VARIANTS, WATER_VARIANTS, type ArtLibrary } from './art/library';
import { depthOf, tileToWorld, worldToTile } from './iso';

/** Teinte des zones encore à acheter. */
export const LOCKED_TINT = 0xa9bb92;

const DEPTH_GROUND = 0;
const DEPTH_ROAD = 2;

interface ChunkView {
  cx: number;
  cy: number;
  ground: Phaser.GameObjects.Image[];
  /** Cases d'eau qui scintillent. */
  glints: Phaser.GameObjects.Image[];
  /** Décor des zones sauvages : arbres et routes (retirés à l'achat). */
  wild: Phaser.GameObjects.Image[];
  roads: Array<{ image: Phaser.GameObjects.Image; x: number; y: number }>;
  /** Montagnes (permanentes). */
  peaks: Phaser.GameObjects.Image[];
  visible: boolean;
}

export interface MapWorld {
  isChunkUnlocked(cx: number, cy: number): boolean;
  isRoad(x: number, y: number): boolean;
}

/**
 * Sol et décor de la carte, construits zone par zone à l'approche de la
 * caméra puis masqués hors champ : une très grande carte reste fluide sur
 * téléphone.
 */
export class MapLayer {
  private chunks = new Map<string, ChunkView>();
  private chunksX = Math.ceil(MAP_W / CHUNK_SIZE);
  private chunksY = Math.ceil(MAP_H / CHUNK_SIZE);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly world: MapWorld,
  ) {}

  /** Route sauvage (décor) sur cette case, dans une zone pas encore achetée. */
  isWildRoad(x: number, y: number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    return isSceneryRoad(x, y) && !this.world.isChunkUnlocked(cx, cy);
  }

  private image(x: number, y: number, key: string, depth: number): Phaser.GameObjects.Image {
    const piece = this.art.get(key);
    const pos = tileToWorld(x, y);
    return this.scene.add.image(pos.x, pos.y, key).setOrigin(piece.originX, piece.originY).setDepth(depth);
  }

  private roadKey(x: number, y: number): string {
    return ArtKey.road(roadMask((rx, ry) => this.world.isRoad(rx, ry) || this.isWildRoad(rx, ry), x, y));
  }

  private build(cx: number, cy: number): ChunkView {
    const unlocked = this.world.isChunkUnlocked(cx, cy);
    const view: ChunkView = { cx, cy, ground: [], glints: [], wild: [], roads: [], peaks: [], visible: true };
    for (let y = cy * CHUNK_SIZE; y < Math.min(MAP_H, (cy + 1) * CHUNK_SIZE); y++) {
      for (let x = cx * CHUNK_SIZE; x < Math.min(MAP_W, (cx + 1) * CHUNK_SIZE); x++) {
        const hash = x * 7 + y * 13 + ((x * y) % 5);
        const terrain = terrainAt(x, y);
        const key =
          terrain === 'water'
            ? ArtKey.water(hash % WATER_VARIANTS, isShallow(x, y))
            : terrain === 'sand'
              ? ArtKey.sand(hash % SAND_VARIANTS)
              : terrain === 'rock'
                ? ArtKey.rock(hash % ROCK_VARIANTS)
                : ArtKey.grass(hash % GRASS_VARIANTS);
        const tile = this.image(x, y, key, DEPTH_GROUND);
        if (terrain === 'water') {
          if (hash % 4 === 0) view.glints.push(tile);
        } else if (!unlocked) tile.setTint(LOCKED_TINT);
        view.ground.push(tile);
      }
    }
    for (const peak of mountainPeaks(cx, cy)) {
      const image = this.image(peak.x, peak.y, ArtKey.mountain(peak.variant), depthOf(peak.x, peak.y, 2, 2));
      if (!unlocked) image.setTint(LOCKED_TINT);
      view.peaks.push(image);
    }
    if (!unlocked) this.buildWild(view);
    return view;
  }

  private buildWild(view: ChunkView): void {
    for (const item of sceneryOf(view.cx, view.cy)) {
      if (item.defId === 'road') {
        const image = this.image(item.x, item.y, this.roadKey(item.x, item.y), DEPTH_ROAD).setTint(LOCKED_TINT);
        view.roads.push({ image, x: item.x, y: item.y });
        view.wild.push(image);
      } else {
        // Légère variation de taille pour que la forêt ne paraisse pas alignée.
        const image = this.image(item.x, item.y, ArtKey.building(item.defId), depthOf(item.x, item.y, 1, 1))
          .setTint(LOCKED_TINT)
          .setScale(0.85 + hash2(item.x, item.y, 5) * 0.3);
        view.wild.push(image);
      }
    }
  }

  /** Construit les zones proches de la caméra et masque les autres (à appeler régulièrement). */
  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;
    const corners = [
      worldToTile(view.x, view.y),
      worldToTile(view.right, view.y),
      worldToTile(view.x, view.bottom),
      worldToTile(view.right, view.bottom),
    ];
    const minCx = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x)) / CHUNK_SIZE) - 1);
    const maxCx = Math.min(this.chunksX - 1, Math.floor(Math.max(...corners.map((c) => c.x)) / CHUNK_SIZE) + 1);
    const minCy = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y)) / CHUNK_SIZE) - 1);
    const maxCy = Math.min(this.chunksY - 1, Math.floor(Math.max(...corners.map((c) => c.y)) / CHUNK_SIZE) + 1);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        if (!this.chunks.has(key)) this.chunks.set(key, this.build(cx, cy));
      }
    }
    for (const chunk of this.chunks.values()) {
      const visible = chunk.cx >= minCx && chunk.cx <= maxCx && chunk.cy >= minCy && chunk.cy <= maxCy;
      if (visible === chunk.visible) continue;
      chunk.visible = visible;
      for (const list of [chunk.ground, chunk.wild, chunk.peaks]) for (const image of list) image.setVisible(visible);
    }
  }

  /** Scintillement de l'eau (zones visibles uniquement). */
  animate(time: number): void {
    const glint = 0.9 + Math.sin(time / 900) * 0.08;
    for (const chunk of this.chunks.values()) {
      if (!chunk.visible) continue;
      for (const tile of chunk.glints) tile.setAlpha(glint);
    }
  }

  /** Zone achetée : couleurs normales, le décor sauvage laisse place aux vraies constructions. */
  unlock(cx: number, cy: number): void {
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;
    for (const tile of chunk.ground) tile.clearTint();
    for (const peak of chunk.peaks) peak.clearTint();
    for (const image of chunk.wild) image.destroy();
    chunk.wild = [];
    chunk.roads = [];
    this.refreshRoads();
  }

  /** Raccorde les routes sauvages aux routes du joueur. */
  refreshRoads(): void {
    for (const chunk of this.chunks.values()) {
      for (const road of chunk.roads) {
        const key = this.roadKey(road.x, road.y);
        if (road.image.texture.key !== key) road.image.setTexture(key);
      }
    }
  }

  get builtChunks(): number {
    return this.chunks.size;
  }
}
