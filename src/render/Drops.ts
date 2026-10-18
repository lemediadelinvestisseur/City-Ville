import Phaser from 'phaser';
import type { Reward } from '@/core/types';
import { ArtKey } from './art/library';
import { DEPTH_FX } from './Effects';

/** Délai avant ramassage automatique d'une récompense restée au sol. */
const AUTO_COLLECT_MS = 7000;

interface Drop {
  sprite: Phaser.GameObjects.Image;
  reward: Reward;
  landedAt: number;
  collecting: boolean;
}

/**
 * Pièces et étoiles d'XP qui tombent au pied d'un bâtiment et qu'on ramasse
 * d'un toucher (ou au survol de la souris). Le jeu a déjà crédité la
 * récompense : le ramassage déclenche seulement l'envol vers les compteurs.
 */
export class DropSystem {
  private drops: Drop[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPickup: (x: number, y: number, reward: Reward) => void,
  ) {}

  get count(): number {
    return this.drops.length;
  }

  /** Fait jaillir la récompense depuis (x, top) et la fait retomber autour de (x, y). */
  spawn(x: number, top: number, y: number, spread: number, reward: Reward, scale: number): void {
    const parts: Array<{ key: string; reward: Reward }> = [];
    const coins = reward.coins ?? 0;
    const xp = reward.xp ?? 0;
    const coinCount = coins > 0 ? Math.min(5, 1 + Math.floor(coins / 80)) : 0;
    const xpCount = xp > 0 ? Math.min(3, 1 + Math.floor(xp / 15)) : 0;
    for (let i = 0; i < coinCount; i++) {
      const share = Math.floor(coins / coinCount) + (i === 0 ? coins % coinCount : 0);
      parts.push({ key: ArtKey.coin, reward: { coins: share } });
    }
    for (let i = 0; i < xpCount; i++) {
      const share = Math.floor(xp / xpCount) + (i === 0 ? xp % xpCount : 0);
      parts.push({ key: ArtKey.xpStar, reward: { xp: share } });
    }
    const { tweens } = this.scene;
    parts.forEach((part, i) => {
      const angle = (i / parts.length) * Math.PI * 2 + Math.random() * 0.6;
      const tx = x + Math.cos(angle) * spread * (0.45 + Math.random() * 0.35);
      const ty = y + Math.sin(angle) * spread * 0.3 + 18 * scale;
      const sprite = this.scene.add
        .image(x, top, part.key)
        .setDepth(DEPTH_FX - 2)
        .setScale(2.4 * scale);
      const drop: Drop = { sprite, reward: part.reward, landedAt: Infinity, collecting: false };
      this.drops.push(drop);
      // Arc : montée puis chute avec rebond.
      tweens.add({ targets: sprite, x: tx, duration: 620, delay: i * 50, ease: 'Linear' });
      tweens.add({
        targets: sprite,
        y: top - 70 * scale,
        duration: 230,
        delay: i * 50,
        ease: 'Quad.easeOut',
        onComplete: () => {
          tweens.add({
            targets: sprite,
            y: ty,
            duration: 390,
            ease: 'Bounce.easeOut',
            onComplete: () => {
              drop.landedAt = this.scene.time.now;
              sprite.setDepth(DEPTH_FX - 2);
              tweens.add({
                targets: sprite,
                scaleX: { from: 2.4 * scale, to: 1.7 * scale },
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
              });
            },
          });
        },
      });
    });
  }

  /** Ramasse les récompenses proches d'un point du monde ; renvoie vrai si au moins une l'a été. */
  collectNear(x: number, y: number, radius: number): boolean {
    let any = false;
    for (const drop of this.drops) {
      if (drop.collecting) continue;
      if (Phaser.Math.Distance.Between(x, y, drop.sprite.x, drop.sprite.y) <= radius) {
        this.collect(drop);
        any = true;
      }
    }
    return any;
  }

  /** Ramassage automatique des récompenses oubliées. */
  update(now: number): void {
    for (const drop of this.drops) {
      if (!drop.collecting && now - drop.landedAt > AUTO_COLLECT_MS) this.collect(drop);
    }
  }

  /** Ramasse tout (avant de quitter la scène, par exemple). */
  collectAll(): void {
    for (const drop of this.drops) if (!drop.collecting) this.collect(drop);
  }

  private collect(drop: Drop): void {
    drop.collecting = true;
    const { sprite } = drop;
    this.scene.tweens.killTweensOf(sprite);
    this.onPickup(sprite.x, sprite.y, drop.reward);
    this.scene.tweens.add({
      targets: sprite,
      y: sprite.y - 60,
      alpha: 0,
      scale: sprite.scale * 1.4,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        sprite.destroy();
        this.drops = this.drops.filter((d) => d !== drop);
      },
    });
  }
}
