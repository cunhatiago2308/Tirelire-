/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanLabel,
  decodeBytes,
  keywordFromLabel,
  matchRule,
  parseBankAmount,
  parseBankDate,
  parseStatement,
} from '../src/lib/bankImport.ts';
import { formatDuration, monthsToReach, simulateSavings } from '../src/lib/calc.ts';
import {
  addTransaction,
  applyImport,
  generateDueRecurring,
  getCategories,
  listRules,
  listTransactions,
  prepareImport,
  saveRecurring,
  upcomingFixed,
} from '../src/db/repo.ts';
import { makeDb } from './helpers.ts';

test('amount and date parsing', () => {
  assert.equal(parseBankAmount('-1 234,56 €'), -1234.56);
  assert.equal(parseBankAmount('+12,5'), 12.5);
  assert.equal(parseBankAmount('1,234.56'), 1234.56);
  assert.equal(parseBankAmount('(12.50)'), -12.5);
  assert.equal(parseBankAmount('−3'), -3);
  assert.equal(parseBankAmount('42.00 EUR'), 42);
  assert.equal(parseBankAmount('abc'), null);
  assert.equal(parseBankAmount(''), null);
  assert.equal(parseBankDate('12/09/2026'), '2026-09-12');
  assert.equal(parseBankDate('12/09/26'), '2026-09-12');
  assert.equal(parseBankDate('2026-09-12'), '2026-09-12');
  assert.equal(parseBankDate('20260912120000[+1:CET]'), '2026-09-12');
  assert.equal(parseBankDate('31/02/2026'), null);
});

test('CSV with separate Débit / Crédit columns, Latin-1, preamble and footer', () => {
  const text =
    'Compte courant N° 12345;;;\r\n' +
    'Solde au 30/09/2026;1 234,56;;\r\n' +
    '\r\n' +
    'Date;Libellé;Débit euros;Crédit euros\r\n' +
    '28/09/2026;"PAIEMENT PAR CARTE X1234 CARREFOUR CITY 27/09";23,40;\r\n' +
    '27/09/2026;VIREMENT EN VOTRE FAVEUR VINTED;;35,00\r\n' +
    '26/09/2026;PRLV SEPA FREE MOBILE;15,99;\r\n' +
    'Total;;39,39;35,00\r\n';
  const bytes = Uint8Array.from([...text].map((c) => (c === 'é' ? 0xe9 : c === '°' ? 0xb0 : c.charCodeAt(0))));
  const decoded = decodeBytes(bytes);
  assert.ok(decoded.includes('Débit'));
  const r = parseStatement(decoded);
  assert.equal(r.format, 'csv');
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount]), [
    ['2026-09-28', -23.4],
    ['2026-09-27', 35],
    ['2026-09-26', -15.99],
  ]);
});

test('CSV with a single signed amount column and value date', () => {
  const csv =
    'dateOp;dateVal;label;category;categoryParent;supplierFound;amount;accountNum\n' +
    '2026-09-20;2026-09-21;"CARTE 19/09/26 SNCF CB*1234";Transport;Auto;sncf;-45,00;001\n' +
    '2026-09-18;2026-09-18;"VIR SEPA CAF";Aides;Revenus;caf;120,50;001\n';
  const r = parseStatement(csv);
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount]), [['2026-09-20', -45], ['2026-09-18', 120.5]]);
  assert.match(r.rows[0].label, /SNCF/);
});

test('CSV without header (comma separated)', () => {
  const r = parseStatement('12/09/2026,Boulangerie Paul,-3.20\n13/09/2026,Salaire septembre,850.00\n');
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.label]), [
    ['2026-09-12', -3.2, 'Boulangerie Paul'],
    ['2026-09-13', 850, 'Salaire septembre'],
  ]);
});

test('OFX statement', () => {
  const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260915<TRNAMT>-12.30<FITID>A1<NAME>CB MONOPRIX<MEMO>PARIS 11
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260916<TRNAMT>25.00<FITID>A2<NAME>VIR LEBONCOIN
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = parseStatement(ofx);
  assert.equal(r.format, 'ofx');
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.fitid]), [['2026-09-15', -12.3, 'A1'], ['2026-09-16', 25, 'A2']]);
  assert.equal(r.rows[0].label, 'CB MONOPRIX — PARIS 11');
});

test('unreadable file gives a clear error', () => {
  assert.throws(() => parseStatement('hello\nworld\n'), /Format non reconnu/);
});

test('labels are cleaned and keywords extracted', () => {
  assert.equal(cleanLabel('PAIEMENT PAR CARTE X1234 CARREFOUR CITY 27/09'), 'Carrefour City');
  assert.equal(cleanLabel('PRLV SEPA FREE MOBILE'), 'Free Mobile');
  assert.equal(cleanLabel('VIREMENT EN VOTRE FAVEUR VINTED'), 'Vinted');
  assert.equal(keywordFromLabel('CB X1234 PIZZERIA NAPOLI 12/09'), 'PIZZERIA');
  assert.equal(keywordFromLabel('CB LA MIE 12/09'), 'MIE');
  assert.equal(keywordFromLabel('CB 1234 12/09'), null);
});

test('rules: whole words, direction, longest pattern wins', () => {
  const rules = [
    { id: 1, pattern: 'TOTAL', kind: 'expense' as const, category_id: 3 },
    { id: 2, pattern: 'TOTALENERGIES ELEC', kind: 'expense' as const, category_id: 5 },
    { id: 3, pattern: 'VINTED', kind: 'sale' as const, category_id: null },
    { id: 4, pattern: 'BAR', kind: 'expense' as const, category_id: 2 },
  ];
  assert.equal(matchRule(rules, 'CB TOTAL ACCESS', -40)?.id, 1);
  assert.equal(matchRule(rules, 'PRLV TOTALENERGIES ELEC', -60)?.id, 2);
  assert.equal(matchRule(rules, 'VIR VINTED', 20)?.id, 3);
  assert.equal(matchRule(rules, 'VINTED ACHAT', -20), null); // sale rule never applies to a debit
  assert.equal(matchRule(rules, 'CB BARCLAYS', -5), null); // whole words only
  assert.equal(matchRule(rules, 'CB Bar du coin', -5)?.id, 4);
});

const STATEMENT = [
  'Date;Libellé;Montant',
  '01/09/2026;VIR SEPA RECU SALAIRE MCDO SARL;650,00',
  '03/09/2026;PRLV SEPA FREE MOBILE;-15,99',
  '05/09/2026;CB CARREFOUR CITY 04/09;-23,40',
  '06/09/2026;VIR VINTED;35,00',
  '07/09/2026;CB PIZZERIA NAPOLI;-18,00',
  '08/09/2026;VIR LIVRET A;-100,00',
  '09/09/2026;CB SNCF;-45,00',
].join('\n');

test('import: categorises with default rules, detects sales, skips transfers, links manual entries', async () => {
  const db = await makeDb();
  const cats = await getCategories(db);
  const id = (name: string) => cats.find((c) => c.name === name)!.id;
  // Already entered by hand two days later
  await addTransaction(db, { type: 'expense', amount: 45, category_id: id('Transport'), date: '2026-09-11', note: 'train' });

  const plan = await prepareImport(db, parseStatement(STATEMENT).rows);
  const row = (label: RegExp) => plan.rows.find((r) => label.test(r.rawLabel))!;
  assert.equal(row(/SALAIRE/).type, 'income');
  assert.equal(row(/SALAIRE/).categoryId, id('Salaire / job')); // longest wins; McDo is an expense rule anyway
  assert.equal(row(/FREE/).categoryId, id('Abonnements'));
  assert.equal(row(/CARREFOUR/).categoryId, id('Nourriture'));
  assert.equal(row(/VINTED/).type, 'sale');
  assert.equal(row(/PIZZERIA/).categoryId, null);
  assert.equal(row(/PIZZERIA/).include, true);
  assert.equal(row(/LIVRET/).include, false); // transfer to own savings
  assert.equal(row(/SNCF/).include, false); // matches the manual entry
  assert.ok(row(/SNCF/).matchId);

  // User categorises the pizzeria → remembered
  const pizza = row(/PIZZERIA/);
  pizza.categoryId = id('Sorties');
  const res = await applyImport(db, plan.rows, new Set([pizza.key]));
  assert.deepEqual(res, { added: 5, linked: 1, ignored: 1, rulesLearned: 1 });
  assert.ok((await listRules(db)).some((r) => r.pattern === 'PIZZERIA' && r.category_id === id('Sorties')));

  const all = await listTransactions(db);
  assert.equal(all.length, 6); // 5 imported + 1 manual (linked, not duplicated)
  assert.equal(all.find((t) => t.type === 'sale')!.amount, 35);

  // Re-importing an overlapping statement adds nothing
  const again = await prepareImport(db, parseStatement(STATEMENT + '\n10/09/2026;CB PIZZERIA NAPOLI;-21,00').rows);
  assert.equal(again.alreadyImported, 7);
  assert.equal(again.rows.length, 1);
  assert.equal(again.rows[0].categoryId, id('Sorties')); // learned rule applied
});

test('import: a bank debit pays a fixed expense (no double counting)', async () => {
  const db = await makeDb();
  await saveRecurring(db, { label: 'Forfait', amount: 15.99, category_id: null, day: 5, start_month: '2026-09', active: 1 });
  // Debited on the 3rd, before the rule's day
  const plan = await prepareImport(db, parseStatement('Date;Libellé;Montant\n03/09/2026;PRLV FREE MOBILE;-15,99').rows);
  await applyImport(db, plan.rows, new Set());
  assert.equal((await upcomingFixed(db, '2026-09-04')).total, 0);
  assert.equal(await generateDueRecurring(db, '2026-09-10'), 0);
  assert.equal((await listTransactions(db)).length, 1);
});

test('fixed expense generated first, then imported: linked, not duplicated', async () => {
  const db = await makeDb();
  await saveRecurring(db, { label: 'Loyer', amount: 350, category_id: null, day: 1, start_month: '2026-09', active: 1 });
  await generateDueRecurring(db, '2026-09-02');
  const plan = await prepareImport(db, parseStatement('Date;Libellé;Montant\n02/09/2026;VIR LOYER M DUPONT;-350,00').rows);
  assert.equal(plan.rows[0].include, false);
  await applyImport(db, plan.rows, new Set());
  assert.equal((await listTransactions(db)).length, 1);
});

test('savings simulator', () => {
  const flat = simulateSavings(30, 10, 0);
  assert.equal(flat.length, 121);
  assert.equal(flat[120].balance, 3600);
  assert.equal(flat[120].contributed, 3600);
  const withInterest = simulateSavings(100, 1, 12);
  // 100 × ((1.01^12 − 1) / 0.01) = 1268.25
  assert.equal(withInterest[12].balance, 1268.25);
  assert.equal(simulateSavings(0, 2, 3, 1000)[24].balance, 1061.76);
  assert.equal(monthsToReach(600, 30, 0), 20);
  assert.equal(monthsToReach(100, 0, 0), null);
  assert.equal(monthsToReach(100, 0, 0, 150), 0);
  assert.equal(formatDuration(40), '3 ans et 4 mois');
  assert.equal(formatDuration(12), '1 an');
  assert.equal(formatDuration(8), '8 mois');
});

// Boursorama-style export (fake data): amount column named "Solde", a second "Solde" holding the
// account balance, a clean "Libellé suggéré" and the bank's categories; delivered inside a ZIP.
const BOURSO =
  '﻿"Date Opération";"Date Valeur";Libellé;"Libellé Suggéré";Catégorie;"Catégorie Parente";Solde;Commentaire;"Numéro Compte";"Libellé Compte";Solde;Pointage\n' +
  '2026-09-25;2026-09-25;"CARTE 24/09/26 MAGASIN TRUC CB*1111";"Magasin Truc";Alimentation;"Vie quotidienne";-12,30;;00012345678;BoursoBank;250.10;Non\n' +
  '2026-09-24;2026-09-24;"VIR MANGOPAY SA";Mangopay;"Virements reçus";"Virements reçus";40,00;;00012345678;BoursoBank;250.10;Non\n' +
  '2026-09-23;2026-09-23;"CARTE 22/09/26 KEBAB DU COIN CB*1111";"Kebab du Coin";"Restaurants, bars";"Loisirs et sorties";-8,50;;00012345678;BoursoBank;250.10;Non\n';

test('Boursorama export inside a ZIP: amount vs balance, suggested label, bank categories', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const { parseStatementFile } = await import('../src/lib/bankImport.ts');
  const zip = zipSync({ 'export-operations.CSV': strToU8(BOURSO), 'kit-contestation.pdf': new Uint8Array([37, 80, 68, 70]) });
  const r = parseStatementFile(zip);
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount]), [['2026-09-25', -12.3], ['2026-09-24', 40], ['2026-09-23', -8.5]]);
  assert.equal(r.rows[0].displayLabel, 'Magasin Truc');

  const db = await makeDb();
  const cats = await getCategories(db);
  const id = (name: string) => cats.find((c) => c.name === name)!.id;
  const plan = await prepareImport(db, r.rows);
  const byLabel = (l: string) => plan.rows.find((p) => p.label === l)!;
  assert.equal(byLabel('Magasin Truc').categoryId, id('Nourriture')); // from the bank category
  assert.equal(byLabel('Mangopay').type, 'sale'); // Vinted payout
  assert.equal(byLabel('Kebab du Coin').categoryId, id('Sorties'));
});

test('ZIP without any statement gives a clear error', async () => {
  const { zipSync } = await import('fflate');
  const { parseStatementFile } = await import('../src/lib/bankImport.ts');
  assert.throws(() => parseStatementFile(zipSync({ 'a.pdf': new Uint8Array([1, 2, 3]) })), /Aucun relevé/);
});
