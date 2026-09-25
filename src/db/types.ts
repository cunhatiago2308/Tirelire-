export type SqlValue = string | number | null;

/** The subset of expo-sqlite's SQLiteDatabase the app relies on (also implemented over node:sqlite in tests). */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type TxType = 'expense' | 'income' | 'sale';
export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  budget: number | null;
  color: string;
  sort: number;
}

export interface Transaction {
  id: number;
  type: TxType;
  amount: number;
  purchase_price: number | null;
  category_id: number | null;
  date: string;
  note: string | null;
  recurring_id: number | null;
  import_key: string | null;
}

export interface TransactionRow extends Transaction {
  category_name: string | null;
  category_color: string | null;
}

export interface Recurring {
  id: number;
  label: string;
  amount: number;
  category_id: number | null;
  day: number;
  start_month: string;
  active: number;
}

export interface RecurringRow extends Recurring {
  category_name: string | null;
  category_color: string | null;
}

export interface SavingsGoal {
  name: string;
  target: number;
  deadline: string | null;
  start_month: string;
}

export interface SavingsEntry {
  id: number;
  date: string;
  amount: number;
  note: string | null;
  auto_month: string | null;
}

export interface RuleRow {
  id: number;
  pattern: string;
  kind: 'expense' | 'income' | 'sale' | 'ignore';
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}
