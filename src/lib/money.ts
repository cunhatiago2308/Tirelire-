/** Rounds to cents to avoid floating point drift (0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 1234.5 → "1 234,50 €" (French formatting, no Intl dependency). */
export function formatMoney(n: number, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  const { sign = false, decimals = true } = opts;
  const value = round2(n);
  const abs = Math.abs(value);
  const fixed = decimals ? abs.toFixed(2) : Math.round(abs).toString();
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : '';
  return `${prefix}${grouped}${dec ? ',' + dec : ''} €`;
}

/** Parses user input like "12,5", "12.50", "1 200" → 12.5 / 12.5 / 1200. Returns null if invalid. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : null;
}

/** Number → string suitable to prefill an input ("12,5"). */
export function amountToInput(n: number | null | undefined): string {
  if (n == null) return '';
  return String(round2(n)).replace('.', ',');
}
