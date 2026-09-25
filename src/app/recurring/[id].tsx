import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { closeScreen, Button, Card, Chip, Field, Muted, Screen, styles, SwitchRow, useDb } from '../../components/ui.tsx';
import { deleteRecurring, getCategories, getRecurring, saveRecurring } from '../../db/repo.ts';
import type { Category } from '../../db/types.ts';
import { monthOf, todayStr } from '../../lib/dates.ts';
import { amountToInput, parseAmount } from '../../lib/money.ts';
import { colors } from '../../theme.ts';
import { confirmAction } from '../../lib/dialogs.ts';

export default function RecurringScreen() {
  const db = useDb();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id === 'new' ? null : Number(params.id);
  const [label, setLabel] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dayText, setDayText] = useState('1');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [active, setActive] = useState(true);
  const [startMonth, setStartMonth] = useState(monthOf(todayStr()));
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    getCategories(db, 'expense').then(setCategories);
    if (!id) return;
    getRecurring(db, id).then((r) => {
      if (!r) return;
      setLabel(r.label);
      setAmountText(amountToInput(r.amount));
      setDayText(String(r.day));
      setCategoryId(r.category_id);
      setActive(!!r.active);
      setStartMonth(r.start_month);
    });
  }, [db, id]);

  const amount = parseAmount(amountText);
  const day = Number(dayText);
  const dayValid = Number.isInteger(day) && day >= 1 && day <= 31;

  const save = async () => {
    if (!amount || !dayValid) return;
    await saveRecurring(db, {
      id: id ?? undefined,
      label: label.trim(),
      amount,
      day,
      category_id: categoryId,
      active: active ? 1 : 0,
      start_month: startMonth,
    });
    closeScreen();
  };

  const remove = () => {
    if (!id) return;
    confirmAction('Supprimer cette dépense fixe ?', "Les dépenses déjà passées restent dans l'historique.", 'Supprimer', async () => {
      await deleteRecurring(db, id);
      closeScreen();
    });
  };

  return (
    <Screen padBottom={40}>
      <Stack.Screen options={{ title: id ? 'Dépense fixe' : 'Nouvelle dépense fixe' }} />
      <Card>
        <Field label="Libellé" value={label} onChangeText={setLabel} placeholder="ex. Loyer, forfait mobile" autoFocus={!id} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 2 }}>
            <Field label="Montant (€)" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="0,00" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Jour du mois" value={dayText} onChangeText={setDayText} keyboardType="number-pad" maxLength={2} />
          </View>
        </View>
        {!dayValid && <Text style={{ color: colors.red }}>Jour entre 1 et 31 (31 = dernier jour du mois).</Text>}
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Catégorie</Text>
          <View style={styles.wrap}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                dot={c.color}
                color={c.color}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              />
            ))}
          </View>
        </View>
        {id && <SwitchRow label="Active" hint="En pause : plus générée ni déduite du dispo." value={active} onChange={setActive} />}
      </Card>
      <Muted>
        Tant que le jour n'est pas arrivé, le montant est déduit d'avance du « dispo aujourd'hui ». Le jour venu, la dépense
        est ajoutée automatiquement à l'historique.
      </Muted>
      <Button title="Enregistrer" onPress={save} disabled={!label.trim() || !amount || !dayValid} />
      {id && <Button title="Supprimer" variant="danger" onPress={remove} />}
    </Screen>
  );
}
