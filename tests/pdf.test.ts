/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStatementFile } from '../src/lib/bankImport.ts';
import { extractPdfText } from '../src/lib/pdfText.web.ts';
import { getCategories, prepareImport } from '../src/db/repo.ts';
import { makeDb } from './helpers.ts';
import { makePdf, type PdfText } from './pdfFixture.ts';

const TODAY = '2026-10-05';

/** Classic French layout: Date | Date valeur | Libellé | Débit | Crédit, dd/mm dates, wrapped labels. */
function classicStatement(): Uint8Array {
  const row = (y: number, date: string, label: string, debit: string | null, credit: string | null): PdfText[] => [
    { x: 40, y, text: date },
    { x: 85, y, text: date },
    { x: 130, y, text: label },
    ...(debit ? [{ x: 470, y, text: debit, right: true }] : []),
    ...(credit ? [{ x: 550, y, text: credit, right: true }] : []),
  ];
  const page1: PdfText[] = [
    { x: 40, y: 800, text: 'RELEVÉ DE COMPTE - Période du 01/09/2026 au 30/09/2026' },
    { x: 40, y: 780, text: 'SOLDE CREDITEUR AU 31/08/2026' },
    { x: 550, y: 780, text: '1 234,56', right: true },
    { x: 40, y: 750, text: 'Date' },
    { x: 85, y: 750, text: 'Valeur' },
    { x: 130, y: 750, text: 'Nature des opérations' },
    { x: 440, y: 750, text: 'Débit' },
    { x: 520, y: 750, text: 'Crédit' },
    ...row(730, '02/09', 'CB CARREFOUR CITY 01/09', '23,40', null),
    ...row(715, '03/09', 'VIR SEPA RECU /DE CAF', null, '120,00'),
    ...row(700, '05/09', 'PRLV SEPA FREE MOBILE', '15,99', null),
    { x: 130, y: 688, text: 'REF: FM-2026-09 ICS FR12ZZZ' },
    ...row(670, '07/09', 'VIR MANGOPAY SA VINTED', null, '1 045,00'),
  ];
  const page2: PdfText[] = [
    { x: 40, y: 800, text: 'Date' },
    { x: 85, y: 800, text: 'Valeur' },
    { x: 130, y: 800, text: 'Nature des opérations' },
    { x: 440, y: 800, text: 'Débit' },
    { x: 520, y: 800, text: 'Crédit' },
    ...row(780, '28/09', 'CB SNCF INTERNET', '45,00', null),
    { x: 130, y: 740, text: 'TOTAL DES OPERATIONS' },
    { x: 470, y: 740, text: '84,39', right: true },
    { x: 550, y: 740, text: '1 165,00', right: true },
    { x: 40, y: 720, text: '30/09/2026' },
    { x: 130, y: 720, text: 'SOLDE CREDITEUR AU 30/09/2026' },
    { x: 550, y: 720, text: '2 315,17', right: true },
  ];
  return makePdf([page1, page2]);
}

test('PDF statement with Débit / Crédit columns over two pages', async () => {
  const r = await readStatementFile(classicStatement(), extractPdfText, TODAY);
  assert.equal(r.format, 'pdf');
  assert.deepEqual(
    r.rows.map((x) => [x.date, x.amount]),
    [['2026-09-02', -23.4], ['2026-09-03', 120], ['2026-09-05', -15.99], ['2026-09-07', 1045], ['2026-09-28', -45]],
  );
  assert.match(r.rows[2].label, /FREE MOBILE REF: FM-2026-09/); // wrapped label kept
});

test('PDF import is categorised like a CSV one', async () => {
  const db = await makeDb();
  const cats = await getCategories(db);
  const id = (n: string) => cats.find((c) => c.name === n)!.id;
  const r = await readStatementFile(classicStatement(), extractPdfText, TODAY);
  const plan = await prepareImport(db, r.rows);
  const row = (re: RegExp) => plan.rows.find((p) => re.test(p.rawLabel))!;
  assert.equal(row(/CARREFOUR/).categoryId, id('Nourriture'));
  assert.equal(row(/FREE/).categoryId, id('Abonnements'));
  assert.equal(row(/CAF/).categoryId, id('Bourse / aides'));
  assert.equal(row(/MANGOPAY/).type, 'sale');
  assert.equal(row(/SNCF/).categoryId, id('Transport'));
});

test('PDF with a single signed "Montant" column and a balance column, full dates', async () => {
  const pdf = makePdf([[
    { x: 40, y: 760, text: 'Date' },
    { x: 120, y: 760, text: 'Description' },
    { x: 430, y: 760, text: 'Montant' },
    { x: 520, y: 760, text: 'Solde' },
    { x: 40, y: 740, text: '12/09/2026' },
    { x: 120, y: 740, text: 'Uber Eats' },
    { x: 470, y: 740, text: '-16,47 €', right: true },
    { x: 555, y: 740, text: '200,00 €', right: true },
    { x: 40, y: 725, text: '13/09/2026' },
    { x: 120, y: 725, text: 'Remboursement Lydia' },
    { x: 470, y: 725, text: '+8,00 €', right: true },
    { x: 555, y: 725, text: '208,00 €', right: true },
  ]]);
  const r = await readStatementFile(pdf, extractPdfText, TODAY);
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.label]), [
    ['2026-09-12', -16.47, 'Uber Eats'],
    ['2026-09-13', 8, 'Remboursement Lydia'],
  ]);
});

test('PDF without table header: sign from the amount or the label wording; dates with month names', async () => {
  const pdf = makePdf([[
    { x: 40, y: 760, text: '3 sept. 2026' },
    { x: 120, y: 760, text: 'Spotify' },
    { x: 520, y: 760, text: '10,99', right: true },
    { x: 40, y: 745, text: '4 sept. 2026' },
    { x: 120, y: 745, text: 'Virement de Paul' },
    { x: 520, y: 745, text: '25,00', right: true },
  ]]);
  const r = await readStatementFile(pdf, extractPdfText, TODAY);
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount]), [['2026-09-03', -10.99], ['2026-09-04', 25]]);
});

test('dd/mm dates across new year go to the right year', async () => {
  const pdf = makePdf([[
    { x: 40, y: 800, text: 'Relevé du 15/12/2026 au 14/01/2027' },
    { x: 40, y: 760, text: 'Date' }, { x: 120, y: 760, text: 'Libellé' },
    { x: 440, y: 760, text: 'Débit' }, { x: 520, y: 760, text: 'Crédit' },
    { x: 40, y: 740, text: '28/12' }, { x: 120, y: 740, text: 'CB CADEAU' }, { x: 470, y: 740, text: '30,00', right: true },
    { x: 40, y: 725, text: '03/01' }, { x: 120, y: 725, text: 'CB SOLDES' }, { x: 470, y: 725, text: '12,00', right: true },
  ]]);
  const r = await readStatementFile(pdf, extractPdfText, '2027-01-20');
  assert.deepEqual(r.rows.map((x) => x.date), ['2026-12-28', '2027-01-03']);
});

test('PDF without text (scan) or without operations gives a clear message', async () => {
  await assert.rejects(readStatementFile(makePdf([[]]), extractPdfText, TODAY), /scanné/);
  await assert.rejects(
    readStatementFile(makePdf([[{ x: 40, y: 700, text: 'Formulaire de contestation de paiement par carte bancaire' }]]), extractPdfText, TODAY),
    /Aucune opération trouvée dans ce PDF/,
  );
});

test('ZIP containing only a PDF statement', async () => {
  const { zipSync } = await import('fflate');
  const r = await readStatementFile(zipSync({ 'releve.pdf': classicStatement() }), extractPdfText, TODAY);
  assert.equal(r.rows.length, 5);
});

test('same period imported as CSV then as PDF: no duplicates, only new operations added', async () => {
  const { applyImport } = await import('../src/db/repo.ts');
  const { parseStatement } = await import('../src/lib/bankImport.ts');
  const db = await makeDb();
  const csv = parseStatement(
    'Date;Libellé;Montant\n02/09/2026;CARTE X1234 CARREFOUR CITY;-23,40\n05/09/2026;PRLV FREE MOBILE SA;-15,99\n',
  );
  await applyImport(db, (await prepareImport(db, csv.rows)).rows, new Set());
  const pdf = await readStatementFile(classicStatement(), extractPdfText, TODAY);
  const plan = await prepareImport(db, pdf.rows);
  assert.equal(plan.alreadyImported, 2);
  assert.deepEqual(plan.rows.map((r) => r.amount).sort((a, b) => a - b), [45, 120, 1045]);
});
