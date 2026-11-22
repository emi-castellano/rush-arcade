import { bayer, disc, ellipse, line, mk, outline, pset, rect, rng, silhouette, tri, type Ctx } from '../../lib/pixel';
import { THEMES, VH, VW, type Theme } from './config';

export interface Spr {
  c: HTMLCanvasElement;
  ax: number;
  ay: number;
  w: number;
  h: number;
}
const spr = (c: HTMLCanvasElement, ax: number, ay: number): Spr => ({ c, ax, ay, w: c.width, h: c.height });

const INK = '#241226';
const PINK = '#f7a9ba';
const PINK_D = '#d6738d';
const PINK_L = '#ffd9e0';

/** Filled circle with a fractional centre/radius (pixel-centre test). */
function fdisc(g: Ctx, color: string, cx: number, cy: number, r: number) {
  g.fillStyle = color;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) g.fillRect(x, y, 1, 1);
    }
  }
}

// ---- worms -------------------------------------------------------------------
export type WormFrameName = 'idle0' | 'idle1' | 'blink' | 'walk0' | 'walk1' | 'walk2' | 'air' | 'hurt';

interface Seg { x: number; y: number; r: number }

/** Segments are listed tail -> head. */
const BODIES: Record<WormFrameName, Seg[]> = {
  idle0: [{ x: 6, y: 11.5, r: 2.5 }, { x: 7, y: 8, r: 3 }, { x: 8, y: 4.5, r: 3.5 }],
  idle1: [{ x: 6, y: 11.5, r: 2.5 }, { x: 7, y: 8, r: 3 }, { x: 7, y: 4.5, r: 3.5 }],
  blink: [{ x: 6, y: 11.5, r: 2.5 }, { x: 7, y: 8, r: 3 }, { x: 8, y: 4.5, r: 3.5 }],
  walk0: [{ x: 5, y: 11.5, r: 2.5 }, { x: 7, y: 8.5, r: 3 }, { x: 9, y: 5.5, r: 3.5 }],
  walk1: [{ x: 5, y: 11.5, r: 2.5 }, { x: 6.5, y: 9, r: 3 }, { x: 8, y: 6, r: 3.5 }],
  walk2: [{ x: 7, y: 11.5, r: 2.5 }, { x: 7, y: 8, r: 3 }, { x: 7, y: 4.5, r: 3.5 }],
  air: [{ x: 7, y: 13, r: 1.8 }, { x: 7.5, y: 10, r: 2.3 }, { x: 8, y: 7, r: 2.8 }, { x: 8, y: 3.5, r: 3 }],
  hurt: [{ x: 6, y: 11.5, r: 2.8 }, { x: 7, y: 9, r: 3.5 }, { x: 8, y: 6.5, r: 3.8 }],
};

function wormFrame(team: string, name: WormFrameName): Spr {
  const [c, g] = mk(16, 18);
  const segs = BODIES[name].map((s) => ({ ...s }));
  // align every frame so the lowest point sits on the same row
  const bottom = Math.max(...segs.map((s) => s.y + s.r));
  const shift = 14 - bottom;
  for (const s of segs) s.y += shift;
  const head = segs[segs.length - 1];

  segs.forEach((s, i) => {
    fdisc(g, PINK_D, s.x, s.y, s.r);
    fdisc(g, PINK, s.x - 0.4, s.y - 0.7, s.r - 1);
    if (i >= segs.length - 2) fdisc(g, PINK_L, s.x - 1.3, s.y - 1.8, 0.9);
  });
  // segment rings
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i], b = segs[i + 1];
    const my = Math.round((a.y + b.y) / 2 + 0.3);
    const mx = (a.x + b.x) / 2;
    const half = Math.max(1, Math.floor(Math.min(a.r, b.r) - 0.6));
    rect(g, PINK_D, Math.round(mx - half), my, half * 2, 1);
  }
  // face
  const hx = Math.round(head.x), hy = Math.round(head.y);
  if (name === 'hurt') {
    for (const ex of [hx - 2, hx + 1]) {
      pset(g, INK, ex, hy - 2); pset(g, INK, ex + 2, hy - 2);
      pset(g, INK, ex + 1, hy - 1);
      pset(g, INK, ex, hy); pset(g, INK, ex + 2, hy);
    }
    rect(g, INK, hx - 1, hy + 2, 4, 1);
  } else if (name === 'blink') {
    rect(g, INK, hx - 2, hy - 1, 2, 1);
    rect(g, INK, hx + 1, hy - 1, 2, 1);
    rect(g, INK, hx, hy + 2, 3, 1);
  } else {
    for (const ex of [hx - 2, hx + 1]) {
      rect(g, '#ffffff', ex, hy - 2, 2, 3);
      rect(g, INK, ex + 1, hy - 1, 1, 2);
    }
    rect(g, INK, hx, hy + 2, 3, 1);
    pset(g, INK, hx - 1, hy + 1);
    pset(g, INK, hx + 3, hy + 1);
  }
  // bandana with a flowing knot
  rect(g, team, hx - 3, hy - 3, 7, 1);
  rect(g, team, hx - 3, hy - 4, 6, 1);
  pset(g, team, hx - 4, hy - 3);
  pset(g, team, hx - 5, hy - 2);
  pset(g, team, hx - 5, hy - 4);
  pset(g, team, hx - 4, hy - 5);
  return spr(outline(c, INK), 9, 15);
}

function makeGrave(): Spr {
  const [c, g] = mk(9, 12);
  rect(g, '#c4c8d4', 1, 2, 7, 9);
  rect(g, '#c4c8d4', 2, 1, 5, 1);
  rect(g, '#9ca1b2', 1, 10, 7, 1);
  rect(g, '#6c7184', 4, 3, 1, 5);
  rect(g, '#6c7184', 3, 4, 3, 1);
  return spr(outline(c, INK), 5, 12);
}

function makeSheep(): Spr {
  const [c, g] = mk(13, 10);
  for (const [x, y] of [[4, 4], [7, 3], [9, 4], [5, 6], [8, 6], [3, 6], [10, 6]]) disc(g, '#f4f4f4', x, y, 2);
  ellipse(g, '#ffffff', 7, 5, 5, 3);
  rect(g, '#3a2a2a', 10, 4, 3, 3);
  pset(g, '#ffffff', 11, 5);
  rect(g, '#3a2a2a', 4, 8, 1, 2);
  rect(g, '#3a2a2a', 8, 8, 1, 2);
  return spr(outline(c, INK), 6, 10);
}

// ---- themed backdrops ------------------------------------------------------------
export const WATER: Record<Theme, { a: string; b: string; top: string; foam: string; lava: boolean }> = {
  meadow: { a: '#2a67d8', b: '#1b3f9a', top: '#8fd0ff', foam: '#e0f4ff', lava: false },
  desert: { a: '#1f9bb0', b: '#126a7f', top: '#8ff0e0', foam: '#e6fff8', lava: false },
  frost: { a: '#2a5fa8', b: '#173a78', top: '#b8e6ff', foam: '#ffffff', lava: false },
  volcano: { a: '#e0481c', b: '#8a1a10', top: '#ffd04a', foam: '#fff0a0', lava: true },
};

interface BgDef {
  stops: string[];
  horizon: number;
  stars: number;
  sun?: { x: number; y: number; r: number; core: string; halo: string };
  ranges: { base: number; amp: number; color: string; seed: number; round?: boolean; caps?: boolean }[];
  extra?: (g: Ctx) => void;
}

const BGS: Record<Theme, BgDef> = {
  meadow: {
    stops: ['#1f1b52', '#352a7c', '#5f3fa3', '#9a52ad', '#d9709a', '#fb9f8c', '#ffd49a'],
    horizon: 168,
    stars: 60,
    sun: { x: 290, y: 124, r: 14, core: '#fff2c0', halo: '#ffd79a' },
    ranges: [
      { base: 150, amp: 52, color: '#5a3f9a', seed: 3 },
      { base: 168, amp: 38, color: '#46327f', seed: 8 },
      { base: 186, amp: 26, color: '#33276a', seed: 12 },
    ],
  },
  desert: {
    stops: ['#2a1d4e', '#5e3470', '#a8446e', '#e8685a', '#fb9a5c', '#ffcc7a', '#ffe9a8'],
    horizon: 170,
    stars: 24,
    sun: { x: 110, y: 128, r: 20, core: '#fff2c0', halo: '#ffd79a' },
    ranges: [
      { base: 152, amp: 30, color: '#b0523e', seed: 4, round: true },
      { base: 170, amp: 24, color: '#8f3f3a', seed: 9, round: true },
      { base: 188, amp: 18, color: '#6e2f38', seed: 14, round: true },
    ],
  },
  frost: {
    stops: ['#0a1238', '#112866', '#1d4a94', '#3a7ac0', '#78b4dc', '#b6daf0', '#e4f2ff'],
    horizon: 172,
    stars: 90,
    sun: { x: 300, y: 56, r: 10, core: '#f4faff', halo: '#bcd8ff' },
    ranges: [
      { base: 148, amp: 58, color: '#4d78b4', seed: 5, caps: true },
      { base: 168, amp: 42, color: '#385f9c', seed: 10, caps: true },
      { base: 188, amp: 28, color: '#264880', seed: 15 },
    ],
    extra: (g) => {
      // aurora ribbons
      for (let x = 0; x < VW; x++) {
        const y0 = 34 + Math.sin(x * 0.03) * 10 + Math.sin(x * 0.011 + 1) * 14;
        for (let y = 0; y < 38; y++) {
          const k = 1 - y / 38;
          if (bayer(x, Math.round(y0) + y) < k * 0.55) pset(g, y < 12 ? '#8dffc0' : '#4ee0c0', x, Math.round(y0) + y);
        }
      }
    },
  },
  volcano: {
    stops: ['#14080e', '#30101a', '#5a1620', '#8c2418', '#c8481c', '#f27a24', '#ffb844'],
    horizon: 176,
    stars: 0,
    ranges: [
      { base: 152, amp: 44, color: '#3a1420', seed: 6 },
      { base: 172, amp: 34, color: '#2a0e18', seed: 11 },
      { base: 190, amp: 24, color: '#1c0a12', seed: 16 },
    ],
    extra: (g) => {
      // a big smoking volcano with a glowing crater
      g.fillStyle = '#1a0c12';
      g.beginPath();
      g.moveTo(40, VH);
      g.lineTo(96, 96);
      g.lineTo(132, 96);
      g.lineTo(196, VH);
      g.fill();
      rect(g, '#ff6a24', 100, 94, 28, 3);
      rect(g, '#ffd04a', 106, 94, 16, 2);
      for (let i = 0; i < 6; i++) {
        const x = 106 + i * 4;
        line(g, '#ff5a1f', x, 98, x - 6 + (i % 3) * 4, 130 + (i % 2) * 10, 1);
      }
      // ash plume
      const R = rng(3);
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const x = 114 + Math.sin(t * 5) * 10 + t * 50, y = 90 - t * 80;
        for (let k = 0; k < 6; k++) pset(g, bayer(k, i) < 0.5 ? '#3a2430' : '#523240', Math.round(x + (R() - 0.5) * 14 * (0.5 + t)), Math.round(y + (R() - 0.5) * 6));
      }
    },
  },
};

function makeBackground(theme: Theme): HTMLCanvasElement {
  const def = BGS[theme];
  const [c, g] = mk(VW, VH);
  for (let y = 0; y < VH; y++) {
    const t = Math.min(1, y / def.horizon) * (def.stops.length - 1);
    const i = Math.min(def.stops.length - 2, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < VW; x++) {
      g.fillStyle = bayer(x, y) < f ? def.stops[i + 1] : def.stops[i];
      g.fillRect(x, y, 1, 1);
    }
  }
  const R = rng(5);
  for (let i = 0; i < def.stars; i++) pset(g, R() < 0.5 ? '#ffffff' : '#bfc8ff', Math.floor(R() * VW), Math.floor(R() * 72));
  if (def.sun) {
    const { x: sx, y: sy, r, core, halo } = def.sun;
    for (let y = -r * 2.4; y <= r * 2.4; y++) {
      for (let x = -r * 2.4; x <= r * 2.4; x++) {
        const d = Math.hypot(x, y);
        if (d <= r) pset(g, core, sx + x, sy + y);
        else if (d <= r * 2.4 && 1 - (d - r) / (r * 1.4) > bayer(x + sx, y + sy) * 1.1) pset(g, halo, sx + x, sy + y);
      }
    }
  }
  def.extra?.(g);
  for (const m of def.ranges) {
    const r = rng(m.seed);
    const [lc, lg] = mk(VW, VH);
    lg.fillStyle = m.color;
    lg.beginPath();
    lg.moveTo(0, VH);
    if (m.round) {
      for (let x = 0; x <= VW; x += 2) lg.lineTo(x, m.base - m.amp * (0.5 + 0.5 * Math.sin(x * 0.02 + m.seed) * Math.sin(x * 0.007 + m.seed * 2)));
    } else {
      let x = -20;
      lg.lineTo(x, m.base);
      while (x < VW + 40) {
        const w = 40 + r() * 50;
        lg.lineTo(x + w * 0.5, m.base - m.amp * (0.4 + r() * 0.6));
        lg.lineTo(x + w, m.base - r() * 6);
        x += w;
      }
    }
    lg.lineTo(VW + 40, VH);
    lg.fill();
    if (m.caps) {
      const d = lg.getImageData(0, 0, VW, VH).data;
      for (let x = 0; x < VW; x++) {
        for (let y = 0; y < VH; y++) {
          if (d[(y * VW + x) * 4 + 3] > 0) {
            const cap = 3 + (x % 3);
            for (let k = 0; k < cap; k++) pset(lg, k < 2 ? '#ffffff' : '#dcecff', x, y + k);
            break;
          }
        }
      }
    }
    g.drawImage(lc, 0, 0);
    // soft haze at the foot of each range
    const hz = theme === 'volcano' ? '#ff7a2a' : '#ffe0c0';
    for (let y = m.base - 8; y < m.base + 6; y++) for (let x = 0; x < VW; x++) if (bayer(x, y) < 0.12) pset(g, hz, x, y);
  }
  return c;
}

const CLOUD_COLORS: Record<Theme, [string, string, string]> = {
  meadow: ['#fff4f8', '#ffe6f0', '#f2c9dc'],
  desert: ['#ffe2c4', '#f6c09a', '#e39a78'],
  frost: ['#d8ecff', '#bcd8f6', '#9fc0e6'],
  volcano: ['#4c2a36', '#3a202a', '#2a141c'],
};

function makeCloud(seed: number, colors: [string, string, string]): Spr {
  const [c, g] = mk(56, 20);
  const R = rng(seed);
  rect(g, colors[1], 4, 12, 48, 6);
  for (let i = 0; i < 6; i++) disc(g, colors[0], 8 + i * 8 + Math.floor(R() * 3), 11 - Math.floor(R() * 5), 5 + Math.floor(R() * 3));
  rect(g, colors[2], 4, 17, 48, 1);
  return spr(c, 28, 10);
}

// ---- decorations (trees, cacti, crystals...) ------------------------------------------
function decorSet(theme: Theme): Spr[] {
  const mkd = (w: number, h: number, f: (g: Ctx) => void): Spr => {
    const [c, g] = mk(w, h);
    f(g);
    return spr(outline(c, INK), Math.ceil(w / 2) + 1, h + 1);
  };
  switch (theme) {
    case 'meadow':
      return [
        mkd(10, 16, (g) => {
          rect(g, '#6b4226', 4, 12, 2, 4);
          tri(g, '#2f9a47', 5, 7, 0, 13, 10, 13);
          tri(g, '#37b255', 5, 3, 1, 9, 9, 9);
          tri(g, '#5ec24e', 5, 0, 2, 5, 8, 5);
        }),
        mkd(10, 6, (g) => {
          disc(g, '#2f9a47', 3, 3, 2);
          disc(g, '#37b255', 6, 3, 2);
          disc(g, '#5ec24e', 4, 2, 1);
        }),
        mkd(8, 7, (g) => {
          line(g, '#2f9a47', 2, 6, 2, 3, 1);
          line(g, '#2f9a47', 5, 6, 5, 2, 1);
          for (const [x, y, col] of [[2, 2, '#ff8fb1'], [5, 1, '#ffe066']] as const) {
            rect(g, col, x - 1, y, 3, 1);
            rect(g, col, x, y - 1, 1, 3);
          }
        }),
      ];
    case 'desert':
      return [
        mkd(10, 16, (g) => {
          rect(g, '#3f9a52', 4, 1, 3, 14);
          rect(g, '#5cc06a', 4, 1, 1, 14);
          rect(g, '#3f9a52', 0, 5, 2, 5);
          rect(g, '#3f9a52', 0, 8, 5, 2);
          rect(g, '#3f9a52', 9, 3, 2, 5);
          rect(g, '#3f9a52', 6, 6, 5, 2);
        }),
        mkd(10, 5, (g) => {
          ellipse(g, '#c9a878', 3, 3, 3, 2);
          ellipse(g, '#b8946a', 7, 3, 2, 1);
          pset(g, '#e6d2a8', 2, 2);
        }),
        mkd(9, 7, (g) => {
          for (const [x0, y0, x1, y1] of [[1, 6, 4, 1], [4, 6, 4, 0], [7, 6, 4, 1], [2, 6, 7, 3], [6, 6, 2, 3]]) line(g, '#8a5a2e', x0, y0, x1, y1, 1);
        }),
      ];
    case 'frost':
      return [
        mkd(10, 16, (g) => {
          rect(g, '#6b4226', 4, 12, 2, 4);
          tri(g, '#2a6f58', 5, 7, 0, 13, 10, 13);
          tri(g, '#2f8264', 5, 3, 1, 9, 9, 9);
          tri(g, '#3a9a76', 5, 0, 2, 5, 8, 5);
          rect(g, '#ffffff', 3, 12, 4, 1);
          rect(g, '#ffffff', 4, 8, 3, 1);
          rect(g, '#ffffff', 4, 4, 2, 1);
          pset(g, '#ffffff', 5, 0);
        }),
        mkd(8, 11, (g) => {
          tri(g, '#bfe6ff', 2, 0, 0, 10, 4, 10);
          tri(g, '#8fcff5', 6, 3, 3, 10, 7, 10);
          line(g, '#ffffff', 2, 2, 2, 8, 1);
        }),
        mkd(8, 11, (g) => {
          disc(g, '#f4faff', 4, 8, 3);
          disc(g, '#ffffff', 4, 3, 2);
          pset(g, '#241226', 3, 2);
          pset(g, '#241226', 5, 2);
          pset(g, '#ff8a2b', 5, 3);
          rect(g, '#d94a3d', 2, 5, 5, 1);
        }),
      ];
    case 'volcano':
      return [
        mkd(10, 16, (g) => {
          line(g, '#3a2a30', 5, 15, 5, 3, 2);
          line(g, '#3a2a30', 5, 9, 1, 5, 1);
          line(g, '#3a2a30', 5, 7, 9, 3, 1);
          line(g, '#3a2a30', 5, 12, 8, 9, 1);
          pset(g, '#ff6a24', 5, 4);
        }),
        mkd(10, 6, (g) => {
          ellipse(g, '#4a3238', 4, 3, 4, 2);
          ellipse(g, '#3a2630', 8, 4, 2, 1);
          pset(g, '#ff7a2b', 3, 2);
          pset(g, '#ff9a3a', 5, 3);
          pset(g, '#ff7a2b', 8, 4);
        }),
        mkd(8, 10, (g) => {
          tri(g, '#7a2430', 3, 0, 0, 9, 6, 9);
          tri(g, '#5a1822', 6, 3, 4, 9, 8, 9);
          line(g, '#ff7a2b', 3, 2, 3, 8, 1);
          pset(g, '#ffd04a', 3, 3);
        }),
      ];
  }
}

export class Art {
  frames: Record<WormFrameName, { s: Spr; flash: HTMLCanvasElement }>[] = [];
  grave = makeGrave();
  sheep = makeSheep();
  private bgs = new Map<Theme, HTMLCanvasElement>();
  private cloudSets = new Map<Theme, Spr[]>();
  private decors = new Map<Theme, Spr[]>();

  constructor() {
    const names = Object.keys(BODIES) as WormFrameName[];
    for (const col of ['#4aa0ff', '#ff5d5d']) {
      const set = {} as Record<WormFrameName, { s: Spr; flash: HTMLCanvasElement }>;
      for (const n of names) {
        const s = wormFrame(col, n);
        set[n] = { s, flash: silhouette(s.c) };
      }
      this.frames.push(set);
    }
  }

  bg(theme: Theme) {
    let b = this.bgs.get(theme);
    if (!b) this.bgs.set(theme, (b = makeBackground(theme)));
    return b;
  }

  clouds(theme: Theme) {
    let s = this.cloudSets.get(theme);
    if (!s) this.cloudSets.set(theme, (s = [makeCloud(1, CLOUD_COLORS[theme]), makeCloud(4, CLOUD_COLORS[theme]), makeCloud(9, CLOUD_COLORS[theme])]));
    return s;
  }

  decor(theme: Theme) {
    let s = this.decors.get(theme);
    if (!s) this.decors.set(theme, (s = decorSet(theme)));
    return s;
  }

  /** Pre-build all themes (used for the hub card / tests). */
  warm() {
    for (const t of THEMES) {
      this.bg(t);
      this.clouds(t);
      this.decor(t);
    }
  }
}
