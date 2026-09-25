import { dateInMonth, dayOf, daysInMonth, monthOf } from './dates.ts';
import { round2 } from './money.ts';

export type GaugeLevel = 'ok' | 'warn' | 'over';

/** Envelope colour: green below 70 %, orange from 70 % to 100 %, red when exceeded. */
export function gaugeLevel(spent: number, budget: number): GaugeLevel {
  if (budget <= 0) return spent > 0 ? 'over' : 'ok';
  const ratio = spent / budget;
  if (ratio > 1) return 'over';
  if (ratio >= 0.7) return 'warn';
  return 'ok';
}

/**
 * What a sale adds to the balance: its margin when the purchase price is known,
 * otherwise the full sale price (nothing known to subtract).
 */
export function saleNet(salePrice: number, purchasePrice: number | null): number {
  return round2(salePrice - (purchasePrice ?? 0));
}

export function saleMargin(salePrice: number, purchasePrice: number | null): number | null {
  return purchasePrice == null ? null : round2(salePrice - purchasePrice);
}

export interface SaleLike {
  amount: number;
  purchase_price: number | null;
}

export interface SalesSummary {
  count: number;
  total: number;
  /** Sales where a purchase price was entered. */
  withMarginCount: number;
  marginTotal: number;
  avgMargin: number | null;
  /** Margin rate on sales with a known purchase price (margin / sale price). */
  marginRate: number | null;
}

export function summarizeSales(sales: SaleLike[]): SalesSummary {
  let total = 0;
  let marginTotal = 0;
  let marginSalesTotal = 0;
  let withMarginCount = 0;
  for (const s of sales) {
    total += s.amount;
    const m = saleMargin(s.amount, s.purchase_price);
    if (m != null) {
      marginTotal += m;
      marginSalesTotal += s.amount;
      withMarginCount++;
    }
  }
  return {
    count: sales.length,
    total: round2(total),
    withMarginCount,
    marginTotal: round2(marginTotal),
    avgMargin: withMarginCount ? round2(marginTotal / withMarginCount) : null,
    marginRate: marginSalesTotal > 0 ? marginTotal / marginSalesTotal : null,
  };
}

export interface RecurringRule {
  id: number;
  amount: number;
  day: number;
  start_month: string;
  active: number;
}

/** Occurrences (rule, date) that are due up to `today` and not yet generated. */
export function dueOccurrences(
  rules: RecurringRule[],
  generated: Set<string>,
  today: string,
): { ruleId: number; month: string; date: string }[] {
  const current = monthOf(today);
  const out: { ruleId: number; month: string; date: string }[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    for (let m = r.start_month; m <= current; m = nextMonth(m)) {
      const date = dateInMonth(m, r.day);
      if (date > today) break;
      if (!generated.has(occurrenceKey(r.id, m))) out.push({ ruleId: r.id, month: m, date });
    }
  }
  return out;
}

/** Sum of fixed expenses still to come this month (not yet generated as transactions). */
export function upcomingFixedTotal(rules: RecurringRule[], generated: Set<string>, today: string): number {
  const month = monthOf(today);
  let sum = 0;
  for (const r of rules) {
    if (!r.active || r.start_month > month) continue;
    if (generated.has(occurrenceKey(r.id, month))) continue;
    sum += r.amount;
  }
  return round2(sum);
}

export function occurrenceKey(ruleId: number, month: string): string {
  return `${ruleId}|${month}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export interface DailyAvailable {
  /** Month balance minus fixed expenses still to come. */
  remaining: number;
  /** Days left in the month, today included. */
  daysLeft: number;
  perDay: number;
}

/** (month balance − upcoming fixed expenses) / days remaining in the month (today included). */
export function dailyAvailable(balance: number, upcomingFixed: number, today: string): DailyAvailable {
  const daysLeft = daysInMonth(monthOf(today)) - dayOf(today) + 1;
  const remaining = round2(balance - upcomingFixed);
  return { remaining, daysLeft, perDay: round2(remaining / daysLeft) };
}

/** Relative change in %, or null when there is no reference value. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface GoalProgress {
  ratio: number;
  remaining: number;
  /** Amount to save per month to hit the deadline, when one is set and not passed. */
  perMonthNeeded: number | null;
}

export function goalProgress(saved: number, target: number, deadline: string | null, today: string): GoalProgress {
  const ratio = target > 0 ? Math.max(0, saved / target) : 0;
  const remaining = round2(Math.max(0, target - saved));
  let perMonthNeeded: number | null = null;
  if (deadline && deadline >= today && remaining > 0) {
    const [ty, tm] = today.split('-').map(Number);
    const [dy, dm] = deadline.split('-').map(Number);
    const months = Math.max(1, (dy - ty) * 12 + (dm - tm) + 1);
    perMonthNeeded = round2(remaining / months);
  }
  return { ratio, remaining, perMonthNeeded };
}

/** CSV cell escaping for a ';'-separated file. */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(round2(v)).replace('.', ',') : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  // BOM so Excel opens UTF-8 accents correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
