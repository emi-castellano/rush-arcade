import { disc, line, mk, outline, pset, rect, rotRect, tri, type Ctx } from '../../lib/pixel';
import type { UpgradeId } from './config';

const INK = '#14122b';

function axe(g: Ctx, x: number, y: number, ang: number, col: string) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  line(g, '#8a5a2e', x - dx * 6, y - dy * 6, x + dx * 6, y + dy * 6, 1);
  rotRect(g, col, x + dx * 5 - dy * 1, y + dy * 5 + dx * 1, ang, 3, 7);
  rotRect(g, '#ffffff', x + dx * 5 - dy * 3, y + dy * 5 + dx * 3, ang, 1, 3);
}

const DRAW: Record<UpgradeId, (g: Ctx) => void> = {
  edge: (g) => axe(g, 8, 8, -0.8, '#cbd5e1'),
  extra: (g) => {
    axe(g, 7, 9, -0.8, '#6ee7ff');
    axe(g, 9, 8, -2.35, '#ffd23f');
  },
  speed: (g) => {
    tri(g, '#ffd23f', 9, 1, 3, 9, 8, 9);
    tri(g, '#ffd23f', 7, 7, 13, 7, 7, 15);
    rect(g, '#fff7a8', 7, 3, 1, 4);
  },
  move: (g) => {
    rect(g, '#b8803f', 4, 2, 5, 9);
    rect(g, '#8a5a2e', 4, 10, 10, 4);
    rect(g, '#d9a366', 9, 10, 5, 2);
    rect(g, '#f6e7c8', 4, 2, 5, 2);
  },
  carry: (g) => {
    rect(g, '#d94a3d', 3, 4, 10, 10);
    rect(g, '#a82f26', 3, 11, 10, 3);
    rect(g, '#f0705f', 3, 4, 10, 2);
    rect(g, '#ffd23f', 7, 8, 2, 2);
    rect(g, '#d94a3d', 5, 2, 6, 2);
  },
  price: (g) => {
    disc(g, '#f6b800', 8, 8, 6);
    disc(g, '#ffe27a', 7, 7, 4);
    rect(g, '#a86a00', 8, 4, 1, 8);
    rect(g, '#a86a00', 6, 5, 4, 1);
    rect(g, '#a86a00', 6, 10, 4, 1);
  },
  time: (g) => {
    rect(g, '#8a5a2e', 3, 1, 10, 2);
    rect(g, '#8a5a2e', 3, 13, 10, 2);
    tri(g, '#9fe8ff', 4, 3, 12, 3, 8, 8);
    tri(g, '#f6d58a', 8, 8, 4, 13, 12, 13);
    pset(g, '#f6d58a', 8, 7);
  },
  dash: (g) => {
    rect(g, '#9fe8ff', 1, 4, 6, 1);
    rect(g, '#9fe8ff', 0, 8, 8, 1);
    rect(g, '#9fe8ff', 2, 12, 5, 1);
    rect(g, '#b8803f', 9, 3, 4, 8);
    rect(g, '#8a5a2e', 9, 10, 6, 3);
    rect(g, '#f6e7c8', 9, 3, 4, 2);
  },
  lucky: (g) => {
    for (const [x, y] of [[5, 5], [10, 5], [5, 10], [10, 10]]) disc(g, '#3fcf6b', x, y, 3);
    for (const [x, y] of [[4, 4], [9, 4], [4, 9], [9, 9]]) disc(g, '#8cf59a', x, y, 1);
    rect(g, '#2a8a45', 7, 8, 2, 7);
  },
  chain: (g) => {
    rect(g, '#cbd5e1', 1, 2, 7, 5);
    rect(g, '#14122b', 3, 4, 3, 1);
    rect(g, '#cbd5e1', 8, 8, 7, 5);
    rect(g, '#14122b', 10, 10, 3, 1);
    rect(g, '#94a3b8', 6, 6, 4, 3);
  },
  patience: (g) => {
    disc(g, '#ffd23f', 8, 8, 6);
    rect(g, INK, 5, 6, 2, 3);
    rect(g, INK, 10, 6, 2, 3);
    rect(g, INK, 5, 11, 7, 1);
    rect(g, INK, 4, 10, 1, 1);
    rect(g, INK, 12, 10, 1, 1);
  },
};

/** Draws a 16x16 outlined pixel icon into `canvas`. */
export function drawIcon(canvas: HTMLCanvasElement, id: UpgradeId) {
  const [c, g] = mk(16, 16);
  DRAW[id](g);
  const o = outline(c, INK);
  canvas.width = 18;
  canvas.height = 18;
  const out = canvas.getContext('2d')!;
  out.imageSmoothingEnabled = false;
  out.clearRect(0, 0, 18, 18);
  out.drawImage(o, 0, 0);
}
