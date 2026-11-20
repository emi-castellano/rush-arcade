/** Tiny pixel-art toolkit: integer-only drawing helpers shared by the games and the hub. */
export type Ctx = CanvasRenderingContext2D;

export function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4x4 ordered-dither threshold in (0,1) */
export const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

export function rect(g: Ctx, color: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

export function pset(g: Ctx, color: string, x: number, y: number) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export function disc(g: Ctx, color: string, cx: number, cy: number, r: number) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y + r * 0.45));
    g.fillRect(Math.round(cx) - half, Math.round(cy) + y, half * 2 + 1, 1);
  }
}

export function ellipse(g: Ctx, color: string, cx: number, cy: number, rx: number, ry: number) {
  g.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01))) + 0.4);
    g.fillRect(Math.round(cx) - half, Math.round(cy) + y, half * 2 + 1, 1);
  }
}

export function line(g: Ctx, color: string, x0: number, y0: number, x1: number, y1: number, w = 1) {
  g.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled rectangle rotated by `ang` (radians), rasterised per pixel. */
export function rotRect(g: Ctx, color: string, cx: number, cy: number, ang: number, w: number, h: number) {
  g.fillStyle = color;
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = Math.ceil(Math.hypot(w, h) / 2) + 1;
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const lx = x * c + y * s, ly = -x * s + y * c;
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) g.fillRect(Math.round(cx) + x, Math.round(cy) + y, 1, 1);
    }
  }
}

/** Filled triangle (point-in-triangle per pixel). */
export function tri(g: Ctx, color: string, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  g.fillStyle = color;
  const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const u = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / d;
      const v = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / d;
      if (u >= 0 && v >= 0 && u + v <= 1) g.fillRect(x, y, 1, 1);
    }
  }
}

/** Dithered soft-edged blob (for ground variation). */
export function ditherDisc(g: Ctx, color: string, cx: number, cy: number, r: number) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      if (1 - d > bayer(x + cx, y + cy) * 0.9) g.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

/** Adds a 1px outline around every opaque pixel; result is 2px larger in each axis. */
export function outline(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [out, g] = mk(w + 2, h + 2);
  const id = g.createImageData(w + 2, h + 2);
  const od = id.data;
  const col = document.createElement('canvas').getContext('2d')!;
  col.fillStyle = color;
  col.fillRect(0, 0, 1, 1);
  const [or, og, ob] = col.getImageData(0, 0, 1, 1).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && sd[(y * w + x) * 4 + 3] > 8;
  for (let y = 0; y < h + 2; y++) {
    for (let x = 0; x < w + 2; x++) {
      const sx = x - 1, sy = y - 1;
      const i = (y * (w + 2) + x) * 4;
      if (solid(sx, sy)) {
        const j = (sy * w + sx) * 4;
        od[i] = sd[j]; od[i + 1] = sd[j + 1]; od[i + 2] = sd[j + 2]; od[i + 3] = 255;
      } else if (solid(sx - 1, sy) || solid(sx + 1, sy) || solid(sx, sy - 1) || solid(sx, sy + 1)) {
        od[i] = or; od[i + 1] = og; od[i + 2] = ob; od[i + 3] = 255;
      }
    }
  }
  g.putImageData(id, 0, 0);
  return out;
}

/** Same silhouette in a single colour (hit flashes). */
export function silhouette(src: HTMLCanvasElement, color = '#ffffff'): HTMLCanvasElement {
  const [c, g] = mk(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---- 3x5 digit font (for tiny labels) ---------------------------------------
const TINY: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001',
  '8': '111101111101111', '9': '111101111001111', '/': '001001010100100', 'x': '000101010101000',
  '+': '000010111010000', '-': '000000111000000', '$': '011110010011110', '.': '000000000000010',
};

export function tiny(g: Ctx, text: string, x: number, y: number, color: string, shadow?: string) {
  let cx = Math.round(x);
  for (const ch of text) {
    const bits = TINY[ch];
    if (bits) {
      for (let i = 0; i < 15; i++) {
        if (bits[i] === '1') {
          if (shadow) { g.fillStyle = shadow; g.fillRect(cx + (i % 3) + 1, Math.round(y) + Math.floor(i / 3) + 1, 1, 1); }
        }
      }
      g.fillStyle = color;
      for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(cx + (i % 3), Math.round(y) + Math.floor(i / 3), 1, 1);
    }
    cx += 4;
  }
}

export const tinyWidth = (text: string) => text.length * 4 - 1;

// ---- Pixel font text (Press Start 2P, crisp at multiples of 8px) -------------
export const PX_FONT = '"Press Start 2P", monospace';

export function ptext(
  g: Ctx, text: string, x: number, y: number, color: string,
  opts: { size?: number; align?: CanvasTextAlign; outline?: string } = {},
) {
  const size = opts.size ?? 8;
  g.font = `${size}px ${PX_FONT}`;
  g.textBaseline = 'top';
  g.textAlign = opts.align ?? 'left';
  const ox = Math.round(x), oy = Math.round(y);
  const o = opts.outline ?? '#14122b';
  g.fillStyle = o;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) g.fillText(text, ox + dx, oy + dy);
  g.fillStyle = color;
  g.fillText(text, ox, oy);
}
