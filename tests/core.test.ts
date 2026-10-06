// Run with: npx tsx --test tests/core.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Biquad, ChannelFilter, bandPowers, psd, relativeBands } from '../src/core/dsp';
import { channelQuality } from '../src/core/quality';
import { runDemoModel } from '../src/core/demoModel';
import { FakeEegGenerator } from '../src/core/fakeEeg';
import { SessionEngine, decimateMinMax } from '../src/core/engine';
import {
  PacketAssembler,
  base64ToBytes,
  bytesToBase64,
  decodeEegPacket,
  encodeCommand,
} from '../src/core/museProtocol';
import { EegBatch, SAMPLE_RATE } from '../src/core/types';

const sine = (f: number, amp: number, n: number, fs = SAMPLE_RATE) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / fs));

test('PSD finds a 10 Hz sine in the alpha band with the right power', () => {
  const x = sine(10, 10, 1024);
  const b = bandPowers(x, SAMPLE_RATE);
  // power of a sine = amp^2 / 2 = 50 µV²
  assert.ok(Math.abs(b.alpha - 50) / 50 < 0.05, `alpha=${b.alpha}`);
  const rel = relativeBands(b);
  assert.ok(rel.alpha > 0.95);
});

test('notch filter removes 60 Hz, high-pass removes DC', () => {
  const n = 4096;
  const f = new ChannelFilter(SAMPLE_RATE);
  const x = sine(60, 50, n);
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const y = f.process(x[i] + 200); // + DC offset
    if (i > n - 512) tail = Math.max(tail, Math.abs(y));
  }
  assert.ok(tail < 3, `60 Hz + DC residue ${tail}`);
});

test('band-pass keeps 10 Hz mostly intact', () => {
  const hp = Biquad.highpass(1, SAMPLE_RATE);
  const lp = Biquad.lowpass(45, SAMPLE_RATE);
  const x = sine(10, 10, 4096);
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const y = lp.process(hp.process(x[i]));
    if (i > 2048) peak = Math.max(peak, Math.abs(y));
  }
  assert.ok(peak > 9.5 && peak < 10.5, `peak ${peak}`);
});

test('quality check: flat = bad, huge = bad, normal = good', () => {
  assert.equal(channelQuality(new Float32Array(1024)), 'bad');
  assert.equal(channelQuality(sine(10, 300, 1024)), 'bad');
  assert.equal(channelQuality(sine(10, 20, 1024)), 'good');
  assert.equal(channelQuality(sine(10, 100, 1024)), 'fair');
});

test('demo model abstains when fewer than 2 sensors are usable', () => {
  const rel = { delta: 0.2, theta: 0.17, alpha: 0.5, beta: 0.08, gamma: 0.05 };
  assert.equal(runDemoModel(rel, ['bad', 'bad', 'bad', 'good']).abstained, true);
  const out = runDemoModel(rel, ['good', 'good', 'good', 'good']);
  assert.equal(out.abstained, false);
  if (!out.abstained) assert.equal(out.label, 'Calm');
});

test('engine: fake calm data -> Calm, fake active data -> Active', () => {
  for (const [calm, expected] of [
    [0.95, 'Calm'],
    [0.0, 'Active'],
  ] as const) {
    const gen = new FakeEegGenerator({ seed: 1, fixedCalm: calm, settleSeconds: [0, 0, 0, 0] });
    const eng = new SessionEngine();
    eng.startRecording();
    for (let s = 0; s < 30 * 4; s++) {
      eng.handleBatch({ firstSampleIndex: 0, receivedMs: 0, sampleCount: 64, channels: gen.next(64), gapBefore: false });
    }
    const res = eng.stopRecording()!;
    assert.ok(res.summary.windows >= 24, `windows ${res.summary.windows}`);
    const top = Object.entries(res.summary.labelCounts).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(top, expected, JSON.stringify(res.summary.labelCounts));
  }
});

test('engine: loose sensors make the model abstain', () => {
  const gen = new FakeEegGenerator({ seed: 2, settleSeconds: [0, 0, 0, 0] });
  [0, 1, 2].forEach((c) => gen.looseChannels.add(c));
  const eng = new SessionEngine();
  eng.startRecording();
  for (let s = 0; s < 40; s++) eng.handleBatch({ firstSampleIndex: 0, receivedMs: 0, sampleCount: 64, channels: gen.next(64), gapBefore: false });
  const res = eng.stopRecording()!;
  assert.ok(res.summary.windows > 0);
  assert.equal(res.summary.abstained, res.summary.windows);
});

test('engine: a gap restarts the 4 s window', () => {
  const gen = new FakeEegGenerator({ seed: 3, settleSeconds: [0, 0, 0, 0] });
  const eng = new SessionEngine();
  let results = 0;
  eng.onResult(() => results++);
  const feed = (gap: boolean) => eng.handleBatch({ firstSampleIndex: 0, receivedMs: 0, sampleCount: 256, channels: gen.next(256), gapBefore: gap });
  for (let i = 0; i < 6; i++) feed(false); // 6 s -> first result at 5 s, second at 6 s
  assert.equal(results, 2);
  feed(true); // gap: restart
  for (let i = 0; i < 3; i++) feed(false);
  assert.equal(results, 2, 'no results until 5 s of clean data after a gap');
  assert.equal(eng.totalGaps, 1);
});

test('display decimation keeps peaks', () => {
  const x = new Float32Array(1280);
  x[500] = 999;
  x[900] = -999;
  const d = decimateMinMax(x, 100);
  assert.equal(d.length, 200);
  assert.ok(d.includes(999) && d.includes(-999));
});

test('Muse command encoding matches muse-js format', () => {
  assert.deepEqual(Array.from(encodeCommand('h')), [2, 104, 10]);
  assert.deepEqual(Array.from(encodeCommand('p21')), [4, 112, 50, 49, 10]);
});

test('Muse EEG packet decoding', () => {
  // sequence 0x0102; first sample raw 0x800 (0 µV), second raw 0xFFF
  const bytes = new Uint8Array(20);
  bytes[0] = 0x01;
  bytes[1] = 0x02;
  bytes[2] = 0x80;
  bytes[3] = 0x0f;
  bytes[4] = 0xff;
  const { sequence, samples } = decodeEegPacket(bytes);
  assert.equal(sequence, 0x0102);
  assert.equal(samples.length, 12);
  assert.equal(samples[0], 0);
  assert.equal(samples[1], 0.48828125 * (0xfff - 0x800));
  assert.equal(samples[2], 0.48828125 * -0x800);
});

test('packet assembler waits for all 4 channels and flags gaps', () => {
  const out: EegBatch[] = [];
  const asm = new PacketAssembler((b) => out.push(b), () => 0);
  const pkt = (seq: number) => {
    const b = new Uint8Array(20).fill(0x80);
    b[0] = seq >> 8;
    b[1] = seq & 255;
    return b;
  };
  for (const seq of [10, 11, 14]) for (let c = 0; c < 4; c++) asm.push(c, pkt(seq));
  assert.equal(out.length, 3);
  assert.equal(out[1].gapBefore, false);
  assert.equal(out[2].gapBefore, true);
  assert.equal(out[2].firstSampleIndex, 12 * 4); // two missing packets skipped
});

test('base64 round trip', () => {
  for (const len of [1, 2, 3, 5, 20]) {
    const b = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 5) & 255);
    const s = bytesToBase64(b);
    assert.equal(s, Buffer.from(b).toString('base64'));
    assert.deepEqual(Array.from(base64ToBytes(s)), Array.from(b));
  }
});

test('PSD output written for Python parity check', async () => {
  const fs = await import('node:fs');
  const gen = new FakeEegGenerator({ seed: 7, settleSeconds: [0, 0, 0, 0] });
  const x = gen.next(1024)[0];
  const { power } = psd(x, SAMPLE_RATE);
  fs.mkdirSync('tests/out', { recursive: true });
  fs.writeFileSync('tests/out/psd_fixture.json', JSON.stringify({ x: Array.from(x), power: Array.from(power) }));
});
