import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SavingsChart } from '../components/SavingsChart.tsx';
import { Card, Muted, Screen, SectionTitle, styles, SwitchRow, useDb } from '../components/ui.tsx';
import { getGoal, savingsTotal } from '../db/repo.ts';
import type { SavingsGoal } from '../db/types.ts';
import { formatDuration, monthsToReach, simulateSavings } from '../lib/calc.ts';
import { formatMoney } from '../lib/money.ts';
import { colors } from '../theme.ts';

const MAX_MONTHLY = 3000;
const PRESETS = [10, 30, 50, 100, 200, 500];

export default function SimulatorScreen() {
  const db = useDb();
  const [monthly, setMonthly] = useState(30);
  const [monthlyText, setMonthlyText] = useState('30');
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(0);
  const [current, setCurrent] = useState(0);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);

  useEffect(() => {
    savingsTotal(db).then((t) => {
      setCurrent(t);
      setIncludeCurrent(t > 0);
    });
    getGoal(db).then(setGoal);
  }, [db]);

  const setMonthlyValue = (v: number) => {
    const clamped = Math.min(MAX_MONTHLY, Math.max(0, Math.round(v)));
    setMonthly(clamped);
    setMonthlyText(String(clamped));
  };

  const initial = includeCurrent ? current : 0;
  const points = useMemo(() => simulateSavings(monthly, years, rate, initial), [monthly, years, rate, initial]);
  const end = points[points.length - 1];
  const milestones = [1, 2, 5, 10, 15, 20, 30, 40].filter((y) => y < years).concat(years);
  const goalMonths = goal ? monthsToReach(goal.target, monthly, rate, initial) : null;

  return (
    <Screen padBottom={40}>
      <Card>
        <Muted>Si je mets de côté</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Stepper label="−" onPress={() => setMonthlyValue(monthly - (monthly > 100 ? 10 : 5))} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <TextInput
              value={monthlyText}
              onChangeText={(t) => {
                const digits = t.replace(/[^\d]/g, '');
                setMonthlyText(digits);
                if (digits) setMonthly(Math.min(MAX_MONTHLY, Number(digits)));
              }}
              onBlur={() => setMonthlyValue(monthly)}
              keyboardType="number-pad"
              maxLength={4}
              style={{ fontSize: 40, fontWeight: '800', color: colors.primary, width: 110, textAlign: 'right', padding: 0 }}
            />
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary }}> €</Text>
          </View>
          <Stepper label="+" onPress={() => setMonthlyValue(monthly + (monthly >= 100 ? 10 : 5))} />
        </View>
        <Muted style={{ textAlign: 'center', marginTop: -8 }}>par mois</Muted>
        <Slider
          minimumValue={0}
          maximumValue={MAX_MONTHLY}
          step={10}
          value={monthly}
          onValueChange={(v) => setMonthlyValue(v)}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
        <View style={styles.wrap}>
          {PRESETS.map((p) => (
            <Pressable key={p} onPress={() => setMonthlyValue(p)} style={[chip, monthly === p && chipOn]}>
              <Text style={{ color: monthly === p ? '#fff' : colors.text, fontSize: 13 }}>{p} €</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.gaugeHead, { marginTop: 4 }]}>
          <Muted>Pendant</Muted>
          <Text style={{ fontWeight: '700', color: colors.text }}>{years} an{years > 1 ? 's' : ''}</Text>
        </View>
        <Slider
          minimumValue={1}
          maximumValue={40}
          step={1}
          value={years}
          onValueChange={(v) => setYears(Math.round(v))}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />

        <View style={styles.gaugeHead}>
          <Muted>Taux d'intérêt annuel</Muted>
          <Text style={{ fontWeight: '700', color: colors.text }}>{rate.toFixed(1).replace('.', ',')} %</Text>
        </View>
        <Slider
          minimumValue={0}
          maximumValue={10}
          step={0.1}
          value={rate}
          onValueChange={(v) => setRate(Math.round(v * 10) / 10)}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
        <Muted style={{ fontSize: 12 }}>0 % = simple mise de côté. Mets le taux de ton livret ou placement (il peut changer).</Muted>

        {current > 0 && (
          <SwitchRow
            label={`Partir de mon épargne actuelle (${formatMoney(current, { decimals: false })})`}
            value={includeCurrent}
            onChange={setIncludeCurrent}
          />
        )}
      </Card>

      <Card>
        <SectionTitle>Dans {years} an{years > 1 ? 's' : ''}, tu aurais</SectionTitle>
        <SavingsChart points={points} />
        <Muted style={{ fontSize: 12, textAlign: 'center' }}>Fais glisser le doigt sur la courbe pour voir chaque mois.</Muted>
      </Card>

      <Card style={{ gap: 6 }}>
        <SectionTitle>Étapes</SectionTitle>
        {milestones.map((y) => {
          const p = points[y * 12];
          return (
            <View key={y} style={[styles.gaugeHead, { paddingVertical: 4 }]}>
              <Text style={{ color: colors.text, width: 70 }}>{y} an{y > 1 ? 's' : ''}</Text>
              <Muted style={{ flex: 1 }}>
                versé {formatMoney(p.contributed, { decimals: false })}
                {p.balance - p.contributed >= 1 ? ` + ${formatMoney(p.balance - p.contributed, { decimals: false })} d'intérêts` : ''}
              </Muted>
              <Text style={{ fontWeight: '700', color: colors.text }}>{formatMoney(p.balance, { decimals: false })}</Text>
            </View>
          );
        })}
        {goal && (
          <Text style={{ color: colors.primary, fontWeight: '600', marginTop: 6 }}>
            🎯 {goal.name} ({formatMoney(goal.target, { decimals: false })}) :{' '}
            {goalMonths === 0
              ? 'déjà atteint'
              : goalMonths == null
                ? 'jamais atteint à ce rythme'
                : `atteint dans ${formatDuration(goalMonths)}`}
          </Text>
        )}
        <Muted style={{ fontSize: 12 }}>
          Simulation indicative : versement en fin de mois, intérêts calculés chaque mois (taux annuel ÷ 12), sans impôts ni
          inflation. Total final : {formatMoney(end.balance)}.
        </Muted>
      </Card>
    </Screen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 24, color: colors.primary, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const chip = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.card,
} as const;
const chipOn = { backgroundColor: colors.primary, borderColor: colors.primary } as const;
