import { getMuted, setMuted } from './storage';

/** Small WebAudio synth shared by games: one-shot tones, filtered noise bursts and sustained loops. */
class Synth {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = getMuted();
  private loops = new Map<string, { src: AudioScheduledSourceNode; gain: GainNode; filt: BiquadFilterNode }>();

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
      const len = this.ctx.sampleRate * 2;
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

  tone(type: OscillatorType, f0: number, dur: number, vol: number, f1?: number, delay = 0, attack = 0.004) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  /** Filtered noise burst; the filter frequency can sweep f0 -> f1. */
  burst(dur: number, vol: number, f0: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass', f1?: number) {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.03);
  }

  // ---- sustained sounds (jetpack, drill, fuse hiss) ----
  loopStart(id: string, kind: 'noise' | 'saw' | 'square', freq: number, vol: number, q = 1) {
    if (!this.ctx || !this.master || this.muted || this.loops.has(id)) return;
    const t = this.ctx.currentTime;
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    f.type = kind === 'noise' ? 'bandpass' : 'lowpass';
    f.frequency.value = kind === 'noise' ? freq : 1800;
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    let src: AudioScheduledSourceNode;
    if (kind === 'noise') {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      src = s;
    } else {
      const o = this.ctx.createOscillator();
      o.type = kind === 'saw' ? 'sawtooth' : 'square';
      o.frequency.value = freq;
      src = o;
    }
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    this.loops.set(id, { src, gain: g, filt: f });
  }

  loopSet(id: string, freq: number, vol: number) {
    const l = this.loops.get(id);
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (l.src instanceof OscillatorNode) l.src.frequency.setTargetAtTime(freq, t, 0.03);
    else l.filt.frequency.setTargetAtTime(freq, t, 0.03);
    l.gain.gain.setTargetAtTime(Math.max(0.0001, vol), t, 0.03);
  }

  loopStop(id: string) {
    const l = this.loops.get(id);
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setTargetAtTime(0.0001, t, 0.04);
    l.src.stop(t + 0.25);
    this.loops.delete(id);
  }

  loopStopAll() {
    for (const id of [...this.loops.keys()]) this.loopStop(id);
  }

  hasLoop(id: string) {
    return this.loops.has(id);
  }
}

export const synth = new Synth();
