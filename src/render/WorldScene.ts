import Phaser from 'phaser';
import type { AppContext, ScreenPoint, WorldMode } from '@/app/context';
import { findHint, type HintTarget } from '@/core/hints';
import { CHUNKS_X, CHUNKS_Y, chunkOf, roadMask } from '@/core/grid';
import type { Entity, FailReason, Reward } from '@/core/types';
import { CHUNK_SIZE, MAP_H, MAP_W } from '@/data/balance';
import { getBuildingDef } from '@/data/buildings';
import { RAIL_END_Y } from '@/data/scenery';
import { isWater } from '@/data/terrain';
import { ArtKey, CLOUD_VARIANTS } from './art/library';
import { DEEP_SEA } from './groundStyle';
import { LOCKED_TINT, MapLayer } from './MapLayer';
import type { BadgeKind } from './art/sprites';
import { CameraController } from './CameraController';
import { HALF_H, HALF_W, TILE_H, depthOf, footprintCenter, tileToWorld, worldToTile } from './iso';
import { DEPTH_FX, Effects } from './Effects';
import { formatClock } from '@/ui/format';
import { DropSystem } from './Drops';
import { MovingVan } from './MovingVan';
import { NightLayer } from './NightLayer';
import { treeLook } from './trees';
import { WalkerSystem } from './WalkerSystem';
import { t } from '@/i18n';

const DEPTH_ROAD = 2;
const DEPTH_LIMITS = 4;
const DEPTH_OVERLAY = 1_000_000;
const DEPTH_GHOST = 2_000_000;
const DEPTH_CLOUDS = 4_000_000;

const TAP_SLOP_CSS = 10;

interface View {
  entity: Entity;
  main: Phaser.GameObjects.Image;
  textureKey: string;
  crop: Phaser.GameObjects.Image | null;
  cropKey: string | null;
  badge: Phaser.GameObjects.Image | null;
  badgeKind: BadgeKind | null;
  badgeBaseY: number;
  bar: Phaser.GameObjects.Graphics | null;
  barKey: string;
  /** Compte à rebours affiché en permanence (chantier, bateau en mer). */
  timer: Phaser.GameObjects.Text | null;
  /** Ouvrier qui travaille sur le chantier. */
  crew: { worker: Phaser.GameObjects.Image; hammer: Phaser.GameObjects.Image } | null;
  /** Bateau amarré (ou parti en mer) d'un port. */
  boat: Phaser.GameObjects.Image | null;
  boatHome: { x: number; y: number } | null;
  /** Train à quai d'une gare (caché pendant une livraison). */
  train: Phaser.GameObjects.Image | null;
  /** Étoiles d'amélioration, au pied du bâtiment. */
  stars: Phaser.GameObjects.Text | null;
}

/** Travaux en cours sur une construction : chantier initial ou amélioration. */
function worksOf(entity: Entity): { startedAt: number; endsAt: number } | null {
  if (!entity.built) return entity.construction ?? null;
  return entity.upgrade ?? null;
}

interface Placement {
  defId: string;
  moveId: number | null;
  x: number;
  y: number;
  ghost: Phaser.GameObjects.Image;
  valid: boolean;
  reason: FailReason | null;
}

type Gesture = 'none' | 'pan' | 'pinch' | 'ghost' | 'paint';

/** Scène principale : la carte isométrique, ses constructions et les interactions tactiles. */
export class WorldScene extends Phaser.Scene {
  private camCtl!: CameraController;
  private fx!: Effects;
  private views = new Map<number, View>();
  /** Sol et décor de la carte, construits à l'approche de la caméra. */
  private map!: MapLayer;
  private mapCheckAt = 0;
  private limits!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private signs = new Map<string, Phaser.GameObjects.Image>();
  private walkers!: WalkerSystem;
  private night!: NightLayer;
  private drops!: DropSystem;
  private van!: MovingVan;
  private clouds: Phaser.GameObjects.Image[] = [];
  private arrow!: Phaser.GameObjects.Image;
  private hintKey = '';
  private hintEntityId: number | null = null;
  private mode: WorldMode = 'play';
  private plantCropId: string | null = null;
  private placement: Placement | null = null;
  private selectedId: number | null = null;
  private unsubscribers: Array<() => void> = [];

  // Gestes
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture = 'none';
  private tapCandidate = false;
  private down = { x: 0, y: 0, time: 0 };
  private last = { x: 0, y: 0, time: 0 };
  private velocity = { x: 0, y: 0 };
  private pinch = { dist: 1, zoom: 1, midX: 0, midY: 0 };
  private grab = { dx: 0, dy: 0 };
  /** Tracé de routes au glissé. */
  private paint = { x: 0, y: 0, started: false, warned: false };
  private overlayScale = 1;
  private modalOpen = false;

  /** Visite de la ville d'un autre joueur : aucune action possible. */
  private readonly readOnly: boolean;
  private nearEdge = false;
  private edgeCheckAt = 0;
  /** Prochains rafraîchissements périodiques (horloge réelle, indépendante de la fluidité). */
  private refreshAt = 0;
  private hammerAt = 0;

  constructor(
    private readonly ctx: AppContext,
    private readonly dpr: number,
    options: { key?: string; readOnly?: boolean } = {},
  ) {
    super({ key: options.key ?? 'world' });
    this.readOnly = options.readOnly ?? false;
  }

  private get game_() {
    return this.ctx.game;
  }

  create(): void {
    for (const [key, piece] of this.ctx.art.pieces) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, piece.canvas);
    }
    this.cameras.main.setBackgroundColor(DEEP_SEA);
    this.fx = new Effects(this);
    this.map = new MapLayer(this, this.ctx.art, {
      isChunkUnlocked: (cx, cy) => this.game_.isChunkUnlocked(cx, cy),
      isRoad: (x, y) => this.game_.isRoad(x, y),
    });
    this.limits = this.add.graphics().setDepth(DEPTH_LIMITS);
    this.overlay = this.add.graphics().setDepth(DEPTH_GHOST - 1);
    this.walkers = new WalkerSystem(this);
    this.drops = new DropSystem(this, (wx, wy, reward) => {
      const screen = this.camCtl.worldToScreen(wx, wy);
      this.ctx.bus.emit('fx:pickup', { screen: this.toCss(screen.x, screen.y), reward });
    });
    this.van = new MovingVan(this, this.ctx.art, (x, y) => this.game_.isRoad(x, y));
    this.night = new NightLayer(this, DEPTH_OVERLAY - 10, this.ctx.prefs.dayNight);
    for (const entity of this.game_.state.entities) this.addView(entity);
    this.refreshRoads();
    this.refreshLimits();
    this.createClouds();
    this.arrow = this.add
      .image(0, 0, ArtKey.arrow)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_FX - 1)
      .setVisible(false);

    const margin = 420;
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.camCtl = new CameraController(
      this.cameras.main,
      this.dpr,
      {
        x: -MAP_H * HALF_W - margin,
        y: -margin,
        w: (MAP_W + MAP_H) * HALF_W + margin * 2,
        h: ((MAP_W + MAP_H) * TILE_H) / 2 + margin * 2,
      },
      0.22,
      1.4,
      isSmall ? 0.4 : 0.62,
    );
    const start = tileToWorld(16.5, 18.5);
    this.camCtl.centerOn(start.x, start.y);
    this.map.update(this.cameras.main, this.camCtl.userZoom);
    this.updateOverlayScale();

    this.setupInput();
    this.subscribe();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.refreshDynamic();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((u) => u());
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
    this.ctx.bus.emit('world:ready', undefined);
  }

  override update(time: number, delta: number): void {
    if (this.camCtl.update(delta)) this.ctx.bus.emit('world:cameraMoved', undefined);
    this.drops.update(time);
    // Cadencé sur l'horloge réelle : reste juste même si l'affichage rame.
    if (time >= this.refreshAt) {
      this.refreshAt = time + 500;
      this.refreshDynamic();
    }
    if (time >= this.hammerAt) {
      this.hammerAt = time + 1400;
      this.hammerTick();
    }
    if (time > this.edgeCheckAt) {
      this.edgeCheckAt = time + 300;
      this.checkEdge();
    }
    this.walkers.update(delta, time);
    const bob = Math.sin(time / 260) * 5;
    for (const view of this.views.values()) {
      if (view.badge) view.badge.y = view.badgeBaseY + bob * this.overlayScale;
      if (view.boat?.visible && view.boatHome)
        view.boat.y = view.boatHome.y + Math.sin(time / 600 + view.entity.id) * 2;
    }
    this.map.animate(time);
    if (time >= this.mapCheckAt) {
      this.mapCheckAt = time + 200;
      this.map.update(this.cameras.main, this.camCtl.userZoom);
    }
    if (this.arrow.visible && this.hintEntityId !== null) {
      const view = this.views.get(this.hintEntityId);
      if (view) this.arrow.y = this.topOf(view) - 72 * this.overlayScale + Math.sin(time / 180) * 10;
    }
    for (const cloud of this.clouds) {
      cloud.x += (delta / 1000) * (cloud.getData('speed') as number);
      if (cloud.x > MAP_W * HALF_W + 600) cloud.x = -MAP_H * HALF_W - 600;
    }
  }

  // ———————————————————————————— Terrain ————————————————————————————

  /** Limites de la ville (pointillés) et panneaux « À vendre ». */
  private refreshLimits(): void {
    const g = this.limits;
    g.clear();
    g.lineStyle(5, 0xffffff, 0.6);
    const dash = (ax: number, ay: number, bx: number, by: number) => {
      const steps = CHUNK_SIZE * 2;
      for (let i = 0; i < steps; i += 2) {
        const s = tileToWorld(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
        const e = tileToWorld(ax + ((bx - ax) * (i + 1)) / steps, ay + ((by - ay) * (i + 1)) / steps);
        g.lineBetween(s.x, s.y, e.x, e.y);
      }
    };
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        if (!this.game_.isChunkUnlocked(cx, cy)) continue;
        const x0 = cx * CHUNK_SIZE;
        const y0 = cy * CHUNK_SIZE;
        const x1 = x0 + CHUNK_SIZE;
        const y1 = y0 + CHUNK_SIZE;
        if (!this.game_.isChunkUnlocked(cx, cy - 1)) dash(x0, y0, x1, y0);
        if (!this.game_.isChunkUnlocked(cx, cy + 1)) dash(x0, y1, x1, y1);
        if (!this.game_.isChunkUnlocked(cx - 1, cy)) dash(x0, y0, x0, y1);
        if (!this.game_.isChunkUnlocked(cx + 1, cy)) dash(x1, y0, x1, y1);
      }
    }
    // Panneaux sur les zones achetables.
    const wanted = new Set<string>();
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        if (this.game_.expansionInfo(cx, cy).status !== 'purchasable') continue;
        const key = `${cx},${cy}`;
        wanted.add(key);
        if (this.signs.has(key)) continue;
        const tx = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const ty = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
        const pos = tileToWorld(tx, ty);
        const sign = this.add
          .image(pos.x, pos.y, ArtKey.forSale)
          .setOrigin(0.5, this.ctx.art.get(ArtKey.forSale).originY)
          .setScale(1.6)
          .setDepth(depthOf(tx, ty, 1, 1) + 0.3);
        this.signs.set(key, sign);
      }
    }
    for (const [key, sign] of this.signs) {
      if (!wanted.has(key)) {
        sign.destroy();
        this.signs.delete(key);
      }
    }
  }

  private createClouds(): void {
    for (let i = 0; i < 3; i++) {
      const cloud = this.add
        .image(-1800 + i * 1500, 300 + i * 650, ArtKey.cloud(i % CLOUD_VARIANTS))
        .setDepth(DEPTH_CLOUDS)
        .setAlpha(0.32)
        .setScale(1.8 + i * 0.3);
      cloud.setData('speed', 10 + i * 4);
      this.clouds.push(cloud);
    }
  }

  // ———————————————————————————— Vues des constructions ————————————————————————————

  private textureFor(entity: Entity): string {
    const def = getBuildingDef(entity.defId);
    if (def.id === 'road') {
      return ArtKey.road(roadMask((x, y) => this.game_.isRoad(x, y) || this.map.isWildRoad(x, y), entity.x, entity.y));
    }
    if (def.id === 'rail') return ArtKey.rail(entity.y === RAIL_END_Y);
    if (!entity.built) return ArtKey.construction(Math.min(4, Math.max(def.size.w, def.size.d)));
    return treeLook(def.id, entity.x, entity.y)?.key ?? ArtKey.building(def.id);
  }

  private cropKeyFor(entity: Entity): string | null {
    const farm = entity.farm;
    if (!farm || farm.cropId === null) return null;
    const now = this.game_.now();
    if (now >= farm.readyAt) return ArtKey.crop(farm.cropId, 'ripe');
    const ratio = (now - farm.plantedAt) / Math.max(1, farm.readyAt - farm.plantedAt);
    return ArtKey.crop(farm.cropId, ratio < 0.4 ? 'sprout' : 'growing');
  }

  private badgeFor(entity: Entity): BadgeKind | null {
    switch (this.game_.primaryAction(entity).type) {
      case 'finishBuild':
      case 'finishUpgrade':
        return 'build';
      case 'unloadBoat':
        return 'fish';
      case 'unloadTrain':
        return 'train';
      case 'needsRoad':
        return 'road';
      case 'collectRent':
      case 'collectBusiness':
        return 'coin';
      case 'harvest':
        return 'harvest';
      case 'supply':
        return 'goods';
      default:
        return null;
    }
  }

  private isFlat(entity: Entity): boolean {
    return entity.defId === 'road' || entity.defId === 'rail';
  }

  private addView(entity: Entity): void {
    const key = this.textureFor(entity);
    const main = this.add.image(0, 0, key);
    const view: View = {
      entity,
      main,
      textureKey: '',
      crop: null,
      cropKey: null,
      badge: null,
      badgeKind: null,
      badgeBaseY: 0,
      bar: null,
      barKey: '',
      timer: null,
      crew: null,
      boat: null,
      boatHome: null,
      train: null,
      stars: null,
    };
    this.views.set(entity.id, view);
    this.syncView(view);
  }

  private removeView(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    view.main.destroy();
    view.crop?.destroy();
    view.badge?.destroy();
    view.bar?.destroy();
    view.timer?.destroy();
    view.crew?.worker.destroy();
    view.crew?.hammer.destroy();
    view.boat?.destroy();
    view.train?.destroy();
    view.stars?.destroy();
    this.views.delete(id);
    if (this.selectedId === id) this.select(null);
  }

  /** Met à jour texture, position, profondeur, culture, bulle et barre de chantier. */
  private syncView(view: View): void {
    const { entity } = view;
    const def = getBuildingDef(entity.defId);
    const key = this.textureFor(entity);
    // Arbres : posés par le pied, avec la même variation que la forêt sauvage.
    const tree = entity.built ? treeLook(def.id, entity.x, entity.y) : null;
    if (key !== view.textureKey) {
      const piece = this.ctx.art.get(key);
      view.main
        .setTexture(key)
        .setOrigin(piece.originX, piece.originY + (tree ? HALF_H / piece.canvas.height : 0))
        .setScale(tree?.scale ?? 1);
      view.textureKey = key;
    }
    const pos = tileToWorld(entity.x, entity.y);
    const depth = this.isFlat(entity) ? DEPTH_ROAD : depthOf(entity.x, entity.y, def.size.w, def.size.d);
    const at = tree ? tileToWorld(entity.x + 0.5 + tree.dx, entity.y + 0.5 + tree.dy) : pos;
    view.main.setPosition(at.x, at.y).setDepth(depth);
    const locked = !this.game_.isTileUnlocked(entity.x, entity.y);
    if (locked) view.main.setTint(LOCKED_TINT);
    else if (this.selectedId !== entity.id) view.main.clearTint();

    const cropKey = this.cropKeyFor(entity);
    if (cropKey !== view.cropKey) {
      if (cropKey) {
        const piece = this.ctx.art.get(cropKey);
        if (!view.crop) view.crop = this.add.image(0, 0, cropKey);
        view.crop.setTexture(cropKey).setOrigin(piece.originX, piece.originY);
      } else {
        view.crop?.destroy();
        view.crop = null;
      }
      view.cropKey = cropKey;
    }
    view.crop?.setPosition(pos.x, pos.y).setDepth(depth + 0.001);

    const badgeKind = locked ? null : this.badgeFor(entity);
    if (badgeKind !== view.badgeKind) {
      view.badge?.destroy();
      view.badge = badgeKind ? this.add.image(0, 0, ArtKey.badge(badgeKind)).setOrigin(0.5, 1) : null;
      view.badgeKind = badgeKind;
    }
    if (view.badge) {
      view.badgeBaseY = this.topOf(view) + 10 * this.overlayScale;
      const center = footprintCenter(entity.x, entity.y, def.size.w, def.size.d);
      view.badge
        .setPosition(center.x, view.badgeBaseY)
        .setDepth(DEPTH_OVERLAY + depth)
        .setScale(this.overlayScale * (badgeKind === 'goods' ? 0.9 : 1));
    }

    const progress = this.buildProgress(entity);
    const barKey = progress === null ? '' : `${progress}@${entity.x},${entity.y}:${this.overlayScale}`;
    if (barKey !== view.barKey) {
      view.barKey = barKey;
      if (progress === null) {
        view.bar?.destroy();
        view.bar = null;
      } else {
        if (!view.bar) view.bar = this.add.graphics();
        this.drawBuildBar(view.bar, view, progress);
      }
    }
    this.syncBoat(view);
    this.syncTrain(view);
    this.syncTimer(view);
    this.syncCrew(view);
    this.syncStars(view);
  }

  /** « ★★ » dorées devant un bâtiment amélioré. */
  private syncStars(view: View): void {
    const stars = view.entity.stars ?? 0;
    if (stars <= 0 || !view.entity.built) {
      view.stars?.destroy();
      view.stars = null;
      return;
    }
    if (!view.stars) {
      view.stars = this.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontStyle: '900',
          fontSize: '34px',
          color: '#ffd54f',
          stroke: '#6d4c00',
          strokeThickness: 7,
        })
        .setOrigin(0.5, 1)
        .setResolution(Math.min(2, this.dpr * 1.5));
    }
    const a = this.anchor(view);
    const front = a.y + ((a.w + a.d) / 2) * (TILE_H / 2);
    view.stars
      .setText('★'.repeat(stars))
      .setPosition(a.x, front + 6 * this.overlayScale)
      .setScale(this.overlayScale * Math.max(1, a.w * 0.4))
      .setDepth(view.main.depth + 0.05)
      .setVisible(this.game_.isTileUnlocked(view.entity.x, view.entity.y));
  }

  /** Un ouvrier au marteau sur chaque chantier en cours. */
  private syncCrew(view: View): void {
    const { entity } = view;
    const works = worksOf(entity);
    const working = !!works && this.game_.now() < works.endsAt && this.game_.isTileUnlocked(entity.x, entity.y);
    if (!working) {
      view.crew?.worker.destroy();
      view.crew?.hammer.destroy();
      view.crew = null;
      return;
    }
    const def = getBuildingDef(entity.defId);
    if (!view.crew) {
      const w = this.ctx.art.get(ArtKey.worker);
      const hm = this.ctx.art.get(ArtKey.hammerTool);
      view.crew = {
        worker: this.add.image(0, 0, ArtKey.worker).setOrigin(w.originX, w.originY).setScale(2.2),
        hammer: this.add.image(0, 0, ArtKey.hammerTool).setOrigin(hm.originX, hm.originY).setScale(2.2),
      };
    }
    const pos = tileToWorld(entity.x + def.size.w * 0.12, entity.y + def.size.d * 0.95);
    const depth = view.main.depth + 0.02;
    view.crew.worker.setPosition(pos.x, pos.y).setDepth(depth);
    view.crew.hammer.setPosition(pos.x + 12, pos.y - 52).setDepth(depth + 0.001);
  }

  /** Coups de marteau réguliers sur les chantiers ; seul le plus proche du centre s'entend. */
  private hammerTick(): void {
    const cam = this.cameras.main;
    const view = cam.worldView;
    let loudest: { d: number } | null = null;
    for (const v of this.views.values()) {
      if (!v.crew) continue;
      const { hammer } = v.crew;
      this.tweens.add({
        targets: hammer,
        angle: { from: -75, to: 15 },
        duration: 150,
        delay: (v.entity.id % 5) * 90,
        yoyo: true,
        ease: 'Quad.easeIn',
        onYoyo: () => this.fx.puffs(hammer.x - 6, hammer.y + 24, 0.4, 0.4, 1),
      });
      if (view.contains(hammer.x, hammer.y)) {
        const d = Phaser.Math.Distance.Between(hammer.x, hammer.y, view.centerX, view.centerY);
        if (!loudest || d < loudest.d) loudest = { d };
      }
    }
    if (loudest && !this.readOnly) this.ctx.bus.emit('fx:hammer', undefined);
  }

  /** Ouverture du chantier : trois coups de marteau (synchronisés avec le bruitage). */
  private openSiteFx(view: View): void {
    const a = this.anchor(view);
    [0, 260, 520].forEach((delay, i) => {
      this.time.delayedCall(delay, () => {
        this.fx.puffs(a.x, a.y, a.w, a.d, 2 + i);
        this.fx.shake(0.001);
      });
    });
  }

  /** Inauguration : le bâtiment s'élève depuis ses fondations. */
  private riseFx(view: View): void {
    const { main } = view;
    const target = main.scaleY;
    main.setScale(main.scaleX, target * 0.15);
    this.tweens.add({ targets: main, scaleY: target, duration: 700, ease: 'Back.easeOut' });
  }

  /** Fin de l'attente à afficher en direct, ou null. */
  private timerEnd(entity: Entity): number | null {
    const now = this.game_.now();
    const works = worksOf(entity);
    if (works && now < works.endsAt) return works.endsAt;
    if (entity.port?.tripId && now < entity.port.readyAt) return entity.port.readyAt;
    if (entity.station?.shipmentId && now < entity.station.readyAt) return entity.station.readyAt;
    return null;
  }

  private syncTimer(view: View): void {
    const end = this.game_.isTileUnlocked(view.entity.x, view.entity.y) ? this.timerEnd(view.entity) : null;
    if (end === null) {
      view.timer?.destroy();
      view.timer = null;
      return;
    }
    if (!view.timer) {
      view.timer = this.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontStyle: '800',
          fontSize: '22px',
          color: '#ffffff',
          stroke: '#0b2a4a',
          strokeThickness: 6,
        })
        .setOrigin(0.5, 1)
        .setResolution(Math.min(2, this.dpr * 1.5));
    }
    const def = getBuildingDef(view.entity.defId);
    const center = footprintCenter(view.entity.x, view.entity.y, def.size.w, def.size.d);
    const s = this.overlayScale;
    // Sous le bâtiment pour un chantier (au-dessus de la barre), au-dessus du port pour un bateau.
    const y = worksOf(view.entity) ? center.y + 14 * s : this.topOf(view) - 4 * s;
    view.timer
      .setText(formatClock((end - this.game_.now()) / 1000))
      .setPosition(center.x, y)
      .setScale(s)
      .setDepth(DEPTH_OVERLAY + view.main.depth + 0.6);
  }

  /** Avancement du chantier en vingtièmes (null : pas de chantier en cours). */
  private buildProgress(entity: Entity): number | null {
    const c = worksOf(entity);
    if (!c) return null;
    const ratio = (this.game_.now() - c.startedAt) / Math.max(1, c.endsAt - c.startedAt);
    return Math.max(0, Math.min(20, Math.floor(ratio * 20)));
  }

  private drawBuildBar(g: Phaser.GameObjects.Graphics, view: View, progress: number): void {
    const def = getBuildingDef(view.entity.defId);
    const center = footprintCenter(view.entity.x, view.entity.y, def.size.w, def.size.d);
    const s = this.overlayScale;
    const width = 96 * s;
    const height = 12 * s;
    const x = center.x - width / 2;
    const y = center.y + 18 * s;
    g.clear();
    g.setDepth(DEPTH_OVERLAY + view.main.depth + 0.5);
    g.fillStyle(0x0b2a4a, 0.75);
    g.fillRoundedRect(x - 3 * s, y - 3 * s, width + 6 * s, height + 6 * s, 7 * s);
    g.fillStyle(0x37506a, 1);
    g.fillRoundedRect(x, y, width, height, 5 * s);
    if (progress > 0) {
      g.fillStyle(progress >= 20 ? 0x7ed957 : 0x4fc3f7, 1);
      g.fillRoundedRect(x, y, Math.max(10 * s, (width * progress) / 20), height, 5 * s);
    }
  }

  /** Case d'eau où le bateau d'un port est amarré. */
  private moorage(entity: Entity): { x: number; y: number } | null {
    const def = getBuildingDef(entity.defId);
    const { w, d } = def.size;
    // On préfère le côté est (vers le large), puis le sud, le nord et l'ouest.
    for (let j = d - 1; j >= 0; j--)
      if (isWater(entity.x + w, entity.y + j)) return { x: entity.x + w, y: entity.y + j };
    for (let i = w - 1; i >= 0; i--)
      if (isWater(entity.x + i, entity.y + d)) return { x: entity.x + i, y: entity.y + d };
    for (let i = w - 1; i >= 0; i--)
      if (isWater(entity.x + i, entity.y - 1)) return { x: entity.x + i, y: entity.y - 1 };
    for (let j = d - 1; j >= 0; j--)
      if (isWater(entity.x - 1, entity.y + j)) return { x: entity.x - 1, y: entity.y + j };
    return null;
  }

  /** Bateau visible à quai (ou de retour) ; caché pendant qu'il est en mer. */
  private syncBoat(view: View): void {
    const { entity } = view;
    const def = getBuildingDef(entity.defId);
    const spot = entity.built && def.category === 'port' ? this.moorage(entity) : null;
    if (!spot || def.category !== 'port') {
      view.boat?.destroy();
      view.boat = null;
      view.boatHome = null;
      return;
    }
    const key = ArtKey.boat(def.boatTier);
    if (!view.boat) {
      const piece = this.ctx.art.get(key);
      view.boat = this.add.image(0, 0, key).setOrigin(piece.originX, piece.originY);
    }
    const pos = tileToWorld(spot.x, spot.y);
    view.boatHome = pos;
    const atSea = !!entity.port?.tripId && this.game_.now() < (entity.port?.readyAt ?? 0);
    view.boat
      .setPosition(pos.x, pos.y)
      .setDepth(depthOf(spot.x, spot.y, 1, 1))
      .setVisible(!atSea);
    const locked = !this.game_.isTileUnlocked(entity.x, entity.y);
    if (locked) view.boat.setTint(LOCKED_TINT);
    else view.boat.clearTint();
  }

  /** Première case de voie (au nord) où stationne le train d'une gare, ou null. */
  private platform(entity: Entity): { x: number; y: number } | null {
    const { w, d } = getBuildingDef(entity.defId).size;
    for (const x of [entity.x - 1, entity.x + w]) {
      for (let j = 0; j < d; j++) {
        if (!this.game_.isRail(x, entity.y + j)) continue;
        // Le train occupe trois cases : il s'arrête avant le butoir.
        return { x, y: Math.max(0, Math.min(entity.y, RAIL_END_Y - 2)) };
      }
    }
    return null;
  }

  /** Train à quai ; caché pendant une livraison (il part par le tunnel du nord). */
  private syncTrain(view: View): void {
    const { entity } = view;
    const spot = entity.built && entity.station ? this.platform(entity) : null;
    if (!spot) {
      view.train?.destroy();
      view.train = null;
      return;
    }
    if (!view.train) {
      const piece = this.ctx.art.get(ArtKey.train);
      view.train = this.add.image(0, 0, ArtKey.train).setOrigin(piece.originX, piece.originY);
    }
    const pos = tileToWorld(spot.x, spot.y);
    const away = !!entity.station?.shipmentId && this.game_.now() < (entity.station?.readyAt ?? 0);
    view.train
      .setPosition(pos.x, pos.y)
      .setDepth(depthOf(spot.x, spot.y, 1, 3))
      .setVisible(!away);
  }

  /** Haut visuel d'une construction (en coordonnées monde). */
  private topOf(view: View): number {
    const { main } = view;
    const piece = this.ctx.art.get(view.textureKey);
    const top = main.y - main.displayHeight * main.originY;
    // Les textures ont une marge transparente ; on la compense grossièrement.
    return top + Math.min(24, piece.canvas.height * 0.06);
  }

  /** Rafraîchit les états qui dépendent du temps (cultures, loyers…) et l'aide visuelle. */
  private refreshDynamic(): void {
    this.night.refresh(Date.now(), this.game_.state.entities, (e) => this.game_.isTileUnlocked(e.x, e.y));
    for (const view of this.views.values()) {
      if (view.timer || worksOf(view.entity) || view.entity.port?.tripId || view.entity.station?.shipmentId)
        this.syncTimer(view);
      const e = view.entity;
      const roadIssue = view.badgeKind === 'road' || !this.game_.isConnected(e);
      if (e.house || e.business || e.farm || e.port || e.station || worksOf(e) || roadIssue) {
        const badge = this.badgeFor(e);
        const progress = this.buildProgress(e);
        const barChanged = progress !== null && !view.barKey.startsWith(`${progress}@`);
        const atSea = !!e.port?.tripId && this.game_.now() < e.port.readyAt;
        const boatChanged = !!view.boat && view.boat.visible === atSea;
        const away = !!e.station?.shipmentId && this.game_.now() < e.station.readyAt;
        const trainChanged = !!view.train && view.train.visible === away;
        if (
          badge !== view.badgeKind ||
          this.cropKeyFor(e) !== view.cropKey ||
          barChanged ||
          boatChanged ||
          trainChanged
        )
          this.syncView(view);
      }
    }
    this.refreshHint();
  }

  private refreshRoads(): void {
    const roads: Array<{ x: number; y: number }> = [];
    for (const view of this.views.values()) {
      if (view.entity.defId === 'road' || view.entity.defId === 'bridge') {
        roads.push({ x: view.entity.x, y: view.entity.y });
        const key = this.textureFor(view.entity);
        if (key !== view.textureKey) this.syncView(view);
      }
    }
    this.map.refreshRoads();
    this.walkers.setRoads(roads.filter((r) => this.game_.isTileUnlocked(r.x, r.y)));
    this.walkers.setTarget(Math.min(28, Math.round(this.game_.derived().population / 7)));
  }

  /** Signale quand la caméra quitte la ville (bord des zones débloquées). */
  private checkEdge(): void {
    if (this.readOnly) return;
    const cam = this.cameras.main;
    const center = worldToTile(cam.midPoint.x, cam.midPoint.y);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        if (!this.game_.isChunkUnlocked(cx, cy)) continue;
        minX = Math.min(minX, cx * CHUNK_SIZE);
        minY = Math.min(minY, cy * CHUNK_SIZE);
        maxX = Math.max(maxX, (cx + 1) * CHUNK_SIZE);
        maxY = Math.max(maxY, (cy + 1) * CHUNK_SIZE);
      }
    }
    const margin = 4;
    const near =
      center.x < minX - margin || center.y < minY - margin || center.x > maxX + margin || center.y > maxY + margin;
    if (near !== this.nearEdge) {
      this.nearEdge = near;
      this.ctx.bus.emit('world:edge', near);
    }
  }

  private refreshHint(): void {
    const hint: HintTarget | null =
      !this.readOnly && this.game_.state.level <= 4 && this.mode === 'play' ? findHint(this.game_) : null;
    const key = JSON.stringify(hint);
    if (key !== this.hintKey) {
      this.hintKey = key;
      this.ctx.bus.emit('world:hint', hint);
    }
    this.hintEntityId = hint?.kind === 'entity' && !this.placement ? hint.entityId : null;
    const view = this.hintEntityId !== null ? this.views.get(this.hintEntityId) : undefined;
    if (view) {
      const def = getBuildingDef(view.entity.defId);
      const center = footprintCenter(view.entity.x, view.entity.y, def.size.w, def.size.d);
      this.arrow.setVisible(true).setX(center.x).setScale(this.overlayScale);
    } else {
      this.arrow.setVisible(false);
    }
  }

  private updateOverlayScale(): void {
    const scale = Math.max(0.8, Math.min(1.7, 0.55 / this.camCtl.userZoom));
    if (Math.abs(scale - this.overlayScale) < 0.02) return;
    this.overlayScale = scale;
    for (const view of this.views.values()) if (view.badge || view.bar || view.timer || view.stars) this.syncView(view);
  }

  // ———————————————————————————— Évènements ————————————————————————————

  private subscribe(): void {
    const { game, bus } = this.ctx;
    const on = (unsubscribe: () => void): void => {
      this.unsubscribers.push(unsubscribe);
    };
    on(
      game.events.on('entityAdded', (entity) => {
        this.addView(entity);
        if (entity.defId === 'road' || entity.defId === 'bridge') this.refreshRoads();
        const view = this.views.get(entity.id);
        // Les arbres et routes offerts avec une zone apparaissent sans effet.
        if (view && !entity.starter) this.popIn(view);
        if (view && !entity.built) this.openSiteFx(view);
      }),
    );
    on(
      game.events.on('entityRemoved', (entity) => {
        this.removeView(entity.id);
        if (entity.defId === 'road') this.refreshRoads();
        this.walkers.setTarget(Math.min(28, Math.round(game.derived().population / 7)));
      }),
    );
    on(
      game.events.on('entityMoved', (entity) => {
        const view = this.views.get(entity.id);
        if (view) this.syncView(view);
        if (entity.defId === 'road') this.refreshRoads();
      }),
    );
    on(
      game.events.on('entityUpdated', (entity) => {
        const view = this.views.get(entity.id);
        if (view) this.syncView(view);
      }),
    );
    on(
      game.events.on('constructionComplete', (entity) => {
        const view = this.views.get(entity.id);
        if (view) {
          this.riseFx(view);
          this.celebrate(view);
        }
        this.refreshRoads();
        const def = getBuildingDef(entity.defId);
        if (def.category === 'house' && view) {
          // Les nouveaux habitants arrivent en camion de déménagement.
          this.van.play(
            { x: entity.x, y: entity.y, w: def.size.w, d: def.size.d },
            t('world.movingIn'),
            this.overlayScale,
            () => {
              const a = this.anchor(view);
              this.fx.popText(a.x, a.top, t('world.residents', { n: def.population }), '#c5e1a5', 0, this.overlayScale);
              this.fx.bounce([view.main]);
            },
          );
        }
      }),
    );
    on(
      game.events.on('upgradeStarted', (entity) => {
        const view = this.views.get(entity.id);
        if (view) this.openSiteFx(view);
      }),
    );
    on(
      game.events.on('upgradeComplete', (entity) => {
        const view = this.views.get(entity.id);
        if (!view) return;
        this.riseFx(view);
        this.celebrate(view, t('world.upgraded', { stars: '★'.repeat(entity.stars ?? 1) }), '#ffd54f');
      }),
    );
    on(game.events.on('reward', ({ entityId, reward }) => this.onReward(entityId, reward)));
    on(
      game.events.on('expanded', ({ cx, cy }) => {
        this.map.unlock(cx, cy);
        this.refreshLimits();
        for (const view of this.views.values()) this.syncView(view);
        this.refreshRoads();
      }),
    );
    on(game.events.on('levelUp', () => this.refreshLimits()));
    on(game.events.on('change', () => this.refreshHint()));

    on(bus.on('ui:startPlacement', ({ defId }) => this.startPlacement(defId, null)));
    on(bus.on('ui:startMove', ({ entityId }) => this.startMoveOf(entityId)));
    on(bus.on('ui:confirmPlacement', () => this.confirmPlacement()));
    on(bus.on('ui:cancelPlacement', () => this.endPlacement()));
    on(
      bus.on('ui:setMode', (mode) => {
        this.mode = mode;
        if (mode === 'play') this.select(null);
        this.refreshHint();
      }),
    );
    on(
      bus.on('ui:plantMode', ({ cropId }) => {
        this.plantCropId = cropId;
      }),
    );
    on(bus.on('ui:focusEntity', ({ entityId }) => this.focusEntity(entityId)));
    on(bus.on('ui:focusTile', ({ x, y }) => this.focusWorld(tileToWorld(x, y))));
    on(
      bus.on('ui:dayNightMode', (mode) => {
        this.night.setMode(mode);
        this.refreshDynamic();
      }),
    );
    on(
      bus.on('ui:modalOpen', (open) => {
        this.modalOpen = open;
      }),
    );
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.camCtl.apply();
  }

  // ———————————————————————————— Entrées ————————————————————————————

  private setupInput(): void {
    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        const factor = Math.exp(-dy * 0.0015);
        this.camCtl.zoomAt(this.camCtl.userZoom * factor, pointer.x, pointer.y);
        this.updateOverlayScale();
        this.ctx.bus.emit('world:cameraMoved', undefined);
      },
    );
    // Les raccourcis ne s'appliquent qu'au monde : pas pendant une fenêtre ni sur un bouton focalisé.
    const forWorld = () => !this.modalOpen && !(document.activeElement instanceof HTMLButtonElement);
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!forWorld()) return;
      if (this.placement) this.endPlacement();
      else this.ctx.bus.emit('world:emptyTap', undefined);
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (forWorld()) this.confirmPlacement();
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    this.camCtl.stop();
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      this.gesture = 'pinch';
      this.tapCandidate = false;
      this.pinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: this.camCtl.userZoom,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      return;
    }
    const now = performance.now();
    this.tapCandidate = true;
    this.down = { x: pointer.x, y: pointer.y, time: now };
    this.last = { x: pointer.x, y: pointer.y, time: now };
    this.velocity = { x: 0, y: 0 };
    if (
      this.placement &&
      this.placement.moveId === null &&
      this.isOnGhost(pointer) &&
      this.placement.defId === 'road'
    ) {
      // Glisser depuis la route fantôme trace une route.
      this.gesture = 'paint';
      this.paint = { x: this.placement.x, y: this.placement.y, started: false, warned: false };
    } else if (this.placement && this.isOnGhost(pointer)) {
      this.gesture = 'ghost';
      const tile = this.tileAt(pointer.x, pointer.y);
      this.grab = { dx: tile.x - this.placement.x, dy: tile.y - this.placement.y };
    } else {
      this.gesture = 'pan';
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    // Survol à la souris : ramasse les pièces au sol (le placement, lui, se fait au clic).
    if (!pointer.isDown && !pointer.wasTouch && this.drops.count > 0 && !this.placement) {
      const world = this.camCtl.screenToWorld(pointer.x, pointer.y);
      this.drops.collectNear(world.x, world.y, 34 * this.overlayScale);
    }
    if (!pointer.isDown || !this.pointers.has(pointer.id)) return;
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    const slop = TAP_SLOP_CSS * this.dpr;
    if (Math.hypot(pointer.x - this.down.x, pointer.y - this.down.y) > slop) this.tapCandidate = false;

    if (this.gesture === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      this.camCtl.zoomAt(this.pinch.zoom * (dist / this.pinch.dist), midX, midY);
      this.camCtl.panBy(midX - this.pinch.midX, midY - this.pinch.midY);
      this.pinch.midX = midX;
      this.pinch.midY = midY;
      this.updateOverlayScale();
      this.ctx.bus.emit('world:cameraMoved', undefined);
      return;
    }
    if (this.gesture === 'ghost' && this.placement) {
      const tile = this.tileAt(pointer.x, pointer.y);
      this.movePlacement(tile.x - this.grab.dx, tile.y - this.grab.dy);
      return;
    }
    if (this.gesture === 'paint' && this.placement) {
      if (!this.tapCandidate) this.paintTo(this.tileAt(pointer.x, pointer.y));
      return;
    }
    if (this.gesture === 'pan') {
      const now = performance.now();
      const dx = pointer.x - this.last.x;
      const dy = pointer.y - this.last.y;
      const dt = Math.max(1, now - this.last.time);
      if (!this.tapCandidate) {
        this.camCtl.panBy(dx, dy);
        this.velocity.x = this.velocity.x * 0.6 + (dx / dt) * 0.4;
        this.velocity.y = this.velocity.y * 0.6 + (dy / dt) * 0.4;
        this.ctx.bus.emit('world:cameraMoved', undefined);
      }
      this.last = { x: pointer.x, y: pointer.y, time: now };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.pointers.has(pointer.id)) return;
    this.pointers.delete(pointer.id);
    if (pointer.wasCanceled) {
      // Geste système (volet de notifications, bord de l'écran…) : on annule tout.
      this.tapCandidate = false;
      if (this.pointers.size === 0) this.gesture = 'none';
      return;
    }
    if (this.gesture === 'pinch') {
      if (this.pointers.size === 1) {
        const [rest] = [...this.pointers.values()];
        if (rest) this.last = { x: rest.x, y: rest.y, time: performance.now() };
        this.gesture = 'pan';
        this.tapCandidate = false;
        this.velocity = { x: 0, y: 0 };
      } else if (this.pointers.size === 0) {
        this.gesture = 'none';
      }
      return;
    }
    if (this.gesture === 'pan' || this.gesture === 'ghost' || this.gesture === 'paint') {
      if (this.tapCandidate) {
        this.handleTap(pointer);
      } else if (this.gesture === 'pan' && performance.now() - this.last.time < 80) {
        this.camCtl.setVelocity(this.velocity.x, this.velocity.y);
      }
    }
    if (this.pointers.size === 0) this.gesture = 'none';
  }

  private tileAt(sx: number, sy: number): { x: number; y: number } {
    const world = this.camCtl.screenToWorld(sx, sy);
    const tile = worldToTile(world.x, world.y);
    return { x: Math.floor(tile.x), y: Math.floor(tile.y) };
  }

  private toCss(sx: number, sy: number): ScreenPoint {
    return { x: sx / this.dpr, y: sy / this.dpr };
  }

  /** Position écran (CSS) du haut d'une construction. */
  entityScreenPoint(entityId: number): ScreenPoint | null {
    const view = this.views.get(entityId);
    if (!view) return null;
    const def = getBuildingDef(view.entity.defId);
    const center = footprintCenter(view.entity.x, view.entity.y, def.size.w, def.size.d);
    const screen = this.camCtl.worldToScreen(center.x, Math.min(center.y, this.topOf(view) + 40));
    return this.toCss(screen.x, screen.y);
  }

  /** Construction sous un point de l'écran (test au pixel près). */
  private pick(sx: number, sy: number, includeFlat: boolean): Entity | null {
    const world = this.camCtl.screenToWorld(sx, sy);
    const candidates = [...this.views.values()]
      .filter((v) => includeFlat || !this.isFlat(v.entity))
      .sort((a, b) => b.main.depth - a.main.depth);
    for (const view of candidates) {
      const { main } = view;
      const left = main.x - main.displayWidth * main.originX;
      const top = main.y - main.displayHeight * main.originY;
      const lx = Math.floor(world.x - left);
      const ly = Math.floor(world.y - top);
      if (lx < 0 || ly < 0 || lx >= main.width || ly >= main.height) continue;
      const alpha = this.textures.getPixelAlpha(lx, ly, view.textureKey);
      if (alpha > 60) return view.entity;
    }
    const tile = worldToTile(world.x, world.y);
    const entity = this.game_.entityAt(Math.floor(tile.x), Math.floor(tile.y));
    if (entity && (includeFlat || !this.isFlat(entity))) return entity;
    return null;
  }

  private handleTap(pointer: Phaser.Input.Pointer): void {
    const { x, y } = pointer;
    if (this.readOnly) {
      // En visite, toucher un bâtiment le fait juste rebondir.
      const picked = this.pick(x, y, false);
      const view = picked ? this.views.get(picked.id) : undefined;
      if (view) this.bounce(view);
      return;
    }
    if (this.placement) {
      const p = this.placement;
      const def = getBuildingDef(p.defId);
      const tile = this.tileAt(x, y);
      const onGhost = tile.x >= p.x && tile.x < p.x + def.size.w && tile.y >= p.y && tile.y < p.y + def.size.d;
      // Toucher la construction fantôme la pose ; toucher ailleurs la déplace.
      if (onGhost) this.confirmPlacement();
      else this.movePlacement(tile.x - Math.floor((def.size.w - 1) / 2), tile.y - Math.floor((def.size.d - 1) / 2));
      return;
    }
    if (this.mode === 'edit') {
      const entity = this.pick(x, y, true);
      // La voie ferrée fait partie de la carte : elle ne se déplace pas.
      if (entity && entity.defId !== 'rail' && this.game_.isTileUnlocked(entity.x, entity.y)) this.select(entity.id);
      else this.select(null);
      return;
    }
    if (this.drops.count > 0) {
      const world = this.camCtl.screenToWorld(x, y);
      if (this.drops.collectNear(world.x, world.y, 80 * this.overlayScale)) return;
    }
    const entity = this.pick(x, y, false);
    if (entity && this.game_.isTileUnlocked(entity.x, entity.y)) {
      this.interact(entity, this.toCss(x, y));
      return;
    }
    const tile = this.tileAt(x, y);
    const inMap = tile.x >= 0 && tile.y >= 0 && tile.x < MAP_W && tile.y < MAP_H;
    if (inMap && !this.game_.isTileUnlocked(tile.x, tile.y)) {
      const { cx, cy } = chunkOf(tile.x, tile.y);
      this.ctx.bus.emit('world:lockedTap', { cx, cy, screen: this.toCss(x, y) });
      return;
    }
    this.ctx.bus.emit('world:emptyTap', undefined);
  }

  /** Action principale sur une construction touchée. */
  private interact(entity: Entity, screen: ScreenPoint): void {
    const { game, bus } = this.ctx;
    const view = this.views.get(entity.id);
    if (view) this.bounce(view);
    const action = game.primaryAction(entity);
    let result: { ok: boolean; reason?: FailReason; missing?: number } | null = null;
    switch (action.type) {
      case 'finishBuild':
        result = game.finishBuild(entity.id);
        break;
      case 'finishUpgrade':
        result = game.finishUpgrade(entity.id);
        break;
      case 'unloadBoat':
        result = game.unloadBoat(entity.id);
        if (result.ok && view) this.supplyFx(view);
        break;
      case 'unloadTrain':
        result = game.unloadTrain(entity.id);
        break;
      case 'collectRent':
        result = game.collectRent(entity.id);
        break;
      case 'harvest':
        result = game.harvest(entity.id);
        break;
      case 'supply':
        result = game.supply(entity.id);
        if (result.ok && view) this.supplyFx(view);
        break;
      case 'collectBusiness':
        result = game.collectBusiness(entity.id);
        break;
      case 'plant':
        if (this.plantCropId) result = game.plant(entity.id, this.plantCropId);
        else bus.emit('world:entityInfo', { entityId: entity.id, screen, action });
        break;
      default:
        bus.emit('world:entityInfo', { entityId: entity.id, screen, action });
    }
    if (result) bus.emit('world:action', { type: action.type, ok: result.ok });
    if (result && !result.ok && result.reason) {
      bus.emit('world:fail', { reason: result.reason, missing: result.missing, screen });
    }
  }

  private select(id: number | null): void {
    if (this.selectedId !== null) {
      const previous = this.views.get(this.selectedId);
      previous?.main.clearTint();
    }
    this.selectedId = id;
    this.overlay.clear();
    if (id === null) {
      this.ctx.bus.emit('world:editSelect', null);
      return;
    }
    const view = this.views.get(id);
    if (!view) return;
    view.main.setTint(0xbfe9ff);
    const def = getBuildingDef(view.entity.defId);
    this.drawFootprint(view.entity.x, view.entity.y, def.size.w, def.size.d, 0x4fc3f7, 0.35);
    const screen = this.entityScreenPoint(id);
    if (screen) this.ctx.bus.emit('world:editSelect', { entityId: id, screen });
  }

  private focusEntity(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    const def = getBuildingDef(view.entity.defId);
    this.focusWorld(footprintCenter(view.entity.x, view.entity.y, def.size.w, def.size.d));
  }

  /** Glisse la caméra jusqu'à un point du monde. */
  private focusWorld(target: { x: number; y: number }): void {
    const cam = this.cameras.main;
    this.camCtl.stop();
    this.tweens.add({
      targets: cam,
      scrollX: target.x - cam.width / 2,
      scrollY: target.y - cam.height / 2,
      duration: 450,
      ease: 'Sine.easeInOut',
      onComplete: () => this.camCtl.centerOn(target.x, target.y),
    });
  }

  // ———————————————————————————— Placement ————————————————————————————

  private startMoveOf(entityId: number): void {
    const entity = this.game_.getEntity(entityId);
    if (!entity) return;
    this.select(null);
    this.startPlacement(entity.defId, entityId);
  }

  private startPlacement(defId: string, moveId: number | null): void {
    this.endPlacement();
    const def = getBuildingDef(defId);
    let x: number;
    let y: number;
    if (moveId !== null) {
      const entity = this.game_.getEntity(moveId);
      if (!entity) return;
      x = entity.x;
      y = entity.y;
      const original = this.views.get(moveId);
      original?.main.setAlpha(0.25);
      original?.crop?.setAlpha(0.25);
      original?.badge?.setVisible(false);
    } else {
      const center = this.camCtl.center();
      const tile = worldToTile(center.x, center.y);
      const spot = this.nearestFreeSpot(
        Math.floor(tile.x - def.size.w / 2 + 0.5),
        Math.floor(tile.y - def.size.d / 2 + 0.5),
        defId,
      );
      x = spot.x;
      y = spot.y;
    }
    const key = defId === 'road' ? ArtKey.road(0) : ArtKey.building(defId);
    const piece = this.ctx.art.get(key);
    const ghost = this.add
      .image(0, 0, key)
      .setOrigin(piece.originX, piece.originY)
      .setAlpha(0.85)
      .setDepth(DEPTH_GHOST);
    this.placement = { defId, moveId, x, y, ghost, valid: false, reason: null };
    this.arrow.setVisible(false);
    this.movePlacement(x, y, true);
  }

  private nearestFreeSpot(cx: number, cy: number, defId: string): { x: number; y: number } {
    const def = getBuildingDef(defId);
    const radius = def.placement === 'bridge' ? 40 : 10;
    // D'abord une place au bord d'une route (le bâtiment y fonctionnera), sinon la plus proche.
    for (const connected of [true, false]) {
      for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = cx + dx;
            const y = cy + dy;
            if (connected && !this.game_.wouldConnect(def, x, y)) continue;
            if (this.game_.checkPlacement(def, x, y) === null) return { x, y };
          }
        }
      }
    }
    return { x: cx, y: cy };
  }

  private movePlacement(x: number, y: number, force = false): void {
    const p = this.placement;
    if (!p || (!force && p.x === x && p.y === y)) return;
    const def = getBuildingDef(p.defId);
    p.x = Math.max(-def.size.w + 1, Math.min(MAP_W - 1, x));
    p.y = Math.max(-def.size.d + 1, Math.min(MAP_H - 1, y));
    let reason = this.game_.checkPlacement(def, p.x, p.y, p.moveId ?? 0);
    if (!reason && p.moveId === null) {
      const purchase = this.game_.checkPurchase(def);
      if (!purchase.ok) reason = purchase.reason;
    }
    p.valid = reason === null;
    p.reason = reason;
    if (def.id === 'road') {
      const mask = roadMask((rx, ry) => this.game_.isRoad(rx, ry), p.x, p.y);
      const key = ArtKey.road(mask);
      const piece = this.ctx.art.get(key);
      p.ghost.setTexture(key).setOrigin(piece.originX, piece.originY);
    }
    const pos = tileToWorld(p.x, p.y);
    p.ghost.setPosition(pos.x, pos.y);
    if (p.valid) p.ghost.clearTint();
    else p.ghost.setTint(0xff8a80);
    this.overlay.clear();
    if (def.category === 'decoration') {
      const r = def.bonus.radius;
      this.drawFootprint(p.x - r, p.y - r, def.size.w + 2 * r, def.size.d + 2 * r, 0xffd54f, 0.16);
    }
    this.drawFootprint(p.x, p.y, def.size.w, def.size.d, p.valid ? 0x66bb6a : 0xef5350, 0.5);
    this.ctx.bus.emit('world:placement', {
      defId: p.defId,
      moving: p.moveId !== null,
      valid: p.valid,
      reason: p.reason,
    });
  }

  private confirmPlacement(): void {
    const p = this.placement;
    if (!p) return;
    const screen = this.toCss(this.cameras.main.width / 2, this.cameras.main.height / 2);
    if (!p.valid) {
      this.ctx.bus.emit('world:fail', { reason: p.reason ?? 'blocked', screen });
      this.cameras.main.shake(120, 0.002);
      return;
    }
    const def = getBuildingDef(p.defId);
    if (p.moveId !== null) {
      const result = this.game_.move(p.moveId, p.x, p.y);
      if (!result.ok) {
        this.ctx.bus.emit('world:fail', { reason: result.reason, screen });
        return;
      }
      this.endPlacement();
      return;
    }
    const result = this.game_.place(p.defId, p.x, p.y);
    if (!result.ok) {
      this.ctx.bus.emit('world:fail', { reason: result.reason, missing: result.missing, screen });
      return;
    }
    if (def.repeatPlacement && this.game_.checkPurchase(def).ok) {
      this.movePlacement(p.x, p.y, true);
    } else {
      this.endPlacement();
    }
  }

  private endPlacement(): void {
    const p = this.placement;
    if (!p) return;
    p.ghost.destroy();
    if (p.moveId !== null) {
      const original = this.views.get(p.moveId);
      original?.main.setAlpha(1);
      original?.crop?.setAlpha(1);
      original?.badge?.setVisible(true);
      if (original) this.syncView(original);
    }
    this.placement = null;
    this.overlay.clear();
    this.ctx.bus.emit('world:placement', null);
    this.refreshHint();
  }

  /** Pose des routes case par case (voisinage en croix) jusqu'à la case visée. */
  private paintTo(target: { x: number; y: number }): void {
    if (!this.paint.started) {
      this.paint.started = true;
      this.paintRoad(this.paint.x, this.paint.y);
    }
    let { x, y } = this.paint;
    while (x !== target.x || y !== target.y) {
      if (Math.abs(target.x - x) >= Math.abs(target.y - y)) x += Math.sign(target.x - x);
      else y += Math.sign(target.y - y);
      this.paintRoad(x, y);
    }
    this.paint.x = x;
    this.paint.y = y;
    this.movePlacement(x, y);
  }

  private paintRoad(x: number, y: number): void {
    const def = getBuildingDef('road');
    // Les cases déjà occupées (croisement avec une route existante…) sont simplement ignorées.
    if (this.game_.checkPlacement(def, x, y) !== null) return;
    const purchase = this.game_.checkPurchase(def);
    if (!purchase.ok) {
      if (!this.paint.warned) this.ctx.bus.emit('world:fail', { reason: purchase.reason, missing: purchase.missing });
      this.paint.warned = true;
      return;
    }
    this.game_.place('road', x, y);
  }

  private isOnGhost(pointer: Phaser.Input.Pointer): boolean {
    const p = this.placement;
    if (!p) return false;
    const def = getBuildingDef(p.defId);
    const tile = this.tileAt(pointer.x, pointer.y);
    return tile.x >= p.x && tile.x < p.x + def.size.w && tile.y >= p.y && tile.y < p.y + def.size.d;
  }

  private drawFootprint(x: number, y: number, w: number, d: number, color: number, alpha: number): void {
    const g = this.overlay;
    const a = tileToWorld(x, y);
    const b = tileToWorld(x + w, y);
    const c = tileToWorld(x + w, y + d);
    const e = tileToWorld(x, y + d);
    g.fillStyle(color, alpha);
    g.fillPoints(
      [a, b, c, e].map((p) => new Phaser.Math.Vector2(p.x, p.y)),
      true,
    );
    g.lineStyle(4, color, Math.min(1, alpha + 0.4));
    g.strokePoints(
      [a, b, c, e].map((p) => new Phaser.Math.Vector2(p.x, p.y)),
      true,
    );
  }

  // ———————————————————————————— Effets ————————————————————————————

  /** Repères d'une construction pour les effets : centre de l'emprise, haut visuel, taille. */
  private anchor(view: View): { x: number; y: number; top: number; w: number; d: number } {
    const def = getBuildingDef(view.entity.defId);
    const center = footprintCenter(view.entity.x, view.entity.y, def.size.w, def.size.d);
    return { x: center.x, y: center.y, top: this.topOf(view), w: def.size.w, d: def.size.d };
  }

  private bounce(view: View): void {
    this.fx.bounce(view.crop ? [view.main, view.crop] : [view.main]);
  }

  private popIn(view: View): void {
    this.fx.popIn(view.main);
    const a = this.anchor(view);
    this.fx.puffs(a.x, a.y, a.w, a.d, 5);
  }

  private supplyFx(view: View): void {
    const a = this.anchor(view);
    this.fx.crates(a.x, a.y);
  }

  private celebrate(view: View, text = t('world.done'), color = '#ffffff'): void {
    const a = this.anchor(view);
    this.fx.puffs(a.x, a.y, a.w, a.d, 8);
    this.fx.stars(a.x, a.top + 30);
    this.fx.popText(a.x, a.top - 40 * this.overlayScale, text, color, 0, this.overlayScale);
  }

  private onReward(entityId: number | null, reward: Reward): void {
    if (entityId === null) return;
    const view = this.views.get(entityId);
    if (!view) return;
    const a = this.anchor(view);
    const s = this.overlayScale;
    const lines: Array<[string, string]> = [];
    if (reward.coins) lines.push([`+${reward.coins}`, '#ffd54f']);
    if (reward.goods) lines.push([`+${reward.goods}`, '#ffb74d']);
    if (reward.xp) lines.push([`+${reward.xp} XP`, '#81d4fa']);
    lines.forEach(([text, color], i) => this.fx.popText(a.x, a.top + 20 + i * 38 * s, text, color, i * 120, s));
    // Pièces et XP tombent au sol (à ramasser) ; le reste s'envole directement.
    const ground: Reward = { coins: reward.coins, xp: reward.xp };
    if (ground.coins || ground.xp) {
      this.ctx.bus.emit('world:drops', ground);
      // Les pièces retombent devant le bâtiment (sous son coin avant), bien visibles.
      const front = a.y + ((a.w + a.d) / 2) * (TILE_H / 2);
      const spread = Math.max(a.w, a.d) * HALF_W * 0.9;
      this.drops.spawn(a.x, a.top + 40 * s, front + 10 * s, spread, ground, s);
    }
    const rest: Reward = { goods: reward.goods, cash: reward.cash, energy: reward.energy };
    const screen = this.entityScreenPoint(entityId);
    if (screen && (rest.goods || rest.cash || rest.energy)) this.ctx.bus.emit('fx:reward', { screen, reward: rest });
  }
}
