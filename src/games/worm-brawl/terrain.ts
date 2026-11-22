import { mk, rng } from '../../lib/pixel';
import { VH, VW } from './config';

const pack = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0);
};

const GRASS = [pack('#7bdc5e'), pack('#4fb24a'), pack('#37913d')];
const DIRT = [pack('#b9834a'), pack('#ab7440'), pack('#9d6a3a'), pack('#b07a44')];
const DEEP = [pack('#7d5532'), pack('#74502e'), pack('#6a4829'), pack('#7a5230')];
const ROCK = [pack('#59402a'), pack('#503925'), pack('#5f4530')];
const PEBBLE = pack('#9aa0ab');
const EDGE = pack('#2b1b10');
const SCORCH = [pack('#33241a'), pack('#46301f'), pack('#573b25')];

const hash = (x: number, y: number) => (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 24) & 255;

/** Destructible pixel terrain: a solid mask plus a recoloured ImageData mirror. */
export class Terrain {
  readonly solid = new Uint8Array(VW * VH);
  readonly scorch = new Uint8Array(VW * VH);
  readonly height = new Int16Array(VW);
  gaps: [number, number][] = [];
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private dirty = true;

  constructor(seed = 1) {
    const [c, g] = mk(VW, VH);
    this.canvas = c;
    this.g = g;
    this.img = g.createImageData(VW, VH);
    this.px = new Uint32Array(this.img.data.buffer);
    this.generate(seed);
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= VW || y < 0) return false;
    if (y >= VH) return true;
    return this.solid[y * VW + x] !== 0;
  }

  private generate(seed: number) {
    const R = rng(seed);
    const p1 = R() * 6.28, p2 = R() * 6.28, p3 = R() * 6.28;
    const bump = R() < 0.5 ? 1 : -1;
    for (let x = 0; x < VW; x++) {
      let h = 128 + 24 * Math.sin(x * 0.016 + p1) + 13 * Math.sin(x * 0.043 + p2) + 5 * Math.sin(x * 0.1 + p3);
      h += bump * 14 * Math.exp(-Math.pow((x - VW / 2) / 55, 2));
      h = Math.max(80, Math.min(165, h));
      this.height[x] = Math.round(h);
      for (let y = this.height[x]; y < VH; y++) this.solid[y * VW + x] = 1;
    }
    const ell = (cx: number, cy: number, rx: number, ry: number, v: 0 | 1, shape?: (dy: number) => number) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (x < 0 || x >= VW || y < 0 || y >= VH) continue;
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          const k = shape ? shape(dy) : 1;
          if (dx * dx / (k * k) + dy * dy <= 1) this.solid[y * VW + x] = v;
        }
      }
    };
    // caves under the surface
    for (let i = 0; i < 4; i++) {
      const cx = 30 + R() * (VW - 60);
      ell(cx, this.height[Math.floor(cx)] + 28 + R() * 26, 12 + R() * 11, 6 + R() * 6, 0);
    }
    // floating islands: flat top, tapering underside
    for (let i = 0; i < 3; i++) {
      const cx = 40 + R() * (VW - 80);
      const cy = 52 + R() * 30;
      ell(cx, cy, 16 + R() * 14, 8 + R() * 3, 1, (dy) => (dy < 0 ? 1 : Math.max(0.15, 1 - dy * 0.95)));
      for (let x = Math.floor(cx - 30); x <= cx + 30; x++) for (let y = Math.floor(cy - 14); y < cy - 8; y++) if (x >= 0 && x < VW && y >= 0 && y < VH) this.solid[y * VW + x] = 0;
    }
    // water gaps (lakes) away from the edges
    const gaps = [[70 + R() * 50, 26 + R() * 12], [250 + R() * 60, 26 + R() * 14]];
    this.gaps = [];
    for (const [gx, gw] of gaps) {
      const x0 = Math.floor(gx), x1 = Math.floor(gx + gw);
      this.gaps.push([x0, x1]);
      for (let x = x0; x < x1; x++) {
        // rounded banks
        const bank = Math.max(0, 5 - Math.min(x - x0, x1 - 1 - x)) * 1.5;
        for (let y = Math.floor(this.height[x] + bank); y < VH; y++) this.solid[y * VW + x] = 0;
        this.height[x] = VH;
      }
    }
    this.recolor(0, 0, VW - 1, VH - 1);
  }

  /** Remove a circle of terrain and scorch the rim. */
  carve(cx: number, cy: number, r: number) {
    cx = Math.round(cx); cy = Math.round(cy);
    const rr = r * r, rs = (r + 3) * (r + 3);
    for (let y = cy - r - 3; y <= cy + r + 3; y++) {
      if (y < 0 || y >= VH) continue;
      for (let x = cx - r - 3; x <= cx + r + 3; x++) {
        if (x < 0 || x >= VW) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        const i = y * VW + x;
        if (d <= rr) this.solid[i] = 0;
        else if (d <= rs && this.solid[i]) this.scorch[i] = 1;
      }
    }
    this.recolor(cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5);
  }

  /** Carve without scorching (drill tunnels). */
  tunnel(cx: number, cy: number, r: number) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= VH) continue;
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= VW) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.solid[y * VW + x] = 0;
      }
    }
    this.recolor(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);
  }

  recolor(x0: number, y0: number, x1: number, y1: number) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(VW - 1, x1); y1 = Math.min(VH - 1, y1);
    for (let x = x0; x <= x1; x++) {
      let depth = 0;
      let lit = true;
      for (let y = 0; y < VH; y++) {
        const i = y * VW + x;
        if (!this.solid[i]) {
          if (depth > 0) lit = false;
          depth = 0;
          if (y >= y0 && y <= y1) this.px[i] = 0;
          continue;
        }
        depth++;
        if (y < y0 || y > y1) continue;
        const n = hash(x, y);
        const sc = this.scorch[i] === 1;
        let c: number;
        const edge =
          depth > 1 && (!this.isSolid(x - 1, y) || !this.isSolid(x + 1, y) || (y + 1 < VH && !this.solid[i + VW]));
        if (edge) c = EDGE;
        else if (sc && depth <= 4) c = SCORCH[n % 3];
        else if (lit && depth <= 3) c = GRASS[depth - 1];
        else if (depth <= 14) c = n % 23 === 0 ? PEBBLE : DIRT[n & 3];
        else if (depth <= 42) c = n % 31 === 0 ? PEBBLE : DEEP[n & 3];
        else c = ROCK[n % 3];
        this.px[i] = c;
      }
    }
    this.dirty = true;
  }

  upload() {
    if (!this.dirty) return;
    this.g.putImageData(this.img, 0, 0);
    this.dirty = false;
  }

  /** x positions where a worm can safely stand on real ground (not gaps, not under islands). */
  spawnColumns(): number[] {
    const out: number[] = [];
    for (let x = 10; x < VW - 10; x++) {
      if (this.gaps.some(([a, b]) => x > a - 8 && x < b + 8)) continue;
      const y = this.height[x] - 1;
      let free = true;
      for (let yy = y - 14; yy <= y && free; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (this.isSolid(xx, yy)) free = false;
      let flat = true;
      for (let xx = x - 3; xx <= x + 3; xx++) if (Math.abs(this.height[xx] - this.height[x]) > 3) flat = false;
      if (free && flat) out.push(x);
    }
    return out;
  }
}
