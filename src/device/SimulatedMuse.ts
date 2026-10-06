// A pretend Muse 2 headband. Behaves like a device source: it "connects",
// then streams fake EEG in small batches, like the real headband does.

import { FakeEegGenerator } from '../core/fakeEeg';
import { ConnectionState, DeviceSource, EegBatch, SAMPLE_RATE } from '../core/types';

export class SimulatedMuse implements DeviceSource {
  readonly kind = 'simulated' as const;
  readonly label = 'Simulated Muse 2 (fake data)';
  private gen = new FakeEegGenerator({ seed: Date.now() % 100000 });
  private timer: ReturnType<typeof setInterval> | null = null;
  private batchCbs = new Set<(b: EegBatch) => void>();
  private stateCbs = new Set<(s: ConnectionState, d?: string) => void>();
  private startMs = 0;
  private sent = 0;

  onBatch(cb: (b: EegBatch) => void) {
    this.batchCbs.add(cb);
    return () => this.batchCbs.delete(cb);
  }
  onState(cb: (s: ConnectionState, d?: string) => void) {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }
  private setState(s: ConnectionState, d?: string) {
    this.stateCbs.forEach((cb) => cb(s, d));
  }

  /** Demo helper: make one sensor look loose (bad contact) or fix it again. */
  setLoose(channel: number, loose: boolean) {
    if (loose) this.gen.looseChannels.add(channel);
    else this.gen.looseChannels.delete(channel);
  }
  isLoose(channel: number) {
    return this.gen.looseChannels.has(channel);
  }

  async connect(): Promise<void> {
    this.setState('discovering');
    await wait(500);
    this.setState('connecting');
    await wait(500);
    this.setState('configuring');
    await wait(300);
    this.startMs = Date.now();
    this.sent = 0;
    this.setState('streaming');
    // Emit whatever samples are "due" every 50 ms (keeps pace with real time).
    this.timer = setInterval(() => {
      const due = Math.floor(((Date.now() - this.startMs) / 1000) * SAMPLE_RATE) - this.sent;
      if (due <= 0) return;
      const n = Math.min(due, SAMPLE_RATE); // cap catch-up after the app was paused
      const channels = this.gen.next(n);
      const batch: EegBatch = {
        firstSampleIndex: this.sent + due - n, // after a capped catch-up, these are the newest samples
        receivedMs: Date.now(),
        sampleCount: n,
        channels,
        gapBefore: false,
      };
      this.sent += due; // if we capped, the skipped part is a real gap
      if (due > n) batch.gapBefore = true;
      this.batchCbs.forEach((cb) => cb(batch));
    }, 50);
  }

  async disconnect(): Promise<void> {
    this.setState('stopping');
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setState('disconnected');
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
