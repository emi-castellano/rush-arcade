import { mk, rng } from '../../lib/pixel';
import { VH, VW, type Theme } from './config';

const pack = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0);
};
const P = (arr: string[]) => arr.map(pack);

interface Palette {
  top: number[]; // first 3 solid pixels under open sky
  dirt: number[];
  deep: number[];
  rock: number[];
  pebble: number[]; // rare speckles (pebbles / embers / ice chips)
  edge: number;
  scorch: number[];
}

const PALETTES: Record<Theme, Palette> = {
  meadow: {
    top: P(['#7bdc5e', '#4fb24a', '#37913d']),
    dirt: P(['#b9834a', '#ab7440', '#9d6a3a', '#b07a44']),
    deep: P(['#7d5532', '#74502e', '#6a4829', '#7a5230']),
    rock: P(['#59402a', '#503925', '#5f4530']),
    pebble: P(['#9aa0ab', '#b9bfca']),
    edge: pack('#2b1b10'),
    scorch: P(['#33241a', '#46301f', '#573b25']),
  },
  desert: {
    top: P(['#f6dc92', '#e8c273', '#d6a85a']),
    dirt: P(['#dba55c', '#cf9650', '#c48a46', '#d39f58']),
    deep: P(['#a8693a', '#9c5f34', '#925832', '#a46438']),
    rock: P(['#6e432a', '#633b24', '#784a2f']),
    pebble: P(['#e7d2a8', '#b9a07a']),
    edge: pack('#47270f'),
    scorch: P(['#3a2214', '#4d2e1a', '#5f3a22']),
  },
  frost: {
    top: P(['#ffffff', '#e1efff', '#bcd6f4']),
    dirt: P(['#a5b9d6', '#98aecf', '#8da5c8', '#a0b5d2']),
    deep: P(['#6d82a8', '#647a9f', '#5b7296', '#69809f']),
    rock: P(['#3f4e76', '#394870', '#465680']),
    pebble: P(['#dcefff', '#bfe0ff']),
    edge: pack('#1c2a4c'),
    scorch: P(['#47506c', '#566079', '#656f86']),
  },
  volcano: {
    top: P(['#7a6c78', '#5a4d62', '#43394e']),
    dirt: P(['#5d4349', '#523b41', '#6b4b50', '#5a4048']),
    deep: P(['#3e2c32', '#37272d', '#302329', '#3a2a30']),
    rock: P(['#241a21', '#1f161c', '#2b2028']),
    pebble: P(['#ff6a24', '#ff9a3a']),
    edge: pack('#100a0e'),
    scorch: P(['#1c1214', '#2a1a1a', '#38201c']),
  },
};

const hash = (x: number, y: number) => (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 24) & 255;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Seeded 2D value noise (0..1). */
function makeNoise(seed: number) {
  const h = (x: number, y: number) => {
    let n = Math.imul(x * 374761393 + y * 668265263 + seed * 1442695041, 1274126177);
    n ^= n >>> 13;
    n = Math.imul(n, 1103515245);
    return ((n >>> 0) % 65536) / 65536;
  };
  const n2 = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (x: number, y: number, oct = 3) => {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      v += n2(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return v / norm;
  };
  return { n2, fbm };
}

export interface Decor { x: number; y: number; kind: number }

/** Destructible pixel terrain: a solid mask plus a recoloured ImageData mirror. */
export class Terrain {
  readonly solid = new Uint8Array(VW * VH);
  readonly scorch = new Uint8Array(VW * VH);
  readonly height = new Int16Array(VW);
  gaps: [number, number][] = [];
  decor: Decor[] = [];
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private dirty = true;
  private pal: Palette;

  constructor(seed = 1, readonly theme: Theme = 'meadow') {
    const [c, g] = mk(VW, VH);
    this.canvas = c;
    this.g = g;
    this.img = g.createImageData(VW, VH);
    this.px = new Uint32Array(this.img.data.buffer);
    this.pal = PALETTES[theme];
    this.generate(seed);
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= VW || y < 0) return false;
    if (y >= VH) return true;
    return this.solid[y * VW + x] !== 0;
  }

  private set(x: number, y: number, v: 0 | 1) {
    if (x >= 0 && x < VW && y >= 0 && y < VH) this.solid[y * VW + x] = v;
  }

  // ---- generation -------------------------------------------------------------
  private generate(seed: number) {
    const R = rng(seed);
    const N = makeNoise(seed);
    const style = Math.floor(R() * 5); // 0 rolling, 1 canyon, 2 mountain, 3 twin peaks, 4 terraces
    const c0 = VW / 2 + (R() - 0.5) * 60;
    const gauss = (x: number, c: number, w: number) => Math.exp(-Math.pow((x - c) / w, 2));

    // 1) base heightmap from fractal noise + a style-specific landmark
    const raw = new Float32Array(VW);
    for (let x = 0; x < VW; x++) {
      let h = 128 + (N.fbm(x * 0.011, 3.1, 3) - 0.5) * 70 + (N.fbm(x * 0.045, 9.7, 2) - 0.5) * 14;
      if (style === 1) h += 34 * gauss(x, c0, 46) - 8 * (1 - gauss(x, c0, 120));
      else if (style === 2) h -= 46 * gauss(x, c0, 72);
      else if (style === 3) h -= 36 * (gauss(x, 96, 46) + gauss(x, VW - 96, 46)) - 10;
      else if (style === 4) h = h * 0.35 + Math.round(h / 12) * 12 * 0.65;
      // raised walls at the map edges so the arena feels bounded
      const edge = 18;
      if (x < edge) h -= 34 * smooth((edge - x) / edge);
      if (x > VW - 1 - edge) h -= 34 * smooth((x - (VW - 1 - edge)) / edge);
      raw[x] = Math.max(66, Math.min(168, h));
    }
    for (let x = 0; x < VW; x++) {
      const a = raw[Math.max(0, x - 1)], b = raw[x], c = raw[Math.min(VW - 1, x + 1)];
      this.height[x] = Math.round(style === 0 ? (a + 2 * b + c) / 4 : style === 4 ? b : (a + b * 2 + c) / 4);
      for (let y = this.height[x]; y < VH; y++) this.solid[y * VW + x] = 1;
    }

    // 2) lakes first (so caves/islands avoid them): V/U-shaped pits with sloped banks
    this.gaps = [];
    const lakeCount = 1 + Math.floor(R() * 3);
    const centers: number[] = [];
    for (let i = 0; i < lakeCount; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const cx = 60 + R() * (VW - 120);
        if (centers.some((o) => Math.abs(o - cx) < 90)) continue;
        centers.push(cx);
        const half = 14 + R() * 18;
        const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
        this.gaps.push([x0, x1]);
        for (let x = x0; x <= x1; x++) {
          const t = Math.abs(x - cx) / half; // 0 centre .. 1 rim
          const depth = smooth(Math.min(1, (1 - t) * 1.7));
          const top = this.height[x];
          const bottom = top + (VH - top) * depth;
          for (let y = top; y < bottom; y++) this.set(x, y, 0);
          this.height[x] = Math.round(Math.min(VH, top + (VH - top) * depth));
        }
        break;
      }
    }
    this.gaps.sort((a, b) => a[0] - b[0]);
    const nearLake = (x: number, m = 0) => this.gaps.some(([a, b]) => x > a - m && x < b + m);

    // 3) organic caves from 2D noise (only well below the surface)
    const cave = new Uint8Array(VW * VH);
    for (let x = 6; x < VW - 6; x++) {
      if (nearLake(x, 6)) continue;
      for (let y = this.height[x] + 24; y < VH - 46; y++) {
        const n = N.fbm(x * 0.055 + 40, y * 0.09 + 7, 3);
        if (n > 0.688 - Math.min(0.03, (y - this.height[x]) * 0.0005)) cave[y * VW + x] = 1;
      }
    }
    // cellular-automata smoothing so caves read as caverns, not noise
    for (let pass = 0; pass < 2; pass++) {
      const next = cave.slice();
      for (let y = 2; y < VH - 2; y++) {
        for (let x = 2; x < VW - 2; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += cave[(y + dy) * VW + x + dx];
          if (cave[y * VW + x]) next[y * VW + x] = n >= 4 ? 1 : 0;
          else next[y * VW + x] = n >= 6 ? 1 : 0;
        }
      }
      cave.set(next);
    }
    for (let i = 0; i < cave.length; i++) if (cave[i]) this.solid[i] = 0;

    // 4) winding tunnels that cut through hills and open onto the cliffs
    const tunnels = Math.floor(R() * 2) + (R() < 0.5 ? 1 : 0);
    for (let t = 0; t < tunnels; t++) {
      let x = 20 + R() * (VW - 160);
      let y = this.height[Math.round(x)] + 16 + R() * 14;
      const len = 60 + R() * 90;
      const ph = R() * 6.28, rad = 4 + Math.floor(R() * 2);
      for (let i = 0; i < len; i++) {
        x += 1;
        y += Math.sin(i * 0.1 + ph) * 0.7 + (R() - 0.5) * 0.3;
        const xi = Math.round(x);
        if (xi >= VW - 4 || nearLake(xi, 2)) continue;
        y = Math.max(y, this.height[xi] + rad + 3);
        this.carveRaw(xi, Math.round(y), rad);
      }
    }

    // 5) irregular floating islands with tapering undersides
    const islands: [number, number][] = [];
    const want = 3 + Math.floor(R() * 3);
    for (let tries = 0; tries < 60 && islands.length < want; tries++) {
      const cx = 36 + R() * (VW - 72), cy = 40 + R() * 56;
      if (islands.some(([ox, oy]) => Math.abs(ox - cx) < 54 && Math.abs(oy - cy) < 26)) continue;
      if (this.height[Math.round(cx)] - cy < 40) continue;
      islands.push([cx, cy]);
      const rx = 14 + R() * 20, thick = 6 + R() * 6;
      for (let dx = -Math.round(rx); dx <= rx; dx++) {
        const u = dx / rx;
        const top = cy - 1.5 + (N.n2((cx + dx) * 0.2, cy * 0.1) - 0.5) * 3;
        const bot = cy + thick * Math.pow(Math.max(0, 1 - u * u), 0.75) * (0.7 + 0.6 * N.n2((cx + dx) * 0.3, 5));
        const stalac = R() < 0.07 ? 3 + R() * 5 : 0;
        for (let y = Math.round(top); y <= bot + stalac; y++) this.set(Math.round(cx + dx), y, 1);
      }
    }

    // 6) decorations on flat surfaces
    this.decor = [];
    const kinds = 3;
    for (let x = 14; x < VW - 14; x += 6 + Math.floor(R() * 14)) {
      if (nearLake(x, 7)) continue;
      for (let y = 8; y < VH - 34; y++) {
        if (!this.isSolid(x, y) || this.isSolid(x, y - 1)) continue;
        let free = true;
        for (let yy = y - 14; yy < y && free; yy++) if (this.isSolid(x, yy) || this.isSolid(x - 3, yy) || this.isSolid(x + 3, yy)) free = false;
        const flat = this.isSolid(x - 3, y) && this.isSolid(x + 3, y) && !this.isSolid(x - 3, y - 1) && !this.isSolid(x + 3, y - 1);
        if (free && flat && R() < 0.55) this.decor.push({ x, y, kind: Math.floor(R() * kinds) });
        break;
      }
    }
    this.recolor(0, 0, VW - 1, VH - 1);
  }

  private carveRaw(cx: number, cy: number, r: number) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, 0);
    }
  }

  /** Flatten a 11px pad so a worm can start on level ground. */
  makePad(cx: number) {
    const h = this.height[cx];
    for (let dx = -5; dx <= 5; dx++) {
      const x = cx + dx;
      if (x < 1 || x >= VW - 1) continue;
      const old = this.height[x];
      if (old > h) for (let y = h; y < old; y++) this.set(x, y, 1);
      else if (old < h) for (let y = old; y < h; y++) this.set(x, y, 0);
      for (let y = h - 14; y < h; y++) if (this.isSolid(x, y) && old === h) this.set(x, y, 0);
      this.height[x] = h;
    }
    this.recolor(cx - 7, h - 16, cx + 7, h + 6);
  }

  // ---- destruction --------------------------------------------------------------
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
    const pal = this.pal;
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
        if (edge) c = pal.edge;
        else if (sc && depth <= 4) c = pal.scorch[n % 3];
        else if (lit && depth <= 3) c = pal.top[depth - 1];
        else if (depth <= 14) c = n % 23 === 0 ? pal.pebble[n & 1] : pal.dirt[n & 3];
        else if (depth <= 42) c = n % 29 === 0 ? pal.pebble[n & 1] : pal.deep[n & 3];
        else c = n % 41 === 0 && this.theme === 'volcano' ? pal.pebble[n & 1] : pal.rock[n % 3];
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

  /** x positions where a worm can start (real ground, away from lakes, open sky above). */
  spawnColumns(): number[] {
    const out: number[] = [];
    for (let x = 14; x < VW - 14; x++) {
      if (this.gaps.some(([a, b]) => x > a - 10 && x < b + 10)) continue;
      const y = this.height[x] - 1;
      let free = true;
      for (let yy = y - 18; yy <= y - 4 && free; yy++) for (let xx = x - 5; xx <= x + 5; xx++) if (this.isSolid(xx, yy)) free = false;
      let gentle = true;
      for (let xx = x - 5; xx <= x + 5; xx++) if (Math.abs(this.height[xx] - this.height[x]) > 6) gentle = false;
      if (free && gentle && this.isSolid(x, y + 1)) out.push(x);
    }
    return out;
  }
}
