// Logical viewport size (16:9). The renderer scales this to the real canvas.
export const W = 1280;
export const H = 720;

// The world is bigger than the viewport; the camera follows the player.
export const WORLD_W = 2600;
export const WORLD_H = 1700;

/** The base sits in the exact middle of the map so every trip starts from the centre. */
export const BASE = { x: WORLD_W / 2, y: WORLD_H / 2 };
/** Drop zone in the very centre: stand inside to unload your backpack. Customers are served from its stock. */
export const DEPOT = { x: BASE.x, y: BASE.y + 10, r: 74 };
/** Wooden counter (blocks movement), just north of the depot. Customers queue in front (south) of it. */
export const COUNTER = { cx: BASE.x, y: BASE.y - 150, w: 280, h: 46 };
export const SLOT_Y = BASE.y - 92;
export const CLIENT_SLOTS_X = [COUNTER.cx - 112, COUNTER.cx, COUNTER.cx + 112];
export const PLAYER_START = { x: BASE.x - 110, y: BASE.y + 120 };

export const TREE_COUNT = 64;
export const CHOP_RANGE = 62;

export const START_TIME = 50;
export const MAX_TIME = 70;
export const ANGRY_PENALTY = 5;

/** Rush Hour: a periodic burst of impatient, generous customers. */
export const RUSH_FIRST = 55; // seconds until the first rush
export const RUSH_EVERY = 65;
export const RUSH_LEN = 12;
export const RUSH_PAY = 1.6;

/** XP needed to go from `level` to `level + 1` (1-based). */
export const xpNeeded = (level: number) => 4 + 2 * (level - 1);
export const MAX_SKILLS = 6;
export const CHOICES = 3;

export type UpgradeId =
  | 'edge' | 'extra' | 'speed' | 'move' | 'carry' | 'price' | 'time' | 'patience'
  | 'dash' | 'lucky' | 'chain';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  max: number;
  blurb: string;
  stat: (level: number) => string;
}

// Gameplay formulas ---------------------------------------------------------
export const dmg = (l: number) => 1.5 + l * 0.8;
export const chopInterval = (l: number) => 0.45 * Math.pow(0.88, l);
export const axeCount = (l: number) => 1 + l;
export const moveSpeed = (l: number) => 285 * (1 + 0.1 * l);
export const carryCap = (l: number) => 10 + 3 * l;
export const logPrice = (l: number) => 3 * (1 + 0.35 * l);
export const timeMult = (l: number) => 1 + 0.2 * l;
export const patienceMult = (l: number) => 1 + 0.18 * l;
export const drainRate = (elapsed: number) => Math.min(3.0, 1 + elapsed * 0.0105);

export const critChance = (l: number) => 0.1 + 0.06 * l;
export const chainDmg = (l: number) => 1.5 * l;
export const dashCd = (l: number) => Math.max(1.4, 3.6 - 0.45 * l);
export const DASH_TIME = 0.22;
export const DASH_MULT = 3;

// Special trees / events -------------------------------------------------------
export const specialChance = (elapsed: number) => (elapsed < 20 ? 0 : Math.min(0.14, 0.03 + elapsed * 0.0004));
export const BOMB_RADIUS = 240;
export const BOMB_DMG = 7;
export const BEES_SPEED = 150;
export const BEES_LIFE = 8;
export const BEES_COST = 1.3;
export const THIEF_FIRST = 50;

export const UPGRADES: UpgradeDef[] = [
  { id: 'edge', name: 'Sharper Axe', icon: '🪓', max: 14,
    blurb: 'More damage per chop', stat: (l) => `${dmg(l).toFixed(1)} dmg` },
  { id: 'extra', name: 'Extra Axe', icon: '🌀', max: 4,
    blurb: 'Another axe swings with you — hits more trees at once', stat: (l) => `${axeCount(l)} axes` },
  { id: 'speed', name: 'Swing Speed', icon: '⚡', max: 10,
    blurb: 'Chop faster', stat: (l) => `${(1 / chopInterval(l)).toFixed(1)}/s` },
  { id: 'move', name: 'Boots', icon: '👟', max: 8,
    blurb: 'Run faster', stat: (l) => `${Math.round(moveSpeed(l))} spd` },
  { id: 'carry', name: 'Backpack', icon: '🎒', max: 10,
    blurb: 'Carry more logs per trip', stat: (l) => `${carryCap(l)} logs` },
  { id: 'price', name: 'Log Price', icon: '💰', max: 12,
    blurb: 'Every log sells for more', stat: (l) => `$${logPrice(l).toFixed(1)}/log` },
  { id: 'time', name: 'Time Bonus', icon: '⏳', max: 8,
    blurb: 'Each sale adds more seconds', stat: (l) => `x${timeMult(l).toFixed(1)}` },
  { id: 'patience', name: 'Patience', icon: '😊', max: 8,
    blurb: 'Customers wait longer', stat: (l) => `x${patienceMult(l).toFixed(2)}` },
  { id: 'dash', name: 'Dash', icon: '💨', max: 6,
    blurb: 'Press SPACE for a burst of speed', stat: (l) => (l === 0 ? 'off' : `${dashCd(l).toFixed(1)}s cooldown`) },
  { id: 'lucky', name: 'Lucky Crit', icon: '🍀', max: 8,
    blurb: 'More crits, and each one drops a bonus log', stat: (l) => `${Math.round(critChance(l) * 100)}% crit` },
  { id: 'chain', name: 'Chain Chop', icon: '⛓', max: 6,
    blurb: 'A falling tree hits the next one', stat: (l) => (l === 0 ? 'off' : `${chainDmg(l).toFixed(1)} dmg`) },
];

export const AXE_TIERS = ['#a3abb7', '#e3e8ef', '#ffd54a', '#4be3a0', '#6ee7ff', '#ff5d7a', '#c084fc'];
export const axeColor = (edgeLevel: number) =>
  AXE_TIERS[Math.min(AXE_TIERS.length - 1, Math.floor(edgeLevel / 2))];

/** hp, logs dropped, trunk collision radius, regrow seconds */
export const TREE_KINDS = [
  { hp: 3, logs: 2, r: 9, regrow: 9 },
  { hp: 7, logs: 5, r: 12, regrow: 12 },
  { hp: 14, logs: 11, r: 17, regrow: 16 },
] as const;

/** Bigger trees are further from the base: more reward, longer trip. */
export function kindWeights(dist: number): [number, number, number] {
  if (dist < 650) return [0.6, 0.32, 0.08];
  if (dist < 1000) return [0.4, 0.4, 0.2];
  return [0.2, 0.4, 0.4];
}
