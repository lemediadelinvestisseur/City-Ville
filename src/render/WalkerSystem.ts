import type Phaser from 'phaser';
import { ArtKey, WALKER_VARIANTS } from './art/library';
import { HALF_W, depthOf, tileToWorld } from './iso';

interface Walker {
  sprite: Phaser.GameObjects.Image;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  speed: number;
  lane: number;
  phase: number;
}

const key = (x: number, y: number) => `${x},${y}`;
const NEIGHBORS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/** Habitants qui se promènent sur les routes (purement décoratif). */
export class WalkerSystem {
  private walkers: Walker[] = [];
  private roads = new Set<string>();
  private roadList: Array<{ x: number; y: number }> = [];

  constructor(private readonly scene: Phaser.Scene) {}

  setRoads(tiles: Array<{ x: number; y: number }>): void {
    this.roads = new Set(tiles.map((t) => key(t.x, t.y)));
    this.roadList = tiles;
    for (const walker of this.walkers) {
      if (!this.roads.has(key(walker.to.x, walker.to.y))) this.respawn(walker);
    }
  }

  setTarget(count: number): void {
    const target = this.roadList.length < 2 ? 0 : count;
    while (this.walkers.length < target) {
      const sprite = this.scene.add.image(0, 0, ArtKey.walker(this.walkers.length % WALKER_VARIANTS));
      sprite.setOrigin(0.5, 41 / 44);
      const walker: Walker = {
        sprite,
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
        t: 0,
        speed: 0.45 + Math.random() * 0.35,
        lane: (Math.random() - 0.5) * 0.5,
        phase: Math.random() * Math.PI * 2,
      };
      this.respawn(walker);
      this.walkers.push(walker);
    }
    while (this.walkers.length > target) this.walkers.pop()?.sprite.destroy();
  }

  private respawn(walker: Walker): void {
    const tile = this.roadList[Math.floor(Math.random() * this.roadList.length)];
    if (!tile) return;
    walker.from = { ...tile };
    walker.to = this.nextTile(tile, null);
    walker.t = Math.random();
  }

  private nextTile(at: { x: number; y: number }, came: { x: number; y: number } | null): { x: number; y: number } {
    const options = NEIGHBORS.map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy })).filter((n) =>
      this.roads.has(key(n.x, n.y)),
    );
    const forward = came ? options.filter((n) => n.x !== came.x || n.y !== came.y) : options;
    const pool = forward.length > 0 ? forward : options;
    return pool[Math.floor(Math.random() * pool.length)] ?? { ...at };
  }

  update(deltaMs: number, time: number): void {
    const dt = deltaMs / 1000;
    for (const walker of this.walkers) {
      walker.t += walker.speed * dt;
      if (walker.t >= 1) {
        const previous = walker.from;
        walker.from = walker.to;
        walker.to = this.nextTile(walker.from, previous);
        walker.t -= 1;
        if (!this.roads.has(key(walker.from.x, walker.from.y))) this.respawn(walker);
      }
      const fx = walker.from.x + 0.5 + (walker.to.x - walker.from.x) * walker.t;
      const fy = walker.from.y + 0.5 + (walker.to.y - walker.from.y) * walker.t;
      // Décalage latéral (trottoir gauche ou droit) perpendiculaire au déplacement.
      const dx = walker.to.x - walker.from.x;
      const dy = walker.to.y - walker.from.y;
      const lx = fx + -dy * walker.lane;
      const ly = fy + dx * walker.lane;
      const pos = tileToWorld(lx, ly);
      walker.sprite.setPosition(pos.x, pos.y - Math.abs(Math.sin(time / 120 + walker.phase)) * 2.5);
      walker.sprite.setDepth(depthOf(lx - 0.5, ly - 0.5, 1, 1) + 0.5);
      // Se tourner dans le sens de la marche à l'écran.
      const screenDx = (dx - dy) * HALF_W;
      if (screenDx !== 0) walker.sprite.setFlipX(screenDx < 0);
    }
  }

  setVisible(visible: boolean): void {
    for (const walker of this.walkers) walker.sprite.setVisible(visible);
  }
}
