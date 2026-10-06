import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import { BANDS, BandName, BandPowers, ContactQuality, MUSE_CHANNELS } from '../core/types';
import { bandColors, channelColors, colors, qualityColor, radius, space } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.record : 'transparent';
  const fg = kind === 'secondary' ? colors.text : colors.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Tag({ text, color = colors.muted }: { text: string; color?: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

function useWidth(initial = 300): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

/** Four stacked EEG traces. Each channel gets a fixed ±scale µV lane. */
export function Waveforms({ data, scaleUv = 60, height = 220 }: { data: Float32Array[]; scaleUv?: number; height?: number }) {
  const [width, onLayout] = useWidth();
  const lane = height / data.length;
  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={width} height={height}>
        {data.map((ch, c) => {
          const mid = lane * c + lane / 2;
          const n = ch.length;
          let pts = '';
          for (let i = 0; i < n; i++) {
            const v = Math.max(-scaleUv, Math.min(scaleUv, ch[i]));
            const x = n > 1 ? (i / (n - 1)) * width : 0;
            const y = mid - (v / scaleUv) * (lane / 2 - 2);
            pts += `${x.toFixed(1)},${y.toFixed(1)} `;
          }
          return (
            <React.Fragment key={c}>
              <Line x1={0} x2={width} y1={mid} y2={mid} stroke={colors.border} strokeWidth={1} />
              {n > 1 && <Polyline points={pts} fill="none" stroke={channelColors[c]} strokeWidth={1.4} />}
            </React.Fragment>
          );
        })}
      </Svg>
      {MUSE_CHANNELS.map((name, c) => (
        <Text key={name} style={[styles.laneLabel, { top: lane * c + 2, color: channelColors[c] }]}>
          {name}
        </Text>
      ))}
    </View>
  );
}

/** Muse sensor positions: ears on the outside, forehead in the middle. */
export function ContactMap({ quality }: { quality: (ContactQuality | null)[] }) {
  const label = (q: ContactQuality | null) => (q === null ? 'waiting' : q === 'good' ? 'good' : q === 'fair' ? 'okay' : 'adjust');
  return (
    <View style={styles.contactRow}>
      {MUSE_CHANNELS.map((name, c) => {
        const q = quality[c];
        const col = q ? qualityColor(q) : colors.border;
        return (
          <View key={name} style={[styles.contactItem, (c === 1 || c === 2) && { marginTop: -10 }]}>
            <View style={[styles.contactDot, { borderColor: col, backgroundColor: q === 'good' ? col : 'transparent' }]} />
            <Text style={styles.contactName}>{name}</Text>
            <Text style={[styles.contactState, { color: col === colors.border ? colors.muted : col }]}>{label(q)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Relative band power as horizontal bars. */
export function BandBars({ bands }: { bands: BandPowers | null }) {
  return (
    <View style={{ gap: 6 }}>
      {(Object.keys(BANDS) as BandName[]).map((b) => {
        const v = bands ? bands[b] : 0;
        return (
          <View key={b} style={styles.bandRow}>
            <Text style={styles.bandName}>{b}</Text>
            <View style={styles.bandTrack}>
              <View style={{ width: `${Math.round(v * 100)}%`, height: '100%', backgroundColor: bandColors[b], borderRadius: 4 }} />
            </View>
            <Text style={styles.bandPct}>{bands ? `${Math.round(v * 100)}%` : '–'}</Text>
          </View>
        );
      })}
      <Text style={styles.hint}>
        {Object.entries(BANDS)
          .map(([b, [lo, hi]]) => `${b} ${lo}–${hi} Hz`)
          .join(' · ')}
      </Text>
    </View>
  );
}

/** Calm score over time (0..1). Gaps = abstained windows. */
export function ScoreTimeline({ points, height = 120 }: { points: { t: number; v: number | null }[]; height?: number }) {
  const [width, onLayout] = useWidth();
  const tMax = Math.max(1, ...points.map((p) => p.t));
  const segments: string[] = [];
  let cur = '';
  for (const p of points) {
    if (p.v === null) {
      if (cur) segments.push(cur);
      cur = '';
      continue;
    }
    const x = (p.t / tMax) * width;
    const y = height - p.v * height;
    cur += `${x.toFixed(1)},${y.toFixed(1)} `;
  }
  if (cur) segments.push(cur);
  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height * 0.4} fill={colors.calm} opacity={0.07} />
        <Rect x={0} y={height * 0.6} width={width} height={height * 0.4} fill={colors.active} opacity={0.07} />
        <Line x1={0} x2={width} y1={height * 0.4} y2={height * 0.4} stroke={colors.border} strokeDasharray="4 4" />
        <Line x1={0} x2={width} y1={height * 0.6} y2={height * 0.6} stroke={colors.border} strokeDasharray="4 4" />
        {segments.map((s, i) => (
          <Polyline key={i} points={s} fill="none" stroke={colors.text} strokeWidth={2} />
        ))}
      </Svg>
      <Text style={[styles.timelineLabel, { top: 4 }]}>Calm</Text>
      <Text style={[styles.timelineLabel, { bottom: 4 }]}>Active</Text>
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.lg, borderWidth: 1, borderColor: colors.border },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  button: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  laneLabel: { position: 'absolute', left: 4, fontSize: 10, fontWeight: '700' },
  contactRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  contactItem: { alignItems: 'center', width: 64 },
  contactDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, marginBottom: 6 },
  contactName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  contactState: { fontSize: 11, marginTop: 2 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandName: { color: colors.text, width: 48, fontSize: 13 },
  bandTrack: { flex: 1, height: 10, backgroundColor: colors.cardAlt, borderRadius: 4, overflow: 'hidden' },
  bandPct: { color: colors.muted, width: 38, textAlign: 'right', fontSize: 12 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 4 },
  timelineLabel: { position: 'absolute', right: 4, color: colors.muted, fontSize: 10 },
  stat: { flex: 1, alignItems: 'flex-start' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
