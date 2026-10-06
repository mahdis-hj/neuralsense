// Planned contract for the real model (from the technical brief, section 10).
// When a trained Muse 2 ONNX model exists, load it with onnxruntime-react-native
// and check incoming data against this description before running it.

export const PLANNED_MODEL_MANIFEST = {
  id: 'muse2_classifier',
  version: '0.1.0',
  format: 'onnx',
  channel_order: ['TP9', 'AF7', 'AF8', 'TP10'],
  sample_rate_hz: 256,
  input_units: 'microvolt',
  input_layout: 'NCT',
  input_shape: [1, 4, 1024],
  window_seconds: 4,
  stride_seconds: 1,
  preprocessing_version: 'muse2_causal_v1',
  quality_policy_version: 'muse2_quality_v1',
  preferred_provider: 'cpu',
  model_sha256: 'REPLACE_WITH_VERIFIED_CHECKSUM',
} as const;
