// Simple per-channel signal quality check on a filtered window.
// Thresholds are placeholders: calibrate them on real Muse 2 recordings.

import { ContactQuality } from './types';

export const QUALITY_THRESHOLDS = {
  flatStdUv: 0.5, // almost no signal -> sensor not touching skin
  badPtpUv: 400, // huge swings -> loose sensor / movement
  fairPtpUv: 150, // blinks or small movement
};

export function channelQuality(x: ArrayLike<number>): ContactQuality {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }
  const n = x.length;
  const std = Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2));
  const ptp = max - min;
  if (!isFinite(ptp) || std < QUALITY_THRESHOLDS.flatStdUv || ptp > QUALITY_THRESHOLDS.badPtpUv) return 'bad';
  if (ptp > QUALITY_THRESHOLDS.fairPtpUv) return 'fair';
  return 'good';
}
