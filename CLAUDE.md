# NeuralSense — Muse 2 mobile app

Prototype phone app (iOS + Android) for Mahdis Hojjati's NeuralSense venture (TRL-UP program).
It records EEG from a Muse 2 headband, processes it on the phone, and shows live results.
Built from the mentor's "Muse 2 React Native Technical Architecture Brief" (25 Sept 2026).

## How to work with me
- Keep answers short and simple. Explain the "why" in plain words, step by step.
- I'm on a Mac. Explain terminal commands before I run them.
- Ask before destructive git actions (force push, reset, deleting files).

## Tech stack
- Expo SDK 57, React Native, TypeScript
- react-native-svg for charts, expo-sqlite for local storage, expo-file-system + expo-sharing for raw EEG CSV files
- Runs in **Expo Go** with fake data. Bluetooth (real Muse) and HealthKit need a **development build** (they don't work in Expo Go).
- Tests: `npx tsx --test tests/core.test.ts` (17 tests); `python tests/python_parity.py` checks PSD vs SciPy (needs `pip3 install scipy`). Lint: `npx expo lint`.

## What exists now (brief Phase 1, fake data)
- `src/core/fakeEeg.ts` — fake Muse 2 signal: 4 channels (TP9, AF7, AF8, TP10), 256 Hz, blinks, 60 Hz hum, drifting calm level
- `src/core/dsp.ts` — causal filters (1–45 Hz band-pass + 60 Hz notch), FFT, PSD, band power
- `src/core/quality.ts` — per-sensor contact quality (thresholds are placeholders)
- `src/core/demoModel.ts` — DEMO rule (alpha vs beta → "calm score"). NOT a trained model. Abstains when contact is poor
- `src/core/engine.ts` — live pipeline: 4 s window every 1 s → quality → bands → model; recording; gaps restart windows
- `src/core/museProtocol.ts` + `src/device/MuseBleSource.ts` — EXPERIMENTAL real Muse 2 Bluetooth (unofficial, muse-js protocol, react-native-ble-plx). Untested on a real headband
- `src/device/SimulatedMuse.ts` — fake headband
- `src/storage/db.ts` — SQLite: session summaries + per-second results
- `src/core/rawCsv.ts` + `src/storage/rawEeg.ts` — raw EEG saving (done 5 Oct 2026). While recording, raw (unfiltered) EEG from all 4 channels is appended to `raw_eeg/<session id>.csv` on the phone about once a second
  - Columns: `sample,time_s,unix_ms,TP9_uV,AF7_uV,AF8_uV,TP10_uV,gap`. `sample` jumps over lost data and `gap`=1 marks the first sample after it; `unix_ms` is estimated from the recording start
  - Review screen: "Raw EEG" card with "Export CSV" (phone share sheet: AirDrop, Files, Drive…)
  - The file is deleted when a recording is cancelled, too short, fails to save, or the session is deleted
- `src/ui/*` — screens: Connect, Live (contact, waveforms, demo result, bands, record), Sessions + Review. Pink/purple theme in `theme.ts`
- `src/core/modelContract.ts` — planned real ONNX model contract from the brief

## Rules (from the brief)
- Never present demo results as validated or clinical. Label demo/fake data clearly.
- Never fill signal gaps; restart windows after a gap.
- Keep EEG sample buffers out of React state.
- A 19-channel model (thesis data) can't be used on Muse's 4 channels; a real model must be trained on Muse 2 recordings.
- Raw EEG stays on the phone unless the user exports it; HealthKit / Health Connect have no EEG type.

## Decisions so far
- Prototype with fake data first; Muse 2 is the first target device.
- Official Muse SDK isn't open source (access/licence from Interaxon). Open-source options: muse-js, BrainFlow, muse-lsl.
- Mentor (Dan) suggests also using existing phone/watch health data (HealthKit / Health Connect: heart rate, HRV, sleep) to reach more users.
- Research interest: frontal and central areas. Neurosity Crown covers both; Muse covers frontal only.
- GitHub repo: mahdis-hj/neuralsense (old code saved under tag `old-version`).

## Possible next steps
1. Device profiles (channel names, count, sample rate) so other headbands can plug in
2. Development build + test real Muse 2 over Bluetooth
3. HealthKit / Health Connect: read heart rate, HRV, sleep
4. Record Muse data (muse-lsl/BrainFlow in Python) and train a real model → export to ONNX
