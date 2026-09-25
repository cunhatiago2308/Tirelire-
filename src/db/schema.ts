import type { Db } from './types.ts';

const DEFAULT_EXPENSE_CATEGORIES: [string, number | null, string][] = [
  ['Nourriture', 200, '#F59E0B'],
  ['Sorties', 80, '#EC4899'],
  ['Transport', 50, '#3B82F6'],
  ['Fournitures', 30, '#8B5CF6'],
  ['Logement', null, '#64748B'],
  ['Abonnements', null, '#14B8A6'],
  ['Divers', null, '#A3A3A3'],
];

const DEFAULT_INCOME_CATEGORIES: [string, string][] = [
  ['Salaire / job', '#22C55E'],
  ['Bourse / aides', '#10B981'],
  ['Famille', '#84CC16'],
  ['Autre revenu', '#65A30D'],
];

/** Keyword rules used to categorise imported bank lines (matched on whole words, accents ignored). */
const DEFAULT_RULES: ['expense' | 'income' | 'sale' | 'ignore', string | null, string[]][] = [
  ['expense', 'Nourriture', [
    'CARREFOUR', 'LECLERC', 'AUCHAN', 'LIDL', 'ALDI', 'INTERMARCHE', 'MONOPRIX', 'FRANPRIX', 'CASINO', 'SUPER U',
    'HYPER U', 'U EXPRESS', 'SUPERU', 'NETTO', 'PICARD', 'GRAND FRAIS', 'BIOCOOP', 'NATURALIA', 'CORA', 'SPAR',
    'BOULANGERIE', 'LECLERC DRIVE', 'COLRUYT', 'DELHAIZE', 'CROUS RESTAURANT',
  ]],
  ['expense', 'Sorties', [
    'MCDONALDS', 'MC DONALDS', 'MCDO', 'BURGER KING', 'KFC', 'QUICK', 'O TACOS', 'DOMINOS', 'DELIVEROO',
    'UBER EATS', 'JUST EAT', 'STARBUCKS', 'UGC', 'PATHE', 'GAUMONT', 'CINEMA', 'FNAC SPECTACLES', 'BAR', 'RESTAURANT',
  ]],
  ['expense', 'Transport', [
    'SNCF', 'OUIGO', 'RATP', 'NAVIGO', 'TCL', 'TISSEO', 'UBER', 'BOLT', 'HEETCH', 'BLABLACAR', 'FLIXBUS', 'TOTAL',
    'TOTALENERGIES', 'ESSO', 'SHELL', 'BP', 'AVIA', 'LIME', 'DOTT', 'VELIB', 'SANEF', 'VINCI AUTOROUTES',
  ]],
  ['expense', 'Fournitures', ['FNAC', 'CULTURA', 'BUREAU VALLEE', 'GIBERT', 'CLAIREFONTAINE', 'ACTION']],
  ['expense', 'Abonnements', [
    'NETFLIX', 'SPOTIFY', 'DEEZER', 'DISNEY', 'CANAL', 'AMAZON PRIME', 'PRIME VIDEO', 'APPLE COM', 'GOOGLE PLAY',
    'YOUTUBE', 'FREE MOBILE', 'SFR', 'ORANGE', 'BOUYGUES', 'SOSH', 'RED BY SFR', 'BASIC FIT', 'FITNESS PARK',
  ]],
  ['expense', 'Logement', ['LOYER', 'EDF', 'ENGIE', 'TOTALENERGIES ELEC', 'VEOLIA', 'ASSURANCE HABITATION']],
  ['sale', null, ['VINTED', 'LEBONCOIN', 'LE BON COIN', 'EBAY', 'BACKMARKET', 'BACK MARKET', 'RAKUTEN', 'VESTIAIRE']],
  ['income', 'Bourse / aides', ['CAF', 'CROUS', 'BOURSE', 'APL', 'PRIME ACTIVITE']],
  ['income', 'Salaire / job', ['SALAIRE', 'PAIE', 'REMUNERATION']],
  ['ignore', null, ['LIVRET A', 'LDDS', 'LEP', 'VIREMENT INTERNE', 'VIR INTERNE', 'COMPTE EPARGNE']],
];

/** Colours offered to new categories, in order. */
export const CATEGORY_COLORS = [
  '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6', '#14B8A6', '#EF4444',
  '#22C55E', '#0EA5E9', '#F97316', '#64748B', '#A855F7', '#84CC16',
];

/** Schema migrations, indexed by the `user_version` they bring the database to. */
const MIGRATIONS: ((db: Db) => Promise<void>)[] = [
  // v1
  async (db) => {
    await db.execAsync(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
        budget REAL,
        color TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE recurring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        amount REAL NOT NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
        start_month TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'sale')),
        amount REAL NOT NULL,
        purchase_price REAL,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        date TEXT NOT NULL,
        note TEXT,
        recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_transactions_date ON transactions(date);
      -- One row per (rule, month) already materialised, so a deleted occurrence is not re-created.
      CREATE TABLE recurring_log (
        recurring_id INTEGER NOT NULL REFERENCES recurring(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        PRIMARY KEY (recurring_id, month)
      );
      CREATE TABLE savings_goal (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        target REAL NOT NULL,
        deadline TEXT,
        start_month TEXT NOT NULL
      );
      CREATE TABLE savings_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        auto_month TEXT UNIQUE
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    let sort = 0;
    for (const [name, budget, color] of DEFAULT_EXPENSE_CATEGORIES) {
      await db.runAsync('INSERT INTO categories (name, kind, budget, color, sort) VALUES (?, ?, ?, ?, ?)', [
        name, 'expense', budget, color, sort++,
      ]);
    }
    for (const [name, color] of DEFAULT_INCOME_CATEGORIES) {
      await db.runAsync('INSERT INTO categories (name, kind, budget, color, sort) VALUES (?, ?, ?, ?, ?)', [
        name, 'income', null, color, sort++,
      ]);
    }
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('auto_savings', '1')", []);
  },
  // v2: bank statement import
  async (db) => {
    await db.execAsync(`
      ALTER TABLE transactions ADD COLUMN import_key TEXT;
      CREATE UNIQUE INDEX idx_transactions_import_key ON transactions(import_key) WHERE import_key IS NOT NULL;
      -- Statement lines the user chose not to import, so they are not proposed again.
      CREATE TABLE import_ignored (key TEXT PRIMARY KEY);
      CREATE TABLE category_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'sale', 'ignore')),
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE
      );
    `);
    const cats = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM categories', []);
    const byName = new Map(cats.map((c) => [c.name, c.id]));
    for (const [kind, category, patterns] of DEFAULT_RULES) {
      const categoryId = category ? byName.get(category) : null;
      if (categoryId === undefined) continue; // category renamed or deleted by the user
      for (const pattern of patterns) {
        await db.runAsync('INSERT INTO category_rules (pattern, kind, category_id) VALUES (?, ?, ?)', [
          pattern, kind, categoryId,
        ]);
      }
    }
  },
];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(() => MIGRATIONS[version](db));
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
