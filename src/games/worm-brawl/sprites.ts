import { bayer, disc, ellipse, line, mk, outline, pset, rect, rng, silhouette, type Ctx } from '../../lib/pixel';
import { VH, VW } from './config';

export interface Spr {
  c: HTMLCanvasElement;
  ax: number;
  ay: number;
  w: number;
  h: number;
}
const spr = (c: HTMLCanvasElement, ax: number, ay: number): Spr => ({ c, ax, ay, w: c.width, h: c.height });

const INK = '#241226';
const PINK = '#f6a6b8';
const PINK_D = '#d6738d';
const PINK_L = '#ffd5dd';

export type WormFrameName = 'idle0' | 'idle1' | 'walk0' | 'walk1' | 'walk2' | 'air' | 'hurt';

const ROWS: Record<WormFrameName, [number, number][]> = {
  idle0: [[4, 9], [3, 10], [2, 10], [2, 10], [2, 10], [3, 9], [4, 8]],
  idle1: [[4, 9], [3, 10], [2, 10], [2, 10], [3, 10], [4, 9]],
  walk0: [[4, 9], [3, 10], [2, 11], [2, 11], [3, 10], [4, 9]],
  walk1: [[5, 9], [4, 10], [3, 10], [3, 10], [3, 10], [4, 9], [4, 8]],
  walk2: [[4, 8], [3, 10], [2, 10], [2, 11], [3, 10], [4, 9]],
  air: [[5, 8], [4, 9], [4, 9], [4, 9], [4, 9], [4, 9], [5, 8], [5, 8]],
  hurt: [[4, 9], [3, 10], [2, 10], [2, 10], [2, 10], [3, 9], [4, 8]],
};

function wormFrame(team: string, name: WormFrameName): Spr {
  const [c, g] = mk(14, 12);
  const rows = ROWS[name];
  const bottom = 10;
  const top = bottom - rows.length + 1;
  rows.forEach(([x0, x1], i) => {
    const y = top + i;
    for (let x = x0; x <= x1; x++) {
      let col = PINK;
      if (i === rows.length - 1 || (i === rows.length - 2 && (x < x0 + 1 || x > x1 - 1))) col = PINK_D;
      else if (i === 1 && x < x0 + 3) col = PINK_L;
      pset(g, col, x, y);
    }
  });
  const x1 = Math.max(...rows.map((r) => r[1]));
  const ey = top + 2;
  if (name === 'hurt') {
    // X eyes
    pset(g, INK, x1 - 3, ey);
    pset(g, INK, x1 - 1, ey);
    pset(g, INK, x1 - 2, ey + 1);
    pset(g, INK, x1 - 3, ey + 2);
    pset(g, INK, x1 - 1, ey + 2);
  } else {
    rect(g, '#ffffff', x1 - 3, ey, 2, 2);
    pset(g, INK, x1 - 2, ey + 1);
    pset(g, INK, x1 - 2, ey);
    pset(g, INK, x1 - 1, ey + 3);
  }
  // bandana
  rect(g, team, 4, top + 1, x1 - 3, 1);
  rect(g, team, 2, top + 1, 2, 1);
  pset(g, team, 1, top);
  pset(g, team, 1, top + 2);
  return spr(outline(c, INK), 7, bottom + 1);
}

function makeGrave(): Spr {
  const [c, g] = mk(9, 11);
  rect(g, '#c4c8d4', 1, 2, 7, 8);
  rect(g, '#c4c8d4', 2, 1, 5, 1);
  rect(g, '#9ca1b2', 1, 9, 7, 1);
  rect(g, '#6c7184', 4, 3, 1, 4);
  rect(g, '#6c7184', 3, 4, 3, 1);
  return spr(outline(c, INK), 5, 11);
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

function makeCloud(seed: number): Spr {
  const [c, g] = mk(56, 20);
  const R = rng(seed);
  rect(g, '#ffe6f0', 4, 12, 48, 6);
  for (let i = 0; i < 6; i++) disc(g, '#fff4f8', 8 + i * 8 + Math.floor(R() * 3), 11 - Math.floor(R() * 5), 5 + Math.floor(R() * 3));
  rect(g, '#f2c9dc', 4, 17, 48, 1);
  return spr(c, 28, 10);
}

function makeBackground(): HTMLCanvasElement {
  const [c, g] = mk(VW, VH);
  const stops = ['#1f1b52', '#352a7c', '#5f3fa3', '#9a52ad', '#d9709a', '#fb9f8c', '#ffd49a'];
  const horizon = 168;
  for (let y = 0; y < VH; y++) {
    const t = Math.min(1, y / horizon) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < VW; x++) {
      g.fillStyle = bayer(x, y) < f ? stops[i + 1] : stops[i];
      g.fillRect(x, y, 1, 1);
    }
  }
  // stars
  const R = rng(5);
  for (let i = 0; i < 60; i++) pset(g, R() < 0.5 ? '#ffffff' : '#bfc8ff', Math.floor(R() * VW), Math.floor(R() * 70));
  // sun with a dithered halo
  for (let y = -34; y <= 34; y++) {
    for (let x = -34; x <= 34; x++) {
      const d = Math.hypot(x, y);
      if (d <= 14) pset(g, '#fff2c0', 290 + x, 124 + y);
      else if (d <= 34 && 1 - (d - 14) / 20 > bayer(x + 290, y + 124) * 1.1) pset(g, '#ffd79a', 290 + x, 124 + y);
    }
  }
  // distant mountains
  const mtn = (base: number, amp: number, color: string, seed: number) => {
    const r = rng(seed);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, VH);
    let x = -20;
    g.lineTo(x, base);
    while (x < VW + 40) {
      const w = 40 + r() * 50;
      g.lineTo(x + w * 0.5, base - amp * (0.4 + r() * 0.6));
      g.lineTo(x + w, base - r() * 6);
      x += w;
    }
    g.lineTo(VW + 40, VH);
    g.fill();
  };
  mtn(150, 52, '#5a3f9a', 3);
  mtn(168, 38, '#46327f', 8);
  mtn(186, 26, '#33276a', 12);
  return c;
}

/** Pixel crosshair, aim ladder dots, held weapons etc. are drawn dynamically; these are the baked sprites. */
export class Art {
  bg = makeBackground();
  clouds = [makeCloud(1), makeCloud(4), makeCloud(9)];
  frames: { team: Record<WormFrameName, { s: Spr; flash: HTMLCanvasElement }>[] };
  grave = makeGrave();
  sheep = makeSheep();

  constructor() {
    const names = Object.keys(ROWS) as WormFrameName[];
    const colors = ['#4aa0ff', '#ff5d5d'];
    this.frames = { team: [] };
    for (const col of colors) {
      const set = {} as Record<WormFrameName, { s: Spr; flash: HTMLCanvasElement }>;
      for (const n of names) {
        const s = wormFrame(col, n);
        set[n] = { s, flash: silhouette(s.c) };
      }
      this.frames.team.push(set);
    }
  }
}

export type { Ctx };
export { line };
