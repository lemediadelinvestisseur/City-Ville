import { HALF_H, HALF_W } from '../iso';
import { shade } from './color';

/** Point 3D : x et y en cases, z en pixels au-dessus du sol. */
export type V3 = readonly [number, number, number];

export interface ArtPiece {
  canvas: HTMLCanvasElement;
  /** Origine normalisée (pour `setOrigin`) : coin nord de l'emprise pour les objets isométriques. */
  originX: number;
  originY: number;
}

export function createCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { canvas, ctx };
}

/** Crée un canevas dimensionné pour un objet d'emprise w × d et de hauteur `height` px. */
export function isoCanvas(
  w: number,
  d: number,
  height: number,
  pad = 8,
): { painter: IsoPainter; finish: () => ArtPiece } {
  const { canvas, ctx } = createCanvas((w + d) * HALF_W + pad * 2, (w + d) * HALF_H + height + pad * 2);
  const ox = pad + d * HALF_W;
  const oy = pad + height;
  const painter = new IsoPainter(ctx, ox, oy);
  return { painter, finish: () => ({ canvas, originX: ox / canvas.width, originY: oy / canvas.height }) };
}

const FACE_UX = HALF_W / Math.hypot(HALF_W, HALF_H);
const FACE_UY = HALF_H / Math.hypot(HALF_W, HALF_H);

export interface BoxColors {
  top: string;
  left: string;
  right: string;
  outline?: string;
}

/** Couleurs d'une boîte éclairée par la gauche à partir d'une teinte. */
export function boxColors(base: string, outline = true): BoxColors {
  return {
    top: shade(base, 0.18),
    left: base,
    right: shade(base, -0.2),
    ...(outline ? { outline: shade(base, -0.45) } : {}),
  };
}

/** Pinceau isométrique : dessine des volumes à partir de coordonnées de cases. */
export class IsoPainter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly ox: number,
    readonly oy: number,
  ) {}

  p(x: number, y: number, z = 0): [number, number] {
    return [this.ox + (x - y) * HALF_W, this.oy + (x + y) * HALF_H - z];
  }

  path(points: readonly V3[]): void {
    const { ctx } = this;
    ctx.beginPath();
    points.forEach(([x, y, z], i) => {
      const [sx, sy] = this.p(x, y, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
  }

  fill(points: readonly V3[], style: string | CanvasGradient, stroke?: string | null, lineWidth = 1.2): void {
    this.path(points);
    this.ctx.fillStyle = style;
    this.ctx.fill();
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  line(a: V3, b: V3, style: string, width = 1.5): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(...this.p(...a));
    ctx.lineTo(...this.p(...b));
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** Dégradé vertical entre deux points 3D. */
  gradient(a: V3, b: V3, from: string, to: string): CanvasGradient {
    const [ax, ay] = this.p(...a);
    const [bx, by] = this.p(...b);
    const g = this.ctx.createLinearGradient(ax, ay, bx, by);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  }

  /** Losange horizontal à la hauteur z. */
  flat(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    style: string | CanvasGradient,
    stroke?: string,
  ): void {
    this.fill(
      [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      style,
      stroke,
    );
  }

  /** Ombre portée douce vers le bas-droite. */
  shadow(x0: number, y0: number, x1: number, y1: number, alpha = 0.22): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    this.fill(
      [
        [x0 + 0.1, y0 + 0.05, 0],
        [x1 + 0.35, y0 + 0.05, 0],
        [x1 + 0.35, y1 + 0.2, 0],
        [x0 + 0.1, y1 + 0.2, 0],
      ],
      '#1d2a12',
    );
    ctx.restore();
  }

  /** Parallélépipède : faces avant-gauche (plan y = y1), avant-droite (plan x = x1) et dessus. */
  box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: BoxColors): void {
    const left: V3[] = [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const right: V3[] = [
      [x1, y1, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
    ];
    const top: V3[] = [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const tall = z1 - z0 > 6;
    this.fill(
      left,
      tall ? this.gradient([x0, y1, z1], [x0, y1, z0], shade(c.left, 0.06), shade(c.left, -0.06)) : c.left,
      c.outline,
    );
    this.fill(
      right,
      tall ? this.gradient([x1, y1, z1], [x1, y1, z0], shade(c.right, 0.05), shade(c.right, -0.08)) : c.right,
      c.outline,
    );
    this.fill(top, c.top, c.outline);
  }

  /** Quadrilatère sur le plan vertical y = y (face avant-gauche). */
  leftQuad(
    xa: number,
    xb: number,
    za: number,
    zb: number,
    y: number,
    style: string | CanvasGradient,
    stroke?: string,
  ): void {
    this.fill(
      [
        [xa, y, za],
        [xb, y, za],
        [xb, y, zb],
        [xa, y, zb],
      ],
      style,
      stroke,
    );
  }

  /** Quadrilatère sur le plan vertical x = x (face avant-droite). */
  rightQuad(
    ya: number,
    yb: number,
    za: number,
    zb: number,
    x: number,
    style: string | CanvasGradient,
    stroke?: string,
  ): void {
    this.fill(
      [
        [x, ya, za],
        [x, yb, za],
        [x, yb, zb],
        [x, ya, zb],
      ],
      style,
      stroke,
    );
  }

  /** Fenêtre (cadre + vitre + reflet) sur une face. */
  window(
    side: 'left' | 'right',
    a: number,
    b: number,
    za: number,
    zb: number,
    plane: number,
    glass: string,
    frame: string,
  ): void {
    const quad = side === 'left' ? this.leftQuad.bind(this) : this.rightQuad.bind(this);
    const pad = 0.035;
    quad(a - pad, b + pad, za - 2.5, zb + 2.5, plane, frame);
    const g =
      side === 'left'
        ? this.gradient([a, plane, zb], [a, plane, za], shade(glass, 0.35), shade(glass, -0.1))
        : this.gradient([plane, a, zb], [plane, a, za], shade(glass, 0.25), shade(glass, -0.18));
    quad(a, b, za, zb, plane, g);
    // Reflet diagonal.
    const m = a + (b - a) * 0.3;
    const n = a + (b - a) * 0.55;
    const pts: V3[] =
      side === 'left'
        ? [
            [m, plane, zb],
            [n, plane, zb],
            [a + (b - a) * 0.25, plane, za + (zb - za) * 0.35],
            [a + (b - a) * 0.05, plane, za + (zb - za) * 0.35],
          ]
        : [
            [plane, m, zb],
            [plane, n, zb],
            [plane, a + (b - a) * 0.25, za + (zb - za) * 0.35],
            [plane, a + (b - a) * 0.05, za + (zb - za) * 0.35],
          ];
    this.ctx.save();
    this.ctx.globalAlpha = 0.35;
    this.fill(pts, '#ffffff');
    this.ctx.restore();
  }

  door(
    side: 'left' | 'right',
    center: number,
    width: number,
    height: number,
    plane: number,
    color: string,
    frame = '#f4efe6',
  ): void {
    const quad = side === 'left' ? this.leftQuad.bind(this) : this.rightQuad.bind(this);
    const a = center - width / 2;
    const b = center + width / 2;
    quad(a - 0.03, b + 0.03, 0, height + 3, plane, frame);
    quad(a, b, 0, height, plane, color, shade(color, -0.4));
    const knob: V3 =
      side === 'left' ? [b - width * 0.18, plane, height * 0.45] : [plane, a + width * 0.18, height * 0.45];
    const [kx, ky] = this.p(...knob);
    this.ctx.fillStyle = '#f7d774';
    this.ctx.beginPath();
    this.ctx.arc(kx, ky, 1.6, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Auvent rayé posé sur une face, qui avance vers l'extérieur. */
  awning(
    side: 'left' | 'right',
    a: number,
    b: number,
    zTop: number,
    plane: number,
    colors: readonly [string, string],
    depth = 0.32,
    drop = 16,
  ): void {
    const stripes = Math.max(4, Math.round((b - a) * 7));
    const step = (b - a) / stripes;
    for (let i = 0; i < stripes; i++) {
      const s = a + i * step;
      const e = s + step;
      const color = colors[i % 2] ?? colors[0];
      const pts: V3[] =
        side === 'left'
          ? [
              [s, plane, zTop],
              [e, plane, zTop],
              [e, plane + depth, zTop - drop],
              [s, plane + depth, zTop - drop],
            ]
          : [
              [plane, s, zTop],
              [plane, e, zTop],
              [plane + depth, e, zTop - drop],
              [plane + depth, s, zTop - drop],
            ];
      this.fill(pts, side === 'left' ? color : shade(color, -0.12));
      // Lambrequin.
      const val: V3[] =
        side === 'left'
          ? [
              [s, plane + depth, zTop - drop],
              [e, plane + depth, zTop - drop],
              [e, plane + depth, zTop - drop - 6],
              [s, plane + depth, zTop - drop - 6],
            ]
          : [
              [plane + depth, s, zTop - drop],
              [plane + depth, e, zTop - drop],
              [plane + depth, e, zTop - drop - 6],
              [plane + depth, s, zTop - drop - 6],
            ];
      this.fill(val, shade(color, -0.18));
    }
  }

  /** Texte plaqué sur une face (perspective isométrique). */
  faceText(
    side: 'left' | 'right',
    text: string,
    along: number,
    plane: number,
    z: number,
    font: string,
    fill: string,
    maxWidth?: number,
  ): void {
    const { ctx } = this;
    const [sx, sy] = side === 'left' ? this.p(along, plane, z) : this.p(plane, along, z);
    ctx.save();
    ctx.setTransform(FACE_UX, side === 'left' ? FACE_UY : -FACE_UY, 0, 1, sx, sy);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    // Une traduction plus longue est resserrée pour tenir sur l'enseigne.
    if (maxWidth) ctx.fillText(text, 0, 0, maxWidth);
    else ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /** Enseigne rectangulaire avec texte. */
  sign(
    side: 'left' | 'right',
    a: number,
    b: number,
    za: number,
    zb: number,
    plane: number,
    bg: string,
    fg: string,
    text: string,
  ): void {
    const quad = side === 'left' ? this.leftQuad.bind(this) : this.rightQuad.bind(this);
    quad(a, b, za, zb, plane, bg, shade(bg, -0.4));
    const size = Math.max(7, Math.min(13, (zb - za) * 0.75));
    const maxWidth = Math.abs(b - a) * Math.hypot(HALF_W, HALF_H) * 0.92;
    this.faceText(side, text, (a + b) / 2, plane, (za + zb) / 2, `800 ${size}px system-ui, sans-serif`, fg, maxWidth);
  }

  pyramidRoof(x0: number, y0: number, x1: number, y1: number, z: number, h: number, color: string, ov = 0.12): void {
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    const apex: V3 = [xm, ym, z + h];
    const a: V3 = [x0 - ov, y0 - ov, z];
    const b: V3 = [x1 + ov, y0 - ov, z];
    const c: V3 = [x1 + ov, y1 + ov, z];
    const d: V3 = [x0 - ov, y1 + ov, z];
    const outline = shade(color, -0.45);
    this.fill([a, d, apex], shade(color, 0.12), outline);
    this.fill([a, b, apex], shade(color, 0.05), outline);
    this.fill([d, c, apex], this.gradient(apex, d, shade(color, 0.08), shade(color, -0.05)), outline);
    this.fill([c, b, apex], this.gradient(apex, c, shade(color, -0.15), shade(color, -0.28)), outline);
    this.shingles([d, c, apex], color);
    // Rive claire le long des égouts avant (relief « cartoon »).
    this.line(a, d, shade(color, 0.4), 2.5);
    this.line(d, c, shade(color, 0.4), 2.5);
    this.line(c, b, shade(color, 0.15), 2.5);
  }

  /** Toit à deux pans, faîtage parallèle à l'axe x ; pignon visible sur la face droite. */
  gableRoofX(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    h: number,
    color: string,
    gable: string,
    ov = 0.14,
  ): void {
    const ym = (y0 + y1) / 2;
    const outline = shade(color, -0.45);
    const back: V3[] = [
      [x0 - ov, y0 - ov, z],
      [x1 + ov, y0 - ov, z],
      [x1 + ov, ym, z + h],
      [x0 - ov, ym, z + h],
    ];
    const front: V3[] = [
      [x0 - ov, y1 + ov, z],
      [x1 + ov, y1 + ov, z],
      [x1 + ov, ym, z + h],
      [x0 - ov, ym, z + h],
    ];
    this.fill(back, shade(color, 0.1), outline);
    this.fill(
      [
        [x1, y0, z],
        [x1, y1, z],
        [x1, ym, z + h],
      ],
      gable,
      shade(gable, -0.4),
    );
    this.fill(front, this.gradient([x0, ym, z + h], [x0, y1 + ov, z], shade(color, 0.08), shade(color, -0.1)), outline);
    this.shingles(front, color);
    this.line([x0 - ov, y1 + ov, z], [x1 + ov, y1 + ov, z], shade(color, 0.45), 3);
    // Rive du toit côté pignon.
    this.ctx.beginPath();
    this.ctx.moveTo(...this.p(x1 + ov, y0 - ov, z));
    this.ctx.lineTo(...this.p(x1 + ov, ym, z + h));
    this.ctx.lineTo(...this.p(x1 + ov, y1 + ov, z));
    this.ctx.strokeStyle = shade(color, -0.3);
    this.ctx.lineWidth = 3.5;
    this.ctx.stroke();
  }

  /** Toit à deux pans, faîtage parallèle à l'axe y ; pignon visible sur la face gauche. */
  gableRoofY(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    h: number,
    color: string,
    gable: string,
    ov = 0.14,
  ): void {
    const xm = (x0 + x1) / 2;
    const outline = shade(color, -0.45);
    const back: V3[] = [
      [x0 - ov, y0 - ov, z],
      [x0 - ov, y1 + ov, z],
      [xm, y1 + ov, z + h],
      [xm, y0 - ov, z + h],
    ];
    const front: V3[] = [
      [x1 + ov, y0 - ov, z],
      [x1 + ov, y1 + ov, z],
      [xm, y1 + ov, z + h],
      [xm, y0 - ov, z + h],
    ];
    this.fill(back, shade(color, 0.12), outline);
    this.fill(
      [
        [x0, y1, z],
        [x1, y1, z],
        [xm, y1, z + h],
      ],
      gable,
      shade(gable, -0.4),
    );
    this.fill(
      front,
      this.gradient([xm, y1, z + h], [x1 + ov, y1, z], shade(color, -0.12), shade(color, -0.26)),
      outline,
    );
    this.shingles(front, shade(color, -0.2));
    this.line([x1 + ov, y0 - ov, z], [x1 + ov, y1 + ov, z], shade(color, 0.25), 3);
    this.ctx.beginPath();
    this.ctx.moveTo(...this.p(x0 - ov, y1 + ov, z));
    this.ctx.lineTo(...this.p(xm, y1 + ov, z + h));
    this.ctx.lineTo(...this.p(x1 + ov, y1 + ov, z));
    this.ctx.strokeStyle = shade(color, -0.25);
    this.ctx.lineWidth = 3.5;
    this.ctx.stroke();
  }

  /** Lignes de tuiles parallèles au bas d'un pan (quadrilatère ou triangle). */
  private shingles(face: readonly V3[], color: string): void {
    const [a, b] = face;
    const top = face.length === 4 ? [face[3]!, face[2]!] : [face[2]!, face[2]!];
    if (!a || !b) return;
    const { ctx } = this;
    ctx.save();
    this.path(face);
    ctx.clip();
    ctx.strokeStyle = shade(color, -0.3);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    const rows = 5;
    for (let i = 1; i < rows; i++) {
      const t = i / rows;
      const lerp = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      const s = lerp(a, top[0]!);
      const e = lerp(b, top[1]!);
      ctx.beginPath();
      ctx.moveTo(...this.p(...s));
      ctx.lineTo(...this.p(...e));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Disque « au sol » (ellipse isométrique) centré sur un point. */
  groundEllipse(cx: number, cy: number, z: number, rx: number, style: string | CanvasGradient, stroke?: string): void {
    const [sx, sy] = this.p(cx, cy, z);
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx * HALF_W * Math.SQRT2, rx * HALF_H * Math.SQRT2, 0, 0, Math.PI * 2);
    ctx.fillStyle = style;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /** Cercle en coordonnées écran autour d'un point 3D. */
  dot(x: number, y: number, z: number, r: number, style: string | CanvasGradient, stroke?: string): void {
    const [sx, sy] = this.p(x, y, z);
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = style;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  /** Clôture en bois le long d'un bord (de a à b), avec poteaux. */
  fence(from: readonly [number, number], to: readonly [number, number], color: string, height = 13): void {
    const [fx, fy] = from;
    const [tx, ty] = to;
    const length = Math.hypot(tx - fx, ty - fy);
    const posts = Math.max(2, Math.round(length * 4) + 1);
    const dark = shade(color, -0.35);
    for (const z of [height * 0.45, height * 0.85]) {
      this.line([fx, fy, z], [tx, ty, z], dark, 3);
      this.line([fx, fy, z], [tx, ty, z], color, 1.6);
    }
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const x = fx + (tx - fx) * t;
      const y = fy + (ty - fy) * t;
      this.line([x, y, 0], [x, y, height], dark, 3.2);
      this.line([x, y, 0], [x, y, height + 1], color, 1.8);
    }
  }
}
