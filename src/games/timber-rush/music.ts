import { sfx } from './audio';
import { getMusicMuted, setMusicMuted } from '../../lib/storage';

/**
 * Procedural background music (no audio files): a pad, bass and plucky arpeggio over a
 * four-chord loop. `intensity` (0..1) raises the tempo and layers in hats and a soft kick.
 */
const CHORDS = [
  [48, 52, 55], // C
  [45, 48, 52], // Am
  [41, 45, 48], // F
  [43, 47, 50], // G
];
const PENTA = [67, 69, 72, 74, 76, 79, 81, 84];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
/** Music level relative to the SFX master (ambient, so well under the effects). */
const MUSIC_GAIN = 0.8;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function createVoices(ctx: BaseAudioContext, dest: AudioNode) {
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate / 2), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  let melodyIdx = 3;

  const tone = (type: OscillatorType, freq: number, t: number, dur: number, vol: number, attack = 0.01, detune = 0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const hat = (t: number, vol: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp).connect(g).connect(dest);
    src.start(t, Math.random() * 0.3);
    src.stop(t + 0.07);
  };

  const kick = (t: number, vol: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.2);
  };

  /** Schedule one 16th-note step. `step` runs 0..63 (four bars). */
  const step = (n: number, t: number, stepDur: number, intensity: number) => {
    const bar = Math.floor(n / 16) % 4;
    const s = n % 16;
    const chord = CHORDS[bar];
    const barDur = stepDur * 16;

    if (s === 0) {
      for (const m of chord) {
        tone('triangle', mtof(m + 12), t, barDur * 1.08, 0.05, 0.7, -7);
        tone('triangle', mtof(m + 12), t, barDur * 1.08, 0.05, 0.7, 7);
      }
    }
    // bass
    if (s % 8 === 0) tone('sine', mtof(chord[0] - 12), t, stepDur * 6, 0.2, 0.015);
    if (intensity > 0.5 && s % 8 === 6) tone('sine', mtof(chord[0]), t, stepDur * 2, 0.12, 0.01);
    // arpeggio
    const dense = intensity > 0.62;
    if (s % 2 === 0 || dense) {
      const idx = ARP[(s >> 1) % ARP.length];
      const oct = s % 8 === 6 ? 36 : 24;
      tone('square', mtof(chord[idx] + oct), t, stepDur * (dense ? 1.6 : 2.4), dense ? 0.022 : 0.03, 0.004);
    }
    // gentle melody on the odd bars
    if (bar % 2 === 1 || bar === 2) {
      const on = s % 4 === 0 ? Math.random() < 0.5 : s % 2 === 0 && Math.random() < 0.12;
      if (on) {
        melodyIdx = Math.max(0, Math.min(PENTA.length - 1, melodyIdx + Math.floor(Math.random() * 5) - 2));
        tone('triangle', mtof(PENTA[melodyIdx] + 12), t, stepDur * 4.5, 0.07, 0.012);
      }
    }
    // percussion arrives with the adrenaline
    if (intensity > 0.3 && s % 2 === 1) hat(t, 0.045);
    if (intensity > 0.65 && s % 2 === 0) hat(t, 0.03);
    if (intensity > 0.5 && s % 4 === 0) kick(t, 0.2);
  };

  return { step };
}

class Music {
  muted = getMusicMuted();
  running = false;
  notes = 0; // scheduled steps (handy for debugging)
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private voices: ReturnType<typeof createVoices> | null = null;
  private timer = 0;
  private next = 0;
  private stepNo = 0;
  private intensity = 0.15;
  private target = 0.15;
  private ducked = false;

  private ensure(): boolean {
    const ctx = sfx.context;
    const out = sfx.output;
    if (!ctx || !out) return false;
    if (this.ctx !== ctx) {
      this.filt = ctx.createBiquadFilter();
      this.filt.type = 'lowpass';
      this.filt.frequency.value = 14000;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.filt.connect(this.bus);
      this.bus.connect(out);
      this.voices = createVoices(ctx, this.filt);
      this.ctx = ctx;
    }
    return true;
  }

  private apply() {
    if (!this.ctx || !this.bus || !this.filt) return;
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(this.muted ? 0 : this.ducked ? 0.14 : MUSIC_GAIN, t, 0.15);
    this.filt.frequency.setTargetAtTime(this.ducked ? 450 : 14000, t, 0.2);
  }

  play() {
    if (!this.ensure()) return;
    this.ducked = false;
    this.apply();
    if (this.running) return;
    this.running = true;
    this.stepNo = 0;
    this.intensity = this.target = 0.15;
    this.next = this.ctx!.currentTime + 0.15;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  /** Muffle + quiet (pause, level-up modal). */
  duck(on: boolean) {
    this.ducked = on;
    this.apply();
  }

  setMuted(m: boolean) {
    this.muted = m;
    setMusicMuted(m);
    this.apply();
  }

  setIntensity(v: number) {
    this.target = Math.max(0, Math.min(1, v));
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.voices) return;
    let guard = 0;
    while (this.next < ctx.currentTime + 0.2 && guard++ < 16) {
      const bpm = 88 + this.intensity * 38;
      const dur = 60 / bpm / 4;
      this.voices.step(this.stepNo, this.next, dur, this.intensity);
      this.notes++;
      this.next += dur;
      this.stepNo = (this.stepNo + 1) % 64;
      this.intensity += (this.target - this.intensity) * 0.03;
    }
  }
}

export const music = new Music();

/** Renders a few seconds offline and reports levels — used to verify the mix isn't silent or clipping. */
export async function renderPreview(seconds = 16, intensity = 0.5) {
  const sr = 22050;
  const ctx = new OfflineAudioContext(1, sr * seconds, sr);
  const bus = ctx.createGain();
  bus.gain.value = MUSIC_GAIN;
  bus.connect(ctx.destination);
  const v = createVoices(ctx, bus);
  const dur = 60 / (88 + intensity * 38) / 4;
  for (let i = 0, t = 0; t < seconds - 0.3; i++, t += dur) v.step(i % 64, t, dur, intensity);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0;
  for (let i = 0; i < d.length; i++) {
    peak = Math.max(peak, Math.abs(d[i]));
    sum += d[i] * d[i];
  }
  return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), seconds: buf.duration };
}
