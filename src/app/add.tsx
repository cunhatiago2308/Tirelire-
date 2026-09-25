import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { closeScreen, Button, Card, Chip, Field, Muted, Screen, styles, SwitchRow, useDb } from '../components/ui.tsx';
import {
  addTransaction,
  deleteTransaction,
  getCategories,
  getTransaction,
  monthSummary,
  updateTransaction,
  type TransactionInput,
} from '../db/repo.ts';
import type { Category, TxType } from '../db/types.ts';
import { gaugeLevel, saleMargin, type GaugeLevel } from '../lib/calc.ts';
import { addDays, dayOf, isValidDateStr, monthOf, relativeDayLabel, todayStr } from '../lib/dates.ts';
import { amountToInput, formatMoney, parseAmount } from '../lib/money.ts';
import { colors, typeMeta } from '../theme.ts';

const TYPES: TxType[] = ['expense', 'income', 'sale'];

export default function AddScreen() {
  const db = useDb();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const editId = params.id ? Number(params.id) : null;

  const [type, setType] = useState<TxType>(TYPES.includes(params.type as TxType) ? (params.type as TxType) : 'expense');
  const [amountText, setAmountText] = useState('');
  const [purchaseText, setPurchaseText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [isRecurringTx, setIsRecurringTx] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<TextInput>(null);

  useEffect(() => {
    getCategories(db).then(setCategories);
    if (editId) {
      getTransaction(db, editId).then((t) => {
        if (!t) return;
        setType(t.type);
        setAmountText(amountToInput(t.amount));
        setPurchaseText(amountToInput(t.purchase_price));
        setCategoryId(t.category_id);
        setDate(t.date);
        setNote(t.note ?? '');
        setIsRecurringTx(t.recurring_id != null);
        setShowMore(true);
      });
    }
  }, [db, editId]);

  const amount = parseAmount(amountText);
  const purchase = purchaseText.trim() ? parseAmount(purchaseText) : null;
  const purchaseInvalid = purchaseText.trim() !== '' && purchase == null;
  const visibleCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));
  const meta = typeMeta[type];

  const envelopeLevel = async (catId: number | null, month: string): Promise<{ level: GaugeLevel; cat?: { name: string; spent: number; budget: number } } | null> => {
    if (!catId) return null;
    const s = await monthSummary(db, month);
    const c = s.byCategory.find((x) => x.id === catId);
    if (!c || !c.budget) return null;
    return { level: gaugeLevel(c.spent, c.budget), cat: { name: c.name, spent: c.spent, budget: c.budget } };
  };

  const save = async (catOverride?: number | null) => {
    if (saving || !amount || purchaseInvalid || !isValidDateStr(date)) return;
    const catId = catOverride !== undefined ? catOverride : categoryId;
    const input: TransactionInput = {
      type,
      amount,
      purchase_price: type === 'sale' ? purchase : null,
      category_id: type === 'sale' ? null : catId,
      date,
      note,
      makeRecurring: type === 'expense' && recurring && !editId,
    };
    setSaving(true);
    try {
      const before = type === 'expense' ? await envelopeLevel(catId, monthOf(date)) : null;
      if (editId) await updateTransaction(db, editId, input);
      else await addTransaction(db, input);
      const after = type === 'expense' ? await envelopeLevel(catId, monthOf(date)) : null;
      if (after?.cat && after.level !== 'ok' && after.level !== before?.level) {
        const { name, spent, budget } = after.cat;
        Alert.alert(
          after.level === 'over' ? `🚨 Budget ${name} dépassé` : `⚠️ Budget ${name} bientôt atteint`,
          `${formatMoney(spent)} dépensés sur ${formatMoney(budget)} (${Math.round((spent / budget) * 100)} %).`,
        );
      }
      closeScreen();
    } finally {
      setSaving(false);
    }
  };

  const onPickCategory = (id: number) => {
    // Quick mode: when adding with a valid amount, tapping a category saves immediately.
    if (!editId && amount && !showMore) {
      setCategoryId(id);
      save(id);
    } else {
      setCategoryId(id === categoryId ? null : id);
    }
  };

  const confirmDelete = () => {
    if (!editId) return;
    Alert.alert('Supprimer ?', 'Cette opération sera définitivement supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, editId);
          closeScreen();
        },
      },
    ]);
  };

  const margin = amount != null ? saleMargin(amount, purchase) : null;
  const quickMode = !editId && !showMore && type !== 'sale';

  return (
    <Screen padBottom={40}>
      <Stack.Screen options={{ title: editId ? 'Modifier' : 'Ajouter' }} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TYPES.map((t) => (
          <Chip key={t} label={typeMeta[t].label} selected={type === t} color={typeMeta[t].color} onPress={() => { setType(t); setCategoryId(null); }} />
        ))}
      </View>

      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Muted>{type === 'sale' ? 'Prix de vente' : 'Montant'}</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            ref={amountRef}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#D1D5DB"
            autoFocus={!editId}
            style={{ fontSize: 48, fontWeight: '800', color: meta.color, width: 220, textAlign: 'right', paddingRight: 6 }}
          />
          <Text style={{ fontSize: 36, fontWeight: '700', color: meta.color }}>€</Text>
        </View>
      </View>

      {type === 'sale' ? (
        <Card>
          <Field
            label="Prix d'achat (optionnel)"
            value={purchaseText}
            onChangeText={setPurchaseText}
            keyboardType="decimal-pad"
            placeholder="ex. 8"
          />
          {purchaseInvalid && <Text style={{ color: colors.red }}>Prix d'achat invalide</Text>}
          {margin != null && (
            <Text style={{ fontSize: 16, fontWeight: '700', color: margin >= 0 ? colors.green : colors.red }}>
              Marge : {formatMoney(margin, { sign: true })}
            </Text>
          )}
          <Field label="Article" value={note} onChangeText={setNote} placeholder="ex. Veste Levi's" />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          <Muted>{quickMode ? (amount ? 'Touche une catégorie pour enregistrer' : 'Saisis le montant, puis touche une catégorie') : 'Catégorie'}</Muted>
          <View style={styles.wrap}>
            {visibleCats.map((c) => (
              <Chip key={c.id} label={c.name} dot={c.color} color={c.color} selected={c.id === categoryId} onPress={() => onPickCategory(c.id)} />
            ))}
          </View>
        </View>
      )}

      {(showMore || type === 'sale') ? (
        <Card>
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Date</Text>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Button title="‹" variant="secondary" onPress={() => setDate(addDays(date, -1))} style={{ paddingVertical: 8, width: 48 }} />
              <Pressable onPress={() => setDate(todayStr())}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{relativeDayLabel(date)}</Text>
              </Pressable>
              <Button title="›" variant="secondary" onPress={() => setDate(addDays(date, 1))} style={{ paddingVertical: 8, width: 48 }} />
            </View>
          </View>
          {type !== 'sale' && <Field label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="ex. courses Lidl" />}
          {type === 'expense' && !editId && (
            <SwitchRow
              label="Dépense fixe mensuelle"
              hint={`Répétée chaque mois le ${dayOf(date)} et déduite d'avance du « dispo aujourd'hui »`}
              value={recurring}
              onChange={setRecurring}
            />
          )}
          {isRecurringTx && <Muted>↻ Générée par une dépense fixe (gérable dans Réglages).</Muted>}
        </Card>
      ) : (
        <Pressable onPress={() => setShowMore(true)}>
          <Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>
            + Date, note, dépense fixe…
          </Text>
        </Pressable>
      )}

      <Button
        title={editId ? 'Enregistrer les modifications' : quickMode && categoryId == null ? 'Enregistrer sans catégorie' : 'Enregistrer'}
        variant={quickMode ? 'secondary' : 'primary'}
        onPress={() => save()}
        disabled={!amount || purchaseInvalid || saving}
      />
      {editId && <Button title="Supprimer" variant="danger" onPress={confirmDelete} />}
    </Screen>
  );
}
