import { getMuted, setMuted } from '../../lib/storage';

/** Tiny synthesized SFX — no asset downloads, zero latency. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = getMuted();
  private lastChop = 0;

  /** Shared with the music engine (null until `init()` has run in a user gesture). */
  get context(): AudioContext | null {
    return this.ctx;
  }
  get output(): GainNode | null {
    return this.master;
  }

  /** Must be called from a user gesture. */
  init() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    setMuted(m);
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, q: number, delay = 0) {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  chop(crit: boolean, auto: boolean) {
    const now = performance.now();
    if (now - this.lastChop < 35) return;
    this.lastChop = now;
    const v = auto ? 0.35 : 0.7;
    this.burst(0.08, v, 900 + Math.random() * 500, 1.2);
    this.tone(150 + Math.random() * 40, 0.09, 'triangle', v * 0.6, 70);
    if (crit) this.tone(880, 0.12, 'square', 0.18, 1760);
  }
  fall() {
    this.tone(110, 0.45, 'sawtooth', 0.22, 40);
    this.burst(0.35, 0.5, 300, 0.6, 0.35);
  }
  coin(pitch = 0) {
    const p = 1 + Math.min(pitch, 10) * 0.06;
    this.tone(988 * p, 0.09, 'square', 0.14);
    this.tone(1319 * p, 0.2, 'square', 0.14, undefined, 0.07);
  }
  nope() {
    this.tone(180, 0.18, 'square', 0.16, 120);
  }
  angry() {
    this.tone(300, 0.4, 'sawtooth', 0.22, 70);
  }
  buy() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.2, undefined, i * 0.05));
  }
  tick() {
    this.tone(1000, 0.05, 'square', 0.12);
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.2, f * 0.9, i * 0.16));
  }
  dash() {
    this.burst(0.18, 0.3, 2400, 0.8);
    this.tone(300, 0.16, 'sawtooth', 0.1, 900);
  }
  boom() {
    this.burst(0.5, 0.8, 180, 0.5);
    this.tone(90, 0.5, 'sawtooth', 0.3, 30);
  }
  alert() {
    for (let i = 0; i < 3; i++) this.tone(i % 2 ? 520 : 780, 0.1, 'square', 0.13, undefined, i * 0.11);
  }
  levelUp() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'square', 0.15, undefined, i * 0.06));
  }
  rush() {
    for (let i = 0; i < 4; i++) this.tone(i % 2 ? 660 : 880, 0.16, 'square', 0.16, undefined, i * 0.17);
  }
  start() {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.12, 'square', 0.14, undefined, i * 0.07));
  }
}

export const sfx = new Sfx();
