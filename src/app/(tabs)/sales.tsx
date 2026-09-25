import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Fab } from '../../components/Fab.tsx';
import { TxRow } from '../../components/TxRow.tsx';
import { Card, Chip, Empty, Muted, Screen, SectionTitle, Stat, useDb, useOnFocus } from '../../components/ui.tsx';
import { listTransactions } from '../../db/repo.ts';
import type { TransactionRow } from '../../db/types.ts';
import { summarizeSales } from '../../lib/calc.ts';
import { addMonths, monthLabel, monthOf, todayStr } from '../../lib/dates.ts';
import { formatMoney } from '../../lib/money.ts';
import { colors } from '../../theme.ts';

type Period = 'month' | 'prev' | 'all';

export default function SalesScreen() {
  const db = useDb();
  const [period, setPeriod] = useState<Period>('month');
  const [sales, setSales] = useState<TransactionRow[]>([]);
  const current = monthOf(todayStr());
  const month = period === 'month' ? current : period === 'prev' ? addMonths(current, -1) : null;

  useOnFocus(useCallback(async () => {
    setSales(await listTransactions(db, { type: 'sale', month, limit: 5000 }));
  }, [db, month]));

  const s = summarizeSales(sales);
  const missing = s.count - s.withMarginCount;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Ce mois" selected={period === 'month'} onPress={() => setPeriod('month')} color={colors.sale} />
          <Chip label="Mois dernier" selected={period === 'prev'} onPress={() => setPeriod('prev')} color={colors.sale} />
          <Chip label="Tout" selected={period === 'all'} onPress={() => setPeriod('all')} color={colors.sale} />
        </View>

        <Card>
          <SectionTitle>{month ? monthLabel(month) : 'Depuis le début'}</SectionTitle>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Ventes" value={String(s.count)} />
            <Stat label="Total encaissé" value={formatMoney(s.total)} color={colors.sale} />
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Marge totale" value={formatMoney(s.marginTotal, { sign: true })} color={s.marginTotal >= 0 ? colors.green : colors.red} />
            <Stat label="Marge moy. / vente" value={s.avgMargin == null ? '—' : formatMoney(s.avgMargin, { sign: true })} />
          </View>
          {s.marginRate != null && (
            <Muted>Taux de marge : {Math.round(s.marginRate * 100)} % du prix de vente</Muted>
          )}
          {missing > 0 && (
            <Muted>
              {missing} vente{missing > 1 ? 's' : ''} sans prix d'achat : exclue{missing > 1 ? 's' : ''} du calcul de marge.
            </Muted>
          )}
        </Card>

        <Card style={{ gap: 0 }}>
          {sales.length === 0 ? (
            <Empty>Aucune vente sur la période.</Empty>
          ) : (
            sales.map((t) => <TxRow key={t.id} tx={t} showDate />)
          )}
        </Card>
        <Muted style={{ textAlign: 'center' }}>
          Dans le solde, une vente compte pour sa marge (prix de vente − prix d'achat). Inutile de saisir l'achat en dépense.
        </Muted>
      </Screen>
      <Fab type="sale" />
    </View>
  );
}
