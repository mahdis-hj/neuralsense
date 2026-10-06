// Shared types for the NeuralSense Muse 2 app.
// Muse 2 has 4 EEG channels at 256 Hz (TP9, AF7, AF8, TP10).

export const MUSE_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'] as const;
export type ChannelName = (typeof MUSE_CHANNELS)[number];
export const SAMPLE_RATE = 256;
export const CHANNEL_COUNT = MUSE_CHANNELS.length;

/** One batch of EEG samples, one Float32Array per channel (same length), in microvolts. */
export type EegBatch = {
  firstSampleIndex: number; // running sample counter since the stream started
  receivedMs: number; // monotonic receive time
  sampleCount: number;
  channels: Float32Array[]; // order = MUSE_CHANNELS
  gapBefore: boolean; // true if samples were lost before this batch
};

export type ConnectionState =
  | 'disconnected'
  | 'discovering'
  | 'connecting'
  | 'configuring'
  | 'streaming'
  | 'reconnecting'
  | 'stopping'
  | 'error';

export type SourceKind = 'simulated' | 'muse-ble';

/** Anything that can produce EEG: the fake headband or a real Muse 2. */
export interface DeviceSource {
  readonly kind: SourceKind;
  readonly label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onBatch(cb: (b: EegBatch) => void): () => void;
  onState(cb: (s: ConnectionState, detail?: string) => void): () => void;
}

export type ContactQuality = 'good' | 'fair' | 'bad';

export type BandName = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
export const BANDS: Record<BandName, [number, number]> = {
  delta: [1, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};
export type BandPowers = Record<BandName, number>;

export type ModelLabel = 'Calm' | 'Neutral' | 'Active';

/** One analysis window result (every 1 s, using the last 4 s of signal). */
export type WindowResult = {
  t: number; // seconds since recording/stream start
  quality: ContactQuality[]; // per channel
  relBands: BandPowers; // relative band power, averaged over usable channels
  abstained: boolean;
  reason?: string;
  label?: ModelLabel;
  calmScore?: number; // 0..1
  confidence?: number; // 0..1
};
