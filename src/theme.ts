import type { GaugeLevel } from './lib/calc.ts';
import type { TxType } from './db/types.ts';

/** App name, shown in the UI. Also change "name" in app.json (store / home-screen name). */
export const APP_NAME = 'Tirelire+';

// Mostly black, with green as the accent colour.
export const colors = {
  bg: '#000000',
  card: '#121212',
  cardHigh: '#1C1C1E',
  text: '#F5F5F5',
  muted: '#8E8E93',
  border: '#2A2A2A',
  primary: '#22C55E',
  primarySoft: '#0F2A19',
  green: '#22C55E',
  greenSoft: '#0F2A19',
  orange: '#F59E0B',
  orangeSoft: '#2B1F08',
  red: '#EF4444',
  redSoft: '#2D1010',
  sale: '#2DD4BF',
  saleSoft: '#0B2926',
};

export const levelColor: Record<GaugeLevel, string> = {
  ok: colors.green,
  warn: colors.orange,
  over: colors.red,
};

export const typeMeta: Record<TxType, { label: string; plural: string; color: string; soft: string; sign: -1 | 1 }> = {
  expense: { label: 'Dépense', plural: 'Dépenses', color: colors.red, soft: colors.redSoft, sign: -1 },
  income: { label: 'Revenu', plural: 'Revenus', color: colors.green, soft: colors.greenSoft, sign: 1 },
  sale: { label: 'Vente', plural: 'Ventes', color: colors.sale, soft: colors.saleSoft, sign: 1 },
};

export const radius = 16;

/** Black or white, whichever reads best on the given background colour. */
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? '#000000' : '#FFFFFF';
}
