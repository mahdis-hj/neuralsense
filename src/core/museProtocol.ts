// EXPERIMENTAL: Muse 2 Bluetooth protocol, as worked out by the open-source
// community (e.g. the muse-js project). This is NOT Muse's official SDK and
// may break with new firmware. Use it for prototypes only.

import { CHANNEL_COUNT, EegBatch } from './types';

export const MUSE_SERVICE_UUID = '0000fe8d-0000-1000-8000-00805f9b34fb';
export const MUSE_CONTROL_UUID = '273e0001-4c4d-454d-96be-f03bac821358';
/** EEG characteristics in channel order TP9, AF7, AF8, TP10. */
export const MUSE_EEG_UUIDS = [
  '273e0003-4c4d-454d-96be-f03bac821358',
  '273e0004-4c4d-454d-96be-f03bac821358',
  '273e0005-4c4d-454d-96be-f03bac821358',
  '273e0006-4c4d-454d-96be-f03bac821358',
];
export const SAMPLES_PER_PACKET = 12;

/** Commands are sent as: [length byte] + ASCII text + '\n'. */
export function encodeCommand(cmd: string): Uint8Array {
  const text = `X${cmd}\n`;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  bytes[0] = bytes.length - 1;
  return bytes;
}

/** Start-streaming sequence: halt, choose preset p21 (EEG only), start, resume. */
export const START_SEQUENCE = ['h', 'p21', 's', 'd'];

/** A 20-byte EEG packet: 2-byte sequence number + 12 samples packed as 12-bit values. */
export function decodeEegPacket(bytes: Uint8Array): { sequence: number; samples: Float32Array } {
  if (bytes.length < 20) throw new Error(`EEG packet too short: ${bytes.length}`);
  const sequence = (bytes[0] << 8) | bytes[1];
  const samples = new Float32Array(SAMPLES_PER_PACKET);
  for (let i = 0, b = 2; i < SAMPLES_PER_PACKET; i += 2, b += 3) {
    const raw1 = (bytes[b] << 4) | (bytes[b + 1] >> 4);
    const raw2 = ((bytes[b + 1] & 0x0f) << 8) | bytes[b + 2];
    samples[i] = 0.48828125 * (raw1 - 0x800);
    samples[i + 1] = 0.48828125 * (raw2 - 0x800);
  }
  return { sequence, samples };
}

/**
 * Each channel arrives as a separate notification. This collects the four
 * channels for the same sequence number and emits one batch, flagging gaps.
 */
export class PacketAssembler {
  private pending = new Map<number, (Float32Array | undefined)[]>();
  private lastSeq: number | null = null;
  private sampleIndex = 0;

  constructor(private emit: (b: EegBatch) => void, private now: () => number = () => Date.now()) {}

  push(channel: number, bytes: Uint8Array): void {
    const { sequence, samples } = decodeEegPacket(bytes);
    let slot = this.pending.get(sequence);
    if (!slot) {
      slot = new Array(CHANNEL_COUNT).fill(undefined);
      this.pending.set(sequence, slot);
    }
    slot[channel] = samples;
    if (slot.every(Boolean)) {
      this.pending.delete(sequence);
      let gapBefore = false;
      if (this.lastSeq !== null) {
        const expected = (this.lastSeq + 1) & 0xffff;
        if (sequence !== expected) {
          gapBefore = true;
          const missed = (sequence - expected + 0x10000) & 0xffff;
          this.sampleIndex += missed * SAMPLES_PER_PACKET;
        }
      }
      this.lastSeq = sequence;
      this.emit({
        firstSampleIndex: this.sampleIndex,
        receivedMs: this.now(),
        sampleCount: SAMPLES_PER_PACKET,
        channels: slot as Float32Array[],
        gapBefore,
      });
      this.sampleIndex += SAMPLES_PER_PACKET;
      // drop stale incomplete packets
      if (this.pending.size > 16) this.pending.clear();
    }
  }

  reset(): void {
    this.pending.clear();
    this.lastSeq = null;
  }
}

// --- base64 helpers (React Native has no Buffer by default) ---
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < len) out[o++] = (n >> 16) & 255;
    if (o < len) out[o++] = (n >> 8) & 255;
    if (o < len) out[o++] = n & 255;
  }
  return out;
}
