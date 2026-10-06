import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import type { RecordingSummary } from '../core/engine';
import { WindowResult } from '../core/types';
import { deleteSession, getSessionResults, listSessions } from '../storage/db';
import { BandBars, Button, Card, ScoreTimeline, SectionTitle, Stat, Tag } from './components';
import { colors, labelColor, space } from './theme';

const fmtDur = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
const topLabel = (s: RecordingSummary) =>
  (Object.entries(s.labelCounts) as [string, number][]).sort((a, b) => b[1] - a[1]).find(([, n]) => n > 0)?.[0];

export function SessionsScreen({ refreshKey }: { refreshKey: number }) {
  const [sessions, setSessions] = useState<RecordingSummary[] | null>(null);
  const [open, setOpen] = useState<RecordingSummary | null>(null);

  const load = useCallback(() => {
    listSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);
  useEffect(load, [load, refreshKey]);

  if (open) {
    return (
      <ReviewScreen
        summary={open}
        onBack={() => setOpen(null)}
        onDeleted={() => {
          setOpen(null);
          load();
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: space.sm }}>Sessions</Text>
      {sessions === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : sessions.length === 0 ? (
        <Card>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>No recordings yet</Text>
          <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
            Connect a headband (or the simulated one), press “Start recording”, then “Stop and save”.
          </Text>
        </Card>
      ) : (
        sessions.map((s) => {
          const lbl = topLabel(s);
          return (
            <Pressable key={s.id} onPress={() => setOpen(s)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: labelColor(lbl) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{fmtDate(s.startedAt)}</Text>
                  <Text style={{ color: colors.muted, marginTop: 2 }}>
                    {fmtDur(s.durationSec)} · mostly {lbl ?? 'no result'}
                    {s.sourceKind === 'simulated' ? ' · fake data' : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
              </Card>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

function ReviewScreen({ summary, onBack, onDeleted }: { summary: RecordingSummary; onBack: () => void; onDeleted: () => void }) {
  const [results, setResults] = useState<WindowResult[] | null>(null);
  useEffect(() => {
    getSessionResults(summary.id).then(setResults).catch(() => setResults([]));
  }, [summary.id]);

  const valid = summary.windows - summary.abstained;
  const pct = (n: number) => (valid ? `${Math.round((n / valid) * 100)}%` : '–');

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }}>
      <Pressable onPress={onBack}>
        <Text style={{ color: colors.accent, fontSize: 16 }}>‹ All sessions</Text>
      </Pressable>
      <View>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{fmtDate(summary.startedAt)}</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          {summary.sourceKind === 'simulated' && <Tag text="FAKE DATA" />}
          <Tag text="DEMO MODEL" color={colors.fair} />
        </View>
      </View>

      <Card style={{ flexDirection: 'row' }}>
        <Stat label="Duration" value={fmtDur(summary.durationSec)} />
        <Stat
          label="Avg calm score"
          value={summary.meanCalm === null ? '–' : String(Math.round(summary.meanCalm * 100))}
          color={colors.accent}
        />
        <Stat label="Usable seconds" value={`${valid}/${summary.windows}`} />
      </Card>

      <Card>
        <SectionTitle>Calm score over time</SectionTitle>
        {results ? (
          <ScoreTimeline points={results.map((r) => ({ t: r.t, v: r.abstained ? null : r.calmScore ?? null }))} />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: space.sm }}>
          Breaks in the line = moments with poor contact (no result).
        </Text>
      </Card>

      <Card style={{ flexDirection: 'row' }}>
        <Stat label="Calm" value={pct(summary.labelCounts.Calm)} color={colors.calm} />
        <Stat label="Neutral" value={pct(summary.labelCounts.Neutral)} color={colors.neutral} />
        <Stat label="Active" value={pct(summary.labelCounts.Active)} color={colors.active} />
      </Card>

      <Card>
        <SectionTitle>Average frequency bands</SectionTitle>
        <BandBars bands={valid ? summary.meanRelBands : null} />
      </Card>

      {summary.gaps > 0 && (
        <Card>
          <Text style={{ color: colors.fair }}>
            {summary.gaps} signal gap{summary.gaps > 1 ? 's' : ''} detected. Gaps are never filled in.
          </Text>
        </Card>
      )}

      <Button
        title="Delete this session"
        kind="secondary"
        onPress={() =>
          Alert.alert('Delete session?', 'This removes it from this phone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteSession(summary.id);
                onDeleted();
              },
            },
          ])
        }
      />
    </ScrollView>
  );
}
