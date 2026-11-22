import { bayer, disc, line, mk, ptext, rect, pset, ttext, tinyWidth, type Ctx } from '../../lib/pixel';
import { TEAM_COLORS, TEAM_NAMES, VH, VW, WATER_Y, WEAPON_BY_ID, WORM_CY, type Theme } from './config';
import type { Particle, Proj, Worm, WormEngine } from './engine';
import { Art, WATER, type WormFrameName } from './sprites';
import { Terrain } from './terrain';

const INK = '#241226';
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Pixel-art renderer: draws into a 384x216 buffer, scaled up by a whole number with smoothing off. */
export class Renderer {
  private out: Ctx;
  private buf: HTMLCanvasElement;
  private b: Ctx;
  private art = new Art();

  constructor(private canvas: HTMLCanvasElement, private e: WormEngine) {
    this.out = canvas.getContext('2d', { alpha: false })!;
    [this.buf, this.b] = mk(VW, VH);
  }

  resize(cssW: number, dpr: number) {
    const k = Math.max(1, Math.floor((cssW * dpr) / VW));
    this.canvas.width = VW * k;
    this.canvas.height = VH * k;
    const w = Math.min(cssW, (VW * (k + 1)) / dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${(w * VH) / VW}px`;
    this.out.imageSmoothingEnabled = false;
  }

  draw() {
    const { b, e, art } = this;
    let ox = 0, oy = 0;
    if (e.shake > 0.6) {
      ox = Math.round(Math.sin(e.clock * 83) * e.shake);
      oy = Math.round(Math.cos(e.clock * 71) * e.shake);
    }
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1;
    const theme = e.theme;
    b.drawImage(art.bg(theme), 0, 0);
    art.clouds(theme).forEach((c, i) => {
      const x = ((e.clock * (2.5 + i * 1.3) + i * 150) % (VW + 90)) - 45;
      b.globalAlpha = 0.9;
      b.drawImage(c.c, Math.round(x - c.ax), 22 + i * 24 - c.ay + Math.round(Math.sin(e.clock * 0.3 + i) * 2));
    });
    b.globalAlpha = 1;

    b.setTransform(1, 0, 0, 1, ox, oy);
    e.terrain.upload();
    b.drawImage(e.terrain.canvas, 0, 0);
    this.decor();
    this.entities();
    this.water();
    b.setTransform(1, 0, 0, 1, 0, 0);
    this.hud();
    this.out.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  // ---- world -----------------------------------------------------------------
  private entities() {
    const { b, e } = this;
    for (const w of e.worms) if (!w.alive && !w.gone) this.grave(w);
    const live = e.worms.filter((w) => w.alive && !w.gone);
    for (const w of live) if (w !== e.cw) this.worm(w);
    if (e.cw && e.cw.alive && !e.cw.gone) this.worm(e.cw);
    for (const p of e.projs) this.proj(p);
    this.rope();
    for (const t of e.tracers) line(b, t.t > 0.035 ? '#fff7b0' : '#ffd23f', t.x0, t.y0, t.x1, t.y1, 1);
    for (const p of e.particles) if (p.on) this.particle(p);
    for (const bl of e.blasts) this.blast(bl.x, bl.y, bl.r, bl.t / bl.max);
    this.aimUi();
    if (e.marker) {
      const m = e.marker;
      if (Math.floor(e.clock * 8) % 2) {
        for (let y = 0; y < m.y; y += 4) pset(b, '#ff4d4d', m.x, y);
      }
      rect(b, '#ff4d4d', m.x - 3, m.y, 7, 1);
      rect(b, '#ff4d4d', m.x, m.y - 3, 1, 7);
    }
    for (const p of e.popups) ttext(b, p.text, Math.round(p.x), Math.round(p.y), p.color, { align: 'center' });
  }

  private decor() {
    const { b, e, art } = this;
    const set = art.decor(e.theme);
    for (const d of e.terrain.decor) {
      // vanish when the ground under them is blown away
      if (!e.terrain.isSolid(d.x, d.y) || e.terrain.isSolid(d.x, d.y - 1)) continue;
      const s = set[d.kind % set.length];
      b.drawImage(s.c, d.x - s.ax, d.y - s.ay + 1);
    }
  }

  private grave(w: Worm) {
    const s = this.art.grave;
    this.b.drawImage(s.c, Math.round(w.x) - s.ax, Math.round(w.y) - s.ay);
  }

  private worm(w: Worm) {
    const { b, e, art } = this;
    const x = Math.round(w.x), y = Math.round(w.y);
    const isCur = w === e.cw && e.phase === 'turn';
    let name: WormFrameName = Math.floor(e.clock * 1.6 + w.id) % 2 ? 'idle1' : 'idle0';
    if (w.grounded && (e.clock * 0.9 + w.id * 1.7) % 3.3 > 3.15) name = 'blink';
    if (w.hurtT > 0.2) name = 'hurt';
    else if (!w.grounded) name = 'air';
    else if (w.walking) name = (['walk0', 'walk1', 'walk2'] as const)[Math.floor(w.walkT * 9) % 3];
    const fr = art.frames[w.team][name];

    if (isCur) this.held(w, true);
    b.save();
    b.translate(x, y);
    if (w.face < 0) b.scale(-1, 1);
    b.drawImage(fr.s.c, -fr.s.ax, -fr.s.ay);
    if (w.hurtT > 0.3 && Math.floor(e.clock * 30) % 2) {
      b.globalAlpha = 0.7;
      b.drawImage(fr.flash, -fr.s.ax, -fr.s.ay);
      b.globalAlpha = 1;
    }
    b.restore();
    if (isCur) this.held(w, false);

    // hp label
    const col = TEAM_COLORS[w.team];
    const hp = String(Math.ceil(w.shown));
    const tw = tinyWidth(hp) + 4;
    rect(b, INK, x - Math.floor(tw / 2), y - 24, tw, 7);
    ttext(b, hp, x, y - 23, col, { align: 'center', outline: '' });
    if (isCur) {
      const bob = Math.round(Math.sin(e.clock * 6) * 1.5);
      const ay = y - 33 + bob;
      rect(b, INK, x - 3, ay, 7, 3);
      rect(b, col, x - 2, ay, 5, 2);
      rect(b, INK, x - 2, ay + 3, 5, 2);
      rect(b, col, x - 1, ay + 3, 3, 1);
      pset(b, col, x, ay + 4);
    }
  }

  private held(w: Worm, behind: boolean) {
    const { b, e } = this;
    const a = (w.aim * Math.PI) / 180;
    const dx = w.face * Math.cos(a), dy = -Math.sin(a);
    const cx = w.x + w.face * 1, cy = w.y - WORM_CY;
    const wp = e.weapon;
    if (wp === 'jetpack') {
      if (!behind) return;
      const bx = Math.round(w.x - w.face * 5);
      rect(b, INK, bx - 1, Math.round(w.y) - 11, 4, 8);
      rect(b, '#8a90a2', bx, Math.round(w.y) - 10, 2, 6);
      rect(b, '#d94a3d', bx, Math.round(w.y) - 8, 2, 1);
      return;
    }
    if (behind) return;
    if (e.fired && WEAPON_BY_ID[wp].attack) return;
    if (e.rope.state === 'attached' || e.jet.active) return;
    const tip = (len: number): [number, number] => [cx + dx * len, cy + dy * len];
    switch (wp) {
      case 'bazooka': {
        const [x1, y1] = tip(10);
        const [x0, y0] = tip(-3);
        line(b, INK, x0, y0 - 1, x1, y1 - 1, 3);
        line(b, '#6f8a3a', x0, y0, x1, y1, 1);
        line(b, '#8fae4a', x0, y0 - 1, x1, y1 - 1, 1);
        rect(b, '#2f3a18', Math.round(x1), Math.round(y1), 2, 2);
        break;
      }
      case 'grenade': case 'cluster': {
        const [x1, y1] = tip(6);
        disc(b, INK, Math.round(x1), Math.round(y1), 3);
        disc(b, wp === 'cluster' ? '#e07a1f' : '#3f8f3f', Math.round(x1), Math.round(y1), 2);
        break;
      }
      case 'shotgun': {
        const [x1, y1] = tip(9);
        const [x0, y0] = tip(0);
        line(b, INK, x0, y0 - 1, x1, y1 - 1, 3);
        line(b, '#8a90a2', x0, y0, x1, y1, 1);
        rect(b, '#7a4a22', Math.round(x0 - dx * 3), Math.round(y0 - dy * 3), 3, 2);
        break;
      }
      case 'uzi': {
        const [x1, y1] = tip(6);
        line(b, INK, cx, cy - 1, x1, y1 - 1, 3);
        line(b, '#4a4f66', cx, cy, x1, y1, 1);
        break;
      }
      case 'dynamite': {
        const [x1, y1] = tip(5);
        rect(b, INK, Math.round(x1) - 1, Math.round(y1) - 3, 4, 6);
        rect(b, '#d94a3d', Math.round(x1), Math.round(y1) - 2, 2, 4);
        break;
      }
      case 'sheep': {
        const [x1, y1] = tip(5);
        disc(b, INK, Math.round(x1), Math.round(y1), 3);
        disc(b, '#ffffff', Math.round(x1), Math.round(y1), 2);
        break;
      }
      case 'drill': {
        const [x1, y1] = tip(10);
        line(b, INK, cx, cy - 1, x1, y1 - 1, 3);
        line(b, '#aab0c2', cx, cy, x1, y1, 1);
        rect(b, '#d94a3d', Math.round(cx), Math.round(cy) - 1, 2, 2);
        break;
      }
      case 'rope': {
        const [x1, y1] = tip(5);
        rect(b, '#cfd4de', Math.round(x1), Math.round(y1), 2, 2);
        break;
      }
      case 'airstrike': case 'teleport': {
        rect(b, INK, Math.round(w.x + w.face * 2) - 1, Math.round(w.y) - 8, 4, 5);
        rect(b, wp === 'teleport' ? '#7a5af0' : '#d94a3d', Math.round(w.x + w.face * 2), Math.round(w.y) - 7, 2, 3);
        break;
      }
      default:
        break;
    }
  }

  private aimUi() {
    const { b, e } = this;
    const w = e.cw;
    if (!w || !w.alive || e.phase !== 'turn') return;
    const def = WEAPON_BY_ID[e.weapon];
    if (def.kind === 'click') {
      if (e.humanTurn) {
        const mx = Math.round(e.mouse.x), my = Math.round(e.mouse.y);
        const col = e.weapon === 'teleport' ? '#7ee6ff' : '#ff6b6b';
        rect(b, col, mx - 5, my, 4, 1);
        rect(b, col, mx + 2, my, 4, 1);
        rect(b, col, mx, my - 5, 1, 4);
        rect(b, col, mx, my + 2, 1, 4);
        if (e.weapon === 'airstrike') for (let i = -2; i <= 2; i++) pset(b, col, mx + i * 13, my - 8);
      }
      return;
    }
    if ((e.fired && def.attack) || e.rope.state === 'attached' || e.jet.active || e.drill.t > 0) return;
    const a = (w.aim * Math.PI) / 180;
    const dx = w.face * Math.cos(a), dy = -Math.sin(a);
    const cx = w.x, cy = w.y - WORM_CY;
    for (const d of [12, 18]) pset(b, 'rgba(255,255,255,0.6)', cx + dx * d, cy + dy * d);
    const px = Math.round(cx + dx * 26), py = Math.round(cy + dy * 26);
    const pulse = Math.floor(e.clock * 6) % 2;
    const col = pulse ? '#ffffff' : '#ffd23f';
    rect(b, INK, px - 3, py - 1, 7, 3);
    rect(b, INK, px - 1, py - 3, 3, 7);
    rect(b, col, px - 2, py, 5, 1);
    rect(b, col, px, py - 2, 1, 5);
    if (e.charging) {
      const n = Math.round(e.charge * 14);
      for (let i = 0; i < n; i++) {
        const d = 7 + i * 1.9;
        const t = i / 14;
        const c = t < 0.5 ? '#ffe45a' : t < 0.8 ? '#ff9a2b' : '#ff3b3b';
        rect(b, INK, Math.round(cx + dx * d) - 1, Math.round(cy + dy * d) - 1, 3, 3);
        rect(b, c, Math.round(cx + dx * d), Math.round(cy + dy * d), 1, 1);
      }
    }
  }

  private rope() {
    const { b, e } = this;
    const r = e.rope;
    const w = e.cw;
    if (r.state === 'none' || !w) return;
    line(b, '#e6d3a0', w.x, w.y - WORM_CY, r.hx, r.hy, 1);
    rect(b, INK, Math.round(r.hx) - 1, Math.round(r.hy) - 1, 3, 3);
    pset(b, '#cfd4de', Math.round(r.hx), Math.round(r.hy));
  }

  private proj(p: Proj) {
    const { b, e, art } = this;
    const x = Math.round(p.x), y = Math.round(p.y);
    switch (p.kind) {
      case 'rocket': case 'missile': {
        const a = Math.atan2(p.vy, p.vx);
        const ux = Math.cos(a), uy = Math.sin(a);
        line(b, INK, x - ux * 4, y - uy * 4, x + ux * 2, y + uy * 2, 3);
        line(b, '#e8e8f0', x - ux * 4, y - uy * 4, x + ux * 1, y + uy * 1, 1);
        rect(b, '#e0453a', Math.round(x + ux * 2), Math.round(y + uy * 2), 1, 1);
        break;
      }
      case 'grenade': case 'cluster': case 'bomblet': {
        const r = p.kind === 'bomblet' ? 1 : 2;
        const hot = p.fuse < 1 && Math.floor(e.clock * 12) % 2 === 0;
        disc(b, INK, x, y, r + 1);
        disc(b, hot ? '#ff4d4d' : p.kind === 'grenade' ? '#3f8f3f' : '#e07a1f', x, y, r);
        pset(b, '#ffffff', x - 1, y - 1);
        break;
      }
      case 'dynamite': {
        rect(b, INK, x - 2, y - 7, 5, 8);
        rect(b, '#d94a3d', x - 1, y - 6, 3, 6);
        rect(b, '#ff8a7a', x - 1, y - 6, 1, 6);
        rect(b, '#f2e8d0', x - 1, y - 4, 3, 1);
        pset(b, Math.floor(e.clock * 15) % 2 ? '#ffd23f' : '#ff7a1f', x, y - 8);
        break;
      }
      case 'sheep': {
        const s = art.sheep;
        const bob = Math.round(Math.abs(Math.sin(p.age * 14)) * 1);
        b.save();
        b.translate(x, y - bob);
        if (p.face < 0) b.scale(-1, 1);
        b.drawImage(s.c, -s.ax, -s.ay);
        b.restore();
        if (p.fuse < 1.2 && Math.floor(e.clock * 14) % 2 === 0) pset(b, '#ff4d4d', x, y - 11);
        break;
      }
    }
  }

  private particle(p: Particle) {
    const { b } = this;
    const x = Math.round(p.x), y = Math.round(p.y);
    const k = clamp(p.life / p.max);
    switch (p.kind) {
      case 'smoke': {
        const s = Math.round(p.size * (1.6 - k * 0.6));
        for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) if (bayer(x + xx, y + yy) < k * 0.9) pset(b, k > 0.5 ? '#aeb2c4' : '#7d8196', x + xx, y + yy);
        break;
      }
      case 'fire': rect(b, k > 0.6 ? '#fff0a0' : k > 0.3 ? '#ff9a2b' : '#d94a3d', x, y, k > 0.5 ? 2 : 1, k > 0.5 ? 2 : 1); break;
      case 'flame': rect(b, k > 0.5 ? '#ffe27a' : '#ff7a1f', x, y, 2, 2); break;
      case 'dirt': rect(b, p.hue < 0.5 ? '#9a6a3a' : '#6f4a2c', x, y, p.size > 1.5 ? 2 : 1, p.size > 1.5 ? 2 : 1); break;
      case 'spark': rect(b, p.hue < 0.5 ? '#fff3a8' : '#ffd23f', x, y, 1, 1); break;
      case 'splash': rect(b, p.hue < 0.5 ? '#cfeaff' : '#7fbdf5', x, y, 1, 1); break;
      case 'star': if (Math.floor(p.life * 20) % 2) rect(b, p.hue < 0.5 ? '#ffffff' : '#7ee6ff', x, y, 1, 1); break;
    }
  }

  private blast(x: number, y: number, r: number, k: number) {
    const { b } = this;
    x = Math.round(x); y = Math.round(y);
    if (k < 0.3) {
      b.globalAlpha = 1 - k / 0.3;
      disc(b, '#fff7d0', x, y, Math.round(r * (0.6 + k * 1.6)));
      b.globalAlpha = 1;
    }
    const rr = Math.round(r * (0.9 + k * 0.9));
    b.globalAlpha = 1 - k;
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      rect(b, a % 2 ? '#ffb347' : '#ff5a1f', Math.round(x + Math.cos(t) * rr), Math.round(y + Math.sin(t) * rr), 2, 2);
    }
    b.globalAlpha = 1;
  }

  private water() {
    const { b, e } = this;
    const pal = WATER[e.theme];
    for (let x = 0; x < VW; x++) {
      const wave = Math.round(Math.sin(x * 0.12 + e.clock * 2.2) * 1.2 + Math.sin(x * 0.05 - e.clock * 1.3) * 0.8);
      const y = WATER_Y + wave;
      b.globalAlpha = pal.lava ? 0.9 : 0.72;
      b.fillStyle = pal.a;
      b.fillRect(x, y, 1, VH - y);
      b.globalAlpha = 0.5;
      b.fillStyle = pal.b;
      b.fillRect(x, y + 4, 1, VH - y - 4);
      b.globalAlpha = 1;
      b.fillStyle = (x + Math.floor(e.clock * 4)) % 9 < 3 ? pal.foam : pal.top;
      b.fillRect(x, y, 1, 1);
      if (pal.lava && (x * 7 + Math.floor(e.clock * 3)) % 23 === 0) {
        b.fillStyle = '#fff0a0';
        b.fillRect(x, y + 3, 2, 1);
      }
    }
  }

  // ---- HUD -------------------------------------------------------------------
  private hud() {
    const { b, e } = this;
    // team health
    for (const team of [0, 1] as const) {
      const ws = e.worms.filter((w) => w.team === team);
      const total = ws.reduce((s, w) => s + (w.alive && !w.gone ? w.hp : 0), 0);
      const max = Math.max(1, ws.length * 100);
      const y = 4 + team * 11;
      ttext(b, TEAM_NAMES[team], 4, y, TEAM_COLORS[team]);
      rect(b, INK, 27, y - 1, 62, 7);
      rect(b, '#33294a', 28, y, 60, 5);
      rect(b, TEAM_COLORS[team], 28, y, Math.round((60 * total) / max), 5);
      rect(b, 'rgba(255,255,255,0.35)', 28, y, Math.round((60 * total) / max), 1);
      ttext(b, `${ws.filter((w) => w.alive && !w.gone).length}/${ws.length}`, 92, y, '#ffffff');
    }
    // turn timer
    if (e.phase === 'turn' || e.phase === 'resolve') {
      const t = e.phase === 'turn' ? Math.max(0, Math.ceil(e.timer)) : 0;
      const low = e.phase === 'turn' && e.timer <= 5;
      const col = e.cw ? TEAM_COLORS[e.cw.team] : '#ffffff';
      rect(b, INK, VW / 2 - 14, 3, 28, 15);
      rect(b, low && Math.floor(e.clock * 6) % 2 ? '#7a1a1a' : '#33294a', VW / 2 - 13, 4, 26, 13);
      ptext(b, e.phase === 'turn' ? String(t) : '..', VW / 2, 7, low ? '#ff6b6b' : '#ffffff', { align: 'center', outline: '' });
      if (e.cw && e.phase === 'turn') ttext(b, e.cw.name, VW / 2, 21, col, { align: 'center' });
    }
    // wind
    const wx = VW - 66, wy = 8;
    ttext(b, 'WIND', wx - 22, wy - 2, '#cfd4e8');
    rect(b, INK, wx - 1, wy - 3, 58, 7);
    rect(b, '#33294a', wx, wy - 2, 56, 5);
    rect(b, '#cfd4e8', wx + 27, wy - 3, 2, 7);
    const wl = Math.round((e.wind / 22) * 26);
    if (wl !== 0) {
      rect(b, '#7fd0ff', wl > 0 ? wx + 28 : wx + 28 + wl, wy - 1, Math.abs(wl), 3);
      const hx = wx + 28 + wl;
      rect(b, '#7fd0ff', hx + (wl > 0 ? 0 : -1), wy - 2, 1, 5);
    }
    // banner
    if (e.banner.t > 0 && (e.banner.t > 0.4 || Math.floor(e.clock * 10) % 2)) {
      const w = e.banner.text.length * 8 + 12;
      rect(b, INK, Math.round(VW / 2 - w / 2), 36, w, 14);
      rect(b, '#33294a', Math.round(VW / 2 - w / 2) + 1, 37, w - 2, 12);
      ptext(b, e.banner.text, VW / 2, 39, e.banner.color, { align: 'center', outline: '' });
    }
    // hint
    if (e.humanTurn && e.phase === 'turn') {
      const def = WEAPON_BY_ID[e.weapon];
      ttext(b, `${def.name}: ${def.blurb}`, VW / 2, VH - 24, '#ffffff', { align: 'center' });
    }
    // jetpack fuel
    if (e.jet.active) {
      rect(b, INK, VW / 2 - 21, VH - 16, 42, 6);
      rect(b, '#33294a', VW / 2 - 20, VH - 15, 40, 4);
      rect(b, '#ff9a2b', VW / 2 - 20, VH - 15, Math.round((40 * e.jet.fuel) / 100), 4);
    }
    if (e.paused) ttext(b, 'PAUSED', VW / 2, 100, '#ffffff', { align: 'center' });
  }
}

/** Mini battle scene for the hub card. */
export function drawCardArt(canvas: HTMLCanvasElement) {
  const art = new Art();
  const theme: Theme = 'meadow';
  const t = new Terrain(11, theme);
  t.upload();
  const [full, g] = mk(VW, VH);
  g.drawImage(art.bg(theme), 0, 0);
  g.drawImage(t.canvas, 0, 0);
  const set = art.decor(theme);
  for (const d of t.decor) if (d.x > 90 && d.x < 300) g.drawImage(set[d.kind % set.length].c, d.x - set[d.kind % set.length].ax, d.y - set[d.kind % set.length].ay + 1);
  const place = (x: number, team: 0 | 1, face: 1 | -1) => {
    const fr = art.frames[team].idle0.s;
    const y = t.height[x] - 1;
    g.save();
    g.translate(x, y);
    if (face < 0) g.scale(-1, 1);
    g.drawImage(fr.c, -fr.ax, -fr.ay);
    g.restore();
  };
  place(150, 0, 1);
  place(236, 1, -1);
  place(268, 1, -1);
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = 1 - i / 9;
    rect(g, '#bfc3d4', 164 + i * 3, 108 - i * 2 + Math.round(Math.sin(i)), 2, 2);
  }
  g.globalAlpha = 1;
  line(g, '#241226', 186, 96, 192, 93, 3);
  line(g, '#e8e8f0', 186, 96, 191, 93, 1);
  rect(g, '#e0453a', 192, 92, 1, 1);
  g.globalAlpha = 0.9;
  disc(g, '#ffb347', 248, 118, 11);
  disc(g, '#fff0a0', 248, 118, 6);
  g.globalAlpha = 1;
  canvas.width = 192;
  canvas.height = 108;
  const o = canvas.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.drawImage(full, 96, 70, 192, 108, 0, 0, 192, 108);
}
