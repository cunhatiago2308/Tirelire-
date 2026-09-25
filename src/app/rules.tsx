import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, Field, Muted, Screen, SectionTitle, styles, useDb, useOnFocus } from '../components/ui.tsx';
import { deleteRule, getCategories, listRules, saveRule } from '../db/repo.ts';
import type { Category, RuleRow } from '../db/types.ts';
import type { RuleKind } from '../lib/bankImport.ts';
import { colors } from '../theme.ts';

type Target = { kind: RuleKind; categoryId: number | null };

const KIND_TITLES: Record<RuleKind, string> = {
  expense: 'Dépenses',
  income: 'Revenus',
  sale: 'Ventes (virements reçus)',
  ignore: 'Ignorées (virements entre tes comptes)',
};

export default function RulesScreen() {
  const db = useDb();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pattern, setPattern] = useState('');
  const [target, setTarget] = useState<Target | null>(null);

  const load = useCallback(async () => {
    setRules(await listRules(db));
    setCategories(await getCategories(db));
  }, [db]);
  useOnFocus(load);

  const add = async () => {
    if (!pattern.trim() || !target) return;
    await saveRule(db, pattern, target.kind, target.categoryId);
    setPattern('');
    setTarget(null);
    load();
  };

  const remove = (r: RuleRow) =>
    Alert.alert(`Supprimer la règle « ${r.pattern} » ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteRule(db, r.id); load(); } },
    ]);

  const isTarget = (kind: RuleKind, categoryId: number | null) => target?.kind === kind && target.categoryId === categoryId;

  return (
    <Screen padBottom={40}>
      <Muted>
        À l'import d'un relevé, un libellé qui contient un mot-clé (mot entier, accents ignorés) prend la catégorie
        associée. Le mot-clé le plus long l'emporte. Tes corrections pendant l'import ajoutent des règles automatiquement.
      </Muted>
      <Card>
        <SectionTitle>Nouvelle règle</SectionTitle>
        <Field label="Mot-clé du libellé" value={pattern} onChangeText={setPattern} placeholder="ex. PIZZERIA, BASIC FIT" autoCapitalize="characters" />
        <Text style={styles.label}>Dépense →</Text>
        <View style={styles.wrap}>
          {categories.filter((c) => c.kind === 'expense').map((c) => (
            <Chip key={c.id} label={c.name} dot={c.color} color={c.color} selected={isTarget('expense', c.id)} onPress={() => setTarget({ kind: 'expense', categoryId: c.id })} />
          ))}
        </View>
        <Text style={styles.label}>Crédit →</Text>
        <View style={styles.wrap}>
          <Chip label="🏷️ Vente" color={colors.sale} selected={isTarget('sale', null)} onPress={() => setTarget({ kind: 'sale', categoryId: null })} />
          {categories.filter((c) => c.kind === 'income').map((c) => (
            <Chip key={c.id} label={c.name} dot={c.color} color={c.color} selected={isTarget('income', c.id)} onPress={() => setTarget({ kind: 'income', categoryId: c.id })} />
          ))}
          <Chip label="Ignorer" color={colors.muted} selected={isTarget('ignore', null)} onPress={() => setTarget({ kind: 'ignore', categoryId: null })} />
        </View>
        <Button title="Ajouter la règle" onPress={add} disabled={!pattern.trim() || !target} />
      </Card>

      {(['expense', 'income', 'sale', 'ignore'] as RuleKind[]).map((kind) => {
        const list = rules.filter((r) => r.kind === kind);
        if (!list.length) return null;
        return (
          <Card key={kind} style={{ gap: 2 }}>
            <SectionTitle>{KIND_TITLES[kind]}</SectionTitle>
            {list.map((r) => (
              <Pressable key={r.id} onLongPress={() => remove(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
                <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{r.pattern}</Text>
                {r.category_name && (
                  <>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.category_color ?? colors.muted }} />
                    <Text style={{ color: colors.muted }}>{r.category_name}</Text>
                  </>
                )}
                <Pressable hitSlop={10} onPress={() => remove(r)}>
                  <Text style={{ color: colors.muted, fontSize: 16, paddingLeft: 6 }}>✕</Text>
                </Pressable>
              </Pressable>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}
