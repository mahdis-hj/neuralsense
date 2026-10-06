import React, { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SessionEngine } from './src/core/engine';
import { ConnectionState, DeviceSource, SourceKind } from './src/core/types';
import { SimulatedMuse } from './src/device/SimulatedMuse';
import { ConnectScreen } from './src/ui/ConnectScreen';
import { LiveScreen } from './src/ui/LiveScreen';
import { SessionsScreen } from './src/ui/SessionsScreen';
import { colors } from './src/ui/theme';

type Tab = 'live' | 'sessions';

function makeSource(kind: SourceKind): DeviceSource {
  if (kind === 'simulated') return new SimulatedMuse();
  // Loaded only when asked for, so Expo Go never touches the Bluetooth module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MuseBleSource } = require('./src/device/MuseBleSource');
  return new MuseBleSource();
}

export default function App() {
  const [tab, setTab] = useState<Tab>('live');
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [detail, setDetail] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const conn = useRef<{ source: DeviceSource; engine: SessionEngine; offs: (() => void)[] } | null>(null);

  const disconnect = async () => {
    const c = conn.current;
    conn.current = null;
    if (!c) return;
    c.offs.forEach((off) => off());
    await c.source.disconnect().catch(() => undefined);
    setState('disconnected');
    setDetail(undefined);
  };

  const connect = async (kind: SourceKind) => {
    await disconnect();
    let source: DeviceSource;
    try {
      source = makeSource(kind);
    } catch (e: any) {
      setState('error');
      setDetail(e?.message ?? String(e));
      return;
    }
    const engine = new SessionEngine(kind);
    const offs = [
      source.onBatch((b) => engine.handleBatch(b)),
      source.onState((s, d) => {
        setState(s);
        setDetail(d);
        if (s === 'disconnected' && conn.current?.source === source) {
          // headband dropped: stop any recording rather than pretending it continued
          engine.stopRecording();
          conn.current = null;
        }
      }),
    ];
    conn.current = { source, engine, offs };
    try {
      await source.connect();
    } catch (e: any) {
      offs.forEach((off) => off());
      conn.current = null;
      setState('error');
      setDetail(e?.message ?? String(e));
    }
  };

  useEffect(() => () => void disconnect(), []);

  const c = conn.current;
  const streaming = state === 'streaming' && c;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'live' ? (
          streaming ? (
            <LiveScreen
              source={c!.source}
              engine={c!.engine}
              onDisconnect={disconnect}
              onSaved={() => {
                setRefreshKey((k) => k + 1);
                setTab('sessions');
              }}
            />
          ) : (
            <ConnectScreen state={state} detail={detail} onConnect={connect} />
          )
        ) : (
          <SessionsScreen refreshKey={refreshKey} />
        )}
      </View>
      <View style={styles.tabBar}>
        {(['live', 'sessions'] as Tab[]).map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)} accessibilityRole="tab">
            <Text style={[styles.tabText, tab === t && { color: colors.accent }]}>{t === 'live' ? 'Live' : 'Sessions'}</Text>
            <View style={[styles.tabDot, tab === t && { backgroundColor: colors.accent }]} />
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  tabDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent' },
});
