// The live processing engine. It receives EEG batches from any DeviceSource,
// filters them, keeps a short history for the screen, and every second
// analyses the last 4 seconds (quality -> band power -> demo model).
// It also keeps track of an in-progress recording.

import { ChannelFilter, bandPowers, relativeBands } from './dsp';
import { runDemoModel } from './demoModel';
import { channelQuality } from './quality';
import type { RawEegInfo, RawSink } from './rawCsv';
import { BANDS, BandName, BandPowers, CHANNEL_COUNT, EegBatch, SAMPLE_RATE, WindowResult } from './types';

export const WINDOW_SAMPLES = 4 * SAMPLE_RATE; // 4 s window
export const STRIDE_SAMPLES = SAMPLE_RATE; // every 1 s
export const WARMUP_SAMPLES = SAMPLE_RATE; // let filters settle for 1 s after a (re)start
const HISTORY_SAMPLES = 10 * SAMPLE_RATE;

export type RecordingSummary = {
  id: string;
  startedAt: number; // epoch ms
  durationSec: number;
  sourceKind: string;
  windows: number;
  abstained: number;
  gaps: number;
  meanCalm: number | null;
  labelCounts: { Calm: number; Neutral: number; Active: number };
  meanRelBands: BandPowers;
  modelId: string;
  rawEeg?: RawEegInfo; // missing for sessions recorded before raw saving existed
};

class Ring {
  readonly buf = new Float32Array(HISTORY_SAMPLES);
  write = 0;
  count = 0;
  push(v: number) {
    this.buf[this.write] = v;
    this.write = (this.write + 1) % HISTORY_SAMPLES;
    if (this.count < HISTORY_SAMPLES) this.count++;
  }
  /** Copy of the last n samples, oldest first. */
  last(n: number): Float32Array {
    n = Math.min(n, this.count);
    const out = new Float32Array(n);
    let idx = (this.write - n + HISTORY_SAMPLES) % HISTORY_SAMPLES;
    for (let i = 0; i < n; i++) {
      out[i] = this.buf[idx];
      idx = (idx + 1) % HISTORY_SAMPLES;
    }
    return out;
  }
  clear() {
    this.write = 0;
    this.count = 0;
  }
}

export class SessionEngine {
  private filters = Array.from({ length: CHANNEL_COUNT }, () => new ChannelFilter(SAMPLE_RATE));
  private rings = Array.from({ length: CHANNEL_COUNT }, () => new Ring());
  private samplesSinceGap = 0;
  private samplesSinceWindow = 0;
  private streamSamples = 0;
  private listeners = new Set<(r: WindowResult) => void>();

  latest: WindowResult | null = null;
  totalGaps = 0;

  // recording state
  private rec: {
    id: string;
    startedAt: number;
    startSample: number;
    results: WindowResult[];
    gaps: number;
    raw: RawSink | null;
  } | null = null;

  constructor(private sourceKind: string = 'simulated', private modelId = 'demo_rule_alpha_beta') {}

  onResult(cb: (r: WindowResult) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.filters.forEach((f) => f.reset());
    this.rings.forEach((r) => r.clear());
    this.samplesSinceGap = 0;
    this.samplesSinceWindow = 0;
    this.latest = null;
  }

  handleBatch(batch: EegBatch): void {
    this.rec?.raw?.append(batch);
    if (batch.gapBefore) {
      // never pretend a gap is continuous signal: restart filters and windows
      this.totalGaps++;
      if (this.rec) this.rec.gaps++;
      this.filters.forEach((f) => f.reset());
      this.rings.forEach((r) => r.clear());
      this.samplesSinceGap = 0;
      this.samplesSinceWindow = 0;
    }
    for (let i = 0; i < batch.sampleCount; i++) {
      for (let c = 0; c < CHANNEL_COUNT; c++) {
        this.rings[c].push(this.filters[c].process(batch.channels[c][i]));
      }
      this.samplesSinceGap++;
      this.samplesSinceWindow++;
      this.streamSamples++;
      if (this.samplesSinceWindow >= STRIDE_SAMPLES && this.samplesSinceGap >= WINDOW_SAMPLES + WARMUP_SAMPLES) {
        this.samplesSinceWindow = 0;
        this.analyse();
      }
    }
  }

  private analyse(): void {
    const windows = this.rings.map((r) => r.last(WINDOW_SAMPLES));
    const quality = windows.map(channelQuality);
    const usable = windows.filter((_, i) => quality[i] !== 'bad');
    const rel = averageBands(usable.map((w) => relativeBands(bandPowers(w, SAMPLE_RATE))));
    const out = runDemoModel(rel, quality);
    const t = this.rec ? (this.streamSamples - this.rec.startSample) / SAMPLE_RATE : this.streamSamples / SAMPLE_RATE;
    const result: WindowResult = out.abstained
      ? { t, quality, relBands: rel, abstained: true, reason: out.reason }
      : { t, quality, relBands: rel, abstained: false, label: out.label, calmScore: out.calmScore, confidence: out.confidence };
    this.latest = result;
    if (this.rec) this.rec.results.push(result);
    this.listeners.forEach((l) => l(result));
  }

  /** Waveform data for the screen: last `seconds`, reduced to ~`points` min/max pairs per channel. */
  displayData(seconds = 5, points = 200): Float32Array[] {
    const n = Math.round(seconds * SAMPLE_RATE);
    return this.rings.map((r) => decimateMinMax(r.last(n), points));
  }

  get isRecording(): boolean {
    return this.rec !== null;
  }

  get recordingSeconds(): number {
    return this.rec ? (this.streamSamples - this.rec.startSample) / SAMPLE_RATE : 0;
  }

  /** `makeRawSink` (optional) creates the raw EEG file for this recording. */
  startRecording(makeRawSink?: (id: string, startedAt: number) => RawSink): string {
    const id = `ses_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const startedAt = Date.now();
    let raw: RawSink | null = null;
    try {
      raw = makeRawSink ? makeRawSink(id, startedAt) : null;
    } catch {
      raw = null; // could not create the file: still record results
    }
    this.rec = { id, startedAt, startSample: this.streamSamples, results: [], gaps: 0, raw };
    return id;
  }

  /** Stop without keeping anything (also deletes the raw EEG file). */
  cancelRecording(): void {
    this.rec?.raw?.discard();
    this.rec = null;
  }

  stopRecording(): { summary: RecordingSummary; results: WindowResult[] } | null {
    if (!this.rec) return null;
    const r = this.rec;
    this.rec = null;
    const valid = r.results.filter((x) => !x.abstained);
    const labelCounts = { Calm: 0, Neutral: 0, Active: 0 };
    valid.forEach((x) => x.label && labelCounts[x.label]++);
    const summary: RecordingSummary = {
      id: r.id,
      startedAt: r.startedAt,
      durationSec: (this.streamSamples - r.startSample) / SAMPLE_RATE,
      sourceKind: this.sourceKind,
      windows: r.results.length,
      abstained: r.results.length - valid.length,
      gaps: r.gaps,
      meanCalm: valid.length ? valid.reduce((a, x) => a + (x.calmScore ?? 0), 0) / valid.length : null,
      labelCounts,
      meanRelBands: averageBands(valid.map((x) => x.relBands)),
      modelId: this.modelId,
      rawEeg: r.raw ? r.raw.finish() : undefined,
    };
    return { summary, results: r.results };
  }
}

export function averageBands(list: BandPowers[]): BandPowers {
  const out = {} as BandPowers;
  (Object.keys(BANDS) as BandName[]).forEach((b) => {
    out[b] = list.length ? list.reduce((a, x) => a + x[b], 0) / list.length : 0;
  });
  return out;
}

/** Peak-preserving display reduction: keeps the min and max of each bucket. */
export function decimateMinMax(x: Float32Array, points: number): Float32Array {
  if (x.length <= points * 2) return x;
  const out = new Float32Array(points * 2);
  const bucket = x.length / points;
  for (let p = 0; p < points; p++) {
    const s = Math.floor(p * bucket);
    const e = Math.floor((p + 1) * bucket);
    let mn = Infinity;
    let mx = -Infinity;
    let iMn = s;
    let iMx = s;
    for (let i = s; i < e; i++) {
      if (x[i] < mn) {
        mn = x[i];
        iMn = i;
      }
      if (x[i] > mx) {
        mx = x[i];
        iMx = i;
      }
    }
    // keep time order inside the bucket
    out[2 * p] = iMn < iMx ? mn : mx;
    out[2 * p + 1] = iMn < iMx ? mx : mn;
  }
  return out;
}
