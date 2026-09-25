import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { AmountModal } from '../../components/AmountModal.tsx';
import { Fab } from '../../components/Fab.tsx';
import {
  Card,
  Gauge,
  Muted,
  ProgressBar,
  Screen,
  SectionTitle,
  Stat,
  styles,
  useDb,
  useOnFocus,
} from '../../components/ui.tsx';
import {
  addSavingsEntry,
  availableToday,
  getGoal,
  monthSummary,
  runDailyJobs,
  savingsTotal,
  type Available,
  type CategorySpend,
} from '../../db/repo.ts';
import type { SavingsGoal } from '../../db/types.ts';
import { gaugeLevel, goalProgress } from '../../lib/calc.ts';
import { dateInMonth, formatDateLong, monthLabel, monthOf, todayStr } from '../../lib/dates.ts';
import { formatMoney } from '../../lib/money.ts';
import { colors, levelColor, typeMeta } from '../../theme.ts';

export default function HomeScreen() {
  const db = useDb();
  const [today, setToday] = useState(todayStr());
  const [avail, setAvail] = useState<Available | null>(null);
  const [envelopes, setEnvelopes] = useState<CategorySpend[]>([]);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [saved, setSaved] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    const t = todayStr();
    setToday(t);
    await runDailyJobs(db, t);
    const [a, s, g, total] = await Promise.all([
      availableToday(db, t),
      monthSummary(db, monthOf(t)),
      getGoal(db),
      savingsTotal(db),
    ]);
    setAvail(a);
    setEnvelopes(s.byCategory.filter((c) => c.budget != null && c.budget > 0));
    setGoal(g);
    setSaved(total);
  }, [db]);
  useOnFocus(load);

  const alerts = envelopes.filter((e) => gaugeLevel(e.spent, e.budget!) !== 'ok');
  const perDayColor = !avail ? colors.text : avail.perDay < 0 ? colors.red : avail.perDay < 5 ? colors.orange : colors.green;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {/* Money really available today */}
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <Muted>Dispo aujourd'hui</Muted>
          <Text style={{ fontSize: 44, fontWeight: '800', color: perDayColor }}>
            {avail ? formatMoney(avail.perDay) : '…'}
          </Text>
          {avail && (
            <Muted style={{ textAlign: 'center' }}>
              par jour pendant {avail.daysLeft} jour{avail.daysLeft > 1 ? 's' : ''} · reste du mois{' '}
              {formatMoney(avail.remaining)}
            </Muted>
          )}
          {avail && (
            <View style={[styles.row, { marginTop: 8, alignSelf: 'stretch' }]}>
              <Stat
                label={`Solde ${monthLabel(monthOf(today)).split(' ')[0]}`}
                value={formatMoney(avail.balance)}
                color={avail.balance < 0 ? colors.red : colors.text}
              />
              <Stat label="Fixes à venir" value={`−${formatMoney(avail.upcomingFixed)}`} />
            </View>
          )}
          {avail && avail.upcomingItems.length > 0 && (
            <View style={{ alignSelf: 'stretch', gap: 2 }}>
              {avail.upcomingItems.map((r) => (
                <Muted key={r.id}>
                  ↻ {r.label} · {formatMoney(r.amount)} le {formatDateLong(dateInMonth(monthOf(today), r.day)).replace(/ \d{4}$/, '')}
                </Muted>
              ))}
            </View>
          )}
        </Card>

        {/* Quick add */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['expense', 'income', 'sale'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => router.push({ pathname: '/add', params: { type: t } })}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: typeMeta[t].soft,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: typeMeta[t].color, fontWeight: '700', fontSize: 15 }}>
                {t === 'expense' ? '−' : '+'} {typeMeta[t].label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Envelope alerts */}
        {alerts.length > 0 && (
          <Card style={{ backgroundColor: alerts.some((a) => a.spent > a.budget!) ? colors.redSoft : colors.orangeSoft }}>
            {alerts.map((a) => {
              const level = gaugeLevel(a.spent, a.budget!);
              return (
                <Text key={String(a.id)} style={{ color: levelColor[level], fontWeight: '600' }}>
                  {level === 'over' ? '🚨' : '⚠️'} {a.name} :{' '}
                  {level === 'over'
                    ? `budget dépassé de ${formatMoney(a.spent - a.budget!)}`
                    : `${Math.round((a.spent / a.budget!) * 100)} % du budget utilisé`}
                </Text>
              );
            })}
          </Card>
        )}

        {/* Envelopes */}
        <Card>
          <SectionTitle right={<Link href="/settings" style={{ color: colors.primary }}>Modifier</Link>}>
            Enveloppes du mois
          </SectionTitle>
          {envelopes.length === 0 ? (
            <Muted>Aucun budget défini. Fixe un budget par catégorie dans les Réglages.</Muted>
          ) : (
            envelopes.map((e) => <Gauge key={String(e.id)} name={e.name} color={e.color} spent={e.spent} budget={e.budget!} />)
          )}
        </Card>

        {/* Savings goal */}
        <Card>
          <SectionTitle right={<Link href="/goal" style={{ color: colors.primary }}>{goal ? 'Modifier' : 'Créer'}</Link>}>
            {goal ? `🎯 ${goal.name}` : "🎯 Objectif d'épargne"}
          </SectionTitle>
          {goal ? (
            <GoalBody goal={goal} saved={saved} today={today} onAdjust={() => setAdjusting(true)} />
          ) : (
            <Muted>Fixe un montant cible : chaque mois terminé avec un solde positif l'alimente automatiquement.</Muted>
          )}
          <Link href="/simulator" style={{ color: colors.primary, fontWeight: '600' }}>
            📈 Simuler : combien j'aurais en épargnant chaque mois ?
          </Link>
        </Card>
      </Screen>
      <Fab />
      <AmountModal
        visible={adjusting}
        title="Ajuster l'épargne"
        allowNegative
        onCancel={() => setAdjusting(false)}
        onSubmit={async (amount, note) => {
          await addSavingsEntry(db, amount, todayStr(), note || null);
          setAdjusting(false);
          load();
        }}
      />
    </View>
  );
}

function GoalBody({ goal, saved, today, onAdjust }: { goal: SavingsGoal; saved: number; today: string; onAdjust: () => void }) {
  const p = goalProgress(saved, goal.target, goal.deadline, today);
  return (
    <>
      <View style={styles.gaugeHead}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{formatMoney(saved)}</Text>
        <Muted>sur {formatMoney(goal.target)}</Muted>
      </View>
      <ProgressBar ratio={p.ratio} color={p.ratio >= 1 ? colors.green : colors.primary} height={14} />
      <Muted>
        {p.ratio >= 1
          ? 'Objectif atteint 🎉'
          : `${Math.round(p.ratio * 100)} % · reste ${formatMoney(p.remaining)}`}
        {goal.deadline ? ` · échéance ${formatDateLong(goal.deadline)}` : ''}
        {p.perMonthNeeded != null ? ` · ${formatMoney(p.perMonthNeeded)}/mois` : ''}
      </Muted>
      <Pressable onPress={onAdjust}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>± Ajuster manuellement</Text>
      </Pressable>
    </>
  );
}
