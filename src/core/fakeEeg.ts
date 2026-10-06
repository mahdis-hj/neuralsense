// Fake Muse 2 EEG generator. Produces 4 channels at 256 Hz, in microvolts.
// It mixes brain-like rhythms (theta, alpha, beta), background noise,
// 60 Hz power-line hum, eye blinks on the forehead sensors and a slow
// "calm level" that drifts over time so the demo results change.

import { CHANNEL_COUNT, SAMPLE_RATE } from './types';

/** Small seeded random generator so tests are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FakeEegOptions = {
  seed?: number;
  /** Seconds before each sensor "settles" onto the skin (simulates putting the headband on). */
  settleSeconds?: number[];
  /** Fixed calm level 0..1 (otherwise it drifts slowly). */
  fixedCalm?: number;
};

export class FakeEegGenerator {
  private rand: () => number;
  private n = 0; // samples generated so far
  private phases: number[][];
  private brown: number[] = new Array(CHANNEL_COUNT).fill(0);
  private nextBlink: number;
  private blinkStart = -1;
  private settle: number[];
  /** Channels forced to look disconnected (for demoing bad contact). */
  looseChannels = new Set<number>();

  constructor(private opts: FakeEegOptions = {}) {
    this.rand = mulberry32(opts.seed ?? 42);
    this.phases = Array.from({ length: CHANNEL_COUNT }, () => [0, 0, 0].map(() => this.rand() * 2 * Math.PI));
    this.settle = opts.settleSeconds ?? [1.5, 3, 2.2, 4];
    this.nextBlink = Math.round(SAMPLE_RATE * 3);
  }

  private gauss(): number {
    const u = 1 - this.rand();
    const v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Calm level 0..1 at time t (seconds). Slow drift with a ~90 s cycle. */
  calmAt(t: number): number {
    if (this.opts.fixedCalm !== undefined) return this.opts.fixedCalm;
    return 0.5 + 0.35 * Math.sin((2 * Math.PI * t) / 90) + 0.1 * Math.sin((2 * Math.PI * t) / 23);
  }

  /** Generate the next `count` samples for every channel. */
  next(count: number): Float32Array[] {
    const out = Array.from({ length: CHANNEL_COUNT }, () => new Float32Array(count));
    for (let i = 0; i < count; i++, this.n++) {
      const t = this.n / SAMPLE_RATE;
      const calm = this.calmAt(t);
      const alphaAmp = 5 + 9 * calm;
      const betaAmp = 3 + 5 * (1 - calm);
      const thetaAmp = 4;

      // eye blink: ~250 ms bump on frontal channels every 3–7 s
      if (this.n === this.nextBlink) {
        this.blinkStart = this.n;
        this.nextBlink = this.n + Math.round(SAMPLE_RATE * (3 + 4 * this.rand()));
      }
      let blink = 0;
      if (this.blinkStart >= 0) {
        const bt = (this.n - this.blinkStart) / SAMPLE_RATE;
        if (bt < 0.4) blink = 110 * Math.exp(-(((bt - 0.15) / 0.06) ** 2));
      }

      for (let c = 0; c < CHANNEL_COUNT; c++) {
        const p = this.phases[c];
        const w = 2 * Math.PI * t;
        let v =
          thetaAmp * Math.sin(w * 6 + p[0]) +
          alphaAmp * Math.sin(w * (9.5 + 0.3 * c) + p[1]) * (c === 0 || c === 3 ? 1.2 : 0.8) +
          betaAmp * Math.sin(w * 16 + p[2]) +
          betaAmp * 0.8 * Math.sin(w * 23.5 + p[0] + p[1]) +
          3 * this.gauss() +
          4 * Math.sin(w * 60); // power-line hum
        this.brown[c] = 0.995 * this.brown[c] + 0.6 * this.gauss(); // slow drift
        v += this.brown[c];
        if (c === 1 || c === 2) v += blink;

        const notSettled = t < this.settle[c];
        if (notSettled || this.looseChannels.has(c)) {
          v = 300 * this.gauss() + 600 * Math.sin(w * 1.3 + c); // big, messy signal
        }
        out[c][i] = v;
      }
    }
    return out;
  }

  get samplesGenerated(): number {
    return this.n;
  }
}
