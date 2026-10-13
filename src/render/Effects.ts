import type Phaser from 'phaser';
import { ArtKey } from './art/library';
import { HALF_H, HALF_W } from './iso';

export const DEPTH_FX = 3_000_000;

const TEXT_STYLE = {
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  fontSize: '34px',
  fontStyle: '900',
  stroke: '#3b2a12',
  strokeThickness: 7,
};

/** Effets visuels éphémères : rebonds, fumée, étoiles, pièces et textes flottants. */
export class Effects {
  constructor(private readonly scene: Phaser.Scene) {}

  /** Petit écrasement élastique au toucher. */
  bounce(targets: Phaser.GameObjects.Image[]): void {
    const { tweens } = this.scene;
    tweens.killTweensOf(targets);
    for (const target of targets) target.setScale(1);
    tweens.add({ targets, scaleY: 0.93, scaleX: 1.04, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Apparition d'une construction posée. */
  popIn(target: Phaser.GameObjects.Image): void {
    target.setScale(0.6).setAlpha(0.3);
    this.scene.tweens.add({ targets: target, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  shake(intensity = 0.0015): void {
    this.scene.cameras.main.shake(60, intensity);
  }

  /** Nuages de poussière autour d'une emprise w × d centrée en (x, y). */
  puffs(x: number, y: number, w: number, d: number, count: number): void {
    const { add, tweens } = this.scene;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      const puff = add
        .image(x, y, ArtKey.puff)
        .setDepth(DEPTH_FX)
        .setScale(1 + Math.random())
        .setAlpha(0.9);
      tweens.add({
        targets: puff,
        x: x + Math.cos(angle) * HALF_W * w * 0.8,
        y: y + Math.sin(angle) * HALF_H * d * 0.8 - 20,
        alpha: 0,
        scale: 2.4,
        duration: 650,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** Caisses qui tombent dans un commerce approvisionné. */
  crates(x: number, y: number): void {
    const { add, tweens } = this.scene;
    for (let i = 0; i < 5; i++) {
      const crate = add
        .image(x + (Math.random() - 0.5) * 60, y - 160, ArtKey.crate)
        .setDepth(DEPTH_FX)
        .setScale(1.4);
      tweens.add({
        targets: crate,
        y: y - 10,
        alpha: 0.2,
        duration: 420,
        delay: i * 60,
        ease: 'Quad.easeIn',
        onComplete: () => crate.destroy(),
      });
    }
  }

  /** Gerbe d'étoiles (chantier terminé). */
  stars(x: number, y: number): void {
    const { add, tweens } = this.scene;
    for (let i = 0; i < 10; i++) {
      const star = add.image(x, y, ArtKey.star).setDepth(DEPTH_FX).setScale(1.4);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const dist = 120 + Math.random() * 120;
      tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        angle: 360,
        alpha: 0,
        duration: 900,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  /** Pièces qui jaillissent puis retombent. */
  coinBurst(x: number, y: number, count: number): void {
    const { add, tweens } = this.scene;
    for (let i = 0; i < count; i++) {
      const coin = add.image(x, y, ArtKey.coin).setDepth(DEPTH_FX).setScale(1.5);
      tweens.add({ targets: coin, x: x + (Math.random() - 0.5) * 180, duration: 600, ease: 'Linear' });
      tweens.add({
        targets: coin,
        y: y - 60 - Math.random() * 60,
        duration: 260,
        ease: 'Quad.easeOut',
        yoyo: true,
        onComplete: () => {
          tweens.add({ targets: coin, alpha: 0, scale: 0.6, duration: 260, onComplete: () => coin.destroy() });
        },
      });
    }
  }

  /** Texte qui s'élève puis disparaît (« +30 », « Terminé ! »…). */
  popText(x: number, y: number, text: string, color: string, delay: number, scale: number): void {
    const { add, tweens } = this.scene;
    const label = add
      .text(x, y, text, { ...TEXT_STYLE, color })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_FX + 1)
      .setScale(scale)
      .setAlpha(0);
    tweens.add({
      targets: label,
      alpha: { from: 0, to: 1 },
      y: y - 30 * scale,
      duration: 220,
      delay,
      ease: 'Back.easeOut',
      onComplete: () => {
        tweens.add({
          targets: label,
          y: label.y - 50 * scale,
          alpha: 0,
          duration: 900,
          delay: 350,
          onComplete: () => label.destroy(),
        });
      },
    });
  }
}
