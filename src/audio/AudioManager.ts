// ---------------------------------------------------------------------------
// AudioManager — fully procedural Web Audio: SFX, per-theme ambience and a
// subtle adaptive music layer. No external audio assets required.
// ---------------------------------------------------------------------------

import { settings } from "../settings";

export type SfxName =
  | "select"
  | "deselect"
  | "move"
  | "capture"
  | "castle"
  | "promote"
  | "check"
  | "checkmate-win"
  | "checkmate-lose"
  | "draw"
  | "ui"
  | "illegal"
  | "tick"
  | "gamestart";

interface ChordDef {
  freqs: number[];
  dur: number;
}

const THEME_CHORDS: Record<string, ChordDef[]> = {
  medieval: [
    { freqs: [146.83, 220, 293.66], dur: 7 }, // Dm
    { freqs: [130.81, 196, 261.63], dur: 7 }, // C
    { freqs: [174.61, 220, 349.23], dur: 7 }, // F
    { freqs: [146.83, 220, 293.66], dur: 7 },
  ],
  cyberpunk: [
    { freqs: [110, 164.81, 246.94], dur: 6 }, // Am-ish low
    { freqs: [98, 146.83, 220], dur: 6 },
    { freqs: [110, 164.81, 261.63], dur: 6 },
    { freqs: [87.31, 130.81, 207.65], dur: 6 },
  ],
  space: [
    { freqs: [130.81, 196, 293.66, 392], dur: 9 },
    { freqs: [116.54, 174.61, 261.63, 349.23], dur: 9 },
    { freqs: [98, 146.83, 220, 293.66], dur: 9 },
  ],
  egypt: [
    { freqs: [146.83, 174.61, 220], dur: 8 }, // phrygian flavor
    { freqs: [130.81, 155.56, 196], dur: 8 },
    { freqs: [164.81, 196, 246.94], dur: 8 },
  ],
  samurai: [
    { freqs: [146.83, 196, 220], dur: 8 }, // pentatonic-ish
    { freqs: [130.81, 174.61, 196], dur: 8 },
    { freqs: [164.81, 220, 246.94], dur: 8 },
  ],
  horror: [
    { freqs: [82.41, 87.31, 123.47], dur: 10 }, // cluster
    { freqs: [73.42, 77.78, 116.54], dur: 10 },
  ],
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private ambientGain!: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;

  // ambience
  private ambientNodes: AudioNode[] = [];
  private ambientSources: AudioBufferSourceNode[] = [];
  private ambientTimers: number[] = [];
  private currentAmbient: string | null = null;

  // music
  private musicTimer: number | null = null;
  private musicTheme: string | null = null;
  private chordIndex = 0;
  private tension = 0;

  unlock(): void {
    if (this.unlocked) {
      if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.ambientGain.connect(this.master);
      this.applyVolumes();
      // Shared noise buffer.
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.unlocked = true;
      if (this.currentAmbient) {
        const id = this.currentAmbient;
        this.currentAmbient = null;
        this.startAmbient(id);
      }
      if (this.musicTheme) {
        const id = this.musicTheme;
        this.musicTheme = null;
        this.startMusic(id);
      }
    } catch {
      /* audio unavailable — the game must never break because of audio */
    }
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const a = settings.get().audio;
    this.master.gain.value = a.master;
    this.musicGain.gain.value = a.music * 0.5;
    this.sfxGain.gain.value = a.sfx;
    this.ambientGain.gain.value = a.ambient * 0.7;
  }

  // ------------------------------------------------------------------- SFX

  play(name: SfxName, opts: { intensity?: number } = {}): void {
    if (!this.ctx || !this.unlocked) return;
    if (settings.get().audio.master <= 0) return;
    try {
      switch (name) {
        case "select": this.blip(660, 0.06, "triangle", 0.25); break;
        case "deselect": this.blip(440, 0.05, "triangle", 0.16); break;
        case "move": this.thock(0.55, 340); break;
        case "capture": {
          this.thock(0.9, 210);
          this.noiseBurst(0.22, 900, 0.35);
          break;
        }
        case "castle": this.thock(0.7, 300, 0.09); this.thock(0.7, 260, 0.09, 0.14); break;
        case "promote": this.arp([523, 659, 784, 1047], 0.09, 0.3); break;
        case "check": this.blip(880, 0.16, "square", 0.16); this.blip(660, 0.2, "square", 0.14, 0.12); break;
        case "checkmate-win": this.arp([392, 523, 659, 784, 1047], 0.16, 0.4, 0.02); break;
        case "checkmate-lose": this.arp([220, 196, 165, 147], 0.3, 0.35, 0.05); break;
        case "draw": this.arp([293, 349, 440], 0.25, 0.25, 0.03); break;
        case "ui": this.blip(520, 0.045, "sine", 0.2); break;
        case "illegal": this.blip(140, 0.16, "sawtooth", 0.18); break;
        case "tick": this.blip(1200, 0.03, "square", 0.12); break;
        case "gamestart": this.arp([262, 330, 392], 0.12, 0.28, 0.02); break;
      }
      void opts;
    } catch {
      /* ignore */
    }
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, at = 0): void {
    const c = this.ctx!;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private thock(power: number, freq: number, dur = 0.08, at = 0): void {
    const c = this.ctx!;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t0 + dur);
    g.gain.setValueAtTime(0.5 * power, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.03);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
    this.noiseBurst(0.05, 2400, 0.22 * power, at);
  }

  private noiseBurst(dur: number, filterFreq: number, gain: number, at = 0): void {
    const c = this.ctx!;
    if (!this.noiseBuffer) return;
    const t0 = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  private arp(freqs: number[], step: number, gain: number, gap = 0): void {
    freqs.forEach((f, i) => this.blip(f, step * 2.2, "triangle", gain, gap + i * step));
  }

  // -------------------------------------------------------------- ambience

  startAmbient(themeId: string): void {
    this.stopAmbient();
    this.currentAmbient = themeId;
    if (!this.ctx || !this.unlocked) return;
    const c = this.ctx;
    const makeNoise = (filterType: BiquadFilterType, freq: number, q: number, gain: number, lfoRate = 0) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuffer!;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(filter).connect(g).connect(this.ambientGain);
      src.start();
      this.ambientSources.push(src);
      this.ambientNodes.push(filter, g);
      if (lfoRate > 0) {
        const lfo = c.createOscillator();
        const lfoGain = c.createGain();
        lfo.frequency.value = lfoRate;
        lfoGain.gain.value = gain * 0.45;
        lfo.connect(lfoGain).connect(g.gain);
        lfo.start();
        this.ambientSources.push(lfo as unknown as AudioBufferSourceNode);
        this.ambientNodes.push(lfoGain);
      }
    };
    const drone = (freq: number, gain: number, type: OscillatorType = "sine") => {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = c.createGain();
      g.gain.value = gain;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq * 3;
      osc.connect(filter).connect(g).connect(this.ambientGain);
      osc.start();
      this.ambientSources.push(osc as unknown as AudioBufferSourceNode);
      this.ambientNodes.push(g, filter);
    };

    switch (themeId) {
      case "medieval":
        makeNoise("bandpass", 300, 0.6, 0.05, 0.11); // wind in the courtyard
        makeNoise("highpass", 3800, 0.8, 0.012); // air
        break;
      case "cyberpunk":
        makeNoise("highpass", 5200, 0.5, 0.05); // rain hiss
        makeNoise("bandpass", 1400, 1.4, 0.02, 0.07);
        drone(55, 0.045, "sawtooth"); // city hum
        break;
      case "space":
        drone(48, 0.06);
        drone(96.5, 0.02);
        makeNoise("lowpass", 220, 0.4, 0.02, 0.05);
        break;
      case "egypt":
        makeNoise("bandpass", 420, 0.5, 0.06, 0.09); // desert wind
        makeNoise("highpass", 4500, 0.7, 0.012);
        break;
      case "samurai":
        makeNoise("bandpass", 360, 0.5, 0.045, 0.13);
        makeNoise("highpass", 5000, 0.6, 0.01);
        break;
      case "horror":
        drone(38, 0.07);
        makeNoise("lowpass", 160, 0.5, 0.03, 0.04);
        // Random creaks.
        const creak = () => {
          if (this.currentAmbient !== "horror" || !this.ctx) return;
          this.blip(90 + Math.random() * 80, 0.6, "sawtooth", 0.02);
          this.ambientTimers.push(window.setTimeout(creak, 4000 + Math.random() * 9000));
        };
        this.ambientTimers.push(window.setTimeout(creak, 3000));
        break;
      default:
        makeNoise("bandpass", 320, 0.5, 0.04, 0.1);
    }
  }

  stopAmbient(): void {
    for (const src of this.ambientSources) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    }
    this.ambientSources = [];
    this.ambientNodes = [];
    for (const t of this.ambientTimers) clearTimeout(t);
    this.ambientTimers = [];
    this.currentAmbient = null;
  }

  // ----------------------------------------------------------------- music

  startMusic(themeId: string): void {
    this.stopMusic();
    this.musicTheme = themeId;
    this.chordIndex = 0;
    if (!this.ctx || !this.unlocked) return;
    const chords = THEME_CHORDS[themeId] ?? THEME_CHORDS.medieval;

    const scheduleNext = () => {
      if (this.musicTheme !== themeId || !this.ctx) return;
      const chord = chords[this.chordIndex % chords.length];
      this.chordIndex++;
      this.playChord(chord.freqs, chord.dur);
      this.musicTimer = window.setTimeout(scheduleNext, chord.dur * 1000);
    };
    scheduleNext();
  }

  private playChord(freqs: number[], dur: number): void {
    const c = this.ctx!;
    const t0 = c.currentTime;
    for (const f of freqs) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const osc2 = c.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = f * 2.001;
      const g = c.createGain();
      const peak = 0.05 + this.tension * 0.03;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.3);
      g.gain.linearRampToValueAtTime(peak * 0.7, t0 + dur * 0.75);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      const g2 = c.createGain();
      g2.gain.value = 0.25;
      osc.connect(g);
      osc2.connect(g2).connect(g);
      g.connect(this.musicGain);
      osc.start(t0);
      osc2.start(t0);
      osc.stop(t0 + dur + 0.1);
      osc2.stop(t0 + dur + 0.1);
    }
    if (this.tension > 0) {
      // Tension layer: high sparse pulse.
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqs[freqs.length - 1] * 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.02 * this.tension, t0 + 1);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur * 0.9);
      osc.connect(g).connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + dur);
    }
  }

  /** Adaptive layer: 0 = calm, 1 = high tension (e.g. king in check). */
  setTension(v: number): void {
    this.tension = Math.max(0, Math.min(1, v));
  }

  stopMusic(): void {
    if (this.musicTimer !== null) clearTimeout(this.musicTimer);
    this.musicTimer = null;
    this.musicTheme = null;
    this.tension = 0;
  }

  dispose(): void {
    this.stopAmbient();
    this.stopMusic();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.unlocked = false;
  }
}

export const audio = new AudioManager();
