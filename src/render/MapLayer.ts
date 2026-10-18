import type Phaser from 'phaser';
import { roadMask } from '@/core/grid';
import type { Terrain } from '@/core/types';
import { CHUNK_SIZE, MAP_H, MAP_W } from '@/data/balance';
import { groundCoverOf, isSceneryRoad, mountainPeaks, rockScatterOf, sceneryOf, type Peak } from '@/data/scenery';
import {
  GROUND_PERIOD,
  grassFringe,
  grassTile,
  rockTile,
  sandTile,
  shoreOverlay,
  surfOverlay,
  waterTile,
} from './art/ground';
import type { ArtPiece } from './art/IsoPainter';
import { ArtKey, type ArtLibrary, type GroundKind } from './art/library';
import { MOUNTAIN_VARIANTS, PEAK_BIG, PEAK_MEDIUM, PEAK_SMALL, mountainArt } from './art/mountains';
import { plantArt, type PlantKind } from './art/nature';
import { GroundStyle, quadTints, uniformTint, type Corners, type Mul } from './groundStyle';
import { HALF_H, tileToWorld, worldToTile } from './iso';
import { TerrainAtlas, type AtlasFrame } from './TerrainAtlas';
import { treeLook } from './trees';

/** Voile des zones encore à acheter (multiplicatif). */
const LOCKED_MUL: Mul = [0.8, 0.86, 0.76];
export const LOCKED_TINT = uniformTint(LOCKED_MUL);

const DEPTH_GROUND = 0;
const DEPTH_SHORE = 0.5;
const DEPTH_SURF = 0.55;
const DEPTH_FRINGE = 0.6;
const DEPTH_ROAD = 2;
/** En deçà de ce zoom (pixels CSS par unité du monde), les petits détails sont masqués. */
const DETAIL_ZOOM = 0.32;

/** Image du sol et ses teintes de base (sans le voile des zones à acheter). */
interface GroundImage {
  image: Phaser.GameObjects.Image;
  corners: Corners | null;
  /** Prend le voile des zones à acheter (l'eau, non). */
  lockable: boolean;
}

interface ChunkView {
  cx: number;
  cy: number;
  locked: boolean;
  ground: GroundImage[];
  /** Écume du ressac, animée. */
  surf: Array<{ image: Phaser.GameObjects.Image; phase: number }>;
  /** Décor des zones sauvages : arbres, sous-bois et routes (retirés à l'achat). */
  wild: Phaser.GameObjects.Image[];
  roads: Array<{ image: Phaser.GameObjects.Image; x: number; y: number }>;
  /** Montagnes et rochers (permanents). */
  peaks: Phaser.GameObjects.Image[];
  /** Petits détails permanents (cailloux, écume), masqués quand on dézoome. */
  details: Phaser.GameObjects.Image[];
  /** Sous-bois des zones sauvages (retiré à l'achat), masqué aussi quand on dézoome. */
  cover: Phaser.GameObjects.Image[];
  visible: boolean;
}

export interface MapWorld {
  isChunkUnlocked(cx: number, cy: number): boolean;
  isRoad(x: number, y: number): boolean;
}

const PEAK_FIRST = { big: PEAK_BIG, medium: PEAK_MEDIUM, small: PEAK_SMALL } as const;

const GROUND_ART: Record<GroundKind, (i: number, j: number) => ArtPiece> = {
  grass: grassTile,
  sand: sandTile,
  rock: rockTile,
  water: waterTile,
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Sol et décor de la carte, construits zone par zone à l'approche de la
 * caméra puis masqués hors champ : une très grande carte reste fluide sur
 * téléphone. Une couronne de zones autour de la carte prolonge le paysage
 * (mer, montagnes du nord). Les visuels sont regroupés dans deux atlas (sols ;
 * arbres, plantes et montagnes) pour limiter les appels de dessin.
 */
export class MapLayer {
  private chunks = new Map<string, ChunkView>();
  private chunksX = Math.ceil(MAP_W / CHUNK_SIZE);
  private chunksY = Math.ceil(MAP_H / CHUNK_SIZE);
  private style = new GroundStyle();
  private groundAtlas: TerrainAtlas;
  private objectAtlas: TerrainAtlas;
  /** Sommets dont le relief n'est pas encore dessiné (un relief par mise à jour, sans à-coup). */
  private pendingPeaks: Array<{ chunk: ChunkView; peak: Peak; variant: number }> = [];
  private detailed = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly world: MapWorld,
  ) {
    this.groundAtlas = new TerrainAtlas(scene, 'atlas_ground', 1024);
    this.objectAtlas = new TerrainAtlas(scene, 'atlas_objects', 2048, true);
  }

  /** Route sauvage (décor) sur cette case, dans une zone pas encore achetée. */
  isWildRoad(x: number, y: number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    return isSceneryRoad(x, y) && !this.world.isChunkUnlocked(cx, cy);
  }

  private add(x: number, y: number, frame: AtlasFrame): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, frame.texture, frame.frame).setOrigin(frame.piece.originX, frame.piece.originY);
  }

  /** Sol (ou transition) de la case (x, y). */
  private ground(x: number, y: number, key: string, make: () => ArtPiece, depth: number): Phaser.GameObjects.Image {
    const pos = tileToWorld(x, y);
    return this.add(pos.x, pos.y, this.groundAtlas.get(key, make)).setDepth(depth);
  }

  /** Pièce dessinée au centre d'une case, posée avec son pied au point (fx, fy). */
  private standing(fx: number, fy: number, key: string, make: () => ArtPiece, scale = 1): Phaser.GameObjects.Image {
    const frame = this.objectAtlas.get(key, make);
    const pos = tileToWorld(fx, fy);
    return this.add(pos.x, pos.y, frame)
      .setOrigin(frame.piece.originX, frame.piece.originY + HALF_H / frame.piece.canvas.height)
      .setScale(scale)
      .setDepth(100 + (fx + fy) * 10);
  }

  private plant(fx: number, fy: number, kind: PlantKind, variant: number, scale = 1): Phaser.GameObjects.Image {
    return this.standing(fx, fy, ArtKey.plant(kind, variant), () => plantArt(kind, variant), scale);
  }

  private roadKey(x: number, y: number): string {
    return ArtKey.road(roadMask((rx, ry) => this.world.isRoad(rx, ry) || this.isWildRoad(rx, ry), x, y));
  }

  private inMap(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.chunksX && cy < this.chunksY;
  }

  private tint(entry: GroundImage, locked: boolean): void {
    const mul = locked && entry.lockable ? LOCKED_MUL : undefined;
    if (entry.corners) {
      const [tl, tr, bl, br] = quadTints(entry.corners, mul);
      entry.image.setTint(tl, tr, bl, br);
    } else if (mul) entry.image.setTint(uniformTint(mul));
    else entry.image.clearTint();
  }

  private build(cx: number, cy: number): ChunkView {
    const inMap = this.inMap(cx, cy);
    const locked = !inMap || !this.world.isChunkUnlocked(cx, cy);
    const view: ChunkView = {
      cx,
      cy,
      locked,
      ground: [],
      surf: [],
      wild: [],
      roads: [],
      peaks: [],
      details: [],
      cover: [],
      visible: true,
    };
    const { style } = this;
    const push = (entry: GroundImage) => {
      this.tint(entry, locked);
      view.ground.push(entry);
    };
    for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
      for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        const terrain: Terrain = style.terrainAt(x, y);
        const i = mod(x, GROUND_PERIOD);
        const j = mod(y, GROUND_PERIOD);
        push({
          image: this.ground(x, y, ArtKey.ground(terrain, i, j), () => GROUND_ART[terrain](i, j), DEPTH_GROUND),
          corners: style.corners(x, y, terrain),
          lockable: terrain !== 'water',
        });
        if (terrain === 'water') {
          const mask = style.landMask(x, y);
          if (mask) {
            const kind = style.shoreKind(x, y);
            push({
              image: this.ground(
                x,
                y,
                ArtKey.shore(mask, kind, i, j),
                () => shoreOverlay(mask, kind, i, j),
                DEPTH_SHORE,
              ),
              // Même teinte que le sable (ou la roche) voisin, pour se raccorder sans couture.
              corners: style.corners(x, y, kind),
              lockable: true,
            });
            const surf = this.ground(x, y, ArtKey.surf(mask, i, j), () => surfOverlay(mask, i, j), DEPTH_SURF);
            view.surf.push({ image: surf, phase: (x + y) * 0.55 });
            view.details.push(surf.setVisible(this.detailed));
          }
        }
        if (terrain !== 'grass') {
          const onWater = terrain === 'water';
          const mask = style.grassMask(x, y, onWater);
          if (mask) {
            push({
              image: this.ground(
                x,
                y,
                ArtKey.fringe(mask, onWater, i, j),
                () => grassFringe(mask, onWater, i, j),
                DEPTH_FRINGE,
              ),
              corners: style.corners(x, y, 'grass'),
              lockable: true,
            });
          }
        }
      }
    }
    for (const peak of mountainPeaks(cx, cy)) {
      const variant = (PEAK_FIRST[peak.size] + peak.variant) % MOUNTAIN_VARIANTS;
      if (this.objectAtlas.has(ArtKey.mountain(variant))) this.addPeak(view, peak, variant);
      else this.pendingPeaks.push({ chunk: view, peak, variant });
    }
    for (const item of rockScatterOf(cx, cy)) {
      const image = this.plant(item.x, item.y, item.kind as PlantKind, item.variant).setVisible(this.detailed);
      if (locked) image.setTint(LOCKED_TINT);
      view.details.push(image);
    }
    if (inMap && locked) this.buildWild(view);
    return view;
  }

  private addPeak(chunk: ChunkView, peak: Peak, variant: number): void {
    const frame = this.objectAtlas.get(ArtKey.mountain(variant), () => mountainArt(variant));
    const pos = tileToWorld(peak.x, peak.y);
    const image = this.add(pos.x, pos.y, frame)
      .setScale(peak.scale)
      .setDepth(100 + (peak.x + peak.y) * 10)
      .setVisible(chunk.visible);
    if (chunk.locked) image.setTint(LOCKED_TINT);
    chunk.peaks.push(image);
  }

  /** Dessine le relief d'un sommet en attente, puis pose tous les sommets qui l'utilisent. */
  private buildPendingPeak(): void {
    const next = this.pendingPeaks[0];
    if (!next) return;
    const { variant } = next;
    const waiting = this.pendingPeaks.filter((p) => p.variant === variant);
    this.pendingPeaks = this.pendingPeaks.filter((p) => p.variant !== variant);
    for (const { chunk, peak } of waiting) this.addPeak(chunk, peak, variant);
  }

  private buildWild(view: ChunkView): void {
    for (const item of sceneryOf(view.cx, view.cy)) {
      if (item.defId === 'road') {
        const key = this.roadKey(item.x, item.y);
        const piece = this.art.get(key);
        const pos = tileToWorld(item.x, item.y);
        const image = this.scene.add
          .image(pos.x, pos.y, key)
          .setOrigin(piece.originX, piece.originY)
          .setDepth(DEPTH_ROAD)
          .setTint(LOCKED_TINT);
        view.roads.push({ image, x: item.x, y: item.y });
        view.wild.push(image);
        continue;
      }
      const look = treeLook(item.defId, item.x, item.y);
      if (!look) continue;
      const tree = this.standing(
        item.x + 0.5 + look.dx,
        item.y + 0.5 + look.dy,
        look.key,
        () => this.art.get(look.key),
        look.scale,
      );
      view.wild.push(tree.setTint(LOCKED_TINT));
    }
    for (const item of groundCoverOf(view.cx, view.cy)) {
      const young = item.kind === 'young_broadleaf' ? 'broadleaf' : item.kind === 'young_conifer' ? 'conifer' : null;
      let image: Phaser.GameObjects.Image;
      if (young !== null) {
        const key = ArtKey.tree(young, item.variant);
        image = this.standing(item.x, item.y, key, () => this.art.get(key), 0.55 + (item.x % 1) * 0.25);
        view.wild.push(image.setTint(LOCKED_TINT));
        continue;
      }
      image = this.plant(item.x, item.y, item.kind as PlantKind, item.variant);
      view.cover.push(image.setTint(LOCKED_TINT).setVisible(this.detailed));
    }
  }

  /**
   * Construit les zones proches de la caméra et masque les autres (à appeler
   * régulièrement). `zoom` : pixels CSS par unité du monde.
   */
  update(camera: Phaser.Cameras.Scene2D.Camera, zoom = camera.zoom): void {
    const view = camera.worldView;
    const corners = [
      worldToTile(view.x, view.y),
      worldToTile(view.right, view.y),
      worldToTile(view.x, view.bottom),
      worldToTile(view.right, view.bottom),
    ];
    const minCx = Math.max(-1, Math.floor(Math.min(...corners.map((c) => c.x)) / CHUNK_SIZE) - 1);
    const maxCx = Math.min(this.chunksX, Math.floor(Math.max(...corners.map((c) => c.x)) / CHUNK_SIZE) + 1);
    const minCy = Math.max(-1, Math.floor(Math.min(...corners.map((c) => c.y)) / CHUNK_SIZE) - 1);
    const maxCy = Math.min(this.chunksY, Math.floor(Math.max(...corners.map((c) => c.y)) / CHUNK_SIZE) + 1);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        if (!this.chunks.has(key)) this.chunks.set(key, this.build(cx, cy));
      }
    }
    const detailed = zoom >= DETAIL_ZOOM;
    const detailChange = detailed !== this.detailed;
    this.detailed = detailed;
    for (const chunk of this.chunks.values()) {
      const visible = chunk.cx >= minCx && chunk.cx <= maxCx && chunk.cy >= minCy && chunk.cy <= maxCy;
      if (visible !== chunk.visible) {
        chunk.visible = visible;
        for (const entry of chunk.ground) entry.image.setVisible(visible);
        for (const list of [chunk.wild, chunk.peaks]) for (const image of list) image.setVisible(visible);
      } else if (!detailChange) continue;
      for (const list of [chunk.details, chunk.cover]) for (const image of list) image.setVisible(visible && detailed);
    }
    this.buildPendingPeak();
    this.groundAtlas.flush();
    this.objectAtlas.flush();
  }

  /** Ressac : l'écume va et vient le long des côtes (zones visibles uniquement). */
  animate(time: number): void {
    if (!this.detailed) return;
    for (const chunk of this.chunks.values()) {
      if (!chunk.visible) continue;
      for (const surf of chunk.surf) surf.image.setAlpha(0.5 + 0.5 * Math.sin(time / 900 - surf.phase));
    }
  }

  /** Zone achetée : couleurs normales, le décor sauvage laisse place aux vraies constructions. */
  unlock(cx: number, cy: number): void {
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;
    chunk.locked = false;
    for (const entry of chunk.ground) this.tint(entry, false);
    for (const peak of chunk.peaks) peak.clearTint();
    for (const image of chunk.wild) image.destroy();
    chunk.wild = [];
    for (const image of chunk.cover) image.destroy();
    chunk.cover = [];
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
