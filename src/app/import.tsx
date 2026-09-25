import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { Button, Card, Chip, closeScreen, Muted, Screen, styles as ui, useDb } from '../components/ui.tsx';
import { applyImport, getCategories, prepareImport, type ImportResult } from '../db/repo.ts';
import type { Category } from '../db/types.ts';
import { decodeBytes, parseStatement, type PlannedRow } from '../lib/bankImport.ts';
import { formatDateLong, formatDateShort } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import { colors, typeMeta } from '../theme.ts';

type Phase = 'pick' | 'review' | 'done';

export default function ImportScreen() {
  const db = useDb();
  const [phase, setPhase] = useState<Phase>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [alreadyImported, setAlreadyImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<PlannedRow | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pick = async () => {
    setError(null);
    try {
      // OFX files have no reliable MIME type across banks/OSes: accept any file, the parser decides.
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return;
      setBusy(true);
      const asset = picked.assets[0];
      const bytes = asset.file
        ? new Uint8Array(await asset.file.arrayBuffer()) // web
        : await new File(asset.uri).bytes();
      const parsed = parseStatement(decodeBytes(bytes));
      const plan = await prepareImport(db, parsed.rows);
      setCategories(await getCategories(db));
      setRows(plan.rows);
      setAlreadyImported(plan.alreadyImported);
      setSkipped(parsed.skipped);
      setEdited(new Set());
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const update = (key: string, patch: Partial<PlannedRow>, markEdited = false) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    if (markEdited) setEdited((s) => new Set(s).add(key));
  };

  const confirm = async () => {
    setBusy(true);
    try {
      setResult(await applyImport(db, rows, edited));
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const toAdd = rows.filter((r) => r.include);
  const todo = toAdd.filter((r) => r.type !== 'sale' && r.categoryId == null);
  const shown = onlyTodo ? rows.filter((r) => r.include && r.type !== 'sale' && r.categoryId == null) : rows;

  if (phase === 'pick') {
    return (
      <Screen padBottom={40}>
        <Card>
          <Text style={ui.sectionTitle}>Importer un relevé bancaire</Text>
          <Muted>
            1. Dans l'app ou sur le site de ta banque, exporte tes opérations (souvent « Télécharger / Exporter mes
            opérations »), au format CSV, Excel-CSV ou OFX.{'\n'}
            2. Choisis le fichier ici : les opérations sont lues sur ton téléphone, rien n'est envoyé nulle part.{'\n'}
            3. Vérifie la catégorisation, puis importe.
          </Muted>
          <Muted>
            Les opérations déjà importées ou déjà saisies à la main sont reconnues : tu peux importer des relevés qui se
            chevauchent sans créer de doublons. Seules les dépenses en espèces restent à saisir avec +.
          </Muted>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Button title="Choisir un fichier" onPress={pick} />}
          {error && <Text style={{ color: colors.red }}>{error}</Text>}
        </Card>
        <Pressable onPress={() => router.push('/rules')}>
          <Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>Voir les règles de catégorisation</Text>
        </Pressable>
      </Screen>
    );
  }

  if (phase === 'done' && result) {
    return (
      <Screen padBottom={40}>
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>✅</Text>
          <Text style={ui.sectionTitle}>Import terminé</Text>
          <Muted style={{ textAlign: 'center' }}>
            {result.added} opération{result.added > 1 ? 's' : ''} ajoutée{result.added > 1 ? 's' : ''}
            {result.linked ? ` · ${result.linked} déjà saisie${result.linked > 1 ? 's' : ''} reliée${result.linked > 1 ? 's' : ''}` : ''}
            {result.ignored ? ` · ${result.ignored} ignorée${result.ignored > 1 ? 's' : ''}` : ''}
          </Muted>
          {result.rulesLearned > 0 && (
            <Muted style={{ textAlign: 'center' }}>
              {result.rulesLearned} nouvelle{result.rulesLearned > 1 ? 's' : ''} règle{result.rulesLearned > 1 ? 's' : ''} retenue
              {result.rulesLearned > 1 ? 's' : ''} pour les prochains imports.
            </Muted>
          )}
          {todo.length > 0 && (
            <Muted style={{ textAlign: 'center' }}>
              {todo.length} opération{todo.length > 1 ? 's' : ''} sans catégorie : modifiable{todo.length > 1 ? 's' : ''} depuis l'Historique.
            </Muted>
          )}
        </Card>
        <Button title="Terminé" onPress={closeScreen} />
      </Screen>
    );
  }

  const dates = rows.map((r) => r.date).sort();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 8 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <Card style={{ gap: 4 }}>
              <Text style={ui.sectionTitle}>
                {rows.length} nouvelle{rows.length > 1 ? 's' : ''} opération{rows.length > 1 ? 's' : ''}
              </Text>
              {dates.length > 0 && (
                <Muted>du {formatDateLong(dates[0])} au {formatDateLong(dates[dates.length - 1])}</Muted>
              )}
              {alreadyImported > 0 && <Muted>{alreadyImported} déjà importée{alreadyImported > 1 ? 's' : ''} (masquée{alreadyImported > 1 ? 's' : ''})</Muted>}
              {skipped > 0 && <Muted>{skipped} ligne{skipped > 1 ? 's' : ''} illisible{skipped > 1 ? 's' : ''} ignorée{skipped > 1 ? 's' : ''}</Muted>}
              <Muted>Touche la catégorie d'une ligne pour la changer : ton choix sera retenu pour les prochains relevés.</Muted>
            </Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Tout" selected={!onlyTodo} onPress={() => setOnlyTodo(false)} />
              <Chip label={`À catégoriser (${todo.length})`} selected={onlyTodo} onPress={() => setOnlyTodo(true)} color={colors.orange} />
            </View>
          </View>
        }
        renderItem={({ item: r }) => {
          const cat = r.categoryId ? catById.get(r.categoryId) : undefined;
          const meta = typeMeta[r.type];
          const badge = r.matchId ? 'Déjà saisie' : !r.include && r.ruleMatched ? 'Virement interne ?' : null;
          return (
            <View style={[styles.row, !r.include && { opacity: 0.55 }]}>
              <Pressable hitSlop={8} onPress={() => update(r.key, { include: !r.include })} style={styles.check}>
                <Text style={{ fontSize: 20, color: r.include ? colors.primary : colors.muted }}>{r.include ? '☑' : '☐'}</Text>
              </Pressable>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={styles.label} numberOfLines={1}>{r.label}</Text>
                  <Text style={{ fontWeight: '700', color: r.isCredit ? meta.color : colors.text }}>
                    {r.isCredit ? '+' : '−'}{formatMoney(r.amount)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Muted style={{ fontSize: 12 }}>{formatDateShort(r.date)}</Muted>
                  <Pressable
                    onPress={() => setEditing(r)}
                    style={[
                      styles.catPill,
                      r.type === 'sale'
                        ? { backgroundColor: colors.saleSoft }
                        : cat
                          ? { backgroundColor: cat.color + '22' }
                          : { backgroundColor: colors.orangeSoft },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: r.type === 'sale' ? colors.sale : cat ? colors.text : colors.orange }}>
                      {r.type === 'sale' ? '🏷️ Vente' : cat ? cat.name : 'Choisir une catégorie'} ▾
                    </Text>
                  </Pressable>
                  {badge && <Muted style={{ fontSize: 12 }}>{badge}</Muted>}
                </View>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.footer}>
        {error && <Text style={{ color: colors.red }}>{error}</Text>}
        <Button
          title={busy ? 'Import…' : `Importer ${toAdd.length} opération${toAdd.length > 1 ? 's' : ''}`}
          onPress={confirm}
          disabled={busy}
        />
      </View>

      <CategoryPicker
        row={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onPick={(patch) => {
          if (editing) update(editing.key, { ...patch, include: true }, true);
          setEditing(null);
        }}
        onIgnore={() => {
          if (editing) update(editing.key, { include: false });
          setEditing(null);
        }}
      />
    </View>
  );
}

function CategoryPicker({
  row,
  categories,
  onClose,
  onPick,
  onIgnore,
}: {
  row: PlannedRow | null;
  categories: Category[];
  onClose: () => void;
  onPick: (patch: Pick<PlannedRow, 'type' | 'categoryId'>) => void;
  onIgnore: () => void;
}) {
  const cats = categories.filter((c) => c.kind === (row?.isCredit ? 'income' : 'expense'));
  return (
    <Modal visible={!!row} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {row && (
          <>
            <Text style={ui.sectionTitle} numberOfLines={2}>{row.label}</Text>
            <Muted>{row.rawLabel}</Muted>
            <View style={ui.wrap}>
              {row.isCredit && (
                <Chip label="🏷️ Vente" selected={row.type === 'sale'} color={colors.sale} onPress={() => onPick({ type: 'sale', categoryId: null })} />
              )}
              {cats.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  dot={c.color}
                  color={c.color}
                  selected={row.type !== 'sale' && row.categoryId === c.id}
                  onPress={() => onPick({ type: row.isCredit ? 'income' : 'expense', categoryId: c.id })}
                />
              ))}
            </View>
            <Button title="Ne pas importer cette ligne" variant="danger" onPress={onIgnore} />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
  },
  check: { width: 28, alignItems: 'center' },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  catPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 28,
    gap: 8,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: colors.card, padding: 20, paddingBottom: 36, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});
