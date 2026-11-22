import {
  GRAVITY, INF, MAX_HP, RETREAT_TIME, TURN_TIME, VH, VW, WALK_SPEED, WATER_Y, WEAPONS, WEAPON_BY_ID, WORM_NAMES,
  type Difficulty, type WeaponId,
} from './config';
import { Terrain } from './terrain';
import { wsfx } from './audio';
import { WormAI } from './ai';
import { getBest, setBest } from '../../lib/storage';

export const GAME_ID = 'worm-brawl';

export type Phase = 'ready' | 'turn' | 'resolve' | 'over';

export interface Worm {
  id: number;
  team: 0 | 1;
  name: string;
  x: number; // feet centre
  y: number;
  vx: number;
  vy: number;
  hp: number;
  shown: number; // smoothed hp for the bar
  face: 1 | -1;
  aim: number; // degrees above horizontal (-85..85)
  alive: boolean;
  gone: boolean; // drowned / removed
  grounded: boolean;
  walking: boolean;
  walkT: number;
  hurtT: number;
  fallV: number;
}

export type ProjKind = 'rocket' | 'grenade' | 'cluster' | 'bomblet' | 'dynamite' | 'sheep' | 'missile';
export interface Proj {
  kind: ProjKind;
  x: number; y: number; vx: number; vy: number;
  fuse: number;
  age: number;
  face: 1 | -1;
  team: 0 | 1;
  owner: number;
  rest: boolean;
  beep: number;
  trail: number;
  jump: number;
}

export type ParticleKind = 'smoke' | 'fire' | 'dirt' | 'spark' | 'splash' | 'flame' | 'star';
export interface Particle {
  on: boolean; kind: ParticleKind; x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; g: number; hue: number;
}
export interface Blast { x: number; y: number; r: number; t: number; max: number }
export interface Tracer { x0: number; y0: number; x1: number; y1: number; t: number }
export interface Popup { x: number; y: number; t: number; text: string; color: string }

export interface Settings { difficulty: Difficulty; perTeam: number; aiVsAi: boolean }

export interface Snapshot {
  phase: Phase;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  fired: boolean;
  humanTurn: boolean;
  turnTeam: 0 | 1;
  winner: -1 | 0 | 1 | 2;
  settings: Settings;
  wins: number;
  paused: boolean;
}

const ROCKET_G = 70;
const rocketSpeed = (p: number) => 45 + p * 215;
const grenadeSpeed = (p: number) => 30 + p * 200;
export const EXPL: Record<string, { r: number; dmg: number; force: number }> = {
  rocket: { r: 15, dmg: 50, force: 150 },
  grenade: { r: 13, dmg: 45, force: 140 },
  cluster: { r: 10, dmg: 28, force: 110 },
  bomblet: { r: 7, dmg: 22, force: 90 },
  dynamite: { r: 23, dmg: 75, force: 200 },
  sheep: { r: 20, dmg: 55, force: 170 },
  missile: { r: 10, dmg: 35, force: 110 },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const freshAmmo = () => Object.fromEntries(WEAPONS.map((w) => [w.id, w.ammo])) as Record<WeaponId, number>;

export class WormEngine {
  phase: Phase = 'ready';
  paused = false;
  clock = 0;
  settings: Settings = { difficulty: 'normal', perTeam: 3, aiVsAi: false };
  terrain: Terrain = new Terrain(7);
  worms: Worm[] = [];
  projs: Proj[] = [];
  particles: Particle[] = [];
  blasts: Blast[] = [];
  tracers: Tracer[] = [];
  popups: Popup[] = [];
  marker: { x: number; y: number; t: number } | null = null;

  turnTeam: 0 | 1 = 0;
  cw: Worm | null = null;
  timer = TURN_TIME;
  fired = false;
  weapon: WeaponId = 'bazooka';
  ammo: [Record<WeaponId, number>, Record<WeaponId, number>] = [freshAmmo(), freshAmmo()];
  charge = 0;
  charging = false;
  wind = 0;
  winner: -1 | 0 | 1 | 2 = -1;
  wins = getBest(GAME_ID);

  ctrl = { left: false, right: false, up: false, down: false };
  mouse = { x: VW / 2, y: VH / 2 };
  rope = { state: 'none' as 'none' | 'flying' | 'attached', hx: 0, hy: 0, vx: 0, vy: 0, len: 0, travel: 0 };
  jet = { active: false, fuel: 0, thrust: false };
  drill = { t: 0, sound: 0 };
  shake = 0;
  banner = { text: '', color: '#ffffff', t: 0 };

  private queue: { at: number; fn: () => void }[] = [];
  private rot: [number, number] = [0, 0];
  private calmT = 0;
  private resolveT = 0;
  private lastTick = -1;
  private stepSound = 0;
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  readonly ai = new WormAI();

  constructor() {
    for (let i = 0; i < 420; i++) this.particles.push({ on: false, kind: 'smoke', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, g: 0, hue: 0 });
    this.snap = this.makeSnapshot();
  }

  // ---- external store -------------------------------------------------------
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
      weapon: this.weapon,
      ammo: { ...this.ammo[0] },
      fired: this.fired,
      humanTurn: this.humanTurn,
      turnTeam: this.turnTeam,
      winner: this.winner,
      settings: { ...this.settings },
      wins: this.wins,
      paused: this.paused,
    };
  }

  get humanTurn() {
    return this.phase === 'turn' && !!this.cw && !this.isAI(this.cw.team);
  }
  isAI(team: number) {
    return team === 1 || this.settings.aiVsAi;
  }

  // ---- match setup ----------------------------------------------------------
  start(s?: Partial<Settings>) {
    wsfx.init();
    if (s) this.settings = { ...this.settings, ...s };
    wsfx.stopLoops();
    this.terrain = new Terrain(Math.floor(Math.random() * 1e6) + 1);
    this.worms = [];
    this.projs = [];
    this.blasts = [];
    this.tracers = [];
    this.popups = [];
    this.queue = [];
    this.particles.forEach((p) => (p.on = false));
    this.ammo = [freshAmmo(), freshAmmo()];
    this.rot = [0, 0];
    this.winner = -1;
    this.paused = false;
    this.rope.state = 'none';
    this.jet.active = false;
    this.drill.t = 0;
    this.spawnWorms();
    this.weapon = 'bazooka';
    this.turnTeam = Math.random() < 0.5 ? 0 : 1;
    this.beginTurn(this.turnTeam);
  }

  private spawnWorms() {
    const n = this.settings.perTeam * 2;
    const cols = this.terrain.spawnColumns();
    const chosen: number[] = [];
    for (let i = 0; i < n; i++) {
      const target = 24 + ((i + 0.5) / n) * (VW - 48);
      let best = -1;
      let bd = 1e9;
      for (const c of cols) {
        if (chosen.some((o) => Math.abs(o - c) < 16)) continue;
        const d = Math.abs(c - target);
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) chosen.push(best);
    }
    chosen.sort((a, b) => a - b);
    const flip = Math.random() < 0.5 ? 1 : 0;
    const used: [number, number] = [0, 0];
    chosen.forEach((x, i) => {
      const team = ((i + flip) % 2) as 0 | 1;
      this.worms.push({
        id: i, team, name: WORM_NAMES[team][used[team]++ % 4], x, y: this.terrain.height[x] - 1, vx: 0, vy: 0,
        hp: MAX_HP, shown: MAX_HP, face: x < VW / 2 ? 1 : -1, aim: 20, alive: true, gone: false, grounded: true,
        walking: false, walkT: 0, hurtT: 0, fallV: 0,
      });
    });
  }

  private beginTurn(team: 0 | 1) {
    const list = this.worms.filter((w) => w.team === team && w.alive && !w.gone);
    if (list.length === 0) return this.checkWin();
    this.turnTeam = team;
    this.cw = list[this.rot[team]++ % list.length];
    this.timer = TURN_TIME;
    this.fired = false;
    this.charging = false;
    this.charge = 0;
    this.wind = rand(-22, 22);
    this.rope.state = 'none';
    this.jet.active = false;
    this.drill.t = 0;
    this.lastTick = -1;
    this.calmT = 0;
    this.phase = 'turn';
    this.ctrl.left = this.ctrl.right = this.ctrl.up = this.ctrl.down = false;
    if (this.isAI(team)) this.ai.startTurn(this);
    else if (!this.hasAmmo(this.weapon)) this.weapon = 'bazooka';
    const label = this.isAI(team) ? `${this.cw.name}'S TURN` : `${this.cw.name}: YOUR TURN`;
    this.banner = { text: label, color: team === 0 ? '#7fc4ff' : '#ff8a8a', t: 1.8 };
    wsfx.turn();
    this.emit();
  }

  endTurn() {
    if (this.phase !== 'turn') return;
    this.phase = 'resolve';
    this.charging = false;
    this.charge = 0;
    this.rope.state = 'none';
    this.stopJet();
    this.stopDrill();
    this.resolveT = 0;
    this.calmT = 0;
    this.ctrl.left = this.ctrl.right = this.ctrl.up = this.ctrl.down = false;
    this.emit();
  }

  private checkWin(): boolean {
    const a = this.worms.some((w) => w.team === 0 && w.alive && !w.gone);
    const b = this.worms.some((w) => w.team === 1 && w.alive && !w.gone);
    if (a && b) return false;
    this.winner = !a && !b ? 2 : a ? 0 : 1;
    this.phase = 'over';
    wsfx.stopLoops();
    if (this.winner === 0 && !this.settings.aiVsAi) {
      this.wins++;
      setBest(GAME_ID, this.wins);
      wsfx.win();
    } else if (this.winner === 1) wsfx.lose();
    this.emit();
    return true;
  }

  togglePause() {
    if (this.phase === 'ready' || this.phase === 'over') return;
    this.paused = !this.paused;
    if (this.paused) wsfx.stopLoops();
    this.emit();
  }

  // ---- input ----------------------------------------------------------------
  keyDown(code: string) {
    if (code === 'Escape' || code === 'KeyP') return this.togglePause();
    if (!this.humanTurn || this.paused) return;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.ctrl.left = true; return;
      case 'ArrowRight': case 'KeyD': this.ctrl.right = true; return;
      case 'ArrowUp': case 'KeyW': this.ctrl.up = true; return;
      case 'ArrowDown': case 'KeyS': this.ctrl.down = true; return;
      case 'Space': return this.fireDown();
      case 'Enter': return this.jump();
      case 'Backspace': return this.backflip();
      case 'KeyQ': return this.cycleWeapon(-1);
      case 'KeyE': return this.cycleWeapon(1);
    }
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    if (m) {
      const idx = m[1] === '0' ? 9 : Number(m[1]) - 1;
      if (WEAPONS[idx]) this.selectWeapon(WEAPONS[idx].id);
    }
  }

  keyUp(code: string) {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.ctrl.left = false; break;
      case 'ArrowRight': case 'KeyD': this.ctrl.right = false; break;
      case 'ArrowUp': case 'KeyW': this.ctrl.up = false; break;
      case 'ArrowDown': case 'KeyS': this.ctrl.down = false; break;
      case 'Space': if (this.humanTurn) this.fireUp(); break;
    }
  }

  clearKeys() {
    this.ctrl.left = this.ctrl.right = this.ctrl.up = this.ctrl.down = false;
    if (this.charging && this.humanTurn) this.fireUp();
  }

  setMouse(x: number, y: number) {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  /** Mouse click on the map (art-pixel coordinates). */
  click(x: number, y: number) {
    if (!this.humanTurn || this.paused) return;
    this.clickAt(x, y);
  }

  clickAt(x: number, y: number) {
    const w = this.cw;
    if (!w || this.phase !== 'turn') return;
    const def = WEAPON_BY_ID[this.weapon];
    if (def.kind === 'click') {
      if (!this.canUse(this.weapon)) return void wsfx.nope();
      if (this.weapon === 'airstrike') this.airstrike(x);
      else this.teleportTo(x, y);
      return;
    }
    // otherwise: aim toward the click
    const dx = x - w.x, dy = w.y - 3 - y;
    if (Math.abs(dx) > 2) w.face = dx >= 0 ? 1 : -1;
    w.aim = clamp((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI, -85, 85);
  }

  hasAmmo(id: WeaponId) {
    return this.ammo[this.turnTeam][id] > 0;
  }
  canUse(id: WeaponId) {
    return this.hasAmmo(id) && !(this.fired && WEAPON_BY_ID[id].attack);
  }

  selectWeapon(id: WeaponId) {
    if (this.phase !== 'turn' || !this.cw) return;
    if (!this.hasAmmo(id)) return void wsfx.nope();
    if (this.charging) { this.charging = false; this.charge = 0; }
    if (id !== 'jetpack') this.stopJet();
    this.weapon = id;
    wsfx.select();
    this.emit();
  }

  cycleWeapon(dir: number) {
    const i = WEAPONS.findIndex((w) => w.id === this.weapon);
    for (let k = 1; k <= WEAPONS.length; k++) {
      const w = WEAPONS[(i + dir * k + WEAPONS.length * 4) % WEAPONS.length];
      if (this.hasAmmo(w.id)) return this.selectWeapon(w.id);
    }
  }

  jump() {
    const w = this.cw;
    if (!w || this.phase !== 'turn') return;
    if (this.rope.state === 'attached') {
      this.rope.state = 'none';
      wsfx.ropeRelease();
      w.vy -= 60;
      return;
    }
    if (!w.grounded || this.charging || this.drill.t > 0) return;
    w.vy = -150;
    w.vx = w.face * 70;
    w.grounded = false;
    wsfx.jump();
  }

  backflip() {
    const w = this.cw;
    if (!w || this.phase !== 'turn' || !w.grounded || this.charging || this.drill.t > 0) return;
    w.vy = -195;
    w.vx = -w.face * 42;
    w.grounded = false;
    wsfx.backflip();
  }

  faceTo(dir: 1 | -1) {
    if (this.cw) this.cw.face = dir;
  }

  // ---- firing ---------------------------------------------------------------
  fireDown() {
    const w = this.cw;
    if (!w || this.phase !== 'turn') return;
    const def = WEAPON_BY_ID[this.weapon];
    if (!this.canUse(this.weapon)) return void wsfx.nope();
    if (def.kind === 'charge') {
      if (this.rope.state === 'attached' || this.drill.t > 0) return;
      this.charging = true;
      this.charge = 0;
    } else if (def.kind === 'instant' || def.kind === 'tool') {
      this.fireNow(1);
    } else if (def.kind === 'click') {
      this.clickAt(this.mouse.x, this.mouse.y);
    }
  }

  fireUp() {
    if (!this.charging) return;
    this.charging = false;
    const p = Math.max(0.12, this.charge);
    this.charge = 0;
    this.fireNow(p);
  }

  private muzzle(w: Worm) {
    const a = (w.aim * Math.PI) / 180;
    const dx = w.face * Math.cos(a), dy = -Math.sin(a);
    return { dx, dy, x: w.x + dx * 6, y: w.y - 3 + dy * 6 };
  }

  private spend(id: WeaponId) {
    if (this.ammo[this.turnTeam][id] < INF) this.ammo[this.turnTeam][id]--;
  }

  private markFired() {
    this.fired = true;
    this.timer = Math.min(this.timer, RETREAT_TIME);
    this.lastTick = -1;
    this.banner = { text: 'RETREAT!', color: '#ffd23f', t: 1.2 };
    this.emit();
  }

  private newProj(kind: ProjKind, x: number, y: number, vx: number, vy: number, fuse = 0): Proj {
    const w = this.cw!;
    return { kind, x, y, vx, vy, fuse, age: 0, face: w.face, team: w.team, owner: w.id, rest: false, beep: 0, trail: 0, jump: 0 };
  }

  private fireNow(power: number) {
    const w = this.cw;
    if (!w) return;
    const m = this.muzzle(w);
    switch (this.weapon) {
      case 'bazooka': {
        const s = rocketSpeed(power);
        this.projs.push(this.newProj('rocket', m.x, m.y, m.dx * s, m.dy * s));
        wsfx.bazooka();
        this.spend('bazooka');
        this.markFired();
        break;
      }
      case 'grenade':
      case 'cluster': {
        const s = grenadeSpeed(power);
        const kind: ProjKind = this.weapon === 'cluster' ? 'cluster' : 'grenade';
        this.projs.push(this.newProj(kind, m.x, m.y, m.dx * s, m.dy * s, 3));
        wsfx.throw();
        wsfx.pin();
        this.spend(this.weapon);
        this.markFired();
        break;
      }
      case 'shotgun': {
        this.spend('shotgun');
        this.markFired();
        this.shootRay(w, 0, 28, 150, 3);
        this.later(0.55, () => { wsfx.shotgunReload(); });
        this.later(0.9, () => {
          if (w.alive && !w.gone) this.shootRay(w, 0, 28, 150, 3);
        });
        break;
      }
      case 'uzi': {
        this.spend('uzi');
        this.markFired();
        for (let i = 0; i < 12; i++) {
          this.later(i * 0.075, () => {
            if (w.alive && !w.gone) this.shootRay(w, rand(-2.5, 2.5), 6, 170, 1.5, true);
          });
        }
        break;
      }
      case 'dynamite': {
        const p = this.newProj('dynamite', w.x + w.face * 3, w.y - 4, w.face * 18, -30, 5);
        this.projs.push(p);
        wsfx.dynamite();
        wsfx.fuseOn();
        this.spend('dynamite');
        this.markFired();
        break;
      }
      case 'sheep': {
        const live = this.projs.find((p) => p.kind === 'sheep' && p.team === w.team);
        if (live) {
          live.fuse = 0; // second press detonates
          break;
        }
        this.projs.push(this.newProj('sheep', w.x + w.face * 4, w.y - 2, 0, 0, 6));
        wsfx.baa();
        this.spend('sheep');
        this.markFired();
        break;
      }
      case 'rope': {
        const s = 260;
        this.rope = { state: 'flying', hx: m.x, hy: m.y, vx: m.dx * s, vy: m.dy * s, len: 0, travel: 0 };
        wsfx.ropeShoot();
        break;
      }
      case 'jetpack': {
        if (this.jet.active) break;
        this.spend('jetpack');
        this.jet = { active: true, fuel: 100, thrust: false };
        this.rope.state = 'none';
        wsfx.jetOn();
        this.emit();
        break;
      }
      case 'drill': {
        if (this.drill.t > 0) break;
        this.spend('drill');
        this.drill = { t: 2.6, sound: 0 };
        wsfx.drillOn();
        this.emit();
        break;
      }
      default:
        break;
    }
  }

  private later(delay: number, fn: () => void) {
    this.queue.push({ at: this.clock + delay, fn });
  }

  /** Hitscan bullet: hits the first worm or terrain along the ray. */
  private shootRay(w: Worm, spread: number, dmg: number, range: number, crater: number, rapid = false) {
    const a = ((w.aim + spread) * Math.PI) / 180;
    const dx = w.face * Math.cos(a), dy = -Math.sin(a);
    const sx = w.x + dx * 5, sy = w.y - 3 + dy * 5;
    if (rapid) wsfx.uzi();
    else wsfx.shotgun();
    this.shake = Math.max(this.shake, rapid ? 0.6 : 2);
    let x = sx, y = sy, d = 0;
    let hit = false;
    while (d < range) {
      x += dx * 0.5; y += dy * 0.5; d += 0.5;
      if (x < 0 || x >= VW || y >= VH) break;
      const target = this.wormAt(x, y, w);
      if (target) {
        const fall = d < 60 ? 1 : 1 - (d - 60) / 140;
        this.hurtWorm(target, Math.max(2, Math.round(dmg * fall)));
        target.vx += dx * 70;
        target.vy += dy * 70 - 25;
        target.grounded = false;
        this.fx('spark', x, y, 6, 70, 0.3);
        hit = true;
        break;
      }
      if (this.terrain.isSolid(Math.round(x), Math.round(y))) {
        this.terrain.carve(x, y, crater);
        this.fx('dirt', x, y, 4, 50, 0.4);
        hit = true;
        break;
      }
    }
    this.tracers.push({ x0: sx, y0: sy, x1: x, y1: y, t: 0.07 });
    this.fx('spark', sx, sy, 2, 40, 0.15);
    void hit;
  }

  private wormAt(x: number, y: number, except?: Worm): Worm | null {
    for (const o of this.worms) {
      if (!o.alive || o.gone || o === except) continue;
      if (Math.abs(x - o.x) <= 3 && y >= o.y - 6 && y <= o.y + 1) return o;
    }
    return null;
  }

  private airstrike(tx: number) {
    this.spend('airstrike');
    this.markFired();
    this.marker = { x: tx, y: this.mouse.y, t: 2.2 };
    wsfx.siren();
    const w = this.cw!;
    for (let i = 0; i < 5; i++) {
      this.later(0.9 + i * 0.16, () => {
        const p: Proj = {
          kind: 'missile', x: tx + (i - 2) * 13 + rand(-3, 3), y: -10, vx: rand(-4, 4), vy: 70, fuse: 0, age: 0,
          face: 1, team: w.team, owner: w.id, rest: false, beep: 0, trail: 0, jump: 0,
        };
        this.projs.push(p);
        wsfx.whistle();
      });
    }
  }

  private teleportTo(x: number, y: number) {
    const w = this.cw!;
    const rx = Math.round(clamp(x, 4, VW - 5)), ry = Math.round(y);
    if (this.blocked(rx, ry) || ry > WATER_Y - 2 || ry < 8) {
      this.text(w.x, w.y - 12, 'NO ROOM', '#ff8a8a');
      return void wsfx.nope();
    }
    this.spend('teleport');
    this.fx('star', w.x, w.y - 3, 14, 60, 0.6);
    w.x = rx; w.y = ry; w.vx = w.vy = 0; w.grounded = false; w.fallV = 0;
    this.rope.state = 'none';
    this.fx('star', w.x, w.y - 3, 14, 60, 0.6);
    wsfx.teleport();
    this.emit();
  }

  // ---- worm physics ---------------------------------------------------------
  blocked(x: number, y: number): boolean {
    const T = this.terrain;
    for (let yy = y - 5; yy <= y; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (T.isSolid(xx, yy)) return true;
    return false;
  }
  onGround(x: number, y: number): boolean {
    const T = this.terrain;
    for (let xx = x - 2; xx <= x + 2; xx++) if (T.isSolid(xx, y + 1)) return true;
    return false;
  }

  private tryMoveX(w: Worm, dx: number): boolean {
    const nx = w.x + dx;
    const rx = Math.round(nx), ry = Math.round(w.y);
    if (!this.blocked(rx, ry)) { w.x = nx; return true; }
    for (let up = 1; up <= 3; up++) {
      if (!this.blocked(rx, ry - up)) { w.x = nx; w.y -= up; return true; }
    }
    return false;
  }

  private snapDown(w: Worm) {
    for (let i = 0; i < 3; i++) {
      const rx = Math.round(w.x), ry = Math.round(w.y);
      if (this.onGround(rx, ry) || this.blocked(rx, ry + 1)) break;
      w.y += 1;
    }
  }

  private moveWorm(w: Worm, dx: number, dy: number) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const sx = dx / steps;
    let sy = dy / steps;
    let sxx = sx;
    for (let i = 0; i < steps; i++) {
      if (sxx !== 0) {
        const nx = w.x + sxx;
        const rx = Math.round(nx), ry = Math.round(w.y);
        if (!this.blocked(rx, ry)) w.x = nx;
        else {
          let ok = false;
          for (let up = 1; up <= 2; up++) if (!this.blocked(rx, ry - up)) { w.x = nx; w.y -= up; ok = true; break; }
          if (!ok) { w.vx *= -0.3; sxx = 0; }
        }
      }
      if (sy !== 0) {
        const ny = w.y + sy;
        const rx = Math.round(w.x), ry = Math.round(ny);
        if (!this.blocked(rx, ry)) w.y = ny;
        else { w.vy = 0; sy = 0; }
      }
    }
  }

  private stepWorm(w: Worm, dt: number) {
    if (w.gone) return;
    w.hurtT = Math.max(0, w.hurtT - dt);
    w.shown += (w.hp - w.shown) * Math.min(1, dt * 6);
    const isCur = w === this.cw && this.phase === 'turn';
    const roped = isCur && this.rope.state === 'attached';
    const jetting = isCur && this.jet.active;
    // free a worm that got wedged into terrain
    for (let i = 0; i < 6 && this.blocked(Math.round(w.x), Math.round(w.y)); i++) w.y -= 1;
    const rx = Math.round(w.x), ry = Math.round(w.y);
    if (this.onGround(rx, ry) && !roped && !jetting && w.vy >= -1) {
      if (!w.grounded) this.landed(w);
      w.grounded = true;
      w.vy = 0;
      if (Math.abs(w.vx) > 3) {
        if (!this.tryMoveX(w, w.vx * dt)) w.vx = 0;
        w.vx *= Math.exp(-dt * 6);
        this.snapDown(w);
      } else w.vx = 0;
    } else {
      w.grounded = false;
      w.vy = Math.min(w.vy + GRAVITY * dt, 320);
      if (jetting) this.jetThrust(w, dt);
      if (roped) this.ropeSwing(w, dt);
      w.fallV = Math.max(w.fallV, w.vy);
      this.moveWorm(w, w.vx * dt, w.vy * dt);
      if (roped) this.ropeConstrain(w);
    }
    w.x = clamp(w.x, 3, VW - 4);
    if (w.y > WATER_Y) this.drown(w);
    else if (w.y < -40) w.y = -40;
  }

  private landed(w: Worm) {
    const v = w.fallV;
    w.fallV = 0;
    if (v > 120) wsfx.land();
    if (v > 175 && w.alive && !(w === this.cw && this.jet.active)) {
      this.hurtWorm(w, Math.round((v - 175) * 0.12) + 1);
    }
  }

  private drown(w: Worm) {
    if (w.gone) return;
    w.gone = true;
    if (w.alive) {
      w.alive = false;
      w.hp = 0;
      this.text(w.x, WATER_Y - 6, `${w.name} SWAM!`, '#9fd0ff');
    }
    this.fx('splash', w.x, WATER_Y, 22, 90, 0.9);
    wsfx.splash();
    if (w === this.cw && this.phase === 'turn') this.endTurn();
  }

  hurtWorm(w: Worm, dmg: number) {
    if (!w.alive || dmg <= 0) return;
    w.hp = Math.max(0, w.hp - dmg);
    w.hurtT = 0.4;
    this.text(w.x, w.y - 12, `-${dmg}`, '#ffffff');
    if (w.hp <= 0) this.killWorm(w);
    else wsfx.hurt();
  }

  private killWorm(w: Worm) {
    w.alive = false;
    w.hp = 0;
    this.fx('smoke', w.x, w.y - 3, 10, 40, 0.8);
    this.fx('spark', w.x, w.y - 3, 8, 70, 0.4);
    wsfx.die();
    this.text(w.x, w.y - 18, `${w.name} DIED`, '#ff8a8a');
    if (w === this.cw && this.phase === 'turn') {
      this.stopJet();
      this.stopDrill();
      this.endTurn();
    }
  }

  // ---- rope / jetpack / drill -------------------------------------------------
  private ropeSwing(w: Worm, dt: number) {
    if (this.ctrl.left) w.vx -= 150 * dt;
    if (this.ctrl.right) w.vx += 150 * dt;
  }

  private ropeConstrain(w: Worm) {
    const r = this.rope;
    const cx = w.x, cy = w.y - 3;
    const dx = cx - r.hx, dy = cy - r.hy;
    const d = Math.hypot(dx, dy) || 1;
    if (d > r.len) {
      const nx = dx / d, ny = dy / d;
      const tx = r.hx + nx * r.len, ty = r.hy + ny * r.len;
      this.moveWorm(w, tx - cx, ty - cy);
      const vr = w.vx * nx + w.vy * ny;
      if (vr > 0) { w.vx -= vr * nx; w.vy -= vr * ny; }
    }
  }

  private jetThrust(w: Worm, dt: number) {
    const j = this.jet;
    let thrust = false;
    if (j.fuel > 0) {
      if (this.ctrl.up) { w.vy = Math.max(-105, w.vy - 440 * dt); thrust = true; }
      if (this.ctrl.left) { w.vx = Math.max(-95, w.vx - 240 * dt); w.face = -1; thrust = true; }
      if (this.ctrl.right) { w.vx = Math.min(95, w.vx + 240 * dt); w.face = 1; thrust = true; }
    }
    if (thrust) {
      j.fuel -= 40 * dt;
      if (Math.random() < 0.9) this.fx('flame', w.x - w.face * 3, w.y - 1, 1, 50, 0.3);
    }
    if (j.thrust !== thrust) wsfx.jetSet(thrust);
    j.thrust = thrust;
    if (j.fuel <= 0) {
      this.stopJet();
      this.text(w.x, w.y - 12, 'OUT OF FUEL', '#ffb36b');
    }
  }

  private stopJet() {
    if (this.jet.active) wsfx.jetOff();
    this.jet.active = false;
  }

  private stopDrill() {
    if (this.drill.t > 0) wsfx.drillOff();
    this.drill.t = 0;
  }

  private updateRopeHook(dt: number) {
    const r = this.rope;
    const w = this.cw;
    if (r.state !== 'flying' || !w) return;
    const steps = Math.ceil((Math.hypot(r.vx, r.vy) * dt) / 0.8);
    for (let i = 0; i < steps; i++) {
      r.hx += (r.vx * dt) / steps;
      r.hy += (r.vy * dt) / steps;
      r.travel += (Math.hypot(r.vx, r.vy) * dt) / steps;
      if (this.terrain.isSolid(Math.round(r.hx), Math.round(r.hy))) {
        r.state = 'attached';
        r.len = Math.max(8, Math.hypot(w.x - r.hx, w.y - 3 - r.hy));
        wsfx.ropeHit();
        return;
      }
      if (r.travel > 130 || r.hx < 0 || r.hx > VW || r.hy < -30) {
        r.state = 'none';
        return;
      }
    }
  }

  private updateDrill(dt: number) {
    const w = this.cw;
    if (this.drill.t <= 0 || !w || this.phase !== 'turn') return;
    this.drill.t -= dt;
    const a = (w.aim * Math.PI) / 180;
    const dx = w.face * Math.cos(a), dy = -Math.sin(a);
    const sp = 24;
    // dig ahead of the worm, then follow into the tunnel
    this.terrain.tunnel(w.x + dx * 5, w.y - 3 + dy * 5, 3);
    this.terrain.tunnel(w.x + dx * 2, w.y - 3 + dy * 2, 3);
    w.x += dx * sp * dt;
    w.y += dy * sp * dt;
    w.grounded = false;
    w.vy = 0;
    w.vx = 0;
    this.drill.sound += dt;
    if (this.drill.sound > 0.05) {
      this.drill.sound = 0;
      this.fx('dirt', w.x + dx * 6, w.y - 3 + dy * 6, 2, 60, 0.4);
      wsfx.drillSet(90 + Math.random() * 30);
    }
    if (this.drill.t <= 0) this.stopDrill();
  }

  // ---- projectiles ------------------------------------------------------------
  private normalAt(x: number, y: number) {
    let nx = 0, ny = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (!this.terrain.isSolid(x + dx, y + dy)) { nx += dx; ny += dy; }
      }
    }
    const l = Math.hypot(nx, ny);
    return l < 0.001 ? { x: 0, y: -1 } : { x: nx / l, y: ny / l };
  }

  /** Move a projectile; bounce<0 means "explode on contact". Returns what it hit. */
  private moveProj(p: Proj, dt: number, bounce: number): 'none' | 'hit' | 'water' | 'out' | 'bounced' {
    const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 0.8));
    const sx = (p.vx * dt) / steps, sy = (p.vy * dt) / steps;
    for (let i = 0; i < steps; i++) {
      const nx = p.x + sx, ny = p.y + sy;
      if (this.terrain.isSolid(Math.round(nx), Math.round(ny))) {
        if (bounce < 0) { p.x = nx; p.y = ny; return 'hit'; }
        const n = this.normalAt(Math.round(nx), Math.round(ny));
        const dot = p.vx * n.x + p.vy * n.y;
        if (dot < 0) {
          p.vx -= (1 + bounce) * dot * n.x;
          p.vy -= (1 + bounce) * dot * n.y;
          p.vx *= 0.9;
          p.vy *= 0.9;
        }
        if (Math.hypot(p.vx, p.vy) < 16 && n.y < -0.4) { p.vx = 0; p.vy = 0; p.rest = true; }
        return 'bounced';
      }
      p.x = nx;
      p.y = ny;
      if (p.y > WATER_Y) return 'water';
      if (p.x < -30 || p.x > VW + 30 || p.y > VH + 30) return 'out';
    }
    return 'none';
  }

  private projHitsWorm(p: Proj): Worm | null {
    for (const o of this.worms) {
      if (!o.alive || o.gone) continue;
      if (o.id === p.owner && p.age < 0.25) continue;
      if (Math.abs(p.x - o.x) <= 4 && p.y >= o.y - 7 && p.y <= o.y + 1) return o;
    }
    return null;
  }

  /** Simulates a shot without side effects (used by the AI). */
  simShot(kind: 'rocket' | 'grenade', x: number, y: number, vx: number, vy: number, wind: number, owner: number) {
    const p: Proj = { kind, x, y, vx, vy, fuse: 3, age: 0, face: 1, team: 0, owner, rest: false, beep: 0, trail: 0, jump: 0 };
    const dt = 1 / 60;
    let t = 0;
    while (t < 6) {
      t += dt;
      p.age += dt;
      if (kind === 'rocket') {
        p.vx += wind * dt;
        p.vy += ROCKET_G * dt;
        const r = this.moveProj(p, dt, -1);
        if (r === 'hit') return { x: p.x, y: p.y, hit: 'terrain' as const };
        if (r === 'water' || r === 'out') return { x: p.x, y: p.y, hit: r };
        const o = this.projHitsWorm(p);
        if (o) return { x: p.x, y: p.y, hit: 'worm' as const };
      } else {
        p.vy += 260 * dt;
        const r = this.moveProj(p, dt, 0.45);
        if (r === 'water' || r === 'out') return { x: p.x, y: p.y, hit: r };
        p.fuse -= dt;
        if (p.fuse <= 0) return { x: p.x, y: p.y, hit: 'terrain' as const };
      }
    }
    return { x: p.x, y: p.y, hit: 'terrain' as const };
  }

  private updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.age += dt;
      let boom = false;
      let gone = false;
      switch (p.kind) {
        case 'rocket': {
          p.vx += this.wind * dt;
          p.vy += ROCKET_G * dt;
          const r = this.moveProj(p, dt, -1);
          p.trail -= dt;
          if (p.trail <= 0) { p.trail = 0.025; this.fx('smoke', p.x, p.y, 1, 8, 0.5); if (Math.random() < 0.5) this.fx('fire', p.x, p.y, 1, 14, 0.25); }
          if (r === 'hit' || this.projHitsWorm(p)) boom = true;
          else if (r === 'water') { this.fx('splash', p.x, WATER_Y, 12, 70, 0.7); wsfx.splash(); gone = true; }
          else if (r === 'out') gone = true;
          break;
        }
        case 'missile': {
          p.vy = Math.min(p.vy + 140 * dt, 210);
          const r = this.moveProj(p, dt, -1);
          p.trail -= dt;
          if (p.trail <= 0) { p.trail = 0.03; this.fx('smoke', p.x, p.y - 2, 1, 6, 0.4); }
          if (r === 'hit' || this.projHitsWorm(p)) boom = true;
          else if (r === 'water') { this.fx('splash', p.x, WATER_Y, 10, 60, 0.6); gone = true; }
          else if (r === 'out') gone = true;
          break;
        }
        case 'grenade':
        case 'cluster':
        case 'bomblet': {
          if (!p.rest) {
            p.vy += GRAVITY * dt;
            const r = this.moveProj(p, dt, 0.45);
            if (r === 'bounced' && Math.hypot(p.vx, p.vy) > 22) wsfx.bounce();
            if (r === 'water') { this.fx('splash', p.x, WATER_Y, 10, 60, 0.6); wsfx.splash(); gone = true; }
            else if (r === 'out') gone = true;
          } else if (!this.terrain.isSolid(Math.round(p.x), Math.round(p.y) + 1)) p.rest = false;
          const before = Math.ceil(p.fuse);
          p.fuse -= dt;
          if (p.kind !== 'bomblet' && Math.ceil(p.fuse) !== before && p.fuse > 0) wsfx.beep();
          if (p.fuse <= 0) boom = true;
          break;
        }
        case 'dynamite': {
          if (!p.rest) {
            p.vy += GRAVITY * dt;
            const r = this.moveProj(p, dt, 0.2);
            p.vx *= 0.99;
            if (r === 'water') { wsfx.fuseOff(); gone = true; }
          }
          p.fuse -= dt;
          p.trail -= dt;
          if (p.trail <= 0) { p.trail = 0.06; this.fx('spark', p.x, p.y - 4, 1, 30, 0.3); }
          if (p.fuse <= 0) boom = true;
          break;
        }
        case 'sheep': {
          this.stepSheep(p, dt);
          p.fuse -= dt;
          p.beep -= dt;
          if (p.beep <= 0) { p.beep = 1.1; wsfx.baaShort(); }
          if (p.y > WATER_Y) { this.fx('splash', p.x, WATER_Y, 12, 70, 0.7); wsfx.splash(); gone = true; }
          if (p.fuse <= 0) boom = true;
          break;
        }
      }
      if (boom) {
        this.detonate(p);
        this.projs.splice(i, 1);
      } else if (gone) this.projs.splice(i, 1);
    }
    if (!this.projs.some((q) => q.kind === 'dynamite')) wsfx.fuseOff();
  }

  private stepSheep(p: Proj, dt: number) {
    const T = this.terrain;
    const rx = Math.round(p.x), ry = Math.round(p.y);
    const grounded = p.vy >= 0 && T.isSolid(rx, ry + 1);
    if (grounded) {
      p.vy = 0;
      const ahead = rx + p.face * 3;
      // find how far up we must go to clear the obstacle ahead (up to 4px), otherwise hop
      let climb = -1;
      for (let up = 0; up <= 4; up++) {
        if (!T.isSolid(ahead, ry - up) && !T.isSolid(ahead, ry - up - 1)) { climb = up; break; }
      }
      if (climb < 0) {
        p.vy = -105;
        p.y -= 1;
      } else {
        p.x += p.face * 30 * dt;
        p.y -= climb;
      }
    } else {
      p.vy = Math.min(p.vy + GRAVITY * dt, 300);
      p.y += p.vy * dt;
      if (!T.isSolid(Math.round(p.x + p.face * 3), Math.round(p.y))) p.x += p.face * 26 * dt;
    }
    // sheep blow up when they touch an enemy
    for (const o of this.worms) {
      if (o.alive && !o.gone && o.team !== p.team && Math.abs(p.x - o.x) < 6 && Math.abs(p.y - o.y) < 7) p.fuse = Math.min(p.fuse, 0.15);
    }
  }

  private detonate(p: Proj) {
    if (p.kind === 'dynamite') wsfx.fuseOff();
    const e = EXPL[p.kind];
    this.explode(p.x, p.y, e.r, e.dmg, e.force);
    if (p.kind === 'cluster') {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55 + rand(-0.15, 0.15);
        const s = rand(55, 100);
        const b: Proj = {
          kind: 'bomblet', x: p.x, y: p.y - 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, fuse: rand(1.0, 1.7), age: 0,
          face: 1, team: p.team, owner: p.owner, rest: false, beep: 0, trail: 0, jump: 0,
        };
        this.projs.push(b);
      }
      wsfx.pop();
    }
  }

  explode(x: number, y: number, r: number, dmg: number, force: number) {
    this.terrain.carve(x, y, r);
    this.blasts.push({ x, y, r, t: 0, max: 0.3 });
    this.shake = Math.max(this.shake, Math.min(5, r * 0.28));
    const size = Math.min(1, r / 24);
    wsfx.boom(size);
    this.fx('fire', x, y, Math.round(8 + r), 60 + r * 3, 0.5);
    this.fx('smoke', x, y, Math.round(6 + r * 0.6), 40, 1.1);
    this.fx('dirt', x, y, Math.round(10 + r * 1.5), 110, 0.9);
    this.fx('spark', x, y, 8, 120, 0.5);
    for (const w of this.worms) {
      if (!w.alive || w.gone) continue;
      const cx = w.x, cy = w.y - 3;
      const d = Math.hypot(cx - x, cy - y);
      if (d > r + 6) continue;
      const k = 1 - d / (r + 6);
      const nx = d < 0.01 ? 0 : (cx - x) / d, ny = d < 0.01 ? -1 : (cy - y) / d;
      w.vx += nx * force * k;
      w.vy += ny * force * k - 40 * k;
      w.grounded = false;
      w.fallV = 0;
      this.hurtWorm(w, Math.max(1, Math.round(dmg * k)));
    }
    // blasts shove loose bombs around too
    for (const p of this.projs) {
      if (p.kind === 'grenade' || p.kind === 'bomblet' || p.kind === 'cluster' || p.kind === 'dynamite') {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < r + 8 && d > 0.01) {
          p.vx += ((p.x - x) / d) * force * 0.6;
          p.vy += ((p.y - y) / d) * force * 0.6 - 30;
          p.rest = false;
        }
      }
    }
  }

  // ---- effects -------------------------------------------------------------
  private pIdx = 0;
  fx(kind: ParticleKind, x: number, y: number, n: number, speed: number, life: number) {
    for (let i = 0; i < n; i++) {
      let p: Particle | null = null;
      for (let k = 0; k < this.particles.length; k++) {
        const q = this.particles[(this.pIdx + k) % this.particles.length];
        if (!q.on) { p = q; this.pIdx = (this.pIdx + k + 1) % this.particles.length; break; }
      }
      if (!p) return;
      const a = rand(0, Math.PI * 2);
      const s = rand(0.2, 1) * speed;
      p.on = true;
      p.kind = kind;
      p.x = x + rand(-1, 1);
      p.y = y + rand(-1, 1);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = p.life = life * rand(0.6, 1.2);
      p.size = kind === 'smoke' ? rand(2, 4) : kind === 'dirt' ? rand(1, 2) : 1;
      p.g = kind === 'dirt' ? 220 : kind === 'splash' ? 200 : kind === 'smoke' ? -14 : kind === 'flame' ? 40 : kind === 'spark' ? 120 : 0;
      p.hue = Math.random();
      if (kind === 'splash') p.vy = -Math.abs(p.vy) - 30;
      if (kind === 'flame') { p.vx = rand(-12, 12); p.vy = rand(40, 80); }
      if (kind === 'dirt') p.vy -= 30;
    }
  }

  text(x: number, y: number, text: string, color: string) {
    this.popups.push({ x, y, t: 1.2, text, color });
    if (this.popups.length > 24) this.popups.shift();
  }

  private updateFx(dt: number) {
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.2;
      if (p.kind === 'dirt' && this.terrain.isSolid(Math.round(p.x), Math.round(p.y))) p.on = false;
      if (p.kind === 'splash' && p.y > WATER_Y + 1 && p.vy > 0) p.on = false;
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t += dt;
      if (this.blasts[i].t > this.blasts[i].max) this.blasts.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].t -= dt;
      if (this.tracers[i].t <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].t -= dt;
      this.popups[i].y -= dt * 14;
      if (this.popups[i].t <= 0) this.popups.splice(i, 1);
    }
    if (this.marker) {
      this.marker.t -= dt;
      if (this.marker.t <= 0) this.marker = null;
    }
    this.banner.t = Math.max(0, this.banner.t - dt);
    this.shake *= Math.pow(0.002, dt);
    if (this.shake < 0.15) this.shake = 0;
  }

  // ---- simulation ------------------------------------------------------------
  update(dt: number) {
    if (this.paused) return;
    this.clock += dt;
    this.updateFx(dt);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].at <= this.clock) {
        const q = this.queue.splice(i, 1)[0];
        q.fn();
      }
    }
    if (this.phase !== 'ready') {
      for (const w of this.worms) this.stepWorm(w, dt);
      this.updateProjs(dt);
      this.updateRopeHook(dt);
      this.updateDrill(dt);
    }
    if (this.phase === 'turn') this.updateTurn(dt);
    else if (this.phase === 'resolve') this.updateResolve(dt);
    this.terrain.upload();
  }

  private updateTurn(dt: number) {
    const w = this.cw;
    if (!w || !w.alive || w.gone) return void this.endTurn();
    this.timer -= dt;
    const sec = Math.ceil(this.timer);
    if (this.timer <= 5 && this.timer > 0 && sec !== this.lastTick) {
      this.lastTick = sec;
      wsfx.tick();
    }
    if (this.isAI(w.team)) this.ai.update(dt, this);
    this.applyControls(w, dt);
    if (this.charging) {
      this.charge = Math.min(1, this.charge + dt / 1.5);
      if (this.charge >= 1) this.fireUp();
    }
    if (this.timer <= 0) this.endTurn();
  }

  private applyControls(w: Worm, dt: number) {
    const c = this.ctrl;
    const roped = this.rope.state === 'attached';
    const jet = this.jet.active;
    w.walking = false;
    if (!roped && !jet) {
      if (c.up) w.aim = Math.min(85, w.aim + 60 * dt);
      if (c.down) w.aim = Math.max(-85, w.aim - 60 * dt);
    } else if (roped) {
      if (c.up) this.rope.len = Math.max(8, this.rope.len - 38 * dt);
      if (c.down) this.rope.len = Math.min(140, this.rope.len + 38 * dt);
    }
    if (w.grounded && !roped && !jet && !this.charging && this.drill.t <= 0 && (c.left || c.right)) {
      const dir: 1 | -1 = c.right && !c.left ? 1 : -1;
      if (c.left !== c.right) {
        w.face = dir;
        if (this.tryMoveX(w, dir * WALK_SPEED * dt)) {
          w.walking = true;
          w.walkT += dt;
          this.snapDown(w);
          this.stepSound -= dt;
          if (this.stepSound <= 0) { this.stepSound = 0.17; wsfx.step(); }
        }
      }
    }
  }

  private calm(): boolean {
    if (this.projs.length > 0 || this.queue.length > 0 || this.drill.t > 0) return false;
    return this.worms.every((w) => w.gone || (w.grounded && Math.abs(w.vx) < 3));
  }

  private updateResolve(dt: number) {
    this.resolveT += dt;
    this.calmT = this.calm() ? this.calmT + dt : 0;
    if (this.calmT > 0.8 || this.resolveT > 14) {
      if (this.checkWin()) return;
      this.beginTurn(this.turnTeam === 0 ? 1 : 0);
    }
  }

  // ---- AI helpers ------------------------------------------------------------
  /** True if there is clear air between two points (terrain doesn't block). */
  lineClear(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(d / 1.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.terrain.isSolid(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t))) return false;
    }
    return true;
  }

  get enemies(): Worm[] {
    const t = this.cw?.team ?? 0;
    return this.worms.filter((w) => w.team !== t && w.alive && !w.gone);
  }
}
