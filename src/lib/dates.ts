// Dates are stored as local 'YYYY-MM-DD' strings and months as 'YYYY-MM'.

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const MONTHS_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDate(s)) === s;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Date of `day` in `month`, clamped to the month's last day (e.g. 31 → 30 in April). */
export function dateInMonth(month: string, day: number): string {
  return `${month}-${pad(Math.min(Math.max(1, day), daysInMonth(month)))}`;
}

/** Months from `from` to `to` inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShortLabel(month: string): string {
  return MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
}

export function formatDateShort(date: string): string {
  const d = parseDate(date);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDateLong(date: string): string {
  const d = parseDate(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 'Aujourd'hui', 'Hier' or a short date. */
export function relativeDayLabel(date: string, today: string = todayStr()): string {
  if (date === today) return "Aujourd'hui";
  if (date === addDays(today, -1)) return 'Hier';
  if (date === addDays(today, 1)) return 'Demain';
  return formatDateShort(date);
}
