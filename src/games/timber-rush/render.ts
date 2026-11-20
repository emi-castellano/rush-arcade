import {
  bayer, ditherDisc, mk, pset, ptext, rect, tiny, tinyWidth, tri, type Ctx,
} from '../../lib/pixel';
import { BASE, COUNTER, DEPOT, MAX_TIME, WORLD_H, WORLD_W, axeColor, axeCount, dashCd, xpNeeded } from './config';
import type { Customer, TimberEngine, Tree } from './engine';
import { ART, Art, VH, VW, WH, WW } from './sprites';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const INK = '#14122b';

type Item = { y: number; k: 0 | 1 | 2 | 3 | 4 | 5 | 6; t?: Tree; c?: Customer; i?: number };

/**
 * Pixel-art renderer. The whole scene is drawn into a 320x180 buffer and scaled up
 * by an integer factor with smoothing off, so every art pixel stays perfectly crisp.
 */
export class Renderer {
  private out: Ctx;
  private buf: HTMLCanvasElement;
  private b: Ctx;
  private art = new Art();
  private camX = 0; // whole-pixel camera (ground + static scenery)
  private camY = 0;
  private camXf = 0; // sub-pixel camera (moving things)
  private camYf = 0;

  constructor(private canvas: HTMLCanvasElement, private e: TimberEngine) {
    this.out = canvas.getContext('2d', { alpha: false })!;
    [this.buf, this.b] = mk(VW, VH);
  }

  /** Renders at the largest integer pixel scale that fits `cssW`. */
  resize(cssW: number, dpr: number) {
    const k = Math.max(1, Math.floor((cssW * dpr) / VW));
    this.canvas.width = VW * k;
    this.canvas.height = VH * k;
    // fill the space, but never stretch more than one whole step beyond the crisp scale
    const w = Math.min(cssW, (VW * (k + 1)) / dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${(w * VH) / VW}px`;
    this.out.imageSmoothingEnabled = false;
  }

  draw() {
    const { b, e, art } = this;
    // Shake is applied in whole art pixels (and ignored when tiny) so it never flickers the rounding.
    const shx = Math.abs(e.shakeX) >= 2 ? Math.round(e.shakeX / ART) : 0;
    const shy = Math.abs(e.shakeY) >= 2 ? Math.round(e.shakeY / ART) : 0;
    this.camXf = clamp(e.cam.x / ART + shx, 0, WW - VW);
    this.camYf = clamp(e.cam.y / ART + shy, 0, WH - VH);
    this.camX = Math.round(this.camXf);
    this.camY = Math.round(this.camYf);
    const cx = this.camX, cy = this.camY;

    b.globalAlpha = 1;
    b.drawImage(art.world, cx, cy, VW, VH, 0, 0, VW, VH);
    this.depotRing();

    // y-sorted scene
    const items: Item[] = [];
    for (const t of e.trees) {
      const sx = t.x / ART - cx, sy = t.y / ART - cy;
      if (sx < -40 || sx > VW + 40 || sy < -4 || sy > VH + 100) continue;
      items.push({ y: t.y / ART, k: 0, t });
    }
    art.bushList.forEach((d, i) => {
      const sx = d.x - cx, sy = d.y - cy;
      if (sx < -14 || sx > VW + 14 || sy < -2 || sy > VH + 16) return;
      items.push({ y: d.y, k: 5, i });
    });
    items.push({ y: e.player.y / ART, k: 1 });
    for (const c of e.customers) if (c.active) items.push({ y: c.drawY / ART, k: 2, c });
    items.push({ y: (COUNTER.y + COUNTER.h / 2) / ART, k: 3 });
    if (e.thief.on) items.push({ y: e.thief.y / ART, k: 6 });
    items.push({ y: DEPOT.y / ART + 6, k: 4 });
    items.sort((p, q) => p.y - q.y);
    for (const it of items) {
      switch (it.k) {
        case 0: this.tree(it.t!); break;
        case 1: this.player(); break;
        case 2: this.customer(it.c!); break;
        case 3: this.stall(); break;
        case 4: this.depot(); break;
        case 6: this.thief(); break;
        case 5: {
          const d = art.bushList[it.i!];
          const s = art.bushes[d.v];
          b.drawImage(s.c, d.x - cx - s.ax, d.y - cy - s.ay);
          break;
        }
      }
    }
    this.particles();
    this.bees();
    this.texts();

    // atmosphere
    const heat = clamp(e.elapsed / 180) * 0.12;
    if (heat > 0.005) {
      b.fillStyle = `rgba(255,120,40,${heat})`;
      b.fillRect(0, 0, VW, VH);
    }
    const danger = e.phase === 'playing' ? clamp((10 - e.time) / 10) : 0;
    const a = Math.max(danger * (0.5 + 0.5 * Math.sin(e.clock * (6 + danger * 8))), e.flashRed * 0.8);
    if (a > 0.02) {
      b.globalAlpha = clamp(a);
      b.drawImage(art.vignette, 0, 0);
      b.globalAlpha = 1;
    }
    if (e.rushLeft > 0) {
      b.fillStyle = Math.floor(e.clock * 6) % 2 ? 'rgba(255,90,20,0.10)' : 'rgba(255,200,40,0.07)';
      b.fillRect(0, 0, VW, VH);
    }
    this.hud();

    this.out.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  // ---- world objects -------------------------------------------------------
  /** Moving things: rounded once, relative to the smooth camera, so they never wobble against the screen. */
  private sx(x: number) { return Math.round(x / ART - this.camXf); }
  private sy(y: number) { return Math.round(y / ART - this.camYf); }
  /** Static scenery: locked to the whole-pixel ground so it scrolls perfectly with it. */
  private sxs(x: number) { return Math.round(x / ART) - this.camX; }
  private sys(y: number) { return Math.round(y / ART) - this.camY; }

  private depotRing() {
    const { b, e } = this;
    const x = this.sxs(DEPOT.x), y = this.sys(DEPOT.y);
    const r = Math.round(DEPOT.r / ART);
    const hot = e.player.carry > 0;
    const col = e.inDepot ? '#6dff9a' : hot ? '#ffd23f' : '#ffffff';
    if (e.inDepot || hot) {
      b.globalAlpha = e.inDepot ? 0.5 : 0.28;
      ditherDisc(b, col, x, y, r);
      b.globalAlpha = 1;
    }
    const shift = Math.floor(e.clock * 8);
    const n = 64;
    b.fillStyle = col;
    for (let i = 0; i < n; i++) {
      if ((i + shift) % 8 >= 4) continue;
      const a = (i / n) * Math.PI * 2;
      b.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
    }
  }

  private shadow(kind: number, x: number, y: number, alpha = 0.3) {
    const s = this.art.shadows[kind];
    this.b.globalAlpha = alpha;
    this.b.drawImage(s.c, x - s.ax, y - s.ay);
    this.b.globalAlpha = 1;
  }

  private tree(t: Tree) {
    const { b, e, art } = this;
    const x = this.sxs(t.x), y = this.sys(t.y);
    if (t.state === 'stump') {
      this.shadow(0, x + 1, y, 0.25);
      const s = art.stump;
      b.drawImage(s.c, x - s.ax, y - s.ay);
      // regrow ring + sprout
      const prog = 1 - clamp(t.respawn / t.regrow);
      const n = 14, lit = Math.round(prog * n);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        pset(b, i < lit ? '#9bf07a' : '#14122b', x + Math.cos(a) * 5, y - 15 + Math.sin(a) * 5);
      }
      const sz = 1 + Math.floor(prog * 3);
      rect(b, '#5fcf78', x - sz, y - 7, sz, 1);
      rect(b, '#5fcf78', x + 1, y - 7, sz, 1);
      pset(b, '#2f9a47', x, y - 6);
      pset(b, '#2f9a47', x, y - 7);
      return;
    }
    const T = art.trees[t.kind][t.variant];
    const s = T.s;
    this.shadow(4 + t.kind, x + 2, y, 0.3 * clamp(t.grow));
    const sh = t.shake > 0.1 ? (Math.floor(e.clock * 40) % 2 ? 1 : -1) : 0;

    if (t.state === 'falling') {
      const f = t.fall;
      const ang = t.fallDir * (Math.PI / 2) * (f * f * (0.8 + 0.2 * f));
      const q = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
      b.save();
      b.translate(x, y);
      b.rotate(q);
      b.globalAlpha = 1 - clamp((f - 0.75) / 0.25);
      b.drawImage(s.c, -s.ax, -s.ay);
      b.restore();
      b.globalAlpha = 1;
      return;
    }
    const g = clamp(t.grow);
    const sc = g >= 1 ? 1 : Math.max(0.25, Math.round(g * 4) / 4);
    const dw = Math.round(s.w * sc), dh = Math.round(s.h * sc);
    const dx = x - Math.round(s.ax * sc) + sh, dy = y - Math.round(s.ay * sc);
    b.drawImage(s.c, dx, dy, dw, dh);
    if (t.flash > 0.2) {
      b.globalAlpha = Math.min(0.75, t.flash);
      b.drawImage(T.flash, dx, dy, dw, dh);
      b.globalAlpha = 1;
    }
    if (g >= 1) {
      if (t.hive) {
        const h = art.hive;
        b.drawImage(h.c, x + 3 - h.ax, y - Math.round(s.h * 0.62) - h.ay);
        if (Math.floor(e.clock * 10 + t.id) % 3 === 0) pset(b, '#ffe27a', x + 2 + (t.id % 5), y - Math.round(s.h * 0.62) + 4);
      } else if (t.special === 3) {
        const bm = art.bomb;
        const by = y - Math.round(s.h * 0.55);
        b.drawImage(bm.c, x - bm.ax, by - bm.ay + 12);
        pset(b, Math.floor(e.clock * 8) % 2 ? '#ffd23f' : '#ff4d4d', x + 2, by - 1);
      }
    }
    if (t.hp < t.maxHp && g >= 1) {
      rect(b, INK, x - 8, y + 3, 16, 4);
      rect(b, '#5a3418', x - 7, y + 4, 14, 2);
      rect(b, '#ffb347', x - 7, y + 4, Math.max(1, Math.round(14 * clamp(t.hp / t.maxHp))), 2);
    }
  }

  private player() {
    const { b, e, art } = this;
    const p = e.player;
    const x = this.sx(p.x), y = this.sy(p.y);
    const moving = p.moving > 0.3;
    const legF = moving ? Math.floor(p.bob / 2) % 4 : 0;
    const hop = moving && legF % 2 === 0 ? 1 : 0;
    const s = p.swing;
    const pose = s > 0.8 ? 3 : s > 0.55 ? 4 : s > 0.3 ? 2 : s > 0.05 ? 1 : e.chopping ? 1 : 0;
    const tier = axeColor(e.levels.edge);
    this.shadow(0, x, y, 0.32);

    b.save();
    b.translate(x, y - hop);
    if (p.face < 0) b.scale(-1, 1);
    const lvl = Math.min(5, Math.ceil(clamp(p.carry / e.capacity) * 5));
    const pk = art.packs[lvl];
    b.drawImage(pk.c, -13, -20);
    const fr = art.player(legF, pose, tier);
    b.drawImage(fr.c, -fr.ax, -fr.ay);
    b.restore();

    // extra axes orbiting
    const n = axeCount(e.levels.extra);
    for (let i = 1; i < n; i++) {
      const a = e.clock * 2.4 + (i / (n - 1)) * Math.PI * 2;
      const ox = x + Math.round(Math.cos(a) * 12), oy = y - 14 + Math.round(Math.sin(a) * 4);
      b.globalAlpha = 0.35;
      b.fillStyle = tier;
      for (let yy = -6; yy <= 6; yy++) {
        const hw = Math.floor(Math.sqrt(36 - yy * yy));
        b.fillRect(ox - hw, oy + yy, hw * 2 + 1, 1);
      }
      b.globalAlpha = 1;
      const as = art.axe(pose, tier);
      b.drawImage(as.c, ox - as.ax, oy - as.ay);
    }

    // bag meter
    if (p.carry > 0) {
      const full = p.carry >= e.capacity;
      const txt = `${p.carry}/${e.capacity}`;
      const w = tinyWidth(txt) + 4;
      const bx = x - Math.floor(w / 2), by = y - 40;
      rect(b, INK, bx, by, w, 9);
      tiny(b, txt, bx + 2, by + 2, full ? (Math.floor(e.clock * 10) % 2 ? '#ff6b6b' : '#ffd0d0') : '#ffd27a');
    }
  }

  private customer(c: Customer) {
    const { b, e, art } = this;
    const walking = c.enter < 1 || c.mood !== 'waiting';
    const phase = walking ? Math.floor(e.clock * 8 + c.look) % 4 : 0;
    const moodIdx = c.mood === 'happy' ? 1 : c.mood === 'angry' ? 2 : 0;
    const frac = clamp(c.patience / c.maxPatience);
    const mood = c.mood === 'waiting' && frac < 0.25 ? 2 : moodIdx;
    const x = this.sx(c.drawX) + (c.shake > 0.2 ? (Math.floor(e.clock * 40) % 2 ? 1 : -1) : 0);
    const y = this.sy(c.drawY);
    const fade = c.mood === 'waiting' ? 1 : clamp(1 - (c.leave - 0.4) / 0.6);
    if (fade < 0.35 && Math.floor(e.clock * 20) % 2) return; // blink out
    this.shadow(0, x, y, 0.3);
    const s = art.customer(c.look, mood, mood === 2 ? Math.floor(e.clock * 10) % 4 : phase, c.kind === 2 ? 2 : 0);
    b.drawImage(s.c, x - s.ax, y - s.ay);
    if (c.kind === 1) b.drawImage(art.crown.c, x - art.crown.ax, y - 21 - art.crown.ay);

    if (c.mood === 'waiting' && c.enter >= 1) {
      const by = y - 47 + (Math.floor(e.clock * 2 + c.look) % 2);
      // patience bar
      rect(b, INK, x - 10, y - 32, 20, 4);
      const col = frac > 0.5 ? '#4be37a' : frac > 0.25 ? '#ffd23f' : '#ff4d4d';
      rect(b, col, x - 9, y - 31, Math.max(1, Math.round(18 * frac)), 2);
      // order bubble
      const left = c.want - c.got;
      const txt = String(left);
      const w = 12 + tinyWidth(txt) + 3;
      const bx = x - Math.floor(w / 2);
      rect(b, c.got > 0 ? '#35d063' : c.kind === 1 ? '#ffd23f' : c.kind === 2 ? '#ff9ad6' : INK, bx - 1, by - 1, w + 2, 12);
      rect(b, '#ffffff', bx, by, w, 10);
      pset(b, '#ffffff', x - 1, by + 10); pset(b, '#ffffff', x, by + 10); pset(b, '#ffffff', x - 1 + 1, by + 11);
      pset(b, INK, x - 2, by + 10); pset(b, INK, x + 1, by + 10);
      b.drawImage(art.log.c, bx + 1, by + 1);
      tiny(b, txt, bx + 11, by + 2, c.got > 0 ? '#128a3e' : '#3b2a1a');
    }
  }

  private thief() {
    const { b, e, art } = this;
    const th = e.thief;
    const x = this.sx(th.x), y = this.sy(th.y);
    const running = th.state === 0 || th.state === 2;
    const frame = art.thiefFrames[running ? Math.floor(e.clock * 12) % 4 : 0];
    this.shadow(0, x, y, 0.3);
    const wob = th.state === 1 ? (Math.floor(e.clock * 6) % 2) : 0;
    b.drawImage(frame.c, x - frame.ax, y - frame.ay - wob);
    if (th.state === 3) {
      for (let i = 0; i < 3; i++) {
        const a = e.clock * 6 + i * 2.1;
        rect(b, '#ffd23f', x + Math.round(Math.cos(a) * 7), y - 27 + Math.round(Math.sin(a) * 2), 2, 2);
      }
    }
    if (th.loot > 0) {
      const txt = String(th.loot);
      const w = tinyWidth(txt) + 14;
      rect(b, INK, x - Math.floor(w / 2), y - 36, w, 10);
      b.drawImage(art.log.c, x - Math.floor(w / 2) + 1, y - 35);
      tiny(b, txt, x - Math.floor(w / 2) + 12, y - 33, '#ff9a9a');
    }
    if (th.state < 2 && Math.floor(e.clock * 4) % 2 === 0) ptext(b, '!', x, y - 48, '#ff4d4d', { align: 'center' });
  }

  private bees() {
    const { b, e } = this;
    const bs = e.bees;
    if (!bs.on) return;
    const cx = this.sx(bs.x), cy = this.sy(bs.y);
    const fade = bs.life < 1.2 && Math.floor(e.clock * 16) % 2 === 0;
    if (fade) return;
    for (let i = 0; i < 9; i++) {
      const a = e.clock * (7 + (i % 3)) + i * 0.9;
      const rr = 5 + (i % 4) * 2;
      const x = cx + Math.round(Math.cos(a) * rr), y = cy + Math.round(Math.sin(a * 1.3) * rr * 0.6);
      rect(b, '#ffd23f', x, y, 2, 2);
      pset(b, '#2b1a08', x + (i % 2), y);
      if (Math.floor(e.clock * 30 + i) % 2) pset(b, '#ffffff', x, y - 1);
    }
  }

  private stall() {
    const s = this.art.stall;
    this.b.drawImage(s.c, this.sxs(COUNTER.cx) - s.ax, this.sys(COUNTER.y + COUNTER.h / 2) - s.ay);
  }

  private depot() {
    const { b, e, art } = this;
    const x = this.sxs(DEPOT.x), y = this.sys(DEPOT.y) + 6;
    this.shadow(2, x, y + 1, 0.28);
    // pile of log ends
    const n = Math.min(e.stock, 15);
    const rows = [5, 4, 3, 2, 1];
    let placed = 0;
    for (let r = 0; r < rows.length && placed < n; r++) {
      const cnt = Math.min(rows[r], n - placed);
      const x0 = x - (rows[r] * 6) / 2 + 3;
      for (let k = 0; k < cnt; k++) {
        const lx = x0 + k * 6, ly = y - 4 - r * 5;
        rect(b, '#6b4226', lx - 3, ly - 3, 6, 6);
        rect(b, '#c88a4a', lx - 2, ly - 2, 4, 4);
        pset(b, '#e0a868', lx - 1, ly - 1);
        pset(b, '#9a6234', lx, ly);
        placed++;
      }
    }
    // frame
    rect(b, INK, x - 17, y - 2, 34, 5);
    rect(b, '#7b4e26', x - 16, y - 1, 32, 3);
    rect(b, '#9a6234', x - 16, y - 1, 32, 1);
    rect(b, INK, x - 17, y - 16, 4, 16);
    rect(b, '#7b4e26', x - 16, y - 15, 2, 14);
    rect(b, INK, x + 13, y - 16, 4, 16);
    rect(b, '#7b4e26', x + 14, y - 15, 2, 14);
    // plate
    rect(b, INK, x - 23, y + 4, 46, 11);
    rect(b, '#5a3418', x - 22, y + 5, 44, 9);
    ptext(b, 'DEPOT', x, y + 6, '#ffe2a8', { align: 'center', outline: '#2a160a' });
    if (e.stock > 0) {
      const txt = String(e.stock);
      const w = tinyWidth(txt) + 14;
      rect(b, INK, x - Math.floor(w / 2), y - 30, w, 10);
      b.drawImage(art.log.c, x - Math.floor(w / 2) + 1, y - 29);
      tiny(b, txt, x - Math.floor(w / 2) + 12, y - 27, '#ffe2a8');
    }
  }

  // ---- particles & text ----------------------------------------------------
  private particles() {
    const { b, e, art } = this;
    for (const p of e.particles) {
      if (!p.on) continue;
      const x = this.sx(p.x), y = this.sy(p.y);
      if (x < -6 || x > VW + 6 || y < -6 || y > VH + 6) continue;
      const k = clamp(p.life / p.max);
      if (k < 0.3 && Math.floor(e.clock * 30 + p.hue * 7) % 2) continue;
      switch (p.kind) {
        case 'log': b.drawImage(art.log.c, x - art.log.ax, y - art.log.ay); break;
        case 'chip':
          rect(b, p.hue < 0.5 ? '#e0a868' : '#9a6234', x, y, p.size > 5 ? 2 : 1, 1 + (p.hue > 0.8 ? 1 : 0));
          break;
        case 'leaf':
          rect(b, p.hue < 0.5 ? '#5ec24e' : '#2f9a47', x, y, 2, 1);
          break;
        case 'coin': {
          const w = [3, 2, 1, 2][Math.floor(p.rot * 2) & 3];
          rect(b, '#f6b800', x - 1, y - 1, w, 3);
          if (w > 1) pset(b, '#ffe27a', x - 1, y - 1);
          break;
        }
        case 'spark': {
          const big = k > 0.55;
          rect(b, p.hue < 0.5 ? '#fff3a8' : '#ffd23f', x, y, big ? 2 : 1, big ? 2 : 1);
          break;
        }
        case 'dust':
          if (bayer(x, y) < 0.6) rect(b, '#e8dcc0', x, y, 3, 2);
          break;
      }
    }
  }

  private texts() {
    const { b, e } = this;
    for (const t of e.texts) {
      if (!t.on) continue;
      const k = clamp(t.life / t.max);
      if (k < 0.25 && Math.floor(e.clock * 24) % 2) continue;
      const big = t.size >= 40;
      ptext(b, t.text, this.sx(t.x), this.sy(t.y) - (big ? 8 : 4), t.color, { size: big ? 16 : 8, align: 'center' });
    }
  }

  // ---- HUD -----------------------------------------------------------------
  private hud() {
    const { b, e, art } = this;

    // money
    const bounce = e.moneyPulse > 0.5 ? -1 : 0;
    b.drawImage(art.coin.c, 5, 5 + bounce);
    ptext(b, Math.floor(e.money).toLocaleString('en-US'), 17, 5 + bounce, e.moneyPulse > 0.2 ? '#fff7a8' : '#ffffff');

    // level + xp
    ptext(b, `LV ${e.level}`, 5, 18, '#7fd3ff');
    const xw = 52, xx = 52;
    rect(b, INK, xx - 1, 19, xw + 2, 8);
    rect(b, '#2a2744', xx, 20, xw, 6);
    rect(b, '#4aa0ff', xx, 20, Math.round((xw * e.xp) / xpNeeded(e.level)), 6);
    rect(b, '#9fd0ff', xx, 20, Math.round((xw * e.xp) / xpNeeded(e.level)), 2);

    // time bar
    const bw = 152, bh = 11, bx = Math.round((VW - bw) / 2), by = 5;
    const frac = clamp(e.time / MAX_TIME);
    const low = e.time < 10 && e.phase === 'playing';
    rect(b, INK, bx - 2, by - 2, bw + 4, bh + 4);
    rect(b, '#2a2744', bx, by, bw, bh);
    const fw = Math.max(1, Math.round((bw - 2) * frac));
    const flick = low && Math.floor(e.clock * 8) % 2 === 0;
    const main = frac > 0.4 ? '#2fc95e' : frac > 0.2 ? '#ffa91f' : flick ? '#ff9a9a' : '#ff3b3b';
    const hi = frac > 0.4 ? '#8cf59a' : frac > 0.2 ? '#ffd27a' : '#ffb0b0';
    rect(b, main, bx + 1, by + 1, fw, bh - 2);
    rect(b, hi, bx + 1, by + 1, fw, 2);
    for (let i = 1; i < 8; i++) rect(b, 'rgba(0,0,0,0.25)', bx + Math.round((bw / 8) * i), by + 1, 1, bh - 2);
    ptext(b, e.time.toFixed(1), VW / 2, by + 2, '#ffffff', { align: 'center' });

    // combo
    if (e.combo >= 2) {
      const bump = e.comboPulse > 0.5 ? -1 : 0;
      ptext(b, `COMBO X${e.combo}  +${Math.min(e.combo - 1, 12) * 10}%`, VW / 2, 21 + bump, '#ffb347', { align: 'center' });
    }

    // rush hour banner / countdown
    if (e.rushLeft > 0) {
      const flash = Math.floor(e.clock * 8) % 2 === 0;
      const w = 126;
      rect(b, INK, VW / 2 - w / 2 - 2, 33, w + 4, 15);
      rect(b, flash ? '#ff5a1f' : '#ffb020', VW / 2 - w / 2, 35, w, 11);
      ptext(b, `RUSH HOUR ${Math.ceil(e.rushLeft)}`, VW / 2, 37, '#ffffff', { align: 'center' });
      if (e.rushBanner > 0) ptext(b, 'CUSTOMERS PAY X1.5!', VW / 2, 52, '#ffd23f', { align: 'center' });
    } else if (e.phase === 'playing' && e.rushIn < 5) {
      if (Math.floor(e.clock * 4) % 2 === 0) ptext(b, 'RUSH HOUR INCOMING', VW / 2, 36, '#ff8a3d', { align: 'center' });
    }

    // alerts (thief, bees, golden tree)
    if (e.alert.t > 0 && (e.alert.t > 0.5 || Math.floor(e.clock * 10) % 2)) {
      const w = e.alert.text.length * 8 + 8;
      rect(b, INK, Math.round(VW / 2 - w / 2), 60, w, 12);
      ptext(b, e.alert.text, VW / 2, 62, e.alert.color, { align: 'center' });
    }

    // dash cooldown
    if (e.levels.dash > 0) {
      const ready = e.player.dashCd <= 0;
      const frac = 1 - e.player.dashCd / dashCd(e.levels.dash);
      ptext(b, ready ? 'DASH: SPACE' : 'DASH', VW - 6, VH - 22, ready ? (Math.floor(e.clock * 4) % 2 ? '#7dff9a' : '#ffffff') : '#8a86b8', { align: 'right' });
      rect(b, INK, VW - 58, VH - 12, 52, 7);
      rect(b, '#2a2744', VW - 57, VH - 11, 50, 5);
      rect(b, ready ? '#4be37a' : '#6f6ad0', VW - 57, VH - 11, Math.round(50 * frac), 5);
    }

    // backpack + depot
    const full = e.player.carry >= e.capacity;
    b.drawImage(art.log.c, VW - 74, 6);
    ptext(b, `${e.player.carry}/${e.capacity}`, VW - 62, 5, full && Math.floor(e.clock * 8) % 2 ? '#ff6b6b' : '#ffffff');
    if (e.stock > 0) ptext(b, `DEPOT ${e.stock}`, VW - 6, 17, '#ffe2a8', { align: 'right' });

    // hints
    if (e.phase === 'playing' && e.elapsed < 12 && (e.elapsed < 9 || Math.floor(e.elapsed * 6) % 2 === 0)) {
      ptext(b, 'WASD / ARROWS: MOVE', VW / 2, 138, '#ffffff', { align: 'center' });
      ptext(b, 'NEAR A TREE: AUTO CHOP', VW / 2, 149, '#ffffff', { align: 'center' });
      ptext(b, 'DROP LOGS AT THE DEPOT', VW / 2, 160, '#ffd23f', { align: 'center' });
    }

    this.minimap();
    this.depotArrow();
  }

  private minimap() {
    const { b, e } = this;
    const mw = 56, mh = Math.round((mw * WH) / WW);
    const mx = 6, my = VH - mh - 6;
    const sx = mw / WORLD_W, sy = mh / WORLD_H;
    rect(b, INK, mx - 2, my - 2, mw + 4, mh + 4);
    rect(b, '#2f7d36', mx, my, mw, mh);
    for (const t of e.trees) {
      const x = mx + Math.round(t.x * sx), y = my + Math.round(t.y * sy);
      if (t.state === 'alive' && t.special) rect(b, t.special === 1 ? '#ffd23f' : t.special === 2 ? '#ff9a2b' : '#ff3b3b', x - 1, y - 1, 3, 3);
      else if (t.state === 'alive') rect(b, t.kind === 2 ? '#0f3b24' : '#1d6b3a', x, y, t.kind === 2 ? 2 : 1, t.kind === 2 ? 2 : 1);
      else pset(b, '#c88a4a', x, y);
    }
    rect(b, '#ffb347', mx + Math.round(BASE.x * sx) - 1, my + Math.round(BASE.y * sy) - 1, 3, 3);
    // view rectangle
    b.fillStyle = 'rgba(255,255,255,0.7)';
    const vx = mx + Math.round(((this.camX * ART) * sx)), vy = my + Math.round(((this.camY * ART) * sy));
    const vw = Math.round(VW * ART * sx), vh = Math.round(VH * ART * sy);
    b.fillRect(vx, vy, vw, 1); b.fillRect(vx, vy + vh, vw, 1);
    b.fillRect(vx, vy, 1, vh); b.fillRect(vx + vw, vy, 1, vh + 1);
    if (e.thief.on && Math.floor(e.clock * 6) % 2) rect(b, '#ff2a2a', mx + Math.round(e.thief.x * sx) - 1, my + Math.round(e.thief.y * sy) - 1, 3, 3);
    const px = mx + Math.round(e.player.x * sx), py = my + Math.round(e.player.y * sy);
    rect(b, Math.floor(e.clock * 4) % 2 ? '#ffffff' : '#4aa0ff', px - 1, py - 1, 3, 3);
  }

  /** Points toward the depot when it is off-screen. */
  private depotArrow() {
    const { b, e } = this;
    const dxw = DEPOT.x / ART - this.camX, dyw = DEPOT.y / ART - this.camY;
    if (dxw > 12 && dxw < VW - 12 && dyw > 68 && dyw < VH - 12) return;
    const cx = VW / 2, cy = VH / 2;
    const dx = dxw - cx, dy = dyw - cy;
    const room = dy < 0 ? cy - 70 : cy - 16;
    const k = Math.min((cx - 16) / Math.abs(dx || 1e-6), room / Math.abs(dy || 1e-6));
    const ax = Math.round(cx + dx * k), ay = Math.round(cy + dy * k);
    const hot = e.player.carry > 0;
    const ang = Math.atan2(dy, dx);
    const pulse = hot && Math.floor(e.clock * 6) % 2 ? 1 : 0;
    ditherDisc(b, INK, ax, ay, 8 + pulse);
    ditherDisc(b, INK, ax, ay, 7);
    b.fillStyle = INK;
    for (let yy = -7; yy <= 7; yy++) { const hw = Math.floor(Math.sqrt(49 - yy * yy)); b.fillRect(ax - hw, ay + yy, hw * 2 + 1, 1); }
    b.fillStyle = hot ? '#ffd23f' : '#d8d8e8';
    for (let yy = -6; yy <= 6; yy++) { const hw = Math.floor(Math.sqrt(36 - yy * yy)); b.fillRect(ax - hw, ay + yy, hw * 2 + 1, 1); }
    const c = Math.cos(ang), s = Math.sin(ang);
    tri(b, INK, ax + c * 5, ay + s * 5, ax - c * 3 - s * 4, ay - s * 3 + c * 4, ax - c * 3 + s * 4, ay - s * 3 - c * 4);
    const meters = String(Math.round(Math.hypot(DEPOT.x - e.player.x, DEPOT.y - e.player.y) / 10));
    rect(b, INK, ax - Math.floor(tinyWidth(meters) / 2) - 1, ay + 9, tinyWidth(meters) + 2, 7);
    tiny(b, meters, ax - Math.floor(tinyWidth(meters) / 2), ay + 10, '#ffffff');
  }
}
