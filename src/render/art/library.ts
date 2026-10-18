import { BUILDINGS } from '@/data/buildings';
import { CROPS } from '@/data/crops';
import { boatArt, bridgeArt, movingTruckArt, BOAT_TIERS } from './boats';
import { buildingArt } from './buildings';
import { decorationArt } from './decorations';
import { createCanvas, type ArtPiece } from './IsoPainter';
import {
  badge,
  cloud,
  coinParticle,
  crateParticle,
  hintArrow,
  puffParticle,
  starParticle,
  walker,
  worker,
  hammerTool,
  type BadgeKind,
} from './sprites';
import {
  constructionSite,
  cropOverlay,
  forSaleSign,
  grassTile,
  plotTile,
  roadTile,
  sandTile,
  waterTile,
  GRASS_COLORS,
  WATER_VARIANTS,
} from './terrain';

export const GRASS_VARIANTS = GRASS_COLORS.length;
export const WALKER_VARIANTS = 8;
export const CLOUD_VARIANTS = 2;
export const SAND_VARIANTS = 2;
export { WATER_VARIANTS };

/** Clés de textures partagées entre le rendu Phaser et l'interface. */
export const ArtKey = {
  grass: (variant: number) => `grass_${variant}`,
  road: (mask: number) => `road_${mask}`,
  sand: (variant: number) => `sand_${variant}`,
  water: (variant: number, shallow: boolean) => `water_${shallow ? 's' : 'd'}${variant}`,
  boat: (tier: number) => `boat_${tier}`,
  truck: (axis: 'x' | 'y') => `truck_${axis}`,
  worker: 'worker',
  hammerTool: 'hammer_tool',
  building: (defId: string) => `bld_${defId}`,
  crop: (cropId: string, stage: 'sprout' | 'growing' | 'ripe') => `crop_${cropId}_${stage}`,
  cropIcon: (cropId: string) => `cropicon_${cropId}`,
  construction: (size: number) => `construction_${size}`,
  badge: (kind: BadgeKind) => `badge_${kind}`,
  walker: (variant: number) => `walker_${variant}`,
  cloud: (variant: number) => `cloud_${variant}`,
  forSale: 'for_sale',
  coin: 'fx_coin',
  crate: 'fx_crate',
  star: 'fx_star',
  xpStar: 'fx_xp',
  puff: 'fx_puff',
  arrow: 'hint_arrow',
} as const;

/** Superpose deux pièces isométriques de même largeur en alignant leurs origines. */
function compose(base: ArtPiece, overlay: ArtPiece): ArtPiece {
  const baseOy = base.originY * base.canvas.height;
  const overOy = overlay.originY * overlay.canvas.height;
  const oy = Math.max(baseOy, overOy);
  const below = Math.max(base.canvas.height - baseOy, overlay.canvas.height - overOy);
  const { canvas, ctx } = createCanvas(Math.max(base.canvas.width, overlay.canvas.width), oy + below);
  ctx.drawImage(base.canvas, 0, oy - baseOy);
  ctx.drawImage(overlay.canvas, 0, oy - overOy);
  return { canvas, originX: base.originX, originY: oy / canvas.height };
}

export class ArtLibrary {
  readonly pieces = new Map<string, ArtPiece>();
  private iconCache = new Map<string, string>();

  get(key: string): ArtPiece {
    const piece = this.pieces.get(key);
    if (!piece) throw new Error(`Texture inconnue : ${key}`);
    return piece;
  }

  has(key: string): boolean {
    return this.pieces.has(key);
  }

  /** Vignette (data URL) pour l'interface HTML, réduite à `max` px. */
  iconUrl(key: string, max = 132): string {
    const cacheKey = `${key}@${max}`;
    const cached = this.iconCache.get(cacheKey);
    if (cached) return cached;
    const piece = this.pieces.get(key);
    if (!piece) return '';
    const { width, height } = piece.canvas;
    const scale = Math.min(1, max / Math.max(width, height));
    const { canvas, ctx } = createCanvas(width * scale, height * scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(piece.canvas, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    this.iconCache.set(cacheKey, url);
    return url;
  }

  private add(key: string, piece: ArtPiece | null): void {
    if (piece) this.pieces.set(key, piece);
  }

  static build(): ArtLibrary {
    const lib = new ArtLibrary();
    for (let i = 0; i < GRASS_VARIANTS; i++) lib.add(ArtKey.grass(i), grassTile(i));
    for (let i = 0; i < SAND_VARIANTS; i++) lib.add(ArtKey.sand(i), sandTile(i));
    for (let i = 0; i < WATER_VARIANTS; i++) {
      lib.add(ArtKey.water(i, true), waterTile(i, true));
      lib.add(ArtKey.water(i, false), waterTile(i, false));
    }
    for (const tier of BOAT_TIERS) lib.add(ArtKey.boat(tier), boatArt(tier));
    lib.add(ArtKey.worker, worker());
    lib.add(ArtKey.hammerTool, hammerTool());
    lib.add(ArtKey.truck('x'), movingTruckArt('x'));
    lib.add(ArtKey.truck('y'), movingTruckArt('y'));
    for (let mask = 0; mask < 16; mask++) lib.add(ArtKey.road(mask), roadTile(mask));
    const plot = plotTile();
    for (const def of BUILDINGS) {
      if (def.id === 'road') continue;
      if (def.id === 'bridge') {
        lib.add(ArtKey.building(def.id), bridgeArt());
        continue;
      }
      if (def.category === 'farm') lib.add(ArtKey.building(def.id), plot);
      else if (def.category === 'decoration') lib.add(ArtKey.building(def.id), decorationArt(def.id));
      else lib.add(ArtKey.building(def.id), buildingArt(def.id));
    }
    lib.add(ArtKey.building('road'), roadTile(5));
    for (const crop of CROPS) {
      for (const stage of ['sprout', 'growing', 'ripe'] as const) {
        lib.add(ArtKey.crop(crop.id, stage), cropOverlay(crop.id, stage));
      }
      lib.add(ArtKey.cropIcon(crop.id), compose(plot, lib.get(ArtKey.crop(crop.id, 'ripe'))));
    }
    for (const size of [1, 2, 3, 4]) lib.add(ArtKey.construction(size), constructionSite(size));
    for (const kind of ['coin', 'goods', 'build', 'harvest', 'plant', 'fish'] as const)
      lib.add(ArtKey.badge(kind), badge(kind));
    for (let i = 0; i < WALKER_VARIANTS; i++) lib.add(ArtKey.walker(i), walker(i));
    for (let i = 0; i < CLOUD_VARIANTS; i++) lib.add(ArtKey.cloud(i), cloud(i));
    lib.add(ArtKey.forSale, forSaleSign());
    lib.add(ArtKey.coin, coinParticle());
    lib.add(ArtKey.crate, crateParticle());
    lib.add(ArtKey.star, starParticle());
    lib.add(ArtKey.xpStar, starParticle('#7fd7ff'));
    lib.add(ArtKey.puff, puffParticle());
    lib.add(ArtKey.arrow, hintArrow());
    for (const def of BUILDINGS) {
      if (!lib.has(ArtKey.building(def.id))) throw new Error(`Aucun visuel pour ${def.id}`);
    }
    return lib;
  }
}
