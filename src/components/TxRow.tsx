import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { TransactionRow } from '../db/types.ts';
import { saleMargin } from '../lib/calc.ts';
import { formatDateShort } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import { colors, typeMeta } from '../theme.ts';

export function TxRow({ tx, showDate = false }: { tx: TransactionRow; showDate?: boolean }) {
  const meta = typeMeta[tx.type];
  const margin = tx.type === 'sale' ? saleMargin(tx.amount, tx.purchase_price) : null;
  const title =
    tx.type === 'sale' ? tx.note || 'Vente' : tx.category_name ?? (tx.type === 'income' ? 'Revenu' : 'Sans catégorie');
  const subtitle = [
    showDate ? formatDateShort(tx.date) : null,
    tx.type !== 'sale' ? tx.note : null,
    tx.type === 'sale' && tx.purchase_price != null ? `acheté ${formatMoney(tx.purchase_price)}` : null,
    tx.recurring_id ? '↻ fixe' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/add', params: { id: String(tx.id) } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#F9FAFB' }]}
    >
      <View style={[styles.icon, { backgroundColor: tx.type === 'expense' ? (tx.category_color ?? '#9CA3AF') + '22' : meta.soft }]}>
        <View style={[styles.dot, { backgroundColor: tx.type === 'expense' ? tx.category_color ?? '#9CA3AF' : meta.color }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.amount, { color: meta.sign < 0 ? colors.text : meta.color }]}>
          {meta.sign < 0 ? '−' : '+'}
          {formatMoney(tx.amount)}
        </Text>
        {margin != null && (
          <Text style={{ fontSize: 12, color: margin >= 0 ? colors.green : colors.red }}>
            marge {formatMoney(margin, { sign: true })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  amount: { fontSize: 15, fontWeight: '700' },
});
