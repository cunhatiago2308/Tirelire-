import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { closeScreen, Button, Card, Field, Muted, Screen, SectionTitle, useDb } from '../components/ui.tsx';
import { deleteGoal, deleteSavingsEntry, getGoal, listSavingsEntries, saveGoal } from '../db/repo.ts';
import type { SavingsEntry } from '../db/types.ts';
import { formatDateLong, isValidDateStr, monthLabel, todayStr } from '../lib/dates.ts';
import { amountToInput, formatMoney, parseAmount } from '../lib/money.ts';
import { colors } from '../theme.ts';

export default function GoalScreen() {
  const db = useDb();
  const [exists, setExists] = useState(false);
  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [deadline, setDeadline] = useState('');
  const [entries, setEntries] = useState<SavingsEntry[]>([]);

  const loadEntries = () => listSavingsEntries(db).then(setEntries);

  useEffect(() => {
    getGoal(db).then((g) => {
      if (!g) return;
      setExists(true);
      setName(g.name);
      setTargetText(amountToInput(g.target));
      setDeadline(g.deadline ?? '');
    });
    loadEntries();
  }, [db]);

  const target = parseAmount(targetText);
  const deadlineValid = deadline.trim() === '' || isValidDateStr(deadline.trim());

  const save = async () => {
    if (!target || !deadlineValid) return;
    await saveGoal(db, { name: name.trim() || 'Épargne', target, deadline: deadline.trim() || null }, todayStr());
    closeScreen();
  };

  const remove = () => {
    Alert.alert("Supprimer l'objectif ?", "L'historique d'épargne sera aussi effacé.", [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteGoal(db); closeScreen(); } },
    ]);
  };

  const removeEntry = (e: SavingsEntry) => {
    Alert.alert('Supprimer ce mouvement ?', `${formatMoney(e.amount, { sign: true })} du ${formatDateLong(e.date)}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteSavingsEntry(db, e.id); loadEntries(); } },
    ]);
  };

  return (
    <Screen padBottom={40}>
      <Card>
        <Field label="Nom" value={name} onChangeText={setName} placeholder="ex. Voyage, permis, ordi" autoFocus={!exists} />
        <Field label="Montant cible (€)" value={targetText} onChangeText={setTargetText} keyboardType="decimal-pad" placeholder="ex. 1000" />
        <Field
          label="Échéance (optionnel)"
          value={deadline}
          onChangeText={setDeadline}
          placeholder="AAAA-MM-JJ, ex. 2027-06-30"
          autoCapitalize="none"
          hint="Avec une échéance, l'accueil indique combien mettre de côté par mois."
        />
        {!deadlineValid && <Text style={{ color: colors.red }}>Date invalide (format AAAA-MM-JJ).</Text>}
      </Card>
      <Muted>
        Chaque mois terminé avec un solde net positif (à partir d'aujourd'hui) est versé automatiquement dans l'objectif.
        Tu peux ajuster à la main depuis l'accueil.
      </Muted>
      <Button title="Enregistrer" onPress={save} disabled={!target || !deadlineValid} />
      {exists && <Button title="Supprimer l'objectif" variant="danger" onPress={remove} />}

      {entries.length > 0 && (
        <Card style={{ gap: 4 }}>
          <SectionTitle>Mouvements</SectionTitle>
          {entries.map((e) => (
            <Pressable key={e.id} onLongPress={() => removeEntry(e)} style={{ flexDirection: 'row', paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text }}>
                  {e.auto_month ? `Fin de mois · ${monthLabel(e.auto_month)}` : e.note || 'Ajustement manuel'}
                </Text>
                <Muted>{formatDateLong(e.date)}</Muted>
              </View>
              <Text style={{ fontWeight: '700', color: e.amount >= 0 ? colors.green : colors.red }}>
                {formatMoney(e.amount, { sign: true })}
              </Text>
            </Pressable>
          ))}
          <Muted>Appui long sur un mouvement pour le supprimer.</Muted>
        </Card>
      )}
    </Screen>
  );
}
