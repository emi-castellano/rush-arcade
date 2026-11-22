/** Art-pixel playfield. The whole map is visible; the terrain bitmap is the same size. */
export const VW = 384;
export const VH = 216;
export const WATER_Y = VH - 9;

export const TURN_TIME = 30;
export const RETREAT_TIME = 4;
export const GRAVITY = 260;
export const WALK_SPEED = 34;
export const MAX_HP = 100;
/** Worm collision body: 5 wide, WORM_H tall, standing on its feet row. WORM_CY = height of its centre of mass. */
export const WORM_H = 8;
export const WORM_CY = 5;

export type Theme = 'meadow' | 'desert' | 'frost' | 'volcano';
export const THEMES: Theme[] = ['meadow', 'desert', 'frost', 'volcano'];
export const THEME_LABEL: Record<Theme, string> = { meadow: 'MEADOW', desert: 'DESERT', frost: 'FROST', volcano: 'VOLCANO' };

export const TEAM_COLORS = ['#4aa0ff', '#ff5d5d'] as const;
export const TEAM_NAMES = ['YOU', 'ENEMY'] as const;
export const WORM_NAMES: [string[], string[]] = [
  ['WIGGLES', 'NOODLE', 'SLIMER', 'GRUBBY'],
  ['SQUIRM', 'WORMY', 'GOOP', 'SNAKEY'],
];

export type WeaponId =
  | 'bazooka' | 'grenade' | 'cluster' | 'shotgun' | 'uzi' | 'dynamite'
  | 'sheep' | 'airstrike' | 'rope' | 'jetpack' | 'teleport' | 'drill';

export const INF = 99;

export interface WeaponDef {
  id: WeaponId;
  name: string;
  ammo: number;
  /** charge: hold SPACE; instant: tap SPACE; click: click the map; tool: movement helper */
  kind: 'charge' | 'instant' | 'click' | 'tool';
  /** attack weapons end your shooting for the turn (you still get a few seconds to retreat) */
  attack: boolean;
  blurb: string;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'bazooka', name: 'Bazooka', ammo: INF, kind: 'charge', attack: true, blurb: 'Hold SPACE to charge, release to fire. Wind pushes it.' },
  { id: 'grenade', name: 'Grenade', ammo: 8, kind: 'charge', attack: true, blurb: 'Bounces around. 3 second fuse.' },
  { id: 'cluster', name: 'Cluster Bomb', ammo: 3, kind: 'charge', attack: true, blurb: 'Bursts into 5 bomblets.' },
  { id: 'shotgun', name: 'Shotgun', ammo: INF, kind: 'instant', attack: true, blurb: 'Two quick shots. Deadly up close.' },
  { id: 'uzi', name: 'Uzi', ammo: 3, kind: 'instant', attack: true, blurb: 'Rapid burst of bullets.' },
  { id: 'dynamite', name: 'Dynamite', ammo: 3, kind: 'instant', attack: true, blurb: 'Drop it and run! 5 second fuse.' },
  { id: 'sheep', name: 'Sheep', ammo: 2, kind: 'instant', attack: true, blurb: 'Walks forward, then explodes. SPACE again to detonate.' },
  { id: 'airstrike', name: 'Air Strike', ammo: 2, kind: 'click', attack: true, blurb: 'Click a spot: five missiles rain down.' },
  { id: 'rope', name: 'Ninja Rope', ammo: INF, kind: 'tool', attack: false, blurb: 'SPACE: hook. W/S length, A/D swing, ENTER let go.' },
  { id: 'jetpack', name: 'Jet Pack', ammo: 2, kind: 'tool', attack: false, blurb: 'SPACE to ignite, then W/A/D to fly.' },
  { id: 'teleport', name: 'Teleport', ammo: 2, kind: 'click', attack: false, blurb: 'Click anywhere free to jump there.' },
  { id: 'drill', name: 'Drill', ammo: 3, kind: 'tool', attack: false, blurb: 'SPACE: tunnel in your aim direction.' },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTY: Record<Difficulty, { aimErr: number; powErr: number; think: number; skill: number }> = {
  easy: { aimErr: 9, powErr: 0.13, think: 1.8, skill: 0.5 },
  normal: { aimErr: 4, powErr: 0.05, think: 1.1, skill: 0.8 },
  hard: { aimErr: 1.3, powErr: 0.015, think: 0.6, skill: 1 },
};
