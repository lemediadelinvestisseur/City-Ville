import Phaser from 'phaser';
import { dayNightAt, type DayNightMode, type DayNightState } from '@/core/dayNight';
import type { Entity } from '@/core/types';
import { getBuildingDef } from '@/data/buildings';
import { footprintCenter } from './iso';

const GLOW_KEY = 'fx_night_glow';
const NIGHT_COLOR = { r: 0x06, g: 0x0d, b: 0x33 };
const DUSK_COLOR = { r: 0xc2, g: 0x4a, b: 0x14 };

/** Où une construction s'éclaire la nuit : fenêtres (bâtiments) ou point lumineux (lampadaire, phare…). */
function lightFor(entity: Entity): { lift: number; scale: number; alpha: number } | null {
  if (!entity.built) return null;
  const def = getBuildingDef(entity.defId);
  const size = Math.max(def.size.w, def.size.d);
  switch (def.category) {
    case 'house':
    case 'business':
    case 'community':
    case 'port':
      return { lift: 22 + size * 10, scale: 0.55 + size * 0.28, alpha: 0.4 };
    case 'decoration':
      if (def.id === 'lamp') return { lift: 70, scale: 0.5, alpha: 0.9 };
      if (def.id === 'lighthouse') return { lift: 128, scale: 1.1, alpha: 1 };
      if (def.id === 'fountain' || def.id === 'grand_fountain')
        return { lift: 10, scale: 0.4 + size * 0.2, alpha: 0.5 };
      return null;
    case 'road':
      return def.id === 'bridge' ? { lift: 40, scale: 1.6, alpha: 0.5 } : null;
    default:
      return null;
  }
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Assombrit le monde la nuit (voile bleu nuit au-dessus des constructions,
 * orangé au crépuscule) et allume des halos chauds sur les bâtiments et lampadaires.
 */
export class NightLayer {
  private shade: Phaser.GameObjects.Rectangle;
  private glows = new Map<number, Phaser.GameObjects.Image>();
  private state: DayNightState = { phase: 'day', darkness: 0, twilight: 0, nextChangeAt: Infinity };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private mode: DayNightMode,
  ) {
    if (!scene.textures.exists(GLOW_KEY)) scene.textures.addCanvas(GLOW_KEY, NightLayer.glowCanvas());
    // Un très grand rectangle fixe couvre tout le monde, quel que soit le cadrage.
    this.shade = scene.add.rectangle(0, 2000, 200_000, 200_000, 0x000000).setDepth(depth).setVisible(false);
  }

  private static glowCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,226,150,0.95)');
      g.addColorStop(0.35, 'rgba(255,196,110,0.45)');
      g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    return canvas;
  }

  get current(): DayNightState {
    return this.state;
  }

  setMode(mode: DayNightMode): void {
    this.mode = mode;
  }

  /** Recalcule la lumière (à appeler régulièrement) et synchronise les halos. */
  refresh(now: number, entities: readonly Entity[], isLit: (entity: Entity) => boolean): void {
    const date = new Date(now);
    this.state = dayNightAt(now, this.mode, date.getHours() + date.getMinutes() / 60);
    const { darkness, twilight } = this.state;
    const tint = Math.min(1, twilight * (1 - darkness) * 2);
    const color = Phaser.Display.Color.GetColor(
      lerp(NIGHT_COLOR.r, DUSK_COLOR.r, tint),
      lerp(NIGHT_COLOR.g, DUSK_COLOR.g, tint),
      lerp(NIGHT_COLOR.b, DUSK_COLOR.b, tint),
    );
    const alpha = Math.max(darkness * 0.7, twilight * 0.3);
    this.shade
      .setFillStyle(color, 1)
      .setAlpha(alpha)
      .setVisible(alpha > 0.01);

    const glowAlpha = Math.max(0, (darkness - 0.25) / 0.75);
    const wanted = new Set<number>();
    if (glowAlpha > 0) {
      for (const entity of entities) {
        const light = lightFor(entity);
        if (!light || !isLit(entity)) continue;
        wanted.add(entity.id);
        let glow = this.glows.get(entity.id);
        if (!glow) {
          glow = this.scene.add
            .image(0, 0, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(this.depth + 1);
          this.glows.set(entity.id, glow);
        }
        const def = getBuildingDef(entity.defId);
        const center = footprintCenter(entity.x, entity.y, def.size.w, def.size.d);
        glow
          .setPosition(center.x, center.y - light.lift)
          .setScale(light.scale * 2)
          .setAlpha(glowAlpha * light.alpha);
      }
    }
    for (const [id, glow] of this.glows) {
      if (!wanted.has(id)) {
        glow.destroy();
        this.glows.delete(id);
      }
    }
  }
}
