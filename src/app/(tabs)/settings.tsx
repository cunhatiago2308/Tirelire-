import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Button, Card, Muted, Screen, SectionTitle, SwitchRow, useDb, useOnFocus } from '../../components/ui.tsx';
import { getCategories, getGoal, getSetting, listRecurring, setSetting } from '../../db/repo.ts';
import type { Category, RecurringRow, SavingsGoal } from '../../db/types.ts';
import { shareCsvExport } from '../../lib/exportFile.ts';
import { formatMoney } from '../../lib/money.ts';
import { colors } from '../../theme.ts';

export default function SettingsScreen() {
  const db = useDb();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [autoSavings, setAutoSavings] = useState(true);
  const [exporting, setExporting] = useState(false);

  useOnFocus(async () => {
    setCategories(await getCategories(db));
    setRecurring(await listRecurring(db));
    setGoal(await getGoal(db));
    setAutoSavings((await getSetting(db, 'auto_savings')) === '1');
  }, [db]);

  const doExport = async () => {
    setExporting(true);
    try {
      await shareCsvExport(db);
    } catch (e) {
      Alert.alert('Export impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const fixedTotal = recurring.filter((r) => r.active).reduce((s, r) => s + r.amount, 0);

  return (
    <Screen padBottom={40}>
      {(['expense', 'income'] as const).map((kind) => (
        <Card key={kind} style={{ gap: 4 }}>
          <SectionTitle right={<AddLink href={{ pathname: '/category/[id]', params: { id: 'new', kind } }} />}>
            {kind === 'expense' ? 'Catégories & budgets' : 'Catégories de revenus'}
          </SectionTitle>
          {kind === 'expense' && <Muted>Budget mensuel par catégorie = enveloppe affichée sur l'accueil.</Muted>}
          {categories
            .filter((c) => c.kind === kind)
            .map((c) => (
              <Row
                key={c.id}
                color={c.color}
                title={c.name}
                right={kind === 'expense' ? (c.budget ? `${formatMoney(c.budget, { decimals: false })}/mois` : 'pas de budget') : ''}
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(c.id) } })}
              />
            ))}
        </Card>
      ))}

      <Card style={{ gap: 4 }}>
        <SectionTitle right={<AddLink href={{ pathname: '/recurring/[id]', params: { id: 'new' } }} />}>Dépenses fixes</SectionTitle>
        <Muted>Loyer, forfait, abonnements… déduits d'avance du « dispo aujourd'hui » puis ajoutés automatiquement le jour venu.</Muted>
        {recurring.length === 0 && <Muted style={{ paddingVertical: 8 }}>Aucune dépense fixe.</Muted>}
        {recurring.map((r) => (
          <Row
            key={r.id}
            color={r.category_color ?? '#9CA3AF'}
            title={`${r.label}${r.active ? '' : ' (en pause)'}`}
            right={`${formatMoney(r.amount)} · le ${r.day}`}
            onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: String(r.id) } })}
          />
        ))}
        {recurring.length > 0 && <Muted>Total mensuel : {formatMoney(fixedTotal)}</Muted>}
      </Card>

      <Card>
        <SectionTitle>Épargne</SectionTitle>
        <Row
          color={colors.primary}
          title={goal ? goal.name : 'Aucun objectif'}
          right={goal ? formatMoney(goal.target, { decimals: false }) : 'Créer'}
          onPress={() => router.push('/goal')}
        />
        <SwitchRow
          label="Alimentation automatique"
          hint="En fin de mois, le solde net positif est versé dans l'objectif."
          value={autoSavings}
          onChange={async (v) => {
            setAutoSavings(v);
            await setSetting(db, 'auto_savings', v ? '1' : '0');
          }}
        />
      </Card>

      <Card>
        <SectionTitle>Sauvegarde</SectionTitle>
        <Muted>
          Toutes les données restent sur ce téléphone (aucun serveur, aucun compte). Exporte régulièrement l'historique complet
          en CSV (Drive, mail, Fichiers…) pour ne rien perdre en cas de changement de téléphone.
        </Muted>
        <Button title={exporting ? 'Export…' : 'Exporter en CSV'} onPress={doExport} disabled={exporting} />
      </Card>

      <Muted style={{ textAlign: 'center' }}>Tirelire · 100 % local · sans pub, sans IA, sans compte</Muted>
    </Screen>
  );
}

function AddLink({ href }: { href: Href }) {
  return (
    <Pressable onPress={() => router.push(href)} hitSlop={10}>
      <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Ajouter</Text>
    </Pressable>
  );
}

function Row({ color, title, right, onPress }: { color: string; title: string; right: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text style={{ flex: 1, fontSize: 15, color: colors.text }} numberOfLines={1}>{title}</Text>
      <Text style={{ color: colors.muted }}>{right}</Text>
      <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}
