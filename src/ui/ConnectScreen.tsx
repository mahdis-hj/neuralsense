import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { ConnectionState, SourceKind } from '../core/types';
import { Button, Card, SectionTitle, Tag } from './components';
import { colors, space } from './theme';

const STATE_TEXT: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  discovering: 'Looking for headband…',
  connecting: 'Connecting…',
  configuring: 'Setting up stream…',
  streaming: 'Streaming',
  reconnecting: 'Reconnecting…',
  stopping: 'Stopping…',
  error: 'Connection failed',
};

export function ConnectScreen({
  state,
  detail,
  onConnect,
}: {
  state: ConnectionState;
  detail?: string;
  onConnect: (kind: SourceKind) => void;
}) {
  const busy = state === 'discovering' || state === 'connecting' || state === 'configuring';
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <View style={{ marginTop: space.xl, marginBottom: space.sm }}>
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700', letterSpacing: 1 }}>NEURALSENSE</Text>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 4 }}>Connect your Muse 2</Text>
        <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8, lineHeight: 21 }}>
          Record brain activity, check sensor contact and see live results — all stored on this phone.
        </Text>
      </View>

      <Card>
        <SectionTitle right={<Tag text="RECOMMENDED" color={colors.accent} />}>Simulated headband</SectionTitle>
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, marginBottom: space.md }}>
          Fake EEG that behaves like a Muse 2: four sensors, eye blinks, power-line noise and a calm level that
          drifts over time. Works everywhere, no headband needed.
        </Text>
        <Button title="Start with fake data" onPress={() => onConnect('simulated')} disabled={busy} />
      </Card>

      <Card>
        <SectionTitle right={<Tag text="EXPERIMENTAL" color={colors.fair} />}>Real Muse 2</SectionTitle>
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, marginBottom: space.md }}>
          Connects over Bluetooth using open-source (unofficial) code. Needs a development build of the app — it will
          not work in Expo Go. Turn the headband on first.
        </Text>
        <Button title="Find my Muse" kind="secondary" onPress={() => onConnect('muse-ble')} disabled={busy} />
      </Card>

      {(busy || state === 'error') && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.bad, fontSize: 18 }}>!</Text>}
          <View style={{ flex: 1 }}>
            <Text style={{ color: state === 'error' ? colors.bad : colors.text, fontWeight: '700' }}>{STATE_TEXT[state]}</Text>
            {detail ? <Text style={{ color: colors.muted, marginTop: 2 }}>{detail}</Text> : null}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
