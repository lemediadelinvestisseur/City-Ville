import type Phaser from 'phaser';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pilote la caméra : déplacement au doigt avec inertie, zoom au pincement ou
 * à la molette autour d'un point, et maintien dans les limites de la carte.
 *
 * `userZoom` s'exprime en pixels CSS par unité de monde ; le zoom Phaser
 * réel tient compte de la densité de pixels de l'écran.
 */
export class CameraController {
  userZoom: number;
  private velocity = { x: 0, y: 0 };

  constructor(
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly dpr: number,
    private readonly bounds: Rect,
    private readonly minZoom: number,
    private readonly maxZoom: number,
    initialZoom: number,
  ) {
    this.userZoom = initialZoom;
    this.cam.setOrigin(0.5, 0.5);
    this.apply();
  }

  get zoom(): number {
    return this.userZoom * this.dpr;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { cam } = this;
    const z = this.zoom;
    return {
      x: (sx - cam.width / 2) / z + cam.scrollX + cam.width / 2,
      y: (sy - cam.height / 2) / z + cam.scrollY + cam.height / 2,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const { cam } = this;
    const z = this.zoom;
    return {
      x: (wx - cam.scrollX - cam.width / 2) * z + cam.width / 2,
      y: (wy - cam.scrollY - cam.height / 2) * z + cam.height / 2,
    };
  }

  /** Déplace la vue d'un décalage écran (pixels du jeu). */
  panBy(dx: number, dy: number): void {
    this.cam.scrollX -= dx / this.zoom;
    this.cam.scrollY -= dy / this.zoom;
    this.clamp();
  }

  /** Zoom en gardant fixe le point du monde situé sous (sx, sy). */
  zoomAt(userZoom: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.userZoom = Math.max(this.minZoom, Math.min(this.maxZoom, userZoom));
    this.cam.setZoom(this.zoom);
    const after = this.screenToWorld(sx, sy);
    this.cam.scrollX += before.x - after.x;
    this.cam.scrollY += before.y - after.y;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.cam.scrollX = wx - this.cam.width / 2;
    this.cam.scrollY = wy - this.cam.height / 2;
    this.clamp();
  }

  /** Point du monde au centre de l'écran. */
  center(): { x: number; y: number } {
    return { x: this.cam.scrollX + this.cam.width / 2, y: this.cam.scrollY + this.cam.height / 2 };
  }

  apply(): void {
    this.cam.setZoom(this.zoom);
    this.clamp();
  }

  setVelocity(vx: number, vy: number): void {
    this.velocity.x = vx;
    this.velocity.y = vy;
  }

  stop(): void {
    this.velocity.x = 0;
    this.velocity.y = 0;
  }

  /** Inertie après un glissé. Renvoie vrai si la caméra a bougé. */
  update(deltaMs: number): boolean {
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed < 0.01) return false;
    this.panBy(this.velocity.x * deltaMs, this.velocity.y * deltaMs);
    const decay = Math.pow(0.9, deltaMs / 16.67);
    this.velocity.x *= decay;
    this.velocity.y *= decay;
    return true;
  }

  private clamp(): void {
    const { cam, bounds } = this;
    const z = this.zoom;
    const viewW = cam.width / z;
    const viewH = cam.height / z;
    const clampAxis = (scroll: number, size: number, view: number, min: number, extent: number) => {
      let left = scroll + size / 2 - view / 2;
      if (extent <= view) left = min + (extent - view) / 2;
      else left = Math.max(min, Math.min(min + extent - view, left));
      return left - size / 2 + view / 2;
    };
    cam.scrollX = clampAxis(cam.scrollX, cam.width, viewW, bounds.x, bounds.w);
    cam.scrollY = clampAxis(cam.scrollY, cam.height, viewH, bounds.y, bounds.h);
  }
}
