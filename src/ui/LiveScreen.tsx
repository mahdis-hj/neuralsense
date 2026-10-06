import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { DEMO_MODEL_INFO } from '../core/demoModel';
import { SessionEngine } from '../core/engine';
import { DeviceSource, MUSE_CHANNELS, WindowResult } from '../core/types';
import { SimulatedMuse } from '../device/SimulatedMuse';
import { saveSession } from '../storage/db';
import { BandBars, Button, Card, ContactMap, SectionTitle, Tag, Waveforms } from './components';
import { colors, labelColor, space } from './theme';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function LiveScreen({
  source,
  engine,
  onDisconnect,
  onSaved,
}: {
  source: DeviceSource;
  engine: SessionEngine;
  onDisconnect: () => void;
  onSaved: () => void;
}) {
  const [, setTick] = useState(0);
  const [result, setResult] = useState<WindowResult | null>(engine.latest);
  const [loose, setLoose] = useState(false);

  // Redraw the waveform ~12 times a second; samples never go into React state.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    const off = engine.onResult(setResult);
    return () => {
      clearInterval(id);
      off();
    };
  }, [engine]);

  const recording = engine.isRecording;
  const warming = !result;

  const toggleRecord = async () => {
    if (!recording) {
      engine.startRecording();
      setTick((t) => t + 1);
      return;
    }
    const out = engine.stopRecording();
    setTick((t) => t + 1);
    if (!out) return;
    if (out.summary.windows === 0) {
      Alert.alert('Recording too short', 'Record for at least a few seconds to get results.');
      return;
    }
    try {
      await saveSession(out.summary, out.results);
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? String(e));
    }
  };

  const sim = source instanceof SimulatedMuse ? source : null;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Live session</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }} numberOfLines={1}>
            {source.label}
          </Text>
        </View>
        <Tag text="● STREAMING" color={colors.accent} />
      </View>

      <Card>
        <SectionTitle>Sensor contact</SectionTitle>
        <ContactMap quality={result ? result.quality : [null, null, null, null]} />
        {result && result.quality.some((q) => q === 'bad') && (
          <Text style={{ color: colors.fair, marginTop: space.md, fontSize: 13 }}>
            Adjust the headband so the red sensors touch the skin.
          </Text>
        )}
      </Card>

      <Card>
        <SectionTitle right={<Text style={{ color: colors.muted, fontSize: 12 }}>last 5 s · ±60 µV</Text>}>
          Brain signal
        </SectionTitle>
        <Waveforms data={engine.displayData(5, 200)} />
      </Card>

      <Card>
        <SectionTitle right={DEMO_MODEL_INFO.isDemo ? <Tag text="DEMO MODEL" color={colors.fair} /> : undefined}>
          Current state
        </SectionTitle>
        {warming ? (
          <Text style={{ color: colors.muted, fontSize: 15 }}>Collecting the first 5 seconds of signal…</Text>
        ) : result!.abstained ? (
          <View>
            <Text style={{ color: colors.muted, fontSize: 26, fontWeight: '800' }}>No result</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>{result!.reason}</Text>
          </View>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
              <Text style={{ color: labelColor(result!.label), fontSize: 34, fontWeight: '800' }}>{result!.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 15 }}>{Math.round((result!.confidence ?? 0) * 100)}% confidence</Text>
            </View>
            <View style={{ height: 8, backgroundColor: colors.cardAlt, borderRadius: 4, marginTop: space.md, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.round((result!.calmScore ?? 0) * 100)}%`,
                  height: '100%',
                  backgroundColor: labelColor(result!.label),
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Active</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Calm score {Math.round((result!.calmScore ?? 0) * 100)}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Calm</Text>
            </View>
          </View>
        )}
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: space.md }}>
          Demo rule based on alpha vs beta power — not a trained or validated model.
        </Text>
      </Card>

      <Card>
        <SectionTitle>Frequency bands</SectionTitle>
        <BandBars bands={result && !result.abstained ? result.relBands : null} />
      </Card>

      <Card style={{ gap: space.md }}>
        {recording && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.record }} />
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Recording {fmtTime(engine.recordingSeconds)}</Text>
          </View>
        )}
        <Button
          title={recording ? 'Stop and save' : 'Start recording'}
          kind={recording ? 'danger' : 'primary'}
          onPress={toggleRecord}
        />
        <Button
          title="Disconnect"
          kind="secondary"
          onPress={() => {
            if (recording) engine.stopRecording();
            onDisconnect();
          }}
        />
      </Card>

      {sim && (
        <Card>
          <SectionTitle right={<Tag text="FAKE DATA ONLY" />}>Demo controls</SectionTitle>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, flex: 1 }}>
              Loosen {MUSE_CHANNELS[0]}, {MUSE_CHANNELS[1]} and {MUSE_CHANNELS[2]} (shows how the app handles bad contact)
            </Text>
            <Switch
              value={loose}
              onValueChange={(v) => {
                [0, 1, 2].forEach((c) => sim.setLoose(c, v));
                setLoose(v);
              }}
              trackColor={{ true: colors.fair, false: colors.border }}
            />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
