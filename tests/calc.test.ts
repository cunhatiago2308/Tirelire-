/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  csvCell,
  dailyAvailable,
  dueOccurrences,
  gaugeLevel,
  goalProgress,
  pctChange,
  summarizeSales,
  upcomingFixedTotal,
} from '../src/lib/calc.ts';
import { addMonths, dateInMonth, daysInMonth, isValidDateStr, monthRange } from '../src/lib/dates.ts';
import { formatMoney, parseAmount } from '../src/lib/money.ts';

test('gauge colours: <70 % green, 70–100 % orange, >100 % red', () => {
  assert.equal(gaugeLevel(69.99, 100), 'ok');
  assert.equal(gaugeLevel(70, 100), 'warn');
  assert.equal(gaugeLevel(100, 100), 'warn');
  assert.equal(gaugeLevel(100.01, 100), 'over');
});

test('available per day = (balance − upcoming fixed) / days left, today included', () => {
  // 25 Sept → 30 − 25 + 1 = 6 days left
  const r = dailyAvailable(500, 200, '2026-09-25');
  assert.equal(r.daysLeft, 6);
  assert.equal(r.remaining, 300);
  assert.equal(r.perDay, 50);
  // last day of month → 1 day
  assert.equal(dailyAvailable(10, 0, '2026-02-28').daysLeft, 1);
  // negative stays negative
  assert.equal(dailyAvailable(-60, 0, '2026-09-25').perDay, -10);
});

test('sales summary: margin only on sales with purchase price', () => {
  const s = summarizeSales([
    { amount: 30, purchase_price: 10 },
    { amount: 50, purchase_price: 35 },
    { amount: 20, purchase_price: null },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.total, 100);
  assert.equal(s.withMarginCount, 2);
  assert.equal(s.marginTotal, 35);
  assert.equal(s.avgMargin, 17.5);
  assert.equal(s.marginRate, 35 / 80);
  assert.equal(summarizeSales([]).avgMargin, null);
});

test('recurring: due occurrences and upcoming total', () => {
  const rules = [
    { id: 1, amount: 400, day: 5, start_month: '2026-07', active: 1 },
    { id: 2, amount: 10, day: 28, start_month: '2026-09', active: 1 },
    { id: 3, amount: 99, day: 1, start_month: '2026-01', active: 0 },
  ];
  const generated = new Set(['1|2026-07']);
  const due = dueOccurrences(rules, generated, '2026-09-25');
  assert.deepEqual(due.map((d) => d.date), ['2026-08-05', '2026-09-05']);
  // rule 1 not yet generated for September counts as upcoming too (until generated)
  assert.equal(upcomingFixedTotal(rules, generated, '2026-09-25'), 410);
  generated.add('1|2026-09');
  assert.equal(upcomingFixedTotal(rules, generated, '2026-09-25'), 10);
});

test('recurring day 31 is clamped to month end', () => {
  const due = dueOccurrences([{ id: 1, amount: 1, day: 31, start_month: '2026-02', active: 1 }], new Set(), '2026-04-30');
  assert.deepEqual(due.map((d) => d.date), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('pctChange and goal progress', () => {
  assert.equal(pctChange(120, 100), 20);
  assert.equal(pctChange(80, 100), -20);
  assert.equal(pctChange(10, 0), null);
  const g = goalProgress(250, 1000, '2026-12-15', '2026-09-25');
  assert.equal(g.ratio, 0.25);
  assert.equal(g.remaining, 750);
  assert.equal(g.perMonthNeeded, 187.5); // sept, oct, nov, dec
  assert.equal(goalProgress(10, 100, '2026-01-01', '2026-09-25').perMonthNeeded, null);
});

test('money and dates helpers', () => {
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount(' 1 200 '), 1200);
  assert.equal(parseAmount('12.345'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(formatMoney(1234.5), '1 234,50 €');
  assert.equal(formatMoney(-3), '−3,00 €');
  assert.equal(formatMoney(3, { sign: true }), '+3,00 €');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(dateInMonth('2026-04', 31), '2026-04-30');
  assert.deepEqual(monthRange('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
  assert.equal(isValidDateStr('2026-02-30'), false);
  assert.equal(isValidDateStr('2026-02-28'), true);
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell(12.5), '12,5');
});
