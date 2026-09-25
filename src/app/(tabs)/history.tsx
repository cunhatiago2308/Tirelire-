import { useMemo, useState } from 'react';
import { ScrollView, SectionList, Text, View } from 'react-native';
import { Fab } from '../../components/Fab.tsx';
import { TxRow } from '../../components/TxRow.tsx';
import { Chip, Empty, useDb, useOnFocus } from '../../components/ui.tsx';
import { getCategories, listTransactions } from '../../db/repo.ts';
import type { Category, TransactionRow, TxType } from '../../db/types.ts';
import { saleNet } from '../../lib/calc.ts';
import { relativeDayLabel } from '../../lib/dates.ts';
import { formatMoney } from '../../lib/money.ts';
import { colors, typeMeta } from '../../theme.ts';

export default function HistoryScreen() {
  const db = useDb();
  const [type, setType] = useState<TxType | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<TransactionRow[]>([]);

  useOnFocus(async () => {
    setCategories(await getCategories(db));
    setRows(await listTransactions(db, { type, categoryId, limit: 1000 }));
  }, [db, type, categoryId]);

  const sections = useMemo(() => {
    const byDate = new Map<string, TransactionRow[]>();
    for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    return [...byDate.entries()].map(([date, data]) => ({
      date,
      data,
      total: data.reduce((s, t) => s + (t.type === 'sale' ? saleNet(t.amount, t.purchase_price) : typeMeta[t.type].sign * t.amount), 0),
    }));
  }, [rows]);

  const shownCats = categories.filter((c) =>
    type === 'income' ? c.kind === 'income' : type === 'expense' ? c.kind === 'expense' : true,
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Tout" selected={type === null} onPress={() => { setType(null); setCategoryId(null); }} />
          {(['expense', 'income', 'sale'] as const).map((t) => (
            <Chip
              key={t}
              label={typeMeta[t].plural}
              color={typeMeta[t].color}
              selected={type === t}
              onPress={() => { setType(type === t ? null : t); setCategoryId(null); }}
            />
          ))}
        </ScrollView>
        {type !== 'sale' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {shownCats.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                dot={c.color}
                color={c.color}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, marginBottom: 2 }}>
            <Text style={{ fontWeight: '700', color: colors.muted }}>{relativeDayLabel(section.date)}</Text>
            <Text style={{ color: colors.muted }}>{formatMoney(section.total, { sign: true })}</Text>
          </View>
        )}
        renderItem={({ item }) => <TxRow tx={item} />}
        ListEmptyComponent={<Empty>Aucune opération{type || categoryId ? ' pour ce filtre' : ''}. Touche + pour en ajouter.</Empty>}
      />
      <Fab type={type ?? undefined} />
    </View>
  );
}
