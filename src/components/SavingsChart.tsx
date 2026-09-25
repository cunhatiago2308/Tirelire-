import { useState } from 'react';
import { Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { SavingsPoint } from '../lib/calc.ts';
import { formatMoney } from '../lib/money.ts';
import { colors } from '../theme.ts';

// Validated pair for the dark card (CVD-safe, ≥ 3:1 contrast). Contributions are also dashed: identity is never colour-only.
export const CHART_TOTAL = '#16A34A';
export const CHART_CONTRIB = '#3B82F6';

const HEIGHT = 200;
const TOP = 12;
const LEFT = 44;

/** 0 → nice round axis maximum (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function compactMoney(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} M€`;
  if (Math.abs(n) >= 1e4) return `${String(Math.round(n / 100) / 10).replace('.', ',')} k€`;
  return formatMoney(n, { decimals: false });
}

/** Balance over time (area + line) vs. money actually put in (dashed), with a touch crosshair. */
export function SavingsChart({ points }: { points: SavingsPoint[] }) {
  const [width, setWidth] = useState(0);
  // Selection is tied to the data it was made on: new inputs → back to the end of the period.
  const [sel, setSel] = useState<{ index: number; data: SavingsPoint[] } | null>(null);
  const n = points.length - 1;
  const max = niceMax(Math.max(...points.map((p) => p.balance)));
  const plotW = Math.max(1, width - LEFT - 8); // 8px so the end marker isn't clipped
  const x = (i: number) => LEFT + (n ? (i / n) * plotW : 0);
  const y = (v: number) => TOP + (1 - v / max) * (HEIGHT - TOP);
  const line = (key: 'balance' | 'contributed') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const area = `${line('balance')}L${x(n)},${HEIGHT}L${x(0)},${HEIGHT}Z`;
  const idx = sel?.data === points ? sel.index : n;
  const cur = points[idx];
  const years = n / 12;
  const yearStep = years <= 5 ? 1 : years <= 12 ? 2 : years <= 25 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor(years / yearStep) + 1 }, (_, k) => k * yearStep);

  const pick = (e: GestureResponderEvent) => {
    const i = Math.round(((e.nativeEvent.locationX - LEFT) / plotW) * n);
    setSel({ index: Math.min(n, Math.max(0, i)), data: points });
  };

  return (
    <View style={{ gap: 8 }}>
      {/* Readout for the touched month (defaults to the end of the period) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {idx === 0 ? 'Aujourd’hui' : `Après ${idx >= 12 ? `${Math.floor(idx / 12)} an${idx >= 24 ? 's' : ''}` : ''}${idx % 12 ? ` ${idx % 12} mois` : ''}`}
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{formatMoney(cur.balance, { decimals: false })}</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'right' }}>
          versé {formatMoney(cur.contributed, { decimals: false })}
          {'\n'}intérêts {formatMoney(cur.balance - cur.contributed, { decimals: false })}
        </Text>
      </View>

      <View
        style={{ height: HEIGHT + 20 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => false}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {[0, 0.5, 1].map((f) => (
              <Line key={f} x1={LEFT} x2={width} y1={y(max * f)} y2={y(max * f)} stroke={colors.border} strokeWidth={1} />
            ))}
            <Path d={area} fill={CHART_TOTAL} fillOpacity={0.18} />
            <Path d={line('contributed')} stroke={CHART_CONTRIB} strokeWidth={2} strokeDasharray="6 4" fill="none" />
            <Path d={line('balance')} stroke={CHART_TOTAL} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Line x1={x(idx)} x2={x(idx)} y1={TOP} y2={HEIGHT} stroke={colors.muted} strokeWidth={1} strokeDasharray="2 3" />
            <Circle cx={x(idx)} cy={y(cur.contributed)} r={4} fill={CHART_CONTRIB} stroke={colors.card} strokeWidth={2} />
            <Circle cx={x(idx)} cy={y(cur.balance)} r={5} fill={CHART_TOTAL} stroke={colors.card} strokeWidth={2} />
          </Svg>
        )}
        {/* Y axis labels */}
        {[0, 0.5, 1].map((f) => (
          <Text key={f} style={{ position: 'absolute', left: 0, top: y(max * f) - 8, fontSize: 10, color: colors.muted }}>
            {compactMoney(max * f)}
          </Text>
        ))}
        {/* X axis labels (years) */}
        {width > 0 &&
          ticks.map((t) => (
            <Text
              key={t}
              style={{ position: 'absolute', top: HEIGHT + 4, left: x(t * 12) - 20, width: 40, textAlign: 'center', fontSize: 10, color: colors.muted }}
            >
              {t === 0 ? '0' : `${t} an${t > 1 ? 's' : ''}`}
            </Text>
          ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
        <Legend color={CHART_TOTAL} label="Épargne totale" />
        <Legend color={CHART_CONTRIB} label="Argent versé" dashed />
      </View>
    </View>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={18} height={4}>
        <Line x1={0} x2={18} y1={2} y2={2} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '5 3' : undefined} />
      </Svg>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}
