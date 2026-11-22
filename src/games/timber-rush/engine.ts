import {
  ANGRY_PENALTY, BASE, CHOP_RANGE, CLIENT_SLOTS_X, COUNTER, DEPOT, H, MAX_TIME, PLAYER_START,
  SLOT_Y, START_TIME, TREE_COUNT, TREE_KINDS, UPGRADES, W, WORLD_H, WORLD_W,
  axeCount, carryCap, chopInterval, dmg, drainRate, kindWeights, logPrice, moveSpeed,
  patienceMult, timeMult, xpNeeded, CHOICES, MAX_SKILLS, RUSH_EVERY, RUSH_FIRST, RUSH_LEN, RUSH_PAY, type UpgradeId,
  critChance, chainDmg, dashCd, DASH_TIME, DASH_MULT, specialChance, BOMB_RADIUS, BOMB_DMG, BEES_SPEED, BEES_LIFE, BEES_COST, THIEF_FIRST, THIEF_HIT,
} from './config';
import { sfx } from './audio';
import { getBest, setBest } from '../../lib/storage';

export const GAME_ID = 'timber-rush';

export type Phase = 'ready' | 'playing' | 'paused' | 'levelup' | 'over';

export interface Tree {
  id: number;
  x: number; // base (ground contact) position
  y: number;
  dist: number; // distance from base, decides what grows here
  r: number;
  kind: 0 | 1 | 2;
  variant: 0 | 1 | 2; // 2 = golden
  special: 0 | 1 | 2 | 3; // none, golden, beehive, bomb
  hive: boolean; // beehive still intact
  state: 'alive' | 'falling' | 'stump';
  hp: number;
  maxHp: number;
  logs: number;
  grow: number; // 0..1 spawn animation
  fall: number; // 0..1 fall animation
  fallDir: 1 | -1;
  shake: number;
  flash: number;
  respawn: number; // seconds until regrow
  regrow: number; // total regrow time (for the progress ring)
}

export interface Customer {
  slot: number;
  active: boolean;
  x: number; // slot position
  y: number;
  drawX: number;
  drawY: number;
  want: number;
  got: number;
  order: number; // arrival order (FIFO)
  patience: number;
  maxPatience: number;
  enter: number; // 0..1 walking in
  leave: number; // 0..1 walking out
  mood: 'waiting' | 'happy' | 'angry';
  shake: number;
  respawn: number;
  look: number;
  kind: 0 | 1 | 2; // normal, VIP, granny
}

export interface Player {
  x: number; y: number; vx: number; vy: number;
  face: 1 | -1;
  swing: number; // 1 -> 0
  bob: number;
  moving: number; // 0..1
  chopTimer: number;
  carry: number;
  dashT: number;
  dashCd: number;
  fightCd: number;
  kx: number; // knockback velocity
  ky: number;
}

export interface Thief {
  on: boolean;
  x: number;
  y: number;
  state: 0 | 1 | 2 | 3 | 4; // approaching, stealing, fleeing, defeated, fighting
  t: number;
  tick: number;
  loot: number;
  hp: number;
  maxHp: number;
  hitCd: number;
  stun: number;
  vx: number;
  vy: number;
}

export type ParticleKind = 'chip' | 'leaf' | 'coin' | 'spark' | 'log' | 'dust';
export interface Particle {
  on: boolean;
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  rot: number; vr: number; g: number;
  hue: number;
  sx: number; sy: number; tx: number; ty: number; // flyers (ty = ground y for chips/coins)
  fol: boolean; // flyer follows the player
}

export interface FloatText {
  on: boolean; x: number; y: number; vy: number;
  life: number; max: number; text: string; color: string; size: number;
}

export interface Snapshot {
  phase: Phase;
  level: number;
  xp: number;
  xpNeed: number;
  owned: UpgradeId[];
  choices: UpgradeId[];
  money: number;
  levels: Record<UpgradeId, number>;
  score: number;
  best: number;
  newBest: boolean;
  stats: { sold: number; logs: number; maxCombo: number; survived: number; lost: number };
}

const MAX_PARTICLES = 520;
const MAX_TEXTS = 28;
const PLAYER_R = 15;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZERO_LEVELS = (): Record<UpgradeId, number> => ({
  edge: 0, extra: 0, speed: 0, move: 0, carry: 0, price: 0, time: 0, patience: 0, dash: 0, lucky: 0, chain: 0,
});

const MOVE_KEYS: Record<string, 'l' | 'r' | 'u' | 'd'> = {
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd',
};

export class TimberEngine {
  phase: Phase = 'ready';
  clock = 0;
  elapsed = 0;
  time = START_TIME;
  money = 0;
  score = 0;
  stock = 0; // logs waiting in the depot
  level = 1;
  xp = 0;
  owned: UpgradeId[] = []; // skills acquired, in pick order (max 6)
  choices: UpgradeId[] = []; // current level-up offer
  pendingLevels = 0;
  combo = 0;
  levels: Record<UpgradeId, number> = ZERO_LEVELS();
  stats = { sold: 0, logs: 0, maxCombo: 0, survived: 0, lost: 0 };
  best = getBest(GAME_ID);
  newBest = false;

  trees: Tree[] = [];
  customers: Customer[] = [];
  player: Player = this.newPlayer();
  cam = { x: 0, y: 0 };
  private look = { x: 0, y: 0 }; // smoothed look-ahead
  particles: Particle[] = [];
  texts: FloatText[] = [];
  shakeAmt = 0;
  shakeX = 0;
  shakeY = 0;
  hitStop = 0;
  comboPulse = 0;
  moneyPulse = 0;
  flashRed = 0;
  bagFlash = 0;
  rushLeft = 0; // seconds of Rush Hour remaining
  rushIn = RUSH_FIRST; // seconds until the next one
  rushBanner = 0; // flash timer for the announcement
  inDepot = false;
  chopping = false;
  alert = { text: '', color: '#ffffff', t: 0 };
  bees = { on: false, x: 0, y: 0, life: 0, hit: 0 };
  thief: Thief = { on: false, x: 0, y: 0, state: 0, t: 0, tick: 0, loot: 0, hp: 0, maxHp: 1, hitCd: 0, stun: 0, vx: 0, vy: 0 };
  private thiefIn = THIEF_FIRST;
  private chainDepth = 0;

  private held = new Set<'l' | 'r' | 'u' | 'd'>();
  stick = { x: 0, y: 0 };
  private pIndex = 0;
  private tIndex = 0;
  private lastTick = -1;
  private depTimer = 0;
  private feedTimer = 0;
  private fullTimer = 0;
  private orderSeq = 0;
  private cands: Tree[] = [];
  private listeners = new Set<() => void>();
  private snap: Snapshot;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ on: false, kind: 'chip', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, g: 0, hue: 0, sx: 0, sy: 0, tx: 0, ty: 0, fol: false });
    }
    for (let i = 0; i < MAX_TEXTS; i++) {
      this.texts.push({ on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', size: 30 });
    }
    this.reset();
    this.snap = this.makeSnapshot();
  }

  private newPlayer(): Player {
    return { x: PLAYER_START.x, y: PLAYER_START.y, vx: 0, vy: 0, face: -1, swing: 0, bob: 0, moving: 0, chopTimer: 0, carry: 0, dashT: 0, dashCd: 0, fightCd: 0, kx: 0, ky: 0 };
  }

  // ---- external store ------------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private emit() {
    this.snap = this.makeSnapshot();
    this.listeners.forEach((l) => l());
  }
  private makeSnapshot(): Snapshot {
    return {
      phase: this.phase,
      level: this.level,
      xp: this.xp,
      xpNeed: xpNeeded(this.level),
      owned: this.owned.slice(),
      choices: this.choices.slice(),
      money: Math.floor(this.money),
      levels: { ...this.levels },
      score: Math.floor(this.score),
      best: this.best,
      newBest: this.newBest,
      stats: { ...this.stats, survived: Math.floor(this.elapsed) },
    };
  }

  /** True from the moment the thief appears until he is beaten or escapes — drives the battle music. */
  get thiefFight() {
    const s = this.thief.state;
    return this.thief.on && (s === 0 || s === 1 || s === 4);
  }

  get capacity() {
    return carryCap(this.levels.carry);
  }

  // ---- lifecycle -----------------------------------------------------------
  reset() {
    this.elapsed = 0;
    this.time = START_TIME;
    this.money = 0;
    this.score = 0;
    this.stock = 0;
    this.level = 1;
    this.xp = 0;
    this.owned = [];
    this.choices = [];
    this.pendingLevels = 0;
    this.combo = 0;
    this.levels = ZERO_LEVELS();
    this.stats = { sold: 0, logs: 0, maxCombo: 0, survived: 0, lost: 0 };
    this.newBest = false;
    this.shakeAmt = 0;
    this.hitStop = 0;
    this.flashRed = 0;
    this.lastTick = -1;
    this.depTimer = 0;
    this.feedTimer = 0;
    this.orderSeq = 0;
    this.rushLeft = 0;
    this.rushIn = RUSH_FIRST;
    this.rushBanner = 0;
    this.alert.t = 0;
    this.bees.on = false;
    this.thief.on = false;
    this.thiefIn = THIEF_FIRST;
    this.chainDepth = 0;
    this.held.clear();
    this.stick.x = this.stick.y = 0;
    this.particles.forEach((p) => (p.on = false));
    this.texts.forEach((t) => (t.on = false));
    this.trees = this.genTrees();
    this.customers = CLIENT_SLOTS_X.map((x, slot) => ({
      slot, active: false, x, y: SLOT_Y, drawX: x, drawY: SLOT_Y, want: 1, got: 0, order: 0,
      patience: 1, maxPatience: 1, enter: 0, leave: 0, mood: 'waiting', shake: 0,
      respawn: 0.8 + slot * 1.2, look: slot * 37, kind: 0,
    }));
    this.player = this.newPlayer();
    this.look.x = this.look.y = 0;
    this.updateCamera(0, true);
  }

  /** Same map every run so players can learn it; kinds/variants vary. */
  private genTrees(): Tree[] {
    const rng = mulberry32(1337);
    const out: Tree[] = [];
    let tries = 0;
    while (out.length < TREE_COUNT && tries < 6000) {
      tries++;
      const x = 110 + rng() * (WORLD_W - 220);
      const y = 230 + rng() * (WORLD_H - 320);
      const dist = Math.hypot(x - BASE.x, (y - BASE.y) * 1.25);
      if (dist < 340) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.y - y) < 100)) continue;
      const t: Tree = {
        id: out.length, x, y, dist, r: 14, kind: 0, variant: 0, special: 0, hive: false, state: 'alive', hp: 1, maxHp: 1, logs: 1,
        grow: 1, fall: 0, fallDir: 1, shake: 0, flash: 0, respawn: 0, regrow: 1,
      };
      this.plant(t);
      t.grow = 1;
      out.push(t);
    }
    return out;
  }

  start() {
    sfx.init();
    sfx.start();
    this.reset();
    this.phase = 'playing';
    this.emit();
  }

  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
    else return;
    this.held.clear();
    this.emit();
  }

  private end() {
    this.phase = 'over';
    this.stats.survived = Math.floor(this.elapsed);
    if (this.score > this.best) {
      this.best = Math.floor(this.score);
      this.newBest = true;
      setBest(GAME_ID, this.best);
    }
    this.shakeAmt = 20;
    this.flashRed = 1;
    this.held.clear();
    sfx.gameOver();
    this.emit();
  }

  // ---- input ---------------------------------------------------------------
  keyDown(code: string) {
    if (this.phase === 'levelup') {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (m) {
        const id = this.choices[Number(m[1]) - 1];
        if (id) this.pick(id);
      }
      return;
    }
    if (code === 'Escape' || code === 'KeyP') return this.togglePause();
    if (this.phase !== 'playing') return;
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') return this.dash();
    const m = MOVE_KEYS[code];
    if (m) {
      this.held.add(m);
      return;
    }
  }

  keyUp(code: string) {
    const m = MOVE_KEYS[code];
    if (m) this.held.delete(m);
  }

  clearKeys() {
    this.held.clear();
    this.stick.x = this.stick.y = 0;
  }

  private showAlert(text: string, color: string, secs = 2.4) {
    this.alert.text = text;
    this.alert.color = color;
    this.alert.t = secs;
    sfx.alert();
  }

  private dash() {
    const p = this.player;
    const l = this.levels.dash;
    if (l <= 0 || p.dashCd > 0 || this.phase !== 'playing') return;
    p.dashT = DASH_TIME;
    p.dashCd = dashCd(l);
    this.burstP('dust', p.x, p.y, 10, 220, 20, p.y);
    sfx.dash();
  }

  // ---- progression ---------------------------------------------------------
  private gainXp(n: number) {
    this.xp += n;
    while (this.xp >= xpNeeded(this.level)) {
      this.xp -= xpNeeded(this.level);
      this.level++;
      this.pendingLevels++;
    }
  }

  /** Skills that can be offered right now: not maxed, and either owned or a free slot exists. */
  private rollChoices(): UpgradeId[] {
    const pool = UPGRADES.filter((u) => this.levels[u.id] < u.max && (this.levels[u.id] > 0 || this.owned.length < MAX_SKILLS)).map((u) => u.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, CHOICES);
  }

  private openLevelUp() {
    const choices = this.rollChoices();
    if (choices.length === 0) {
      this.pendingLevels = 0;
      this.emit();
      return;
    }
    this.choices = choices;
    this.phase = 'levelup';
    this.held.clear();
    this.stick.x = this.stick.y = 0;
    this.shakeAmt = 0;
    sfx.levelUp();
    this.emit();
  }

  pick(id: UpgradeId) {
    if (this.phase !== 'levelup' || !this.choices.includes(id)) return;
    const def = UPGRADES.find((u) => u.id === id)!;
    if (this.levels[id] === 0) this.owned.push(id);
    this.levels[id]++;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    const p = this.player;
    this.burstP('spark', p.x, p.y - 50, 18, 300, 60, p.y + 10);
    this.text(p.x, p.y - 100, `${def.name} ${this.levels[id]}!`, '#ffe14a', 30);
    sfx.buy();
    this.choices = [];
    if (this.pendingLevels > 0) {
      this.openLevelUp();
      return;
    }
    this.phase = 'playing';
    this.emit();
  }

  // ---- simulation ----------------------------------------------------------
  update(rawDt: number) {
    const dt = Math.min(rawDt, 0.05);
    this.clock += dt;
    this.updateParticles(dt);
    this.shakeAmt *= Math.pow(0.0005, dt);
    if (this.shakeAmt < 0.5) this.shakeAmt = 0;
    this.shakeX = Math.sin(this.clock * 57) * this.shakeAmt;
    this.shakeY = Math.cos(this.clock * 49) * this.shakeAmt;
    this.comboPulse = Math.max(0, this.comboPulse - dt * 3);
    this.moneyPulse = Math.max(0, this.moneyPulse - dt * 3);
    this.flashRed = Math.max(0, this.flashRed - dt * 1.5);
    this.bagFlash = Math.max(0, this.bagFlash - dt * 2.5);
    this.player.swing = Math.max(0, this.player.swing - dt * 7);
    this.alert.t = Math.max(0, this.alert.t - dt);

    if (this.phase !== 'playing') {
      this.updateCamera(dt);
      return;
    }
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    this.elapsed += dt;
    this.time -= dt * drainRate(this.elapsed);
    if (this.time < 10 && this.time > 0) {
      const s = Math.ceil(this.time);
      if (s !== this.lastTick) {
        this.lastTick = s;
        sfx.tick();
      }
    }
    if (this.time <= 0) {
      this.time = 0;
      this.end();
      return;
    }

    this.updateRush(dt);
    this.updatePlayer(dt);
    this.autoChop(dt);
    this.fightThief(dt);
    this.updateTrees(dt);
    this.updateDepot(dt);
    this.updateCustomers(dt);
    this.updateBees(dt);
    this.updateThief(dt);
    this.updateCamera(dt);
  }

  private updateRush(dt: number) {
    this.rushBanner = Math.max(0, this.rushBanner - dt);
    if (this.rushLeft > 0) {
      this.rushLeft -= dt;
      if (this.rushLeft <= 0) {
        this.rushLeft = 0;
        this.rushIn = RUSH_EVERY;
      }
      return;
    }
    this.rushIn -= dt;
    if (this.rushIn <= 0) {
      this.rushLeft = RUSH_LEN;
      this.rushBanner = 2.2;
      this.shakeAmt = Math.max(this.shakeAmt, 6);
      sfx.rush();
    }
  }

  private updateCamera(dt: number, snap = false) {
    const p = this.player;
    // look-ahead follows a *smoothed* velocity so dashes/stops don't yank the camera
    const kl = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    this.look.x += (clamp(p.vx * 0.3, -110, 110) - this.look.x) * kl;
    this.look.y += (clamp(p.vy * 0.3, -80, 80) - this.look.y) * kl;
    const tx = clamp(p.x + this.look.x - W / 2, 0, WORLD_W - W);
    const ty = clamp(p.y + this.look.y - H / 2 - 30, 0, WORLD_H - H);
    const k = snap ? 1 : 1 - Math.exp(-dt * 8);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    let ix = (this.held.has('r') ? 1 : 0) - (this.held.has('l') ? 1 : 0) + this.stick.x;
    let iy = (this.held.has('d') ? 1 : 0) - (this.held.has('u') ? 1 : 0) + this.stick.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    let sp = moveSpeed(this.levels.move);
    let k = Math.min(1, dt * 14);
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.dashT > 0) {
      p.dashT -= dt;
      if (ix === 0 && iy === 0) ix = p.face;
      sp *= DASH_MULT;
      k = 1;
      if (Math.random() < 0.6) this.burstP('dust', p.x, p.y, 1, 60, 6, p.y);
    }
    p.vx += (ix * sp - p.vx) * k;
    p.vy += (iy * sp - p.vy) * k;
    p.x += (p.vx + p.kx) * dt;
    p.y += (p.vy + p.ky) * dt;
    const kd = Math.exp(-dt * 7);
    p.kx *= kd;
    p.ky *= kd;
    this.collide(p);
    const speed = Math.hypot(p.vx, p.vy);
    p.moving = Math.min(1, speed / 120);
    p.bob += dt * (3 + Math.min(speed, 460) * 0.042);
    if (Math.abs(p.vx) > 25) p.face = p.vx > 0 ? 1 : -1;
  }

  private collide(p: Player) {
    const ox = p.x, oy = p.y;
    p.x = clamp(p.x, 50, WORLD_W - 50);
    p.y = clamp(p.y, 90, WORLD_H - 40);
    if (p.x !== ox) p.vx = 0;
    if (p.y !== oy) p.vy = 0;
    for (const t of this.trees) {
      if (t.state !== 'alive') continue;
      const dx = p.x - t.x, dy = p.y - t.y;
      const d = Math.hypot(dx, dy);
      const min = PLAYER_R + t.r;
      if (d < min && d > 0.001) {
        const nx = dx / d, ny = dy / d;
        p.x = t.x + nx * min;
        p.y = t.y + ny * min;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; } // slide along the trunk
      }
    }
    // stall + counter block
    const left = COUNTER.cx - COUNTER.w / 2 - 8;
    const right = COUNTER.cx + COUNTER.w / 2 + 8;
    const top = COUNTER.y - 150;
    const bottom = COUNTER.y + COUNTER.h / 2;
    const cx = clamp(p.x, left, right), cy = clamp(p.y, top, bottom);
    const dx = p.x - cx, dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < PLAYER_R) {
      if (d > 0.001) {
        const nx = dx / d, ny = dy / d;
        p.x = cx + nx * PLAYER_R;
        p.y = cy + ny * PLAYER_R;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
      } else {
        p.y = bottom + PLAYER_R; // pushed out through the front
      }
    }
  }

  // ---- chopping ------------------------------------------------------------
  private autoChop(dt: number) {
    const p = this.player;
    p.chopTimer -= dt;
    const c = this.cands;
    c.length = 0;
    for (const t of this.trees) {
      if (t.state !== 'alive' || t.grow < 0.6) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) <= CHOP_RANGE + t.r) c.push(t);
    }
    this.chopping = c.length > 0;
    if (!this.chopping || p.chopTimer > 0) return;

    if (p.carry >= this.capacity) {
      this.fullTimer -= dt;
      this.bagFlash = 1;
      if (this.fullTimer <= 0) {
        this.fullTimer = 1.1;
        this.text(p.x, p.y - 120, 'BAG FULL!', '#ff7a7a', 30);
        sfx.nope();
      }
      return;
    }
    this.fullTimer = 0;

    c.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    p.chopTimer = chopInterval(this.levels.speed);
    p.swing = 1;
    const first = c[0];
    if (Math.abs(first.x - p.x) > 6) p.face = first.x > p.x ? 1 : -1;
    const n = axeCount(this.levels.extra);
    for (let i = 0; i < n; i++) {
      const t = c[i % c.length];
      if (t.state !== 'alive') continue;
      const crit = Math.random() < critChance(this.levels.lucky);
      this.hitTree(t, dmg(this.levels.edge) * (crit ? 2 : 1), crit);
    }
  }

  private hitTree(t: Tree, amount: number, crit: boolean) {
    if (t.state !== 'alive') return;
    if (t.hive) {
      t.hive = false;
      this.spawnBees(t.x, t.y - 50);
    }
    t.hp -= amount;
    t.shake = 1;
    t.flash = 1;
    this.burstP('chip', t.x + (this.player.x < t.x ? -8 : 8), t.y - rand(24, 60), crit ? 12 : 6, 260, 36, t.y + 6);
    if (Math.random() < 0.5) this.burstP('leaf', t.x + rand(-30, 30), t.y - rand(80, 150), 2, 90, 90, t.y + 6);
    this.shakeAmt = Math.max(this.shakeAmt, crit ? 5 : 0);
    this.hitStop = crit ? 0.04 : 0;
    if (crit) {
      const lucky = this.levels.lucky > 0;
      this.text(t.x, t.y - 120, lucky ? 'JACKPOT!' : 'CRIT!', lucky ? '#7dff9a' : '#ffe14a', 34);
      if (lucky) {
        this.player.carry += 1;
        this.stats.logs += 1;
        this.flyerTo(t.x, t.y - 50, this.player.x, this.player.y - 40, 0, true);
      }
    }
    sfx.chop(crit, false);
    if (t.hp <= 0) this.fell(t);
  }

  private fell(t: Tree) {
    const p = this.player;
    t.state = 'falling';
    t.fall = 0;
    t.fallDir = t.x >= p.x ? 1 : -1;
    p.carry += t.logs;
    this.stats.logs += t.logs;
    sfx.fall();
    this.shakeAmt = Math.max(this.shakeAmt, 6);
    this.text(t.x, t.y - 140, `+${t.logs} logs`, '#ffd9a0', 30);
    const n = Math.min(t.logs, 8);
    for (let i = 0; i < n; i++) {
      this.flyerTo(t.x + rand(-14, 14), t.y - rand(20, 90), p.x, p.y - 40, i * 0.04, true);
    }
    if (t.special === 1) {
      this.text(t.x, t.y - 175, 'GOLDEN!', '#ffd23f', 34);
      this.burstP('spark', t.x, t.y - 60, 30, 360, 60, t.y);
      this.burstP('coin', t.x, t.y - 60, 12, 420, 60, t.y + 6);
    }
    if (t.special === 3) this.explode(t);
    const cl = this.levels.chain;
    if (cl > 0 && this.chainDepth < 5) {
      let best: Tree | null = null;
      let bd = 190;
      for (const o of this.trees) {
        if (o === t || o.state !== 'alive' || o.grow < 0.6) continue;
        const d = Math.hypot(o.x - t.x, o.y - t.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        this.chainDepth++;
        this.text(best.x, best.y - 100, 'CHAIN!', '#9fd0ff', 26);
        this.hitTree(best, chainDmg(cl), false);
        this.chainDepth--;
      }
    }
  }

  private explode(t: Tree) {
    this.text(t.x, t.y - 190, 'BOOM!', '#ff6a3d', 40);
    this.shakeAmt = Math.max(this.shakeAmt, 24);
    this.flashRed = Math.max(this.flashRed, 0.35);
    this.burstP('spark', t.x, t.y - 40, 40, 520, 80, t.y);
    this.burstP('dust', t.x, t.y - 10, 14, 300, 60, t.y);
    sfx.boom();
    for (const o of this.trees) {
      if (o === t || o.state !== 'alive') continue;
      if (Math.hypot(o.x - t.x, o.y - t.y) > BOMB_RADIUS) continue;
      o.hp -= BOMB_DMG;
      o.flash = 1;
      o.shake = 1;
      if (o.hp <= 0) this.fell(o);
    }
  }

  // ---- special events ------------------------------------------------------
  private spawnBees(x: number, y: number) {
    this.bees.on = true;
    this.bees.x = x;
    this.bees.y = y;
    this.bees.life = BEES_LIFE;
    this.bees.hit = 0.9;
    this.showAlert('BEES! RUN!', '#ffcf40');
  }

  private updateBees(dt: number) {
    const b = this.bees;
    if (!b.on) return;
    b.life -= dt;
    if (b.life <= 0) {
      b.on = false;
      return;
    }
    const p = this.player;
    const dx = p.x - b.x, dy = p.y - 30 - b.y;
    const d = Math.hypot(dx, dy) || 1;
    b.x += (dx / d) * BEES_SPEED * dt;
    b.y += (dy / d) * BEES_SPEED * dt;
    b.hit -= dt;
    if (d < 32 && b.hit <= 0) {
      b.hit = 0.7;
      this.time = Math.max(0.5, this.time - BEES_COST);
      this.text(p.x, p.y - 100, `-${BEES_COST}s`, '#ffcf40', 30);
      this.shakeAmt = Math.max(this.shakeAmt, 6);
      this.flashRed = Math.max(this.flashRed, 0.25);
      sfx.nope();
    }
  }

  private spawnThief() {
    const th = this.thief;
    th.on = true;
    th.x = BASE.x + 820;
    th.y = DEPOT.y + rand(-120, 140);
    th.state = 0;
    th.t = 0;
    th.tick = 0;
    th.loot = 0;
    th.maxHp = th.hp = 12 + 2 * Math.floor(this.elapsed / 25);
    th.hitCd = 0.8;
    th.stun = 0;
    th.vx = th.vy = 0;
    this.showAlert('THIEF! FIGHT HIM!', '#ff6b6b', 3);
  }

  private engageThief() {
    const th = this.thief;
    if (th.state === 4) return;
    th.state = 4;
    th.t = 0;
    this.text(th.x, th.y - 110, 'FIGHT!', '#ff6b6b', 34);
    sfx.alert();
  }

  /** Your axe hits him when he is in reach (same swing rhythm as chopping). */
  private fightThief(dt: number) {
    const th = this.thief;
    const p = this.player;
    p.fightCd = Math.max(0, p.fightCd - dt);
    if (!th.on || th.state === 2 || th.state === 3) return;
    const dx = th.x - p.x, dy = th.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 84 || p.fightCd > 0) return;
    p.fightCd = chopInterval(this.levels.speed);
    p.swing = 1;
    p.face = dx >= 0 ? 1 : -1;
    const crit = Math.random() < critChance(this.levels.lucky);
    const n = axeCount(this.levels.extra);
    const amt = dmg(this.levels.edge) * (1 + 0.6 * (n - 1)) * (crit ? 2 : 1);
    th.hp -= amt;
    th.stun = 0.25;
    th.vx += (dx / d) * 300;
    th.vy += (dy / d) * 300;
    this.burstP('spark', th.x, th.y - 40, crit ? 12 : 6, 260, 20, th.y);
    this.text(th.x, th.y - 85, crit ? 'CRIT!' : `-${amt.toFixed(1)}`, crit ? '#ffe14a' : '#ffffff', crit ? 34 : 26);
    this.shakeAmt = Math.max(this.shakeAmt, crit ? 5 : 0);
    this.hitStop = crit ? 0.04 : 0;
    sfx.chop(crit, false);
    this.engageThief();
    if (th.hp <= 0) this.defeatThief();
  }

  private defeatThief() {
    const th = this.thief;
    this.stock += th.loot;
    this.text(th.x, th.y - 110, th.loot > 0 ? `THIEF DOWN! +${th.loot} logs back` : 'THIEF DOWN!', '#7dff9a', 30);
    this.text(th.x, th.y - 140, '+6 XP', '#7fd3ff', 26);
    this.burstP('coin', th.x, th.y - 40, 18, 420, 60, th.y);
    this.shakeAmt = Math.max(this.shakeAmt, 8);
    th.loot = 0;
    th.state = 3;
    th.t = 0;
    th.stun = 99;
    sfx.coin(6);
    this.gainXp(6);
    if (this.pendingLevels > 0) this.openLevelUp();
    else this.emit();
  }

  private updateThief(dt: number) {
    const th = this.thief;
    if (!th.on) {
      if (this.elapsed > 25) {
        this.thiefIn -= dt;
        if (this.thiefIn <= 0) this.spawnThief();
      }
      return;
    }
    th.t += dt;
    th.hitCd = Math.max(0, th.hitCd - dt);
    if (th.state !== 3) th.stun = Math.max(0, th.stun - dt);
    th.x += th.vx * dt;
    th.y += th.vy * dt;
    const damp = Math.exp(-dt * 7);
    th.vx *= damp;
    th.vy *= damp;
    const p = this.player;
    const dx = p.x - th.x, dy = p.y - th.y;
    const dist = Math.hypot(dx, dy) || 1;
    const stunned = th.stun > 0;

    if (th.state === 0) {
      if (dist < 130) this.engageThief();
      else if (!stunned) {
        const tx = DEPOT.x - th.x, ty = DEPOT.y - th.y;
        const d = Math.hypot(tx, ty) || 1;
        th.x += (tx / d) * 150 * dt;
        th.y += (ty / d) * 150 * dt;
        if (d < 26) {
          th.state = 1;
          th.t = 0;
        }
      }
    } else if (th.state === 1) {
      th.tick -= dt;
      if (th.tick <= 0 && this.stock > 0 && !stunned) {
        th.tick = 0.35;
        this.stock--;
        th.loot++;
        this.flyerTo(DEPOT.x, DEPOT.y - 20, th.x, th.y - 40, 0, false);
        sfx.nope();
      }
      if (dist < 130) this.engageThief();
      else if (th.t > 9 || th.loot >= 12) {
        th.state = 2;
        th.t = 0;
        this.text(th.x, th.y - 110, 'HE RUNS!', '#ff9a6a', 28);
      }
    } else if (th.state === 4) {
      if (dist > 260) {
        th.state = 0; // you walked away: back to the loot
        th.t = 0;
      } else if (!stunned) {
        if (dist > 32) {
          th.x += (dx / dist) * 135 * dt;
          th.y += (dy / dist) * 135 * dt;
        } else if (th.hitCd <= 0) {
          // he hits back: costs time, shoves you, and grabs logs from your bag
          th.hitCd = 1.15;
          p.kx += (dx / dist) * 420;
          p.ky += (dy / dist) * 420;
          th.vx -= (dx / dist) * 160;
          th.vy -= (dy / dist) * 160;
          this.time = Math.max(0.5, this.time - THIEF_HIT);
          const grab = Math.min(2, p.carry);
          if (grab > 0) {
            p.carry -= grab;
            th.loot += grab;
            this.text(p.x, p.y - 130, `-${grab} logs!`, '#ffb36b', 26);
          }
          this.text(p.x, p.y - 100, `-${THIEF_HIT}s`, '#ff6b6b', 30);
          this.shakeAmt = Math.max(this.shakeAmt, 8);
          this.flashRed = Math.max(this.flashRed, 0.3);
          this.burstP('spark', p.x, p.y - 40, 8, 240, 20, p.y);
          sfx.angry();
        }
      }
      if (th.t > 22) {
        th.state = 2;
        th.t = 0;
      }
    } else if (th.state === 3) {
      if (th.t > 1.3) {
        th.state = 2;
        th.t = 0;
        th.stun = 0;
      }
    } else {
      th.x += 250 * dt;
      th.y += 30 * dt;
      if (th.x > WORLD_W + 80 || th.t > 14) {
        th.on = false;
        this.thiefIn = rand(40, 60);
        if (th.loot > 0) {
          this.text(DEPOT.x, DEPOT.y - 120, `STOLEN: ${th.loot} logs`, '#ff6b6b', 30);
          this.flashRed = Math.max(this.flashRed, 0.4);
          sfx.angry();
        }
        th.loot = 0;
      }
    }
  }

  private plant(t: Tree) {
    const w = kindWeights(t.dist);
    let r = Math.random();
    let kind = 2;
    for (let i = 0; i < 3; i++) {
      r -= w[i];
      if (r <= 0) { kind = i; break; }
    }
    const k = TREE_KINDS[kind];
    t.kind = kind as 0 | 1 | 2;
    t.variant = Math.random() < 0.5 ? 0 : 1;
    t.r = k.r;
    t.regrow = k.regrow;
    t.state = 'alive';
    t.hp = t.maxHp = k.hp;
    t.logs = k.logs;
    t.grow = 0;
    t.fall = 0;
    t.shake = 0;
    t.flash = 0;
    t.special = 0;
    t.hive = false;
    if (Math.random() < specialChance(this.elapsed)) {
      const r = Math.random();
      t.special = r < 0.4 ? 1 : r < 0.72 ? 2 : 3;
    }
    if (t.special === 1) {
      t.variant = 2;
      t.logs *= 3;
      t.hp = t.maxHp = Math.round(t.hp * 1.4);
      this.showAlert('GOLDEN TREE GREW!', '#ffd23f', 2);
    } else if (t.special === 2) {
      t.logs = Math.round(t.logs * 1.8);
      t.hive = true;
    } else if (t.special === 3) {
      t.hp = t.maxHp = Math.max(2, Math.round(t.hp * 0.8));
    }
  }

  private updateTrees(dt: number) {
    for (const t of this.trees) {
      t.shake = Math.max(0, t.shake - dt * 5);
      t.flash = Math.max(0, t.flash - dt * 8);
      if (t.state === 'alive') {
        if (t.grow < 1) t.grow = Math.min(1, t.grow + dt * 2.2);
        if (t.special === 1 && Math.random() < dt * 3) this.burstP('spark', t.x + rand(-30, 30), t.y - rand(30, 110), 1, 40, 4, t.y);
      } else if (t.state === 'falling') {
        t.fall += dt / 0.55;
        if (t.fall >= 1) {
          t.state = 'stump';
          t.respawn = t.regrow;
          this.burstP('dust', t.x + t.fallDir * 70, t.y, 8, 160, 20, t.y);
          this.burstP('leaf', t.x + t.fallDir * 60, t.y - 20, 8, 200, 60, t.y + 6);
        }
      } else {
        t.respawn -= dt;
        if (t.respawn <= 0) {
          // don't regrow on top of the player
          if (Math.hypot(t.x - this.player.x, t.y - this.player.y) < 50) t.respawn = 0.5;
          else this.plant(t);
        }
      }
    }
  }

  // ---- depot & customers ---------------------------------------------------
  private updateDepot(dt: number) {
    const p = this.player;
    this.inDepot = Math.hypot(p.x - DEPOT.x, p.y - DEPOT.y) < DEPOT.r;
    if (this.inDepot && p.carry > 0) {
      this.depTimer -= dt;
      while (this.depTimer <= 0 && p.carry > 0) {
        this.depTimer += 0.05;
        p.carry--;
        this.stock++;
        if (p.carry % 2 === 0) this.flyerTo(p.x, p.y - 40, DEPOT.x, DEPOT.y - 14, 0, false);
      }
    } else {
      this.depTimer = 0;
    }

    // Feed waiting customers from stock, oldest first.
    this.feedTimer -= dt;
    if (this.feedTimer <= 0 && this.stock > 0) {
      let target: Customer | null = null;
      for (const c of this.customers) {
        if (c.active && c.mood === 'waiting' && c.enter >= 1 && c.got < c.want && (!target || c.order < target.order)) target = c;
      }
      if (target) {
        this.stock--;
        target.got++;
        this.feedTimer = 0.07;
        this.flyerTo(DEPOT.x, DEPOT.y - 20, target.drawX, target.drawY - 70, 0, false);
        if (target.got >= target.want) this.complete(target);
      }
    }
  }

  private complete(c: Customer) {
    this.combo += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    this.stats.sold += c.want;
    const speedBonus = 1 + 0.5 * (c.patience / c.maxPatience);
    const comboMult = 1 + Math.min(this.combo - 1, 12) * 0.1;
    const rush = this.rushLeft > 0 ? RUSH_PAY : 1;
    const kindPay = c.kind === 1 ? 3 : c.kind === 2 ? 4 : 1;
    const pay = Math.round(c.want * logPrice(this.levels.price) * speedBonus * comboMult * rush * kindPay);
    const bonusTime = (1.4 + 0.8 * c.want) * timeMult(this.levels.time) * (c.kind === 2 ? 3 : 1);
    const xpGain = c.want * (c.kind === 1 ? 2 : c.kind === 2 ? 3 : 1);
    this.money += pay;
    this.score += pay;
    this.time = Math.min(MAX_TIME, this.time + bonusTime);
    c.mood = 'happy';
    c.leave = 0.0001;
    this.comboPulse = 1;
    this.moneyPulse = 1;
    this.burstP('coin', c.drawX, c.drawY - 80, 10 + Math.min(pay / 4, 14), 380, 80, c.drawY);
    this.text(c.drawX, c.drawY - 150, `+$${pay}`, '#7dff9a', 38);
    this.text(c.drawX + 12, c.drawY - 115, `+${bonusTime.toFixed(1)}s`, '#8fd8ff', 26);
    if (this.combo >= 2) this.text(c.drawX, c.drawY - 185, `COMBO x${this.combo}`, '#ffb347', 30);
    this.text(c.drawX, c.drawY - 215, `+${xpGain} XP`, '#7fd3ff', 26);
    if (c.kind === 1) this.text(c.drawX, c.drawY - 245, 'VIP TIP!', '#ffd23f', 28);
    if (c.kind === 2) this.text(c.drawX, c.drawY - 245, 'SWEET GRANNY!', '#ff9ad6', 28);
    this.gainXp(xpGain);
    sfx.coin(this.combo);
    if (this.pendingLevels > 0) this.openLevelUp();
    else this.emit();
  }

  private spawnCustomer(c: Customer) {
    const maxQ = Math.min(11, 3 + Math.floor(this.elapsed / 16));
    const want = this.elapsed < 3 ? 2 : 1 + Math.floor(Math.pow(Math.random(), 1.25) * maxQ);
    const pf = Math.max(0.6, 1 - this.elapsed / 520) * (this.rushLeft > 0 ? 0.88 : 1);
    c.active = true;
    c.want = want;
    c.got = 0;
    c.order = ++this.orderSeq;
    c.maxPatience = c.patience = (18 + want * 3) * pf * patienceMult(this.levels.patience);
    c.kind = 0;
    if (this.elapsed > 25) {
      const r = Math.random();
      if (r < 0.07) {
        c.kind = 1; // VIP: big order, pays triple, hates waiting
        c.want = Math.max(c.want, 3);
        c.maxPatience = c.patience = c.maxPatience * 0.6;
      } else if (r < 0.14) {
        c.kind = 2; // granny: one log, huge bonus
        c.want = 1;
        c.maxPatience = c.patience = c.maxPatience * 1.8;
      }
    }
    c.enter = 0;
    c.leave = 0;
    c.mood = 'waiting';
    c.look = Math.floor(Math.random() * 1000);
    c.drawX = c.x + 520;
    c.drawY = c.y + 50;
  }

  private updateCustomers(dt: number) {
    for (const c of this.customers) {
      c.shake = Math.max(0, c.shake - dt * 4);
      if (!c.active) {
        c.respawn -= dt;
        if (c.respawn <= 0) this.spawnCustomer(c);
        continue;
      }
      if (c.enter < 1) {
        c.enter = Math.min(1, c.enter + dt * 0.7);
        const e = 1 - Math.pow(1 - c.enter, 3);
        c.drawX = c.x + (1 - e) * 520;
        c.drawY = c.y + (1 - e) * 50;
      }
      if (c.mood === 'waiting') {
        if (c.enter >= 1) {
          c.patience -= dt;
          if (c.patience <= 0) {
            c.mood = 'angry';
            c.leave = 0.0001;
            this.time = Math.max(0.001, this.time - ANGRY_PENALTY);
            this.combo = 0;
            this.stats.lost++;
            this.shakeAmt = Math.max(this.shakeAmt, 9);
            this.flashRed = 0.8;
            this.text(c.drawX, c.drawY - 150, `-${ANGRY_PENALTY}s`, '#ff5d5d', 40);
            this.burstP('spark', c.drawX, c.drawY - 70, 8, 220, 60, c.drawY);
            sfx.angry();
          }
        }
      } else {
        c.leave += dt * 1.1;
        c.drawX += dt * 150;
        c.drawY += dt * 40;
        if (c.leave >= 1) {
          c.active = false;
          c.respawn = this.rushLeft > 0 ? rand(0.1, 0.4) : rand(0.5, 1.4);
        }
      }
    }
  }

  // ---- particles & text ----------------------------------------------------
  private nextParticle(): Particle {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[(this.pIndex + i) % MAX_PARTICLES];
      if (!p.on) {
        this.pIndex = (this.pIndex + i + 1) % MAX_PARTICLES;
        return p;
      }
    }
    const p = this.particles[this.pIndex];
    this.pIndex = (this.pIndex + 1) % MAX_PARTICLES;
    return p;
  }

  private burstP(kind: ParticleKind, x: number, y: number, n: number, speed: number, spread: number, groundY: number) {
    for (let i = 0; i < n; i++) {
      const p = this.nextParticle();
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * speed;
      p.on = true;
      p.kind = kind;
      p.fol = false;
      p.ty = groundY;
      p.x = x + rand(-spread * 0.2, spread * 0.2);
      p.y = y + rand(-spread * 0.2, spread * 0.2);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - (kind === 'coin' || kind === 'chip' ? speed * 0.6 : 0);
      p.max = p.life = kind === 'leaf' ? rand(0.9, 1.6) : kind === 'dust' ? rand(0.4, 0.8) : rand(0.5, 1.0);
      p.size = kind === 'coin' ? rand(6, 9) : kind === 'dust' ? rand(14, 26) : kind === 'leaf' ? rand(5, 9) : rand(3, 7);
      p.rot = rand(0, 6.28);
      p.vr = rand(-12, 12);
      p.g = kind === 'leaf' ? 120 : kind === 'dust' ? -20 : kind === 'spark' ? 200 : 900;
      p.hue = rand(0, 1);
      if (kind === 'leaf') { p.vy = Math.abs(p.vy) * 0.2 - 40; p.vx *= 0.5; }
    }
  }

  private flyerTo(x: number, y: number, tx: number, ty: number, delay: number, follow: boolean) {
    const p = this.nextParticle();
    p.on = true;
    p.kind = 'log';
    p.fol = follow;
    p.sx = p.x = x; p.sy = p.y = y; p.tx = tx; p.ty = ty;
    p.max = 0.5 + delay;
    p.life = p.max;
    p.size = 1;
    p.rot = rand(0, 6.28);
    p.vr = rand(-8, 8);
    p.vx = p.vy = p.g = 0;
    p.hue = delay; // delay stored here
  }

  private updateParticles(dt: number) {
    const pl = this.player;
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.kind === 'log') {
        if (p.fol) { p.tx = pl.x; p.ty = pl.y - 40; }
        const total = p.max - p.hue;
        const k = Math.min(1, Math.max(0, (p.max - p.life - p.hue) / total));
        const e = k * k * (3 - 2 * k);
        p.x = p.sx + (p.tx - p.sx) * e;
        p.y = p.sy + (p.ty - p.sy) * e - Math.sin(k * Math.PI) * 70;
        p.rot += p.vr * dt;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * (p.kind === 'leaf' ? 1.2 : 0.6);
      p.rot += p.vr * dt;
      if (p.kind === 'leaf') p.vx += Math.sin(this.clock * 6 + p.hue * 9) * 60 * dt;
      if ((p.kind === 'chip' || p.kind === 'coin') && p.y > p.ty && p.vy > 0) {
        p.y = p.ty;
        p.vy *= -0.35;
        p.vx *= 0.7;
      }
    }
    for (const t of this.texts) {
      if (!t.on) continue;
      t.life -= dt;
      if (t.life <= 0) { t.on = false; continue; }
      t.y += t.vy * dt;
      t.vy *= 1 - dt * 2.2;
    }
  }

  private text(x: number, y: number, text: string, color: string, size: number) {
    const t = this.texts[this.tIndex];
    this.tIndex = (this.tIndex + 1) % MAX_TEXTS;
    t.on = true; t.x = x; t.y = y; t.vy = -110; t.max = t.life = 1.0; t.text = text; t.color = color; t.size = size;
  }
}
