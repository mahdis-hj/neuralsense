// Signal processing: causal filters (for live data), FFT and band power.
// Filters keep their state between batches, so a live stream is filtered
// exactly like one long recording. Reset them after a gap.

import { BANDS, BandName, BandPowers } from './types';

/** Second-order IIR section (RBJ audio-EQ cookbook), transposed direct form II. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(
    readonly b0: number,
    readonly b1: number,
    readonly b2: number,
    readonly a1: number,
    readonly a2: number,
  ) {}

  static highpass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad((1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  static lowpass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad((1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  static notch(fc: number, fs: number, q = 30): Biquad {
    const w = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad(1 / a0, (-2 * cos) / a0, 1 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

export type FilterConfig = { highpassHz: number; lowpassHz: number; notchHz: 50 | 60 | null };
// Canada uses 60 Hz mains power. These are starting values, not validated defaults.
export const DEFAULT_FILTER: FilterConfig = { highpassHz: 1, lowpassHz: 45, notchHz: 60 };

/** Causal filter chain for one channel: high-pass -> low-pass -> notch. */
export class ChannelFilter {
  private stages: Biquad[];
  constructor(fs: number, cfg: FilterConfig = DEFAULT_FILTER) {
    this.stages = [Biquad.highpass(cfg.highpassHz, fs), Biquad.lowpass(cfg.lowpassHz, fs)];
    if (cfg.notchHz) this.stages.push(Biquad.notch(cfg.notchHz, fs));
  }
  process(x: number): number {
    let y = x;
    for (const s of this.stages) y = s.process(y);
    return y;
  }
  reset(): void {
    this.stages.forEach((s) => s.reset());
  }
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error('FFT length must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * One-sided power spectral density (µV²/Hz) using a Hann-windowed periodogram.
 * Matches scipy.signal.periodogram(x, fs, window='hann', detrend='constant', scaling='density').
 */
export function psd(x: ArrayLike<number>, fs: number): { freqs: Float64Array; power: Float64Array } {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let wss = 0;
  for (let i = 0; i < n; i++) {
    // periodic Hann window (scipy's default for spectral estimation)
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    re[i] = (x[i] - mean) * w;
    wss += w * w;
  }
  fft(re, im);
  const half = n / 2 + 1;
  const freqs = new Float64Array(half);
  const power = new Float64Array(half);
  const scale = 1 / (fs * wss);
  for (let k = 0; k < half; k++) {
    freqs[k] = (k * fs) / n;
    let p = (re[k] * re[k] + im[k] * im[k]) * scale;
    if (k !== 0 && k !== n / 2) p *= 2;
    power[k] = p;
  }
  return { freqs, power };
}

/** Absolute band power (µV²) by summing PSD bins in [lo, hi). */
export function bandPowers(x: ArrayLike<number>, fs: number): BandPowers {
  const { freqs, power } = psd(x, fs);
  const df = freqs[1] - freqs[0];
  const out = {} as BandPowers;
  (Object.keys(BANDS) as BandName[]).forEach((band) => {
    const [lo, hi] = BANDS[band];
    let s = 0;
    for (let k = 0; k < freqs.length; k++) if (freqs[k] >= lo && freqs[k] < hi) s += power[k];
    out[band] = s * df;
  });
  return out;
}

export function relativeBands(abs: BandPowers): BandPowers {
  const total = Object.values(abs).reduce((a, b) => a + b, 0) || 1;
  const out = {} as BandPowers;
  (Object.keys(abs) as BandName[]).forEach((b) => (out[b] = abs[b] / total));
  return out;
}
