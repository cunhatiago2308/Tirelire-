import type { GaugeLevel } from './lib/calc.ts';
import type { TxType } from './db/types.ts';

export const colors = {
  bg: '#F4F5FA',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#4F46E5',
  primarySoft: '#EEF2FF',
  green: '#16A34A',
  greenSoft: '#DCFCE7',
  orange: '#EA580C',
  orangeSoft: '#FFEDD5',
  red: '#DC2626',
  redSoft: '#FEE2E2',
  sale: '#0891B2',
  saleSoft: '#CFFAFE',
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

export const radius = 14;
