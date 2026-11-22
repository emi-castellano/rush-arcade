import type { Worm, WormEngine } from './engine';
import { DIFFICULTY, VW, type WeaponId } from './config';

type Stage = 'idle' | 'think' | 'move' | 'aim' | 'charge' | 'retreat';

interface Plan {
  weapon: WeaponId;
  face: 1 | -1;
  aim: number;
  power: number;
  score: number;
  click?: { x: number; y: number };
  moveTo?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => Math.random() + Math.random() + Math.random() - 1.5; // roughly -1.5..1.5
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Computer opponent: plans a shot by simulating the physics, then plays it out visibly like a player. */
export class WormAI {
  active = false;
  private stage: Stage = 'idle';
  private t = 0;
  private plan: Plan | null = null;
  private replans = 0;
  private moveT = 0;
  private stuckT = 0;
  private lastX = 0;
  private selected = false;
  private retreatDir: 1 | -1 = 1;
  private hopT = 0;

  startTurn(e: WormEngine) {
    const d = DIFFICULTY[e.settings.difficulty];
    this.active = true;
    this.stage = 'think';
    this.t = d.think * rand(0.7, 1.3);
    this.plan = null;
    this.replans = 0;
    this.selected = false;
  }

  update(dt: number, e: WormEngine) {
    const w = e.cw;
    if (!w || !this.active) return;
    e.ctrl.left = e.ctrl.right = e.ctrl.up = e.ctrl.down = false;
    switch (this.stage) {
      case 'think':
        this.t -= dt;
        if (this.t <= 0) this.decide(e, w);
        break;
      case 'move':
        this.doMove(dt, e, w);
        break;
      case 'aim':
        this.doAim(dt, e, w);
        break;
      case 'charge':
        this.doCharge(e);
        break;
      case 'retreat':
        this.doRetreat(dt, e, w);
        break;
      default:
        break;
    }
  }

  // ---- decisions -----------------------------------------------------------
  private decide(e: WormEngine, w: Worm) {
    const plan = this.makePlan(e, w);
    this.plan = plan;
    if (plan.moveTo !== undefined && Math.abs(w.x - plan.moveTo) > 3) {
      this.stage = 'move';
      this.moveT = 0;
      this.stuckT = 0;
      this.lastX = w.x;
    } else {
      this.beginAim();
    }
  }

  private beginAim() {
    this.stage = 'aim';
    this.selected = false;
  }

  private doMove(dt: number, e: WormEngine, w: Worm) {
    const plan = this.plan!;
    const target = plan.moveTo!;
    const dir: 1 | -1 = target > w.x ? 1 : -1;
    this.moveT += dt;
    if (Math.abs(w.x - target) <= 3 || this.moveT > 6 || !this.safeAhead(e, w, dir)) {
      // arrived (or can't go on): look again from here
      this.replans++;
      this.stage = 'think';
      this.t = 0.25;
      return;
    }
    if (dir > 0) e.ctrl.right = true;
    else e.ctrl.left = true;
    // hop over obstacles
    if (Math.abs(w.x - this.lastX) < 0.01) this.stuckT += dt;
    else this.stuckT = 0;
    this.lastX = w.x;
    if (this.stuckT > 0.35 && w.grounded) {
      e.jump();
      this.stuckT = 0;
    }
  }

  private doAim(dt: number, e: WormEngine, w: Worm) {
    const plan = this.plan!;
    if (!this.selected) {
      e.selectWeapon(plan.weapon);
      e.faceTo(plan.face);
      this.selected = true;
    }
    if (plan.click) {
      this.t += dt;
      e.setMouse(plan.click.x, plan.click.y);
      if (this.t > 0.5) {
        this.t = 0;
        e.clickAt(plan.click.x, plan.click.y);
        this.beginRetreat(e, w);
      }
      return;
    }
    const diff = plan.aim - w.aim;
    const step = 75 * dt;
    if (Math.abs(diff) > step) w.aim += Math.sign(diff) * step;
    else {
      w.aim = plan.aim;
      this.t += dt;
      if (this.t > 0.25) {
        this.t = 0;
        const kind = e.weapon;
        if (kind === 'bazooka' || kind === 'grenade' || kind === 'cluster') {
          e.fireDown();
          this.stage = 'charge';
        } else {
          e.fireDown();
          this.beginRetreat(e, w);
        }
      }
    }
  }

  private doCharge(e: WormEngine) {
    const plan = this.plan!;
    if (!e.charging) {
      // something interrupted charging (e.g. fired at full power)
      if (e.fired) this.stage = 'retreat';
      return;
    }
    if (e.charge >= plan.power) {
      e.fireUp();
      const w = e.cw!;
      this.beginRetreat(e, w);
    }
  }

  private beginRetreat(e: WormEngine, w: Worm) {
    const plan = this.plan;
    this.stage = 'retreat';
    this.retreatDir = plan ? (plan.face === 1 ? -1 : 1) : 1;
    if (!this.safeAhead(e, w, this.retreatDir)) this.retreatDir = this.retreatDir === 1 ? -1 : 1;
    this.stuckT = 0;
    this.lastX = w.x;
    this.hopT = 0;
  }

  private doRetreat(dt: number, e: WormEngine, w: Worm) {
    // blast-throwing weapons: get away; bullets: it doesn't matter
    const dir = this.retreatDir;
    if (!this.safeAhead(e, w, dir)) return;
    if (dir > 0) e.ctrl.right = true;
    else e.ctrl.left = true;
    if (Math.abs(w.x - this.lastX) < 0.01) this.stuckT += dt;
    else this.stuckT = 0;
    this.lastX = w.x;
    if (this.stuckT > 0.3 && w.grounded) {
      e.jump();
      this.stuckT = 0;
    }
    void this.hopT;
  }

  /** Is there ground (not a lake) a few pixels ahead? */
  private safeAhead(e: WormEngine, w: Worm, dir: 1 | -1): boolean {
    const x = Math.round(w.x + dir * 6);
    if (x < 6 || x > VW - 6) return false;
    for (let y = Math.round(w.y) - 4; y < Math.round(w.y) + 12; y++) if (e.terrain.isSolid(x, y)) return true;
    return false;
  }

  // ---- planning ------------------------------------------------------------
  private makePlan(e: WormEngine, w: Worm): Plan {
    const d = DIFFICULTY[e.settings.difficulty];
    const enemies = e.enemies;
    const mx = w.x, my = w.y - 3;
    const cands: Plan[] = [];
    if (enemies.length === 0) return { weapon: 'bazooka', face: w.face, aim: 30, power: 0.5, score: 0 };
    const near = [...enemies].sort((a, b) => dist(a.x, a.y, mx, my) - dist(b.x, b.y, mx, my));
    const noise = (deg: number) => gauss() * deg * 0.7;

    // 1) hitscan weapons at clear targets
    for (const t of near.slice(0, 3)) {
      const tx = t.x, ty = t.y - 3;
      const dx = tx - mx, dy = ty - my;
      const dd = Math.hypot(dx, dy);
      const face: 1 | -1 = dx >= 0 ? 1 : -1;
      if (dd < 140 && e.lineClear(mx + face * 4, my - 1, tx, ty)) {
        const aim = clamp((Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI, -85, 85);
        if (e.hasAmmo('shotgun')) cands.push({ weapon: 'shotgun', face, aim: aim + noise(d.aimErr * 0.5), power: 1, score: 62 - dd * 0.25 + (100 - t.hp) * 0.1 });
        if (e.hasAmmo('uzi')) cands.push({ weapon: 'uzi', face, aim: aim + noise(d.aimErr * 0.4), power: 1, score: 50 - dd * 0.15 });
      }
      // dynamite for adjacent targets
      if (Math.abs(dx) < 15 && Math.abs(dy) < 12 && e.hasAmmo('dynamite')) {
        cands.push({ weapon: 'dynamite', face, aim: 10, power: 1, score: 56 });
      }
      // sheep along flat ground
      if (Math.abs(dy) < 20 && Math.abs(dx) > 22 && Math.abs(dx) < 150 && e.hasAmmo('sheep') && this.groundRun(e, w, face, Math.abs(dx))) {
        cands.push({ weapon: 'sheep', face, aim: 0, power: 1, score: 42 });
      }
      // air strike
      if (e.hasAmmo('airstrike') && Math.abs(dx) > 34) {
        const clear = this.skyClear(e, tx);
        cands.push({
          weapon: 'airstrike', face, aim: 0, power: 1, score: clear ? 44 : 30,
          click: { x: tx + gauss() * d.aimErr * 2, y: ty - 40 },
        });
      }
    }

    // 2) bazooka / grenade / cluster by simulating the physics
    const sims: { weapon: WeaponId; kind: 'rocket' | 'grenade'; ammo: boolean; base: number; k: number; selfSafe: number }[] = [
      { weapon: 'bazooka', kind: 'rocket', ammo: true, base: 54, k: 2.2, selfSafe: 24 },
      { weapon: 'grenade', kind: 'grenade', ammo: e.hasAmmo('grenade'), base: 46, k: 1.9, selfSafe: 20 },
      { weapon: 'cluster', kind: 'grenade', ammo: e.hasAmmo('cluster'), base: 48, k: 1.5, selfSafe: 24 },
    ];
    const bestFor = new Map<WeaponId, Plan & { err: number }>();
    for (const sim of sims) {
      if (!sim.ammo) continue;
      for (const face of [1, -1] as const) {
        const facing = near.some((t) => (t.x - mx >= 0 ? 1 : -1) === face);
        if (!facing) continue;
        for (let aim = sim.kind === 'rocket' ? -10 : 5; aim <= 80; aim += 3) {
          const a = (aim * Math.PI) / 180;
          const ux = face * Math.cos(a), uy = -Math.sin(a);
          for (let p = 0.2; p <= 1.001; p += sim.kind === 'rocket' ? 0.05 : 0.06) {
            const s = sim.kind === 'rocket' ? 45 + p * 215 : 30 + p * 200;
            const r = e.simShot(sim.kind, mx + ux * 6, my + uy * 6, ux * s, uy * s, e.wind, w.id);
            if (r.hit === 'water' || r.hit === 'out') continue;
            if (dist(r.x, r.y, mx, my) < sim.selfSafe) continue;
            for (const t of near.slice(0, 3)) {
              const err = dist(r.x, r.y, t.x, t.y - 3);
              if (err > 40) continue;
              const prev = bestFor.get(sim.weapon);
              const score = sim.base - err * sim.k + (r.hit === 'worm' ? 4 : 0);
              if (!prev || score > prev.score) {
                bestFor.set(sim.weapon, { weapon: sim.weapon, face, aim, power: p, score, err });
              }
            }
          }
        }
      }
    }
    for (const p of bestFor.values()) {
      cands.push({
        weapon: p.weapon,
        face: p.face,
        aim: clamp(p.aim + noise(d.aimErr), -85, 85),
        power: clamp(p.power + gauss() * d.powErr, 0.15, 1),
        score: p.score,
      });
    }

    cands.sort((a, b) => b.score - a.score);
    let best = cands[0];

    // out of reach: walk toward the nearest enemy and look again
    const nearest = near[0];
    const gap = nearest.x - mx;
    if ((!best || best.score < 30) && this.replans < 3) {
      const dir: 1 | -1 = gap >= 0 ? 1 : -1;
      const step = clamp(Math.abs(gap) - 70, 25, 80);
      let target = mx + dir * step;
      if (!this.safeAheadX(e, w, dir)) target = mx - dir * 40;
      return { weapon: 'bazooka', face: dir, aim: 30, power: 0.6, score: 0, moveTo: clamp(target, 8, VW - 8) };
    }
    if (!best) {
      const face: 1 | -1 = gap >= 0 ? 1 : -1;
      best = { weapon: 'bazooka', face, aim: 35 + rand(-8, 8), power: rand(0.5, 0.9), score: 0 };
    }
    // weaker AIs sometimes pick the 2nd-best option
    if (cands.length > 1 && Math.random() > d.skill) best = cands[Math.min(cands.length - 1, 1 + Math.floor(Math.random() * 2))];
    return best;
  }

  private safeAheadX(e: WormEngine, w: Worm, dir: 1 | -1) {
    return this.safeAhead(e, w, dir);
  }

  /** Flat-ish walkable ground between the worm and the target (for the sheep). */
  private groundRun(e: WormEngine, w: Worm, face: 1 | -1, len: number): boolean {
    let y = Math.round(w.y);
    for (let i = 4; i < len; i += 3) {
      const x = Math.round(w.x + face * i);
      let found = false;
      for (let dy = -4; dy <= 4; dy++) {
        if (e.terrain.isSolid(x, y + dy + 1) && !e.terrain.isSolid(x, y + dy)) {
          y += dy;
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  /** Nothing solid between the sky and this column's surface at the target. */
  private skyClear(e: WormEngine, x: number): boolean {
    const xi = Math.round(x);
    for (let y = 0; y < 100; y++) if (e.terrain.isSolid(xi, y)) return y > 60;
    return true;
  }
}
