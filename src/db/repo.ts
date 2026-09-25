import {
  dailyAvailable,
  dueOccurrences,
  occurrenceKey,
  saleMargin,
  saleNet,
  toCsv,
  upcomingFixedTotal,
  type DailyAvailable,
} from '../lib/calc.ts';
import { addMonths, dateInMonth, dayOf, monthOf, monthRange } from '../lib/dates.ts';
import { round2 } from '../lib/money.ts';
import { CATEGORY_COLORS } from './schema.ts';
import type {
  Category,
  CategoryKind,
  Db,
  Recurring,
  RecurringRow,
  SavingsEntry,
  SavingsGoal,
  Transaction,
  TransactionRow,
  TxType,
} from './types.ts';

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function getCategories(db: Db, kind?: CategoryKind): Promise<Category[]> {
  return kind
    ? db.getAllAsync<Category>('SELECT * FROM categories WHERE kind = ? ORDER BY sort, id', [kind])
    : db.getAllAsync<Category>('SELECT * FROM categories ORDER BY kind, sort, id', []);
}

export function getCategory(db: Db, id: number): Promise<Category | null> {
  return db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [id]);
}

export async function saveCategory(
  db: Db,
  c: { id?: number; name: string; kind: CategoryKind; budget: number | null; color?: string },
): Promise<number> {
  if (c.id) {
    await db.runAsync('UPDATE categories SET name = ?, budget = ?, color = COALESCE(?, color) WHERE id = ?', [
      c.name, c.kind === 'expense' ? c.budget : null, c.color ?? null, c.id,
    ]);
    return c.id;
  }
  const stats = await db.getFirstAsync<{ n: number; maxSort: number | null }>(
    'SELECT COUNT(*) AS n, MAX(sort) AS maxSort FROM categories',
    [],
  );
  const color = c.color ?? CATEGORY_COLORS[(stats?.n ?? 0) % CATEGORY_COLORS.length];
  const res = await db.runAsync('INSERT INTO categories (name, kind, budget, color, sort) VALUES (?, ?, ?, ?, ?)', [
    c.name, c.kind, c.kind === 'expense' ? c.budget : null, color, (stats?.maxSort ?? 0) + 1,
  ]);
  return res.lastInsertRowId;
}

/** Deletes a category; its transactions are kept (category set to null → "Sans catégorie"). */
export async function deleteCategory(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}

export async function countCategoryUsage(db: Db, id: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?', [id]);
  return row?.n ?? 0;
}

// ─── Transactions ────────────────────────────────────────────────────────────

export interface TransactionInput {
  type: TxType;
  amount: number;
  purchase_price?: number | null;
  category_id?: number | null;
  date: string;
  note?: string | null;
  /** Expense only: also create a monthly recurring rule on this day of month. */
  makeRecurring?: boolean;
}

export async function addTransaction(db: Db, t: TransactionInput): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    let recurringId: number | null = null;
    if (t.type === 'expense' && t.makeRecurring) {
      let label = t.note?.trim() || null;
      if (!label && t.category_id) label = (await getCategory(db, t.category_id))?.name ?? null;
      recurringId = await saveRecurring(db, {
        label: label ?? 'Dépense fixe',
        amount: t.amount,
        category_id: t.category_id ?? null,
        day: dayOf(t.date),
        start_month: monthOf(t.date),
        active: 1,
      });
      await db.runAsync('INSERT OR IGNORE INTO recurring_log (recurring_id, month) VALUES (?, ?)', [
        recurringId, monthOf(t.date),
      ]);
    }
    const res = await db.runAsync(
      'INSERT INTO transactions (type, amount, purchase_price, category_id, date, note, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        t.type,
        round2(t.amount),
        t.type === 'sale' && t.purchase_price != null ? round2(t.purchase_price) : null,
        t.type === 'sale' ? null : t.category_id ?? null,
        t.date,
        t.note?.trim() || null,
        recurringId,
      ],
    );
    id = res.lastInsertRowId;
  });
  return id;
}

export async function updateTransaction(db: Db, id: number, t: TransactionInput): Promise<void> {
  await db.runAsync(
    'UPDATE transactions SET type = ?, amount = ?, purchase_price = ?, category_id = ?, date = ?, note = ? WHERE id = ?',
    [
      t.type,
      round2(t.amount),
      t.type === 'sale' && t.purchase_price != null ? round2(t.purchase_price) : null,
      t.type === 'sale' ? null : t.category_id ?? null,
      t.date,
      t.note?.trim() || null,
      id,
    ],
  );
}

export async function deleteTransaction(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

export function getTransaction(db: Db, id: number): Promise<Transaction | null> {
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', [id]);
}

const TX_SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color
  FROM transactions t LEFT JOIN categories c ON c.id = t.category_id`;

export function listTransactions(
  db: Db,
  filter: { type?: TxType | null; categoryId?: number | null; month?: string | null; limit?: number } = {},
): Promise<TransactionRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.type) {
    where.push('t.type = ?');
    params.push(filter.type);
  }
  if (filter.categoryId) {
    where.push('t.category_id = ?');
    params.push(filter.categoryId);
  }
  if (filter.month) {
    where.push("substr(t.date, 1, 7) = ?");
    params.push(filter.month);
  }
  const sql = `${TX_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.date DESC, t.id DESC LIMIT ?`;
  params.push(filter.limit ?? 500);
  return db.getAllAsync<TransactionRow>(sql, params);
}

// ─── Monthly figures ─────────────────────────────────────────────────────────

export interface CategorySpend {
  id: number | null;
  name: string;
  color: string;
  budget: number | null;
  spent: number;
}

export interface MonthSummary {
  month: string;
  expenses: number;
  /** Non-sale income. */
  income: number;
  salesCount: number;
  salesRevenue: number;
  /** What sales add to the balance: margin when purchase price is known, else the sale price. */
  salesNet: number;
  /** income + salesNet − expenses */
  net: number;
  byCategory: CategorySpend[];
}

export async function monthSummary(db: Db, month: string): Promise<MonthSummary> {
  const rows = await db.getAllAsync<Transaction>('SELECT * FROM transactions WHERE substr(date, 1, 7) = ?', [month]);
  const cats = await getCategories(db, 'expense');
  const spend = new Map<number | null, number>();
  let expenses = 0;
  let income = 0;
  let salesRevenue = 0;
  let salesNet = 0;
  let salesCount = 0;
  for (const r of rows) {
    if (r.type === 'expense') {
      expenses += r.amount;
      spend.set(r.category_id, (spend.get(r.category_id) ?? 0) + r.amount);
    } else if (r.type === 'income') {
      income += r.amount;
    } else {
      salesCount++;
      salesRevenue += r.amount;
      salesNet += saleNet(r.amount, r.purchase_price);
    }
  }
  const byCategory: CategorySpend[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    budget: c.budget,
    spent: round2(spend.get(c.id) ?? 0),
  }));
  const uncategorised = spend.get(null);
  if (uncategorised) {
    byCategory.push({ id: null, name: 'Sans catégorie', color: '#9CA3AF', budget: null, spent: round2(uncategorised) });
  }
  return {
    month,
    expenses: round2(expenses),
    income: round2(income),
    salesCount,
    salesRevenue: round2(salesRevenue),
    salesNet: round2(salesNet),
    net: round2(income + salesNet - expenses),
    byCategory,
  };
}

/** Months (YYYY-MM) that have at least one transaction, newest first. */
export async function monthsWithData(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ m: string }>(
    'SELECT DISTINCT substr(date, 1, 7) AS m FROM transactions ORDER BY m DESC',
    [],
  );
  return rows.map((r) => r.m);
}

// ─── Recurring fixed expenses ────────────────────────────────────────────────

export function listRecurring(db: Db): Promise<RecurringRow[]> {
  return db.getAllAsync<RecurringRow>(
    `SELECT r.*, c.name AS category_name, c.color AS category_color
     FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
     ORDER BY r.active DESC, r.day, r.id`,
    [],
  );
}

export function getRecurring(db: Db, id: number): Promise<Recurring | null> {
  return db.getFirstAsync<Recurring>('SELECT * FROM recurring WHERE id = ?', [id]);
}

export async function saveRecurring(db: Db, r: Omit<Recurring, 'id'> & { id?: number }): Promise<number> {
  if (r.id) {
    await db.runAsync('UPDATE recurring SET label = ?, amount = ?, category_id = ?, day = ?, active = ? WHERE id = ?', [
      r.label, round2(r.amount), r.category_id, r.day, r.active, r.id,
    ]);
    return r.id;
  }
  const res = await db.runAsync(
    'INSERT INTO recurring (label, amount, category_id, day, start_month, active) VALUES (?, ?, ?, ?, ?, ?)',
    [r.label, round2(r.amount), r.category_id, r.day, r.start_month, r.active],
  );
  return res.lastInsertRowId;
}

/** Deletes the rule; expenses it already generated stay in the history. */
export async function deleteRecurring(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM recurring WHERE id = ?', [id]);
}

async function generatedSet(db: Db): Promise<Set<string>> {
  const log = await db.getAllAsync<{ recurring_id: number; month: string }>('SELECT * FROM recurring_log', []);
  return new Set(log.map((l) => occurrenceKey(l.recurring_id, l.month)));
}

/** Creates the expense transactions for fixed expenses whose day has come. Returns how many were created. */
export async function generateDueRecurring(db: Db, today: string): Promise<number> {
  const rules = await db.getAllAsync<Recurring>('SELECT * FROM recurring', []);
  const due = dueOccurrences(rules, await generatedSet(db), today);
  if (!due.length) return 0;
  const byId = new Map(rules.map((r) => [r.id, r]));
  await db.withTransactionAsync(async () => {
    for (const o of due) {
      const r = byId.get(o.ruleId)!;
      await db.runAsync('INSERT INTO recurring_log (recurring_id, month) VALUES (?, ?)', [r.id, o.month]);
      await db.runAsync(
        "INSERT INTO transactions (type, amount, category_id, date, note, recurring_id) VALUES ('expense', ?, ?, ?, ?, ?)",
        [r.amount, r.category_id, o.date, r.label, r.id],
      );
    }
  });
  return due.length;
}

export async function upcomingFixed(db: Db, today: string): Promise<{ total: number; items: Recurring[] }> {
  const rules = await db.getAllAsync<Recurring>('SELECT * FROM recurring', []);
  const generated = await generatedSet(db);
  const month = monthOf(today);
  const items = rules.filter(
    (r) => r.active && r.start_month <= month && !generated.has(occurrenceKey(r.id, month)),
  );
  return { total: upcomingFixedTotal(rules, generated, today), items };
}

// ─── Home: money available today ─────────────────────────────────────────────

export interface Available extends DailyAvailable {
  balance: number;
  upcomingFixed: number;
  upcomingItems: Recurring[];
}

export async function availableToday(db: Db, today: string): Promise<Available> {
  const summary = await monthSummary(db, monthOf(today));
  const upcoming = await upcomingFixed(db, today);
  return {
    ...dailyAvailable(summary.net, upcoming.total, today),
    balance: summary.net,
    upcomingFixed: upcoming.total,
    upcomingItems: upcoming.items,
  };
}

// ─── Savings goal ────────────────────────────────────────────────────────────

export function getGoal(db: Db): Promise<SavingsGoal | null> {
  return db.getFirstAsync<SavingsGoal>('SELECT name, target, deadline, start_month FROM savings_goal WHERE id = 1', []);
}

export async function saveGoal(db: Db, g: { name: string; target: number; deadline: string | null }, today: string) {
  await db.runAsync(
    `INSERT INTO savings_goal (id, name, target, deadline, start_month) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, target = excluded.target, deadline = excluded.deadline`,
    [g.name, round2(g.target), g.deadline, monthOf(today)],
  );
}

/** Removes the goal and its history of contributions. */
export async function deleteGoal(db: Db): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM savings_goal', []);
    await db.runAsync('DELETE FROM savings_entries', []);
  });
}

export function listSavingsEntries(db: Db): Promise<SavingsEntry[]> {
  return db.getAllAsync<SavingsEntry>('SELECT * FROM savings_entries WHERE amount != 0 ORDER BY date DESC, id DESC', []);
}

export async function savingsTotal(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ s: number | null }>('SELECT SUM(amount) AS s FROM savings_entries', []);
  return round2(row?.s ?? 0);
}

/** Manual adjustment (positive = deposit, negative = withdrawal). */
export async function addSavingsEntry(db: Db, amount: number, date: string, note: string | null): Promise<void> {
  await db.runAsync('INSERT INTO savings_entries (date, amount, note) VALUES (?, ?, ?)', [date, round2(amount), note]);
}

/** Auto entries are zeroed rather than deleted, so the month is not credited again. */
export async function deleteSavingsEntry(db: Db, id: number): Promise<void> {
  await db.runAsync('UPDATE savings_entries SET amount = 0 WHERE id = ? AND auto_month IS NOT NULL', [id]);
  await db.runAsync('DELETE FROM savings_entries WHERE id = ? AND auto_month IS NULL', [id]);
}

/**
 * Month-end auto-contribution: every finished month since the goal was created whose net balance
 * is positive adds that balance to the savings (once per month). Returns the months added.
 */
export async function processAutoSavings(db: Db, today: string): Promise<string[]> {
  const goal = await getGoal(db);
  if (!goal || (await getSetting(db, 'auto_savings')) !== '1') return [];
  const lastFinished = addMonths(monthOf(today), -1);
  if (goal.start_month > lastFinished) return [];
  const done = new Set(
    (await db.getAllAsync<{ auto_month: string }>('SELECT auto_month FROM savings_entries WHERE auto_month IS NOT NULL', []))
      .map((r) => r.auto_month),
  );
  const added: string[] = [];
  for (const m of monthRange(goal.start_month, lastFinished)) {
    if (done.has(m)) continue;
    const { net } = await monthSummary(db, m);
    if (net > 0) {
      await db.runAsync('INSERT INTO savings_entries (date, amount, note, auto_month) VALUES (?, ?, ?, ?)', [
        dateInMonth(m, 31), net, 'Solde positif du mois', m,
      ]);
      added.push(m);
    }
  }
  return added;
}

/** Everything the app does when it opens / comes back to the home screen. */
export async function runDailyJobs(db: Db, today: string): Promise<void> {
  await generateDueRecurring(db, today);
  await processAutoSavings(db, today);
}

// ─── CSV export ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TxType, string> = { expense: 'Dépense', income: 'Revenu', sale: 'Vente' };

export async function exportCsv(db: Db): Promise<string> {
  const txs = await db.getAllAsync<TransactionRow>(`${TX_SELECT} ORDER BY t.date, t.id`, []);
  const savings = await db.getAllAsync<SavingsEntry>('SELECT * FROM savings_entries WHERE amount != 0 ORDER BY date, id', []);
  const header = ['id', 'date', 'type', 'categorie', 'montant', 'prix_achat', 'marge', 'note', 'recurrente'];
  const rows: (string | number | null)[][] = txs.map((t) => [
    t.id,
    t.date,
    TYPE_LABELS[t.type],
    t.type === 'sale' ? 'Ventes' : t.category_name ?? '',
    t.amount,
    t.purchase_price,
    t.type === 'sale' ? saleMargin(t.amount, t.purchase_price) : null,
    t.note,
    t.recurring_id ? 'oui' : '',
  ]);
  for (const s of savings) {
    rows.push([`E${s.id}`, s.date, 'Épargne', s.auto_month ? 'Auto fin de mois' : 'Ajustement', s.amount, null, null, s.note, '']);
  }
  return toCsv(header, rows);
}
