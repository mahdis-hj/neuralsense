// Raw EEG recording to CSV (brief section 12). Unfiltered microvolts, every
// sample, all 4 channels. Text is collected in memory and handed to `io.write`
// about once a second, so a long recording never sits in memory.
// No Expo imports here, so it runs in the Node tests too.

import { CHANNEL_COUNT, EegBatch, MUSE_CHANNELS, SAMPLE_RATE } from './types';

// sample:  index since recording start (jumps forward over lost samples)
// time_s:  sample / 256
// unix_ms: estimated wall-clock time (recording start + time_s)
// gap:     1 on the first sample after lost data, else 0
export const RAW_CSV_HEADER = `sample,time_s,unix_ms,${MUSE_CHANNELS.map((c) => `${c}_uV`).join(',')},gap\n`;

export type RawEegInfo = { samples: number; ok: boolean };

/** What the engine needs from a raw recorder while recording. */
export interface RawSink {
  append(batch: EegBatch): void;
  finish(): RawEegInfo;
  discard(): void;
}

export class RawCsvRecorder implements RawSink {
  private base: number | null = null;
  private pending: string[] = [];
  private pendingSamples = 0;
  private samples = 0;
  private ok = true;

  constructor(
    private startedAtMs: number,
    private io: { write(text: string): void; remove(): void },
    private flushEvery = SAMPLE_RATE,
  ) {
    this.pending.push(RAW_CSV_HEADER);
  }

  append(batch: EegBatch): void {
    if (!this.ok) return;
    if (this.base === null) this.base = batch.firstSampleIndex;
    for (let i = 0; i < batch.sampleCount; i++) {
      const s = batch.firstSampleIndex + i - this.base;
      const t = s / SAMPLE_RATE;
      let row = `${s},${t},${Math.round(this.startedAtMs + t * 1000)}`;
      for (let c = 0; c < CHANNEL_COUNT; c++) row += `,${batch.channels[c][i].toFixed(3)}`;
      row += batch.gapBefore && i === 0 ? ',1\n' : ',0\n';
      this.pending.push(row);
    }
    this.samples += batch.sampleCount;
    this.pendingSamples += batch.sampleCount;
    if (this.pendingSamples >= this.flushEvery) this.flush();
  }

  finish(): RawEegInfo {
    this.flush();
    return { samples: this.samples, ok: this.ok };
  }

  discard(): void {
    this.ok = false;
    this.pending = [];
    try {
      this.io.remove();
    } catch {
      // nothing more we can do
    }
  }

  private flush(): void {
    if (!this.ok || this.pending.length === 0) return;
    try {
      this.io.write(this.pending.join(''));
    } catch {
      // e.g. phone storage full: stop writing, keep the live session running
      this.ok = false;
    }
    this.pending = [];
    this.pendingSamples = 0;
  }
}
