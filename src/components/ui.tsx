import { useCallback, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Db } from '../db/types.ts';
import { gaugeLevel } from '../lib/calc.ts';
import { formatMoney } from '../lib/money.ts';
import { colors, levelColor, radius } from '../theme.ts';

export function useDb(): Db {
  return useSQLiteContext();
}

/** Closes a modal screen; falls back to home when opened directly (deep link, reload). */
export function closeScreen() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Runs `load` every time the screen gets focus (e.g. after closing the add modal). */
export function useOnFocus(load: () => void | Promise<void>, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void load(); }, deps));
}

export function Screen({ children, padBottom = 100 }: { children: ReactNode; padBottom?: number }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: padBottom, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[{ color: colors.muted, fontSize: 13 }, style]}>{children}</Text>;
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.primary,
  dot,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  dot?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color, borderColor: color },
        pressed && { opacity: 0.7 },
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: selected ? '#fff' : dot }]} />}
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.redSoft : colors.primarySoft;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.red : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#9CA3AF" {...props} style={[styles.input, props.style]} />
      {hint && <Muted>{hint}</Muted>}
    </View>
  );
}

export function SwitchRow({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
        {hint && <Muted>{hint}</Muted>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

export function ProgressBar({ ratio, color, height = 10 }: { ratio: number; color: string; height?: number }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Envelope gauge: name, spent / budget, coloured bar. */
export function Gauge({ name, color, spent, budget }: { name: string; color: string; spent: number; budget: number }) {
  const level = gaugeLevel(spent, budget);
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const left = budget - spent;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.gaugeHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }} numberOfLines={1}>{name}</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {formatMoney(spent, { decimals: false })} / {formatMoney(budget, { decimals: false })}
        </Text>
      </View>
      <ProgressBar ratio={budget > 0 ? spent / budget : 1} color={levelColor[level]} />
      <Text style={{ fontSize: 12, color: levelColor[level] }}>
        {level === 'over'
          ? `Dépassé de ${formatMoney(-left)} (${pct} %)`
          : `${pct} % utilisé · reste ${formatMoney(left)}`}
      </Text>
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 17, fontWeight: '700', color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 24 }}>{children}</Text>;
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: 14, color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  button: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { backgroundColor: '#EEF0F4', overflow: 'hidden' },
  gaugeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
