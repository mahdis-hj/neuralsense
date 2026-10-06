// DEMO MODEL: a simple hand-written rule, NOT a trained or validated model.
// It turns the alpha/beta balance into a "calm score" so the app has
// something to show. Replace it with a real ONNX model trained on Muse 2 data
// (see src/core/modelContract.ts for the planned interface).

import { BandPowers, ContactQuality, ModelLabel } from './types';

export const DEMO_MODEL_INFO = {
  id: 'demo_rule_alpha_beta',
  version: '0.0.1',
  isDemo: true,
  description: 'Rule of thumb: more alpha relative to beta -> higher calm score. For demonstration only.',
};

export type ModelOutput =
  | { abstained: true; reason: string }
  | { abstained: false; label: ModelLabel; calmScore: number; confidence: number };

export function runDemoModel(relBands: BandPowers, quality: ContactQuality[]): ModelOutput {
  const usable = quality.filter((q) => q !== 'bad').length;
  if (usable < 2) return { abstained: true, reason: 'Not enough sensors with good contact' };

  const ratio = Math.log((relBands.alpha + 1e-6) / (relBands.beta + 1e-6));
  const calmScore = 1 / (1 + Math.exp(-1.1 * (ratio - 0.7)));
  const label: ModelLabel = calmScore > 0.6 ? 'Calm' : calmScore < 0.4 ? 'Active' : 'Neutral';
  // Confidence falls when the score sits near a boundary or when contact is only "fair".
  const fairPenalty = quality.filter((q) => q === 'fair').length * 0.1;
  const distance = label === 'Neutral' ? 1 - Math.abs(calmScore - 0.5) / 0.1 : Math.abs(calmScore - 0.5) * 2;
  const confidence = Math.max(0.05, Math.min(0.99, 0.5 + 0.5 * distance - fairPenalty));
  return { abstained: false, label, calmScore, confidence };
}
