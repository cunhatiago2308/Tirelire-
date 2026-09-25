import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Muted, Screen, SectionTitle, styles, useDb, useOnFocus } from '../../components/ui.tsx';
import { monthSummary, type MonthSummary } from '../../db/repo.ts';
import { pctChange } from '../../lib/calc.ts';
import { addMonths, monthLabel, monthOf, monthShortLabel, todayStr } from '../../lib/dates.ts';
import { formatMoney } from '../../lib/money.ts';
import { colors } from '../../theme.ts';

export default function StatsScreen() {
  const db = useDb();
  const current = monthOf(todayStr());
  const [month, setMonth] = useState(current);
  const [cur, setCur] = useState<MonthSummary | null>(null);
  const [prev, setPrev] = useState<MonthSummary | null>(null);
  const [history, setHistory] = useState<MonthSummary[]>([]);

  useOnFocus(async () => {
    const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
    const all = await Promise.all([addMonths(month, -6), ...months].map((m) => monthSummary(db, m)));
    setPrev(all[all.length - 2]);
    setCur(all[all.length - 1]);
    setHistory(all.slice(1));
  }, [db, month]);

  const spent = (cur?.byCategory ?? []).filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const maxSpent = Math.max(1, ...spent.map((c) => c.spent));

  return (
    <Screen padBottom={40}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Button title="‹" variant="secondary" onPress={() => setMonth(addMonths(month, -1))} style={{ width: 48, paddingVertical: 8 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textTransform: 'capitalize' }}>{monthLabel(month)}</Text>
        <Button
          title="›"
          variant="secondary"
          disabled={month >= current}
          onPress={() => setMonth(addMonths(month, 1))}
          style={{ width: 48, paddingVertical: 8 }}
        />
      </View>

      {cur && prev && (
        <Card>
          <Line label="Revenus" value={cur.income + cur.salesRevenue} prev={prev.income + prev.salesRevenue} higherIsBetter />
          <Muted style={{ marginTop: -8 }}>
            dont ventes {formatMoney(cur.salesRevenue)} ({cur.salesCount}) · marge ventes {formatMoney(cur.salesNet)}
          </Muted>
          <Line label="Dépenses" value={cur.expenses} prev={prev.expenses} higherIsBetter={false} />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Line label="Solde net" value={cur.net} prev={prev.net} higherIsBetter bold />
          <Muted>Solde net = revenus + marge des ventes − dépenses. Comparaison avec {monthLabel(addMonths(month, -1))}.</Muted>
        </Card>
      )}

      <Card>
        <SectionTitle>Dépenses par catégorie</SectionTitle>
        {spent.length === 0 && <Muted>Aucune dépense ce mois-ci.</Muted>}
        {spent.map((c) => {
          const before = prev?.byCategory.find((p) => p.id === c.id)?.spent ?? 0;
          const change = pctChange(c.spent, before);
          return (
            <View key={String(c.id)} style={{ gap: 4 }}>
              <View style={styles.gaugeHead}>
                <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>{c.name}</Text>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{formatMoney(c.spent)}</Text>
              </View>
              <View style={{ height: 14, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: `${(c.spent / maxSpent) * 100}%`, height: 14, borderRadius: 7, backgroundColor: c.color }} />
              </View>
              <Muted style={{ fontSize: 12 }}>
                {Math.round((c.spent / cur!.expenses) * 100)} % des dépenses
                {c.budget ? ` · budget ${formatMoney(c.budget, { decimals: false })}` : ''}
                {change != null ? ` · ${change > 0 ? '+' : ''}${Math.round(change)} % vs mois préc.` : ''}
              </Muted>
            </View>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>Solde net sur 6 mois</SectionTitle>
        <NetHistory data={history} selected={month} />
      </Card>
    </Screen>
  );
}

function Line({ label, value, prev, higherIsBetter, bold }: {
  label: string; value: number; prev: number; higherIsBetter: boolean; bold?: boolean;
}) {
  const change = pctChange(value, prev);
  const better = value === prev ? null : higherIsBetter ? value > prev : value < prev;
  return (
    <View style={styles.gaugeHead}>
      <Text style={{ fontSize: 15, color: colors.text, fontWeight: bold ? '700' : '400', flex: 1 }}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: bold ? 20 : 16, fontWeight: '700', color: bold && value < 0 ? colors.red : colors.text }}>
          {formatMoney(value)}
        </Text>
        <Text style={{ fontSize: 12, color: better == null ? colors.muted : better ? colors.green : colors.red }}>
          {better == null
            ? '= mois préc.'
            : `${better ? '▲ mieux' : '▼ moins bien'} ${change != null ? `(${change > 0 ? '+' : ''}${Math.round(change)} %)` : `(${formatMoney(value - prev, { sign: true })})`}`}
        </Text>
      </View>
    </View>
  );
}

function NetHistory({ data, selected }: { data: MonthSummary[]; selected: string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.net)));
  const H = 60; // height of each half (positive / negative)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {data.map((d) => {
        const h = (Math.abs(d.net) / max) * H;
        const color = d.net >= 0 ? colors.green : colors.red;
        return (
          <View key={d.month} style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ height: H, justifyContent: 'flex-end' }}>
              {d.net > 0 && <View style={{ width: 22, height: h, backgroundColor: color, borderRadius: 4 }} />}
            </View>
            <View style={{ height: 1, width: '100%', backgroundColor: colors.border }} />
            <View style={{ height: H, justifyContent: 'flex-start' }}>
              {d.net < 0 && <View style={{ width: 22, height: h, backgroundColor: color, borderRadius: 4 }} />}
            </View>
            <Text style={{ fontSize: 11, color: d.month === selected ? colors.primary : colors.muted, fontWeight: d.month === selected ? '700' : '400' }}>
              {monthShortLabel(d.month)}
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>{formatMoney(d.net, { decimals: false })}</Text>
          </View>
        );
      })}
    </View>
  );
}
