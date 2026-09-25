import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { closeScreen, Button, Card, Field, Muted, Screen, styles, useDb } from '../../components/ui.tsx';
import { countCategoryUsage, deleteCategory, getCategory, saveCategory } from '../../db/repo.ts';
import { CATEGORY_COLORS } from '../../db/schema.ts';
import type { CategoryKind } from '../../db/types.ts';
import { amountToInput, parseAmount } from '../../lib/money.ts';
import { colors } from '../../theme.ts';

export default function CategoryScreen() {
  const db = useDb();
  const params = useLocalSearchParams<{ id: string; kind?: string }>();
  const id = params.id === 'new' ? null : Number(params.id);
  const [kind, setKind] = useState<CategoryKind>(params.kind === 'income' ? 'income' : 'expense');
  const [name, setName] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    getCategory(db, id).then((c) => {
      if (!c) return;
      setKind(c.kind);
      setName(c.name);
      setBudgetText(amountToInput(c.budget));
      setColor(c.color);
    });
  }, [db, id]);

  const budget = budgetText.trim() ? parseAmount(budgetText) : null;
  const budgetInvalid = budgetText.trim() !== '' && budget == null;

  const save = async () => {
    await saveCategory(db, { id: id ?? undefined, name: name.trim(), kind, budget, color });
    closeScreen();
  };

  const remove = async () => {
    if (!id) return;
    const n = await countCategoryUsage(db, id);
    Alert.alert(
      `Supprimer « ${name} » ?`,
      n ? `${n} opération${n > 1 ? 's' : ''} garderont leur montant mais passeront « Sans catégorie ».` : undefined,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteCategory(db, id); closeScreen(); } },
      ],
    );
  };

  return (
    <Screen padBottom={40}>
      <Stack.Screen options={{ title: id ? 'Modifier la catégorie' : kind === 'expense' ? 'Nouvelle catégorie' : 'Nouvelle catégorie de revenu' }} />
      <Card>
        <Field label="Nom" value={name} onChangeText={setName} placeholder="ex. Sport" autoFocus={!id} />
        {kind === 'expense' && (
          <Field
            label="Budget mensuel (€)"
            value={budgetText}
            onChangeText={setBudgetText}
            keyboardType="decimal-pad"
            placeholder="vide = pas d'enveloppe"
            hint="Jauge verte sous 70 %, orange de 70 à 100 %, rouge au-delà."
          />
        )}
        {budgetInvalid && <Text style={{ color: colors.red }}>Montant invalide</Text>}
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Couleur</Text>
          <View style={styles.wrap}>
            {CATEGORY_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: c,
                  borderWidth: 3,
                  borderColor: color === c ? colors.text : 'transparent',
                }}
              />
            ))}
          </View>
        </View>
      </Card>
      <Button title="Enregistrer" onPress={save} disabled={!name.trim() || budgetInvalid} />
      {id && <Button title="Supprimer la catégorie" variant="danger" onPress={remove} />}
      {kind === 'expense' && !id && <Muted>La catégorie apparaîtra dans l'ajout rapide et, si un budget est fixé, sur l'accueil.</Muted>}
    </Screen>
  );
}
