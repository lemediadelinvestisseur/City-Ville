import type Phaser from 'phaser';
import { CAR_COLORS } from './art/boats';
import { ArtKey } from './art/library';
import { depthOf, tileToWorld } from './iso';

interface Car {
  sprite: Phaser.GameObjects.Image;
  color: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  speed: number;
}

const key = (x: number, y: number) => `${x},${y}`;
const NEIGHBORS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/** Voitures qui roulent sur les routes, à droite (purement décoratif) : la ville vit. */
export class CarSystem {
  private cars: Car[] = [];
  private roads = new Set<string>();
  private roadList: Array<{ x: number; y: number }> = [];

  constructor(private readonly scene: Phaser.Scene) {}

  setRoads(tiles: Array<{ x: number; y: number }>): void {
    this.roads = new Set(tiles.map((t) => key(t.x, t.y)));
    this.roadList = tiles;
    for (const car of this.cars) if (!this.roads.has(key(car.to.x, car.to.y))) this.respawn(car);
  }

  setTarget(count: number): void {
    const target = this.roadList.length < 6 ? 0 : count;
    while (this.cars.length < target) {
      const color = this.cars.length % CAR_COLORS.length;
      const sprite = this.scene.add.image(0, 0, ArtKey.car('x', color)).setOrigin(0.5, 0.75);
      const car: Car = {
        sprite,
        color,
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
        t: 0,
        speed: 1 + Math.random() * 0.7,
      };
      this.respawn(car);
      this.cars.push(car);
    }
    while (this.cars.length > target) this.cars.pop()?.sprite.destroy();
  }

  private respawn(car: Car): void {
    const tile = this.roadList[Math.floor(Math.random() * this.roadList.length)];
    if (!tile) return;
    car.from = { ...tile };
    car.to = this.nextTile(tile, null);
    car.t = Math.random();
  }

  private nextTile(at: { x: number; y: number }, came: { x: number; y: number } | null): { x: number; y: number } {
    const options = NEIGHBORS.map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy })).filter((n) =>
      this.roads.has(key(n.x, n.y)),
    );
    const forward = came ? options.filter((n) => n.x !== came.x || n.y !== came.y) : options;
    const pool = forward.length > 0 ? forward : options;
    return pool[Math.floor(Math.random() * pool.length)] ?? { ...at };
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const car of this.cars) {
      car.t += car.speed * dt;
      if (car.t >= 1) {
        const previous = car.from;
        car.from = car.to;
        car.to = this.nextTile(car.from, previous);
        car.t -= 1;
        if (!this.roads.has(key(car.from.x, car.from.y))) this.respawn(car);
      }
      const dx = car.to.x - car.from.x;
      const dy = car.to.y - car.from.y;
      // On roule à droite : décalage perpendiculaire au sens de la marche.
      const fx = car.from.x + 0.5 + dx * car.t + -dy * 0.2;
      const fy = car.from.y + 0.5 + dy * car.t + dx * 0.2;
      const axis = dx !== 0 ? 'x' : 'y';
      const texture = ArtKey.car(axis, car.color);
      if (car.sprite.texture.key !== texture) car.sprite.setTexture(texture);
      const pos = tileToWorld(fx, fy);
      car.sprite.setPosition(pos.x, pos.y).setDepth(depthOf(fx - 0.5, fy - 0.5, 1, 1) + 0.4);
    }
  }

  setVisible(visible: boolean): void {
    for (const car of this.cars) car.sprite.setVisible(visible);
  }
}
