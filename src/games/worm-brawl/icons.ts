import { disc, ellipse, line, mk, outline, pset, rect, rotRect, tri, type Ctx } from '../../lib/pixel';
import type { WeaponId } from './config';

const INK = '#241226';

const DRAW: Record<WeaponId, (g: Ctx) => void> = {
  bazooka: (g) => {
    rotRect(g, '#6f8a3a', 8, 8, -0.55, 14, 4);
    rotRect(g, '#4a5e26', 12, 5, -0.55, 3, 5);
    rect(g, '#ff9a2b', 1, 12, 2, 2);
    pset(g, '#ffe27a', 0, 13);
    rotRect(g, '#3a3a48', 4, 11, -0.55, 3, 5);
  },
  grenade: (g) => {
    disc(g, '#3f8f3f', 8, 9, 5);
    disc(g, '#6fc46a', 6, 7, 2);
    rect(g, '#9aa0ab', 7, 2, 3, 3);
    rect(g, '#cfd4de', 10, 3, 3, 1);
    pset(g, '#ffd23f', 12, 2);
  },
  cluster: (g) => {
    disc(g, '#e07a1f', 6, 8, 4);
    disc(g, '#f6a85a', 5, 6, 1);
    rect(g, '#9aa0ab', 5, 2, 3, 2);
    for (const [x, y] of [[12, 5], [13, 10], [10, 13]]) disc(g, '#e07a1f', x, y, 1);
  },
  shotgun: (g) => {
    rect(g, '#7a4a22', 1, 8, 5, 4);
    rect(g, '#9a6234', 1, 8, 5, 1);
    rect(g, '#6c7184', 5, 7, 10, 2);
    rect(g, '#8a90a2', 5, 9, 9, 2);
    rect(g, '#3a3a48', 6, 11, 2, 2);
  },
  uzi: (g) => {
    rect(g, '#4a4f66', 3, 5, 9, 4);
    rect(g, '#6c7184', 3, 5, 9, 1);
    rect(g, '#2f3346', 11, 6, 4, 2);
    rect(g, '#3a3a48', 5, 9, 3, 5);
    rect(g, '#3a3a48', 9, 9, 2, 4);
  },
  dynamite: (g) => {
    for (const x of [3, 6, 9]) {
      rect(g, '#d94a3d', x, 5, 3, 9);
      rect(g, '#ff7a6a', x, 5, 1, 9);
    }
    rect(g, '#f2e8d0', 3, 8, 9, 2);
    line(g, '#8a5a2e', 7, 5, 9, 2);
    pset(g, '#ffd23f', 10, 1);
    pset(g, '#ff9a2b', 9, 1);
  },
  sheep: (g) => {
    for (const [x, y] of [[4, 6], [7, 5], [10, 6], [5, 9], [9, 9]]) disc(g, '#f4f4f4', x, y, 2);
    rect(g, '#3a2a2a', 11, 6, 4, 4);
    rect(g, '#3a2a2a', 4, 12, 1, 2);
    rect(g, '#3a2a2a', 9, 12, 1, 2);
  },
  airstrike: (g) => {
    tri(g, '#aab0c2', 1, 6, 14, 3, 14, 9);
    rect(g, '#6c7184', 10, 1, 3, 3);
    rect(g, '#6c7184', 10, 9, 3, 3);
    for (const x of [3, 7, 11]) {
      rect(g, '#d94a3d', x, 12, 2, 3);
      pset(g, '#ffd23f', x, 15);
    }
  },
  rope: (g) => {
    line(g, '#d9c28a', 2, 14, 7, 7, 1);
    line(g, '#9aa0ab', 7, 7, 7, 3, 2);
    line(g, '#9aa0ab', 7, 3, 11, 2, 2);
    line(g, '#9aa0ab', 11, 2, 12, 6, 2);
    pset(g, '#cfd4de', 8, 3);
  },
  jetpack: (g) => {
    rect(g, '#8a90a2', 3, 2, 4, 9);
    rect(g, '#8a90a2', 9, 2, 4, 9);
    rect(g, '#cfd4de', 3, 2, 1, 9);
    rect(g, '#cfd4de', 9, 2, 1, 9);
    rect(g, '#d94a3d', 3, 5, 4, 1);
    rect(g, '#d94a3d', 9, 5, 4, 1);
    for (const x of [4, 10]) {
      rect(g, '#ff9a2b', x, 11, 2, 3);
      pset(g, '#ffe27a', x, 11);
      pset(g, '#ffd23f', x + 1, 14);
    }
  },
  teleport: (g) => {
    ellipse(g, '#7a5af0', 8, 8, 6, 6);
    ellipse(g, '#241226', 8, 8, 4, 4);
    ellipse(g, '#4be3ff', 8, 8, 3, 3);
    pset(g, '#ffffff', 7, 7);
    pset(g, '#ffffff', 11, 3);
    pset(g, '#ffffff', 3, 12);
  },
  drill: (g) => {
    tri(g, '#aab0c2', 14, 8, 6, 3, 6, 13);
    line(g, '#6c7184', 7, 5, 12, 8, 1);
    line(g, '#6c7184', 7, 9, 12, 8, 1);
    rect(g, '#d94a3d', 1, 5, 6, 6);
    rect(g, '#ff7a6a', 1, 5, 6, 1);
  },
};

/** Draws an 18x18 outlined pixel icon into `canvas`. */
export function drawWeaponIcon(canvas: HTMLCanvasElement, id: WeaponId) {
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
