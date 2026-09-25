/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSavingsEntry,
  addTransaction,
  availableToday,
  deleteCategory,
  deleteTransaction,
  exportCsv,
  generateDueRecurring,
  getCategories,
  listTransactions,
  monthSummary,
  processAutoSavings,
  saveGoal,
  saveRecurring,
  savingsTotal,
  setSetting,
  upcomingFixed,
} from '../src/db/repo.ts';
import { makeDb } from './helpers.ts';

test('migration seeds categories and is idempotent', async () => {
  const db = await makeDb();
  const { migrate } = await import('../src/db/schema.ts');
  await migrate(db);
  const exp = await getCategories(db, 'expense');
  const inc = await getCategories(db, 'income');
  assert.ok(exp.find((c) => c.name === 'Nourriture' && c.budget === 200));
  assert.equal(inc.length, 4);
});

test('month summary counts sales at their margin and groups spend by category', async () => {
  const db = await makeDb();
  const food = (await getCategories(db, 'expense'))[0];
  const job = (await getCategories(db, 'income'))[0];
  await addTransaction(db, { type: 'income', amount: 600, category_id: job.id, date: '2026-09-02' });
  await addTransaction(db, { type: 'expense', amount: 45.5, category_id: food.id, date: '2026-09-03' });
  await addTransaction(db, { type: 'expense', amount: 20, category_id: food.id, date: '2026-09-10' });
  await addTransaction(db, { type: 'sale', amount: 40, purchase_price: 15, date: '2026-09-11', note: 'Veste' });
  await addTransaction(db, { type: 'sale', amount: 10, date: '2026-09-12' });
  await addTransaction(db, { type: 'expense', amount: 999, category_id: food.id, date: '2026-08-31' });

  const s = await monthSummary(db, '2026-09');
  assert.equal(s.income, 600);
  assert.equal(s.expenses, 65.5);
  assert.equal(s.salesRevenue, 50);
  assert.equal(s.salesNet, 35); // 25 margin + 10 with unknown purchase price
  assert.equal(s.net, 600 + 35 - 65.5);
  assert.equal(s.byCategory.find((c) => c.id === food.id)!.spent, 65.5);

  const sales = await listTransactions(db, { type: 'sale' });
  assert.equal(sales.length, 2);
  assert.equal(sales[0].category_id, null);
});

test('recurring expense: created from the add form, generated monthly, counted as upcoming', async () => {
  const db = await makeDb();
  const housing = (await getCategories(db, 'expense')).find((c) => c.name === 'Logement')!;
  await addTransaction(db, {
    type: 'expense', amount: 350, category_id: housing.id, date: '2026-07-05', note: 'Loyer', makeRecurring: true,
  });
  // A second rule later in the month
  await saveRecurring(db, { label: 'Forfait', amount: 15, category_id: null, day: 28, start_month: '2026-09', active: 1 });

  // Before day 5 of September: rent is upcoming, July already paid, August due
  assert.equal(await generateDueRecurring(db, '2026-09-03'), 1);
  let up = await upcomingFixed(db, '2026-09-03');
  assert.equal(up.total, 365);

  // After day 5: September rent generated as an expense, only phone plan remains upcoming
  assert.equal(await generateDueRecurring(db, '2026-09-25'), 1);
  up = await upcomingFixed(db, '2026-09-25');
  assert.equal(up.total, 15);
  const rents = await listTransactions(db, { categoryId: housing.id });
  assert.deepEqual(rents.map((r) => r.date), ['2026-09-05', '2026-08-05', '2026-07-05']);
  assert.equal(rents[0].note, 'Loyer');

  // Deleting a generated occurrence does not bring it back
  await deleteTransaction(db, rents[0].id);
  assert.equal(await generateDueRecurring(db, '2026-09-26'), 0);
});

test('available today subtracts upcoming fixed expenses and divides by days left', async () => {
  const db = await makeDb();
  await addTransaction(db, { type: 'income', amount: 700, date: '2026-09-01' });
  await addTransaction(db, { type: 'expense', amount: 100, date: '2026-09-10' });
  await saveRecurring(db, { label: 'Loyer', amount: 300, category_id: null, day: 28, start_month: '2026-09', active: 1 });
  const a = await availableToday(db, '2026-09-25');
  assert.equal(a.balance, 600);
  assert.equal(a.upcomingFixed, 300);
  assert.equal(a.daysLeft, 6);
  assert.equal(a.perDay, 50);
});

test('auto savings adds positive month-end balances once, from goal creation', async () => {
  const db = await makeDb();
  await addTransaction(db, { type: 'income', amount: 1000, date: '2026-06-10' }); // before goal: ignored
  await saveGoal(db, { name: 'Voyage', target: 1000, deadline: null }, '2026-07-01');
  await addTransaction(db, { type: 'income', amount: 300, date: '2026-07-10' });
  await addTransaction(db, { type: 'expense', amount: 100, date: '2026-07-11' });
  await addTransaction(db, { type: 'expense', amount: 50, date: '2026-08-11' }); // negative month
  await addTransaction(db, { type: 'income', amount: 80, date: '2026-09-02' }); // current month

  assert.deepEqual(await processAutoSavings(db, '2026-09-25'), ['2026-07']);
  assert.deepEqual(await processAutoSavings(db, '2026-09-25'), []);
  assert.equal(await savingsTotal(db), 200);

  await addSavingsEntry(db, -20, '2026-09-25', 'Retrait');
  assert.equal(await savingsTotal(db), 180);

  await setSetting(db, 'auto_savings', '0');
  assert.deepEqual(await processAutoSavings(db, '2026-11-02'), []);
});

test('deleting a category keeps its transactions as uncategorised', async () => {
  const db = await makeDb();
  const cat = (await getCategories(db, 'expense'))[1];
  await addTransaction(db, { type: 'expense', amount: 12, category_id: cat.id, date: '2026-09-01' });
  await deleteCategory(db, cat.id);
  const s = await monthSummary(db, '2026-09');
  assert.equal(s.byCategory.find((c) => c.id === null)!.spent, 12);
});

test('CSV export contains transactions and savings, escaped', async () => {
  const db = await makeDb();
  await addTransaction(db, { type: 'sale', amount: 40, purchase_price: 15.5, date: '2026-09-11', note: 'Veste; taille M' });
  await saveGoal(db, { name: 'Voyage', target: 500, deadline: null }, '2026-09-01');
  await addSavingsEntry(db, 50, '2026-09-12', null);
  const csv = await exportCsv(db);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'id;date;type;categorie;montant;prix_achat;marge;note;recurrente');
  assert.equal(lines[1], '1;2026-09-11;Vente;Ventes;40;15,5;24,5;"Veste; taille M";');
  assert.match(lines[2], /^E1;2026-09-12;Épargne;Ajustement;50;/);
});

test('deleting an auto savings entry does not re-credit the month', async () => {
  const db = await makeDb();
  const { deleteSavingsEntry, listSavingsEntries } = await import('../src/db/repo.ts');
  await saveGoal(db, { name: 'Voyage', target: 1000, deadline: null }, '2026-07-01');
  await addTransaction(db, { type: 'income', amount: 300, date: '2026-07-10' });
  await processAutoSavings(db, '2026-08-02');
  const [entry] = await listSavingsEntries(db);
  await deleteSavingsEntry(db, entry.id);
  assert.deepEqual(await processAutoSavings(db, '2026-08-03'), []);
  assert.equal(await savingsTotal(db), 0);
  assert.equal((await listSavingsEntries(db)).length, 0);
});
