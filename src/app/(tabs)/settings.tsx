import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Button, Card, Muted, Screen, SectionTitle, SwitchRow, useDb, useOnFocus } from '../../components/ui.tsx';
import { getCategories, getGoal, getSetting, listRecurring, setSetting } from '../../db/repo.ts';
import type { Category, RecurringRow, SavingsGoal } from '../../db/types.ts';
import { shareCsvExport } from '../../lib/exportFile.ts';
import { formatMoney } from '../../lib/money.ts';
import { APP_NAME, colors } from '../../theme.ts';
import { notify } from '../../lib/dialogs.ts';

export default function SettingsScreen() {
  const db = useDb();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [autoSavings, setAutoSavings] = useState(true);
  const [exporting, setExporting] = useState(false);

  useOnFocus(useCallback(async () => {
    setCategories(await getCategories(db));
    setRecurring(await listRecurring(db));
    setGoal(await getGoal(db));
    setAutoSavings((await getSetting(db, 'auto_savings')) === '1');
  }, [db]));

  const doExport = async () => {
    setExporting(true);
    try {
      await shareCsvExport(db);
    } catch (e) {
      notify('Export impossible', e instanceof Error ? e.message : String(e));
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
            color={r.category_color ?? colors.muted}
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
        <Row color={colors.sale} title="Simulateur d'épargne" right="courbe" onPress={() => router.push('/simulator')} />
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

      <Card style={{ gap: 4 }}>
        <SectionTitle>Relevé bancaire</SectionTitle>
        <Muted>
          Importe l'export CSV ou OFX de ta banque : opérations catégorisées automatiquement, sans doublons. Seules les
          espèces restent à saisir à la main.
        </Muted>
        <Row color={colors.primary} title="Importer un relevé" right="CSV / OFX" onPress={() => router.push('/import')} />
        <Row color={colors.muted} title="Règles de catégorisation" right="" onPress={() => router.push('/rules')} />
      </Card>

      <Card>
        <SectionTitle>Sauvegarde</SectionTitle>
        <Muted>
          Toutes les données restent sur ce téléphone (aucun serveur, aucun compte). Exporte régulièrement l'historique complet
          en CSV (Drive, mail, Fichiers…) pour ne rien perdre en cas de changement de téléphone.
        </Muted>
        <Button title={exporting ? 'Export…' : 'Exporter en CSV'} onPress={doExport} disabled={exporting} />
      </Card>

      <Muted style={{ textAlign: 'center' }}>{APP_NAME} · 100 % local · sans pub, sans IA, sans compte</Muted>
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
