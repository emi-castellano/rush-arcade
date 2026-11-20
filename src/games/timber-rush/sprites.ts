import {
  bayer, disc, ditherDisc, ellipse, line, mk, outline, pset, ptext, rect, rng, rotRect, silhouette,
  type Ctx,
} from '../../lib/pixel';
import { BASE, DEPOT, WORLD_H, WORLD_W } from './config';

/** 1 art pixel = ART logical units. The scene is drawn at VW x VH art pixels. */
export const ART = 4;
export const VW = 320;
export const VH = 180;
export const WW = WORLD_W / ART; // 650
export const WH = WORLD_H / ART; // 425

export interface Spr {
  c: HTMLCanvasElement;
  ax: number; // anchor (feet / base centre)
  ay: number;
  w: number;
  h: number;
}
const spr = (c: HTMLCanvasElement, ax: number, ay: number): Spr => ({ c, ax, ay, w: c.width, h: c.height });

// ---- palettes ----------------------------------------------------------------
type Pal = [string, string, string, string, string]; // darkest -> lightest
const PAL_GREEN: Pal = ['#0f3b24', '#1d6b3a', '#2f9a47', '#5ec24e', '#a8e86a'];
const PAL_TEAL: Pal = ['#0c3a40', '#17665f', '#26967a', '#4fc79a', '#a2f0c4'];
const PAL_AUTUMN: Pal = ['#5a1a12', '#9a3a16', '#d2661f', '#f0a032', '#ffe07a'];
const PAL_GOLD: Pal = ['#6b3a00', '#b8730a', '#e8a91c', '#ffd23f', '#fff4a8'];
const PAL_DARK: Pal = ['#06140d', '#0b2417', '#103321', '#17492e', '#215f3b'];
const OUT = '#0b1f14';

export const SHIRTS = ['#e0453a', '#3b82f6', '#f59e0b', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16', '#f97316'];
const SKINS = ['#f6cf9f', '#e8b07a', '#c68a58', '#8d5a3a'];
const HAIRS = ['#2b1d12', '#6b3f1d', '#d9a441', '#16161d', '#b5522a', '#b8bcc4'];

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

// ---- trees -------------------------------------------------------------------
function trunk(g: Ctx, cx: number, h: number, tw: number, th: number) {
  const x0 = cx - Math.floor(tw / 2);
  for (let y = h - th; y < h; y++) {
    for (let i = 0; i < tw; i++) {
      const col = i === 0 ? '#9a6234' : i >= tw - 2 ? '#3b2314' : '#6b4226';
      pset(g, col, x0 + i, y);
    }
    if ((y + 1) % 4 === 0) pset(g, '#3b2314', x0 + 2, y);
  }
  pset(g, '#3b2314', x0 - 1, h - 1);
  pset(g, '#3b2314', x0 + tw, h - 1);
  pset(g, '#6b4226', x0 - 1, h - 1 - 1 + 1);
}

function pine(w: number, h: number, tiers: number, pal: Pal, seed: number): Spr {
  const [c, g] = mk(w, h);
  const R = rng(seed);
  const cx = Math.floor(w / 2);
  const trunkH = Math.round(h * 0.16);
  trunk(g, cx, h, 2 * Math.round(w * 0.08), trunkH);
  const bottom = h - trunkH + 4;
  const tierH = Math.round(bottom * (tiers > 3 ? 0.42 : 0.5));
  const step = (bottom - tierH) / (tiers - 1);
  for (let i = tiers - 1; i >= 0; i--) {
    const yTop = Math.round(i * step);
    const yBot = yTop + tierH;
    const maxHalf = Math.round((w / 2 - 1) * (0.55 + 0.45 * ((i + 1) / tiers)));
    for (let y = yTop; y <= yBot; y++) {
      const t = (y - yTop) / (yBot - yTop);
      let half = Math.round(1 + t * (maxHalf - 1));
      if (y > yTop + 1) half += R() < 0.22 ? 1 : R() < 0.22 ? -1 : 0;
      for (let x = cx - half; x <= cx + half; x++) {
        const u = (x - cx) / Math.max(1, half);
        let k = u < -0.4 ? 3 : u < 0.3 ? 2 : 1;
        if (Math.abs(u + 0.4) < 0.18 && bayer(x, y) > 0.5) k = k === 3 ? 2 : 3;
        if (Math.abs(u - 0.3) < 0.18 && bayer(x, y) > 0.5) k = k === 2 ? 1 : 2;
        if (y >= yBot - 1) k = Math.max(0, k - 1);
        if (u < -0.62 && (y - yTop) % 4 === 1 && t > 0.15) k = 4;
        pset(g, pal[k], x, y);
      }
    }
  }
  return spr(outline(c, OUT), cx + 1, h + 1);
}

function oak(w: number, h: number, pal: Pal, seed: number): Spr {
  const [c, g] = mk(w, h);
  const R = rng(seed);
  const k = w / 54; // designed at 54 wide
  const cx = Math.floor(w / 2);
  const S = (v: number) => Math.round(v * k);
  trunk(g, cx, h, Math.max(4, 2 * Math.round(4 * k)), Math.round(h * 0.42));
  line(g, '#6b4226', cx, h - S(28), cx - S(9), h - S(40), 1);
  line(g, '#6b4226', cx + 1, h - S(30), cx + S(10), h - S(42), 1);
  const blobs: [number, number, number][] = [
    [cx, S(26), S(16)], [cx - S(13), S(33), S(11)], [cx + S(13), S(33), S(11)],
    [cx - S(9), S(16), S(10)], [cx + S(9), S(16), S(10)], [cx, S(38), S(9)],
  ];
  for (const [x, y, r] of blobs) disc(g, pal[1], x, y + 1, r);
  for (const [x, y, r] of blobs) disc(g, pal[2], x - 1, y - 1, Math.max(1, Math.round(r * 0.86)));
  for (const [x, y, r] of blobs) disc(g, pal[3], x - S(3), y - S(4), Math.max(1, Math.round(r * 0.55)));
  for (const [x, y, r] of blobs) disc(g, pal[4], x - S(5), y - S(6), Math.max(1, Math.round(r * 0.22)));
  const img = g.getImageData(0, 0, w, h);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] > 0;
  for (let i = 0; i < Math.round(80 * k * k); i++) {
    const x = cx - S(24) + Math.floor(R() * S(48)), y = S(6) + Math.floor(R() * S(40));
    if (!solid(x, y)) continue;
    pset(g, R() < 0.5 ? pal[1] : pal[3], x, y);
  }
  for (let x = cx - S(18); x <= cx + S(18); x++) {
    for (const y of [S(44), S(44) + 1]) {
      if (solid(x, y) && bayer(x, y) < 0.6) pset(g, pal[0], x, y);
    }
  }
  return spr(outline(c, OUT), cx + 1, h + 1);
}

// ---- characters --------------------------------------------------------------
const POSE_ANG = [-1.05, -2.2, -0.75, 0.3, 0.75];
const LEGS: [number, number, number, number][] = [[0, 0, 0, 0], [2, -1, -2, 0], [0, 0, 0, 0], [-2, 0, 2, -1]];

function drawAxeHead(g: Ctx, hx: number, hy: number, ang: number, tier: string) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  const ex = hx + dx * 10, ey = hy + dy * 10;
  line(g, '#8a5a2e', hx, hy, ex, ey, 1);
  line(g, '#b57a3c', hx + px * 0.4, hy + py * 0.4, ex, ey, 1);
  rotRect(g, shade(tier, -0.35), ex + dx * 0.5 + px * 1, ey + dy * 0.5 + py * 1, ang, 4, 8);
  rotRect(g, tier, ex + dx * 0.5 + px * 1.6, ey + dy * 0.5 + py * 1.6, ang, 3, 6);
  rotRect(g, shade(tier, 0.6), ex + dx * 0.5 + px * 3, ey + dy * 0.5 + py * 3, ang, 1, 4);
}

function playerFrame(legF: number, pose: number, tier: string): Spr {
  const [c, g] = mk(40, 40);
  const fx = 20, fy = 36;
  const [lx, ly, rx, ry] = LEGS[legF];
  // short legs
  rect(g, '#3d5f96', fx - 4 + lx, fy - 5 + ly, 3, 3);
  rect(g, '#5a3418', fx - 4 + lx, fy - 2 + ly, 4, 2);
  rect(g, '#2c4672', fx + 1 + rx, fy - 5 + ry, 3, 3);
  rect(g, '#46290f', fx + 1 + rx, fy - 2 + ry, 4, 2);
  // plaid torso 10x8
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 10; i++) {
      let col = '#cf3b30';
      if (i % 3 === 0 || j % 4 === 0) col = '#8e2a23';
      else if (i % 3 === 1 && j % 4 === 2) col = '#ea6a55';
      pset(g, col, fx - 5 + i, fy - 13 + j);
    }
  }
  rect(g, '#4a2c17', fx - 5, fy - 7, 10, 1);
  pset(g, '#f4c542', fx, fy - 7);
  pset(g, '#f4c542', fx + 1, fy - 7);
  // big head (stubby proportions)
  const headRows = [8, 10, 10, 10, 10, 10, 8];
  headRows.forEach((wd, r) => {
    const x0 = fx - Math.floor(wd / 2);
    for (let i = 0; i < wd; i++) pset(g, i >= wd - 2 ? '#dca06c' : SKINS[0], x0 + i, fy - 20 + r);
  });
  for (let r = 0; r < 4; r++) {
    const wd = r === 3 ? 6 : 9;
    const x0 = fx - Math.floor(wd / 2);
    for (let i = 0; i < wd; i++) pset(g, r % 2 && i % 3 === 0 ? '#5d3418' : '#7b4a26', x0 + i, fy - 17 + r);
  }
  pset(g, '#1b1b2b', fx + 1, fy - 18);
  pset(g, '#1b1b2b', fx + 3, fy - 18);
  // beanie
  rect(g, '#1c4fa8', fx - 5, fy - 21, 10, 2);
  rect(g, '#2f6fd6', fx - 5, fy - 23, 10, 2);
  rect(g, '#2f6fd6', fx - 4, fy - 24, 8, 1);
  rect(g, '#2f6fd6', fx - 3, fy - 25, 6, 1);
  rect(g, '#ffffff', fx - 1, fy - 27, 3, 2);
  pset(g, '#cfe0ff', fx - 3, fy - 23);
  // arm + axe
  const ang = POSE_ANG[pose];
  const sx = fx + 1, sy = fy - 12;
  const hx = sx + Math.cos(ang) * 4, hy = sy + Math.sin(ang) * 4;
  line(g, '#cf3b30', sx, sy, hx, hy, 2);
  drawAxeHead(g, hx, hy, ang, tier);
  rect(g, SKINS[0], Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
  return spr(outline(c, OUT), fx + 1, fy + 1);
}

function axeOrbit(pose: number, tier: string): Spr {
  const [c, g] = mk(30, 30);
  const ang = POSE_ANG[pose];
  const sx = 15 - Math.cos(ang) * 5, sy = 15 - Math.sin(ang) * 5;
  drawAxeHead(g, sx, sy, ang, tier);
  return spr(outline(c, OUT), 16, 16);
}

function backpack(level: number): Spr {
  const [c, g] = mk(10, 16);
  rect(g, '#7a4a22', 2, 6, 6, 8);
  rect(g, '#a9743c', 2, 6, 6, 3);
  rect(g, '#5a3418', 2, 12, 6, 2);
  pset(g, '#f4c542', 4, 9);
  for (let i = 0; i < level; i++) {
    const x = 2 + (i % 3) * 2, y = 4 - Math.floor(i / 3) * 2 + (i % 2);
    rect(g, '#c88a4a', x, y, 2, 2);
    pset(g, '#9a6234', x, y + 1);
  }
  return spr(outline(c, OUT), 0, 0);
}

function customer(look: number, mood: number, phase: number, special = 0): Spr {
  const [c, g] = mk(24, 36);
  const fx = 12, fy = 32;
  const shirt = special === 2 ? '#d86aa8' : SHIRTS[look % SHIRTS.length];
  const skin = SKINS[(look >> 3) % SKINS.length];
  const hair = HAIRS[(look >> 5) % HAIRS.length];
  const hat = (look >> 2) % 3;
  const [lx, ly, rx, ry] = LEGS[phase];
  rect(g, '#4b5568', fx - 4 + lx, fy - 5 + ly, 3, 3);
  rect(g, '#2b2b36', fx - 4 + lx, fy - 2 + ly, 4, 2);
  rect(g, '#3d4658', fx + 1 + rx, fy - 5 + ry, 3, 3);
  rect(g, '#2b2b36', fx + 1 + rx, fy - 2 + ry, 4, 2);
  const up = mood === 1 || (mood === 2 && phase % 2 === 0);
  if (up) {
    line(g, shirt, fx - 5, fy - 12, fx - 8, fy - 18, 2);
    line(g, shirt, fx + 4, fy - 12, fx + 7, fy - 18, 2);
    rect(g, skin, fx - 9, fy - 20, 2, 2);
    rect(g, skin, fx + 7, fy - 20, 2, 2);
  } else {
    rect(g, shirt, fx - 7, fy - 12, 2, 5);
    rect(g, shirt, fx + 5, fy - 12, 2, 5);
    rect(g, skin, fx - 7, fy - 7, 2, 2);
    rect(g, skin, fx + 5, fy - 7, 2, 2);
  }
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 10; i++) {
      let col = shirt;
      if (i < 2) col = shade(shirt, 0.22);
      else if (i > 7 || j > 5) col = shade(shirt, -0.22);
      pset(g, col, fx - 5 + i, fy - 13 + j);
    }
  }
  const rows = [7, 9, 9, 9, 9, 7];
  rows.forEach((wd, r) => {
    const x0 = fx - Math.floor(wd / 2);
    for (let i = 0; i < wd; i++) pset(g, skin, x0 + i, fy - 19 + r);
  });
  pset(g, '#1b1b2b', fx - 2, fy - 17);
  pset(g, '#1b1b2b', fx + 2, fy - 17);
  if (mood === 1) {
    rect(g, '#1b1b2b', fx - 2, fy - 15, 5, 1);
    pset(g, '#1b1b2b', fx - 3, fy - 16);
    pset(g, '#1b1b2b', fx + 3, fy - 16);
  } else if (mood === 2) {
    rect(g, '#1b1b2b', fx - 2, fy - 15, 5, 1);
    pset(g, '#1b1b2b', fx - 3, fy - 14);
    pset(g, '#1b1b2b', fx + 3, fy - 14);
    line(g, '#1b1b2b', fx - 4, fy - 19, fx - 1, fy - 18);
    line(g, '#1b1b2b', fx + 4, fy - 19, fx + 1, fy - 18);
  } else {
    rect(g, '#1b1b2b', fx - 1, fy - 15, 3, 1);
  }
  if (hat === 0) {
    rect(g, hair, fx - 4, fy - 21, 9, 3);
    rect(g, hair, fx - 5, fy - 19, 2, 2);
    rect(g, hair, fx + 4, fy - 19, 1, 2);
  } else if (hat === 1) {
    rect(g, '#c0392b', fx - 5, fy - 22, 10, 3);
    rect(g, '#e5574a', fx - 4, fy - 22, 8, 1);
    rect(g, '#9a2a20', fx - 2, fy - 19, 9, 1);
  } else {
    rect(g, '#d9a84a', fx - 4, fy - 23, 8, 3);
    rect(g, '#e8c46a', fx - 8, fy - 20, 16, 2);
    rect(g, '#b8862e', fx - 4, fy - 21, 8, 1);
  }
  if (special === 2) {
    rect(g, '#dfe3ea', fx - 4, fy - 21, 9, 3);
    rect(g, '#dfe3ea', fx - 5, fy - 19, 2, 3);
    rect(g, '#dfe3ea', fx + 4, fy - 19, 1, 3);
    rect(g, '#cfd4de', fx - 1, fy - 24, 3, 3);
    for (const x of [fx - 3, fx + 1]) {
      rect(g, '#6b4a8a', x, fy - 18, 3, 1);
      rect(g, '#6b4a8a', x, fy - 16, 3, 1);
    }
  }
  return spr(outline(c, OUT), fx + 1, fy + 1);
}

function thiefFrame(phase: number): Spr {
  const [c, g] = mk(26, 36);
  const fx = 13, fy = 32;
  const [lx, ly, rx, ry] = LEGS[phase];
  rect(g, '#1d1d28', fx - 4 + lx, fy - 5 + ly, 3, 3);
  rect(g, '#111118', fx - 4 + lx, fy - 2 + ly, 4, 2);
  rect(g, '#262632', fx + 1 + rx, fy - 5 + ry, 3, 3);
  rect(g, '#111118', fx + 1 + rx, fy - 2 + ry, 4, 2);
  // loot sack on the back
  rect(g, '#c9a66b', fx - 11, fy - 14, 7, 8);
  rect(g, '#a8854a', fx - 11, fy - 14, 7, 2);
  rect(g, '#6b4a1f', fx - 8, fy - 11, 1, 3);
  rect(g, '#6b4a1f', fx - 9, fy - 12, 3, 1);
  rect(g, '#6b4a1f', fx - 9, fy - 9, 3, 1);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 10; i++) pset(g, i < 2 ? '#3a3a4e' : j > 5 ? '#1d1d28' : '#2b2b3a', fx - 5 + i, fy - 13 + j);
  rect(g, '#2b2b3a', fx - 7, fy - 12, 2, 5);
  rect(g, '#2b2b3a', fx + 5, fy - 12, 2, 5);
  rect(g, '#f6cf9f', fx + 5, fy - 7, 2, 2);
  const rows = [7, 9, 9, 9, 9, 7];
  rows.forEach((wd, r) => {
    const x0 = fx - Math.floor(wd / 2);
    for (let i = 0; i < wd; i++) pset(g, '#e8b07a', x0 + i, fy - 19 + r);
  });
  rect(g, '#2b2b3a', fx - 5, fy - 22, 10, 4); // hood
  rect(g, '#111118', fx - 5, fy - 18, 10, 3); // mask
  pset(g, '#ffffff', fx - 2, fy - 17);
  pset(g, '#ffffff', fx + 2, fy - 17);
  return spr(outline(c, OUT), fx + 1, fy + 1);
}

function makeHive(): Spr {
  const [c, g] = mk(10, 13);
  rect(g, '#6b4226', 4, 0, 2, 3);
  for (const [y, w] of [[3, 6], [5, 8], [7, 8], [9, 6], [11, 4]] as const) {
    const x0 = 5 - w / 2;
    rect(g, y % 4 === 3 ? '#c98a1c' : '#f0b429', x0, y, w, 2);
  }
  rect(g, '#2b1a08', 4, 8, 2, 2);
  return spr(outline(c, OUT), 5, 0);
}

function makeBomb(): Spr {
  const [c, g] = mk(12, 13);
  disc(g, '#23232e', 6, 8, 4);
  disc(g, '#3a3a4a', 5, 7, 2);
  pset(g, '#8a8aa0', 4, 6);
  rect(g, '#8a5a2e', 6, 2, 1, 3);
  rect(g, '#8a5a2e', 7, 1, 2, 1);
  return spr(outline(c, OUT), 6, 12);
}

function makeCrown(): Spr {
  const [c, g] = mk(9, 5);
  rect(g, '#ffd23f', 0, 2, 9, 3);
  for (const x of [0, 4, 8]) rect(g, '#ffd23f', x, 0, 1, 3);
  pset(g, '#ff4d4d', 4, 3);
  pset(g, '#4da3ff', 1, 3);
  pset(g, '#4da3ff', 7, 3);
  rect(g, '#b8860b', 0, 4, 9, 1);
  return spr(outline(c, OUT), 5, 6);
}

// ---- props -------------------------------------------------------------------
function makeStall(): Spr {
  const W = 90, H = 80;
  const [c, g] = mk(W, H);
  const cx = W / 2;
  const base = H - 2;
  for (let y = 24; y < 60; y++) for (let x = 12; x < 78; x++) pset(g, y % 4 === 0 ? '#c99a5b' : '#e4bb7e', x, y);
  rect(g, '#b98848', 12, 24, 66, 3);
  for (const px of [9, 78]) {
    rect(g, '#6b4226', px, 8, 3, 52);
    rect(g, '#9a6234', px, 8, 1, 52);
  }
  rect(g, '#7b4e26', 13, 47, 64, 3);
  rect(g, '#5a3418', 13, 50, 64, 1);
  for (let i = 0; i < 9; i++) {
    const x = 18 + i * 7;
    disc(g, '#9a6234', x, 43, 3);
    disc(g, '#d9a366', x, 43, 2);
    pset(g, '#9a6234', x, 43);
  }
  rect(g, '#9a6234', 10, 62, 70, 14);
  for (let i = 0; i < 70; i += 7) rect(g, '#7b4e26', 10 + i, 62, 1, 14);
  rect(g, '#7b4e26', 10, 74, 70, 2);
  rect(g, '#e8b476', 8, 58, 74, 4);
  rect(g, '#f6cf94', 8, 58, 74, 1);
  rect(g, '#b8803f', 8, 61, 74, 1);
  const stripes = 13;
  for (let i = 0; i < stripes; i++) {
    const x = 5 + i * 6;
    const col = i % 2 ? '#f6ecd6' : '#d94a3d';
    const dark = i % 2 ? '#d8cbae' : '#a82f26';
    rect(g, col, x, 4, 6, 19);
    rect(g, dark, x, 4, 6, 2);
    rect(g, col, x + 1, 23, 4, 1);
    rect(g, dark, x + 5, 4, 1, 19);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(5, 24, 78, 3);
  rect(g, '#4a2c17', 4, 28, 82, 12);
  rect(g, '#6b4226', 4, 28, 82, 1);
  ptext(g, 'WOOD SHOP', cx, 30, '#ffe2a8', { align: 'center', outline: '#2a160a' });
  return spr(outline(c, OUT), cx + 1, base + 1);
}

function makeStump(): Spr {
  const [c, g] = mk(16, 10);
  ellipse(g, '#5a3418', 8, 6, 7, 3);
  rect(g, '#6b4226', 1, 4, 14, 4);
  ellipse(g, '#dcae6e', 8, 4, 6, 3);
  ellipse(g, '#b8803f', 8, 4, 3, 1);
  pset(g, '#8a5a2e', 8, 4);
  return spr(outline(c, OUT), 9, 10);
}

function makeBush(v: number): Spr {
  const pal = v ? PAL_TEAL : PAL_GREEN;
  const [c, g] = mk(20, 14);
  const bl: [number, number, number][] = [[6, 8, 5], [14, 8, 5], [10, 5, 5]];
  for (const [x, y, r] of bl) disc(g, pal[1], x, y + 1, r);
  for (const [x, y, r] of bl) disc(g, pal[2], x - 1, y - 1, r - 1);
  for (const [x, y, r] of bl) disc(g, pal[3], x - 2, y - 2, Math.max(1, r - 3));
  pset(g, pal[4], 7, 3);
  pset(g, pal[4], 9, 2);
  return spr(outline(c, OUT), 11, 14);
}

function makeShadow(rx: number, ry: number): Spr {
  const [c, g] = mk(rx * 2 + 3, ry * 2 + 3);
  ellipse(g, '#000', rx + 1, ry + 1, rx, ry);
  return spr(c, rx + 1, ry + 1);
}

function makeLog(): Spr {
  const [c, g] = mk(10, 7);
  rect(g, '#9a6234', 2, 1, 7, 5);
  rect(g, '#c88a4a', 2, 1, 7, 1);
  rect(g, '#6b4226', 2, 5, 7, 1);
  ellipse(g, '#e0a868', 2, 3, 1, 2);
  pset(g, '#9a6234', 2, 3);
  return spr(outline(c, OUT), 5, 4);
}

function makeCoin(): Spr {
  const [c, g] = mk(9, 9);
  disc(g, '#f6b800', 4, 4, 3);
  disc(g, '#ffe27a', 3, 3, 2);
  rect(g, '#a86a00', 4, 2, 1, 5);
  return spr(outline(c, '#4a2c00'), 5, 5);
}

function makeVignette(): HTMLCanvasElement {
  const [c, g] = mk(VW, VH);
  g.fillStyle = '#ff2a2a';
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const nx = (x - VW / 2) / (VW / 2), ny = (y - VH / 2) / (VH / 2);
      const r = Math.hypot(nx, ny);
      if (r > 0.72 && bayer(x, y) < (r - 0.72) * 1.6) g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---- ground / world layer ----------------------------------------------------
function makeGroundTile(): HTMLCanvasElement {
  const T = 64;
  const [c, g] = mk(T, T);
  rect(g, '#47a447', 0, 0, T, T);
  const R = rng(5);
  const wrapDisc = (col: string, x: number, y: number, r: number) => {
    for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) ditherDisc(g, col, Math.round(x) + ox, Math.round(y) + oy, Math.round(r));
  };
  for (let i = 0; i < 7; i++) wrapDisc('#3b9540', R() * T, R() * T, 8 + R() * 9);
  for (let i = 0; i < 6; i++) wrapDisc('#58b850', R() * T, R() * T, 6 + R() * 8);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(R() * T), y = Math.floor(R() * T);
    pset(g, R() < 0.5 ? '#2f7d36' : '#6fcd5f', x, y);
    if (R() < 0.5) pset(g, '#2f7d36', x, y - 1);
  }
  return c;
}

export interface Deco { x: number; y: number; v: number }

export class Art {
  world: HTMLCanvasElement;
  vignette = makeVignette();
  trees: { s: Spr; flash: HTMLCanvasElement }[][];
  stump = makeStump();
  stall = makeStall();
  bushes = [makeBush(0), makeBush(1)];
  bushList: Deco[] = [];
  shadows = [makeShadow(7, 2), makeShadow(10, 3), makeShadow(16, 4), makeShadow(11, 3), makeShadow(5, 2), makeShadow(7, 2), makeShadow(11, 3)];
  log = makeLog();
  coin = makeCoin();
  hive = makeHive();
  bomb = makeBomb();
  crown = makeCrown();
  thiefFrames = [0, 1, 2, 3].map(thiefFrame);
  packs = [0, 1, 2, 3, 4, 5].map(backpack);
  private pf = new Map<string, Spr>();
  private ax = new Map<string, Spr>();
  private cu = new Map<string, Spr>();

  constructor() {
    const mkTree = (s: Spr) => ({ s, flash: silhouette(s.c) });
    this.trees = [
      [mkTree(pine(15, 28, 3, PAL_GREEN, 1)), mkTree(pine(15, 28, 3, PAL_TEAL, 2)), mkTree(pine(15, 28, 3, PAL_GOLD, 7))],
      [mkTree(pine(20, 40, 3, PAL_GREEN, 3)), mkTree(pine(20, 40, 3, PAL_TEAL, 4)), mkTree(pine(20, 40, 3, PAL_GOLD, 8))],
      [mkTree(oak(36, 50, PAL_GREEN, 5)), mkTree(oak(36, 50, PAL_AUTUMN, 6)), mkTree(oak(36, 50, PAL_GOLD, 10))],
    ];
    this.world = this.buildWorld();
  }

  player(legF: number, pose: number, tier: string) {
    const k = `${legF}|${pose}|${tier}`;
    let s = this.pf.get(k);
    if (!s) this.pf.set(k, (s = playerFrame(legF, pose, tier)));
    return s;
  }
  axe(pose: number, tier: string) {
    const k = `${pose}|${tier}`;
    let s = this.ax.get(k);
    if (!s) this.ax.set(k, (s = axeOrbit(pose, tier)));
    return s;
  }
  customer(look: number, mood: number, phase: number, special = 0) {
    const k = `${look % 96}|${mood}|${phase}|${special}`;
    let s = this.cu.get(k);
    if (!s) this.cu.set(k, (s = customer(look % 96, mood, phase, special)));
    return s;
  }

  private buildWorld(): HTMLCanvasElement {
    const [c, g] = mk(WW, WH);
    const R = rng(2024);
    g.fillStyle = g.createPattern(makeGroundTile(), 'repeat')!;
    g.fillRect(0, 0, WW, WH);
    for (let i = 0; i < 90; i++) ditherDisc(g, '#3b9540', Math.floor(R() * WW), Math.floor(R() * WH), 14 + Math.floor(R() * 26));
    for (let i = 0; i < 60; i++) ditherDisc(g, '#58b850', Math.floor(R() * WW), Math.floor(R() * WH), 10 + Math.floor(R() * 20));

    // dirt roads from the base
    const bx = BASE.x / ART, by = BASE.y / ART;
    const ends: [number, number, number, number][] = [
      [0, by + 38, bx - 150, by + 10],
      [WW, by - 30, bx + 162, by - 10],
      [bx - 58, 0, bx - 40, by - 105],
      [bx + 65, WH, bx + 40, by + 105],
    ];
    const samples: [number, number][] = [];
    for (const [ex, ey, qx, qy] of ends) {
      for (let t = 0; t <= 1; t += 0.004) {
        const u = 1 - t;
        samples.push([u * u * bx + 2 * u * t * qx + t * t * ex, u * u * by + 2 * u * t * qy + t * t * ey]);
      }
    }
    for (const [x, y] of samples) disc(g, '#a9733f', Math.round(x), Math.round(y), 8);
    for (const [x, y] of samples) disc(g, '#d3a066', Math.round(x), Math.round(y), 6);
    for (const [x, y] of samples) {
      if (R() < 0.35) pset(g, R() < 0.5 ? '#e6bd83' : '#b98245', x + Math.round((R() - 0.5) * 9), y + Math.round((R() - 0.5) * 9));
    }

    // cobbled plaza
    const rx = 112, ry = 76;
    const stones = ['#d8b27a', '#cfa66d', '#e0bc86', '#c79a62'];
    for (let y = Math.floor(by - ry - 6); y <= by + ry + 6; y++) {
      for (let x = Math.floor(bx - rx - 6); x <= bx + rx + 6; x++) {
        const nx = (x - bx) / rx, ny = (y - by) / ry;
        const d = Math.hypot(nx, ny);
        const a = Math.atan2(ny, nx);
        const lim = 1 + Math.sin(a * 5 + 1) * 0.025 + Math.sin(a * 11) * 0.012;
        if (d > lim + 0.07) continue;
        if (d > lim) {
          if (bayer(x, y) < 0.7) pset(g, '#2f7d36', x, y);
          continue;
        }
        if (d > lim - 0.06) { pset(g, '#7a5030', x, y); continue; }
        const row = Math.floor(y / 4);
        const off = (row % 2) * 3;
        const col = Math.floor((x + off) / 6);
        if (y % 4 === 0 || (x + off) % 6 === 0) pset(g, '#a47c4c', x, y);
        else {
          const h = Math.abs(Math.imul(col * 73856093 ^ row * 19349663, 2654435761)) % 4;
          pset(g, y % 4 === 1 ? shade(stones[h], 0.18) : stones[h], x, y);
        }
      }
    }
    g.fillStyle = 'rgba(60,35,10,0.22)';
    ellipse(g, 'rgba(60,35,10,0.22)', Math.round(DEPOT.x / ART), Math.round(DEPOT.y / ART) + 3, 19, 11);

    // scenery
    const place = (n: number, fn: (x: number, y: number) => void) => {
      for (let i = 0; i < n; i++) {
        const x = Math.floor(R() * WW), y = 6 + Math.floor(R() * (WH - 6));
        const ex = (x - bx) / (rx + 8), ey = (y - by) / (ry + 8);
        if (ex * ex + ey * ey < 1) continue;
        fn(x, y);
      }
    };
    place(420, (x, y) => {
      const col = R() < 0.5 ? '#2f7d36' : '#86dc6a';
      pset(g, col, x, y); pset(g, col, x - 1, y - 1); pset(g, col, x + 1, y - 2); pset(g, col, x, y - 2);
    });
    const petals = ['#ff8fb1', '#ffe066', '#ffffff', '#b794f6'];
    place(150, (x, y) => {
      const p = petals[Math.floor(R() * petals.length)];
      pset(g, '#2f7d36', x, y); pset(g, '#2f7d36', x, y - 1);
      pset(g, p, x, y - 3); pset(g, p, x - 1, y - 2); pset(g, p, x + 1, y - 2); pset(g, p, x, y - 2);
      pset(g, '#f4a300', x, y - 2);
    });
    place(46, (x, y) => {
      ellipse(g, 'rgba(0,30,10,0.3)', x, y + 1, 4, 1);
      rect(g, '#8590a0', x - 3, y - 3, 7, 4);
      rect(g, '#aab3c2', x - 2, y - 4, 5, 1);
      rect(g, '#c7cfdb', x - 2, y - 3, 2, 1);
      rect(g, '#5d6878', x - 3, y, 7, 1);
    });
    place(30, (x, y) => {
      rect(g, '#f2e8d0', x, y - 2, 2, 3);
      rect(g, '#d94a3d', x - 1, y - 4, 4, 2);
      pset(g, '#fff', x, y - 4);
    });
    place(70, (x, y) => this.bushList.push({ x, y, v: R() < 0.5 ? 0 : 1 }));
    this.bushList.sort((a, b) => a.y - b.y);

    // dark forest rim: top silhouette pines + dithered edge shading
    const dp = pine(18, 34, 3, PAL_DARK, 9);
    for (let x = -6; x < WW + 10; x += 9 + Math.floor(R() * 4)) g.drawImage(dp.c, x - dp.ax, 12 + Math.floor(R() * 4) - dp.ay);
    for (let y = 0; y < WH; y++) {
      for (let x = 0; x < WW; x++) {
        const d = Math.min(x, y, WW - 1 - x, WH - 1 - y);
        if (d < 14) {
          const k = 1 - d / 14;
          if (d < 3 || bayer(x, y) < k * 0.85) pset(g, '#0e2a1c', x, y);
        }
      }
    }
    return c;
  }
}
