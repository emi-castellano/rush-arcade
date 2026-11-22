import { synth } from '../../lib/synth';

/** Every weapon/tool has its own synthesized sound. */
export const wsfx = {
  init: () => synth.init(),
  get muted() { return synth.muted; },
  setMuted: (m: boolean) => synth.setMuted(m),
  stopLoops: () => synth.loopStopAll(),

  // --- worm ---
  step: () => synth.burst(0.03, 0.08, 1200 + Math.random() * 300, 2),
  jump: () => synth.tone('sine', 220, 0.16, 0.16, 520),
  backflip: () => synth.tone('sine', 200, 0.24, 0.16, 700),
  land: () => { synth.burst(0.07, 0.25, 300, 1); synth.tone('sine', 120, 0.08, 0.15, 60); },
  hurt: () => { synth.tone('square', 520, 0.14, 0.12, 260); synth.tone('square', 420, 0.12, 0.1, 200, 0.07); },
  die: () => { synth.tone('sawtooth', 400, 0.5, 0.14, 70); synth.burst(0.3, 0.2, 800, 1, 0.1, 'lowpass', 120); },
  splash: () => { synth.burst(0.45, 0.35, 2400, 0.6, 0, 'lowpass', 300); synth.tone('sine', 300, 0.3, 0.1, 90); },
  select: () => synth.tone('square', 880, 0.05, 0.08),
  nope: () => synth.tone('square', 170, 0.16, 0.14, 110),
  turn: () => { synth.tone('triangle', 660, 0.12, 0.16); synth.tone('triangle', 880, 0.18, 0.16, undefined, 0.1); },
  tick: () => synth.tone('square', 1000, 0.05, 0.1),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => synth.tone('square', f, 0.2, 0.14, undefined, i * 0.1)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => synth.tone('sawtooth', f, 0.32, 0.16, f * 0.9, i * 0.18)),

  // --- bazooka / rockets ---
  bazooka: () => { synth.burst(0.35, 0.5, 700, 0.7, 0, 'lowpass', 120); synth.tone('sawtooth', 160, 0.28, 0.15, 50); synth.burst(0.5, 0.18, 1600, 1.2, 0.05, 'bandpass', 500); },
  // --- explosions ---
  boom: (size = 0.5) => {
    synth.burst(0.35 + size * 0.5, 0.55 + size * 0.3, 1100, 0.6, 0, 'lowpass', 70);
    synth.tone('sine', 110 - size * 30, 0.5 + size * 0.4, 0.4, 28);
    synth.burst(0.15, 0.2, 3500, 0.8, 0, 'highpass');
  },
  // --- grenades ---
  throw: () => synth.burst(0.12, 0.14, 1800, 1.5, 0, 'bandpass', 600),
  pin: () => { synth.tone('square', 1800, 0.03, 0.08); synth.tone('square', 1300, 0.03, 0.08, undefined, 0.05); },
  bounce: () => { synth.tone('triangle', 1500, 0.06, 0.12, 900); synth.burst(0.04, 0.1, 3000, 2); },
  beep: () => synth.tone('square', 1400, 0.06, 0.1),
  pop: () => { synth.burst(0.08, 0.3, 1800, 1, 0, 'bandpass', 400); synth.tone('sine', 260, 0.07, 0.15, 120); },
  // --- shotgun / uzi ---
  shotgun: () => { synth.burst(0.22, 0.7, 2400, 0.5, 0, 'lowpass', 220); synth.tone('sine', 140, 0.16, 0.45, 45); },
  shotgunReload: () => { synth.tone('square', 700, 0.04, 0.1); synth.tone('square', 500, 0.05, 0.1, undefined, 0.08); },
  uzi: () => { synth.burst(0.05, 0.4, 3200, 0.8, 0, 'bandpass', 1200); synth.tone('square', 220, 0.04, 0.1, 140); },
  // --- dynamite ---
  dynamite: () => { synth.tone('square', 600, 0.05, 0.1); synth.burst(0.25, 0.1, 5000, 3, 0.05, 'highpass'); },
  fuseOn: () => synth.loopStart('fuse', 'noise', 5500, 0.07, 6),
  fuseOff: () => synth.loopStop('fuse'),
  // --- sheep ---
  baa: () => { synth.tone('sawtooth', 420, 0.5, 0.11, 360); synth.tone('sawtooth', 425, 0.5, 0.08, 330, 0.01); synth.tone('sine', 18, 0.5, 0.0001); },
  baaShort: () => synth.tone('sawtooth', 380, 0.18, 0.08, 330),
  // --- air strike ---
  siren: () => { for (let i = 0; i < 4; i++) synth.tone('square', i % 2 ? 620 : 880, 0.14, 0.12, undefined, i * 0.15); },
  whistle: () => synth.tone('sine', 2200, 0.7, 0.07, 700),
  // --- ninja rope ---
  ropeShoot: () => { synth.burst(0.1, 0.25, 3000, 1.5, 0, 'bandpass', 1200); synth.tone('triangle', 900, 0.1, 0.1, 1500); },
  ropeHit: () => { synth.tone('square', 220, 0.07, 0.18, 120); synth.burst(0.05, 0.2, 900, 1); },
  ropeRelease: () => synth.tone('triangle', 700, 0.08, 0.1, 400),
  // --- jetpack ---
  jetOn: () => { synth.loopStart('jet', 'noise', 700, 0.22, 0.8); synth.tone('sawtooth', 90, 0.3, 0.1, 200); },
  jetSet: (thrust: boolean) => synth.loopSet('jet', thrust ? 1300 : 520, thrust ? 0.26 : 0.1),
  jetOff: () => synth.loopStop('jet'),
  // --- teleport ---
  teleport: () => { synth.tone('sine', 300, 0.35, 0.14, 1800); synth.tone('sine', 1800, 0.3, 0.12, 250, 0.3); synth.tone('triangle', 600, 0.6, 0.06, 1200, 0.05); },
  // --- drill ---
  drillOn: () => synth.loopStart('drill', 'saw', 95, 0.12, 4),
  drillSet: (f: number) => synth.loopSet('drill', f, 0.12),
  drillOff: () => synth.loopStop('drill'),
};
