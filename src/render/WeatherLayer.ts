import type Phaser from 'phaser';
import { weatherAt, type Weather } from '@/core/weather';

interface Drop {
  x: number;
  y: number;
  speed: number;
  size: number;
}

/**
 * Pluie et neige dessinées par-dessus la ville (fixes à l'écran) selon la
 * météo du moment ; le ciel s'assombrit un peu quand il pleut.
 */
export class WeatherLayer {
  private graphics: Phaser.GameObjects.Graphics;
  private drops: Drop[] = [];
  private weather: Weather = 'sun';
  private checkAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  get current(): Weather {
    return this.weather;
  }

  update(deltaMs: number, time: number): void {
    if (time >= this.checkAt) {
      this.checkAt = time + 30_000;
      this.weather = weatherAt(Date.now());
    }
    const g = this.graphics;
    g.clear();
    if (this.weather !== 'rain' && this.weather !== 'snow') return;
    const { width, height } = this.scene.scale;
    const count = this.weather === 'rain' ? 90 : 60;
    while (this.drops.length < count) {
      this.drops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: this.weather === 'rain' ? 900 + Math.random() * 500 : 50 + Math.random() * 60,
        size: this.weather === 'rain' ? 14 + Math.random() * 12 : 2 + Math.random() * 3,
      });
    }
    this.drops.length = count;
    const dt = deltaMs / 1000;
    if (this.weather === 'rain') {
      g.fillStyle(0x34495e, 0.12);
      g.fillRect(0, 0, width, height);
      g.lineStyle(2, 0xdbe9f6, 0.55);
    } else g.fillStyle(0xffffff, 0.9);
    for (const drop of this.drops) {
      drop.y += drop.speed * dt;
      drop.x += (this.weather === 'rain' ? -0.25 * drop.speed : Math.sin(time / 900 + drop.size) * 20) * dt;
      if (drop.y > height + 20 || drop.x < -20) {
        drop.y = -20;
        drop.x = Math.random() * (width + 100);
      }
      if (this.weather === 'rain') g.lineBetween(drop.x, drop.y, drop.x + drop.size * 0.25, drop.y - drop.size);
      else g.fillCircle(drop.x, drop.y, drop.size);
    }
  }
}
