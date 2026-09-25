// Bank statement import: parsing (CSV / OFX), label cleaning, rule-based categorisation and
// de-duplication. Pure functions only — no database access here.
import { isValidDateStr, parseDate } from './dates.ts';
import { round2 } from './money.ts';

export interface ParsedTx {
  date: string;
  /** Signed: negative = debit, positive = credit. */
  amount: number;
  label: string;
  /** Bank's own transaction id (OFX FITID), when available. */
  fitid: string | null;
}

export interface ParseResult {
  format: 'csv' | 'ofx';
  rows: ParsedTx[];
  /** Lines that looked like data but could not be read. */
  skipped: number;
}

// ─── Decoding ────────────────────────────────────────────────────────────────

/** Decodes UTF-8, falling back to Latin-1 / Windows-1252 (common for French bank exports). */
export function decodeBytes(bytes: Uint8Array): string {
  const utf8 = decodeUtf8(bytes);
  const text = utf8 ?? decodeLatin1(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function decodeUtf8(b: Uint8Array): string | null {
  let out = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp: number;
    let extra: number;
    if (c < 0x80) { cp = c; extra = 0; }
    else if (c >= 0xc2 && c < 0xe0) { cp = c & 0x1f; extra = 1; }
    else if (c >= 0xe0 && c < 0xf0) { cp = c & 0x0f; extra = 2; }
    else if (c >= 0xf0 && c < 0xf5) { cp = c & 0x07; extra = 3; }
    else return null;
    for (let k = 1; k <= extra; k++) {
      const n = b[i + k];
      if (n === undefined || (n & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (n & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

// Windows-1252 specifics for 0x80–0x9F (€, ’, œ, …); the rest maps 1:1 to Unicode.
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x84: 0x201e, 0x85: 0x2026, 0x8a: 0x160, 0x8c: 0x152, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x96: 0x2013, 0x97: 0x2014, 0x9a: 0x161, 0x9c: 0x153,
};

function decodeLatin1(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) out += String.fromCharCode(CP1252[b[i]] ?? b[i]);
  return out;
}

// ─── Value parsing ───────────────────────────────────────────────────────────

/** "12/09/2026", "12/09/26", "12-09-2026", "2026-09-12", "20260912" → "2026-09-12". */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, '');
  let y: number, m: number, d: number;
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(s);
  if (r) {
    d = +r[1];
    m = +r[2];
    y = r[3].length === 2 ? 2000 + +r[3] : +r[3];
  } else if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
    y = +r[1]; m = +r[2]; d = +r[3];
  } else if ((r = /^(\d{4})(\d{2})(\d{2})/.exec(s))) {
    y = +r[1]; m = +r[2]; d = +r[3];
  } else return null;
  const out = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidDateStr(out) ? out : null;
}

/** "-1 234,56 €", "+12,5", "(12.50)", "1,234.56", "−3" → signed number, or null. */
export function parseBankAmount(raw: string): number | null {
  let s = raw.trim().replace(/^"|"$/g, '').replace(/[\s  ]|EUR|€/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[-−–]/.test(s)) { neg = true; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (/[-−–]$/.test(s)) { neg = true; s = s.slice(0, -1); }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // The last separator is the decimal one.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = round2(Number(s));
  return neg ? -n : n;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function splitCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.trim() !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ';';
  let bestScore = 0;
  for (const d of [';', '\t', ',', '|']) {
    // Score = number of lines having the most common (non-zero) count of this delimiter.
    const counts = new Map<number, number>();
    for (const l of lines) {
      const n = l.split(d).length - 1;
      if (n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const score = Math.max(0, ...counts.values());
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

export function normalize(s: string): string {
  return s
    .toUpperCase()
    .replace(/[ÀÂÄÁÃ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÎÏÍ]/g, 'I')
    .replace(/[ÔÖÓÕ]/g, 'O').replace(/[ÙÛÜÚ]/g, 'U').replace(/Ç/g, 'C').replace(/Œ/g, 'OE')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

interface Columns {
  date: number;
  labels: number[];
  amount: number | null;
  debit: number | null;
  credit: number | null;
}

function columnsFromHeader(header: string[]): Columns | null {
  const h = header.map(normalize);
  const dateCols = h.map((c, i) => (/\bDATE/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (!dateCols.length) return null;
  const date = dateCols.find((i) => !/VALEUR/.test(h[i])) ?? dateCols[0];
  const find = (re: RegExp) => h.findIndex((c, i) => i !== date && re.test(c));
  const amount = find(/\b(MONTANT|AMOUNT|SOMME|VALEUR EUR)\b/);
  const debit = find(/\bDEBIT\b/);
  const credit = find(/\bCREDIT\b/);
  if (amount < 0 && debit < 0 && credit < 0) return null;
  const labels = h
    .map((c, i) => (i !== date && /\b(LIBELLE|LABEL|DESCRIPTION|INTITULE|DETAIL|NATURE|OPERATION|BENEFICIAIRE|TIERS|COMMENTAIRE|MEMO)\b/.test(c) && !/\bDATE/.test(c) ? i : -1))
    .filter((i) => i >= 0);
  return {
    date,
    labels,
    amount: amount >= 0 ? amount : null,
    debit: debit >= 0 ? debit : null,
    credit: credit >= 0 ? credit : null,
  };
}

/** No header: date = first date-like cell, amount = last amount-like cell, label = longest text. */
function columnsFromData(row: string[]): Columns | null {
  const date = row.findIndex((c) => parseBankDate(c) != null);
  if (date < 0) return null;
  const isAmount = (i: number) => i !== date && parseBankDate(row[i]) == null && parseBankAmount(row[i]) != null;
  let amount = -1;
  // Prefer a cell with cents ("12,50") over bare numbers (account or reference numbers).
  for (let i = row.length - 1; i >= 0 && amount < 0; i--) if (isAmount(i) && /[.,]\d{2}\s*(€|EUR)?$/i.test(row[i])) amount = i;
  for (let i = row.length - 1; i >= 0 && amount < 0; i--) if (isAmount(i)) amount = i;
  if (amount < 0) return null;
  let label = -1;
  row.forEach((c, i) => {
    if (i !== date && i !== amount && parseBankAmount(c) == null && (label < 0 || c.length > row[label].length)) label = i;
  });
  return { date, labels: label >= 0 ? [label] : [], amount, debit: null, credit: null };
}

function parseCsv(text: string): ParseResult {
  const rows = splitCsv(text, detectDelimiter(text));
  let cols: Columns | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    cols = columnsFromHeader(rows[i]);
    if (cols) { start = i + 1; break; }
  }
  if (!cols) {
    const first = rows.findIndex((r) => columnsFromData(r) != null);
    if (first >= 0) { cols = columnsFromData(rows[first]); start = first; }
  }
  if (!cols) throw new Error("Format non reconnu : impossible de trouver les colonnes date et montant.");

  const out: ParsedTx[] = [];
  let skipped = 0;
  for (const r of rows.slice(start)) {
    const date = parseBankDate(r[cols.date] ?? '');
    let amount: number | null = null;
    if (cols.amount != null) amount = parseBankAmount(r[cols.amount] ?? '');
    if (amount == null && (cols.debit != null || cols.credit != null)) {
      const d = cols.debit != null ? parseBankAmount(r[cols.debit] ?? '') : null;
      const c = cols.credit != null ? parseBankAmount(r[cols.credit] ?? '') : null;
      if (d != null || c != null) amount = round2(Math.abs(c ?? 0) - Math.abs(d ?? 0));
    }
    if (!date || amount == null) {
      // Footer lines ("Solde au …", totals) are expected; only count lines that look like operations.
      if (date || amount != null) skipped++;
      continue;
    }
    if (amount === 0) continue;
    const label = cols.labels.map((i) => r[i] ?? '').filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
    out.push({ date, amount, label: label || 'Opération', fitid: null });
  }
  return { format: 'csv', rows: out, skipped };
}

// ─── OFX / QFX ───────────────────────────────────────────────────────────────

function ofxTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

function parseOfx(text: string): ParseResult {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const out: ParsedTx[] = [];
  let skipped = 0;
  for (const b of blocks) {
    const date = parseBankDate(ofxTag(b, 'DTPOSTED') ?? '');
    const amount = parseBankAmount(ofxTag(b, 'TRNAMT') ?? '');
    if (!date || amount == null) { skipped++; continue; }
    if (amount === 0) continue;
    const name = ofxTag(b, 'NAME') ?? '';
    const memo = ofxTag(b, 'MEMO') ?? '';
    const label = [name, memo && !name.includes(memo) ? memo : ''].filter(Boolean).join(' — ');
    out.push({ date, amount, label: label || 'Opération', fitid: ofxTag(b, 'FITID') });
  }
  return { format: 'ofx', rows: out, skipped };
}

export function parseStatement(text: string): ParseResult {
  const result = /<STMTTRN>/i.test(text) ? parseOfx(text) : parseCsv(text);
  if (!result.rows.length) throw new Error('Aucune opération trouvée dans ce fichier.');
  return result;
}

// ─── Labels, rules, keys ─────────────────────────────────────────────────────

const NOISE = new Set([
  'CB', 'CARTE', 'PAIEMENT', 'PAR', 'PRLV', 'PRELEVEMENT', 'SEPA', 'VIR', 'VIREMENT', 'RECU', 'EMIS', 'INST',
  'INSTANTANE', 'FACTURE', 'FACT', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'A', 'AU', 'ET', 'EN', 'SUR', 'WEB',
  'RETRAIT', 'DAB', 'ACHAT', 'ECHEANCE', 'REF', 'MOTIF', 'NUM', 'NO', 'CONTACTLESS', 'SANS', 'CONTACT', 'SC',
  'EUR', 'MANDAT', 'ICS', 'RUM', 'FRAIS', 'OPERATION', 'DATE', 'VERS', 'POUR',
]);

/** Label shown in the app: noise and card numbers removed, Title Case when all caps. */
export function cleanLabel(label: string): string {
  let s = label
    .trim()
    .replace(/^(VIREMENT EN VOTRE FAVEUR|VIR SEPA RECU \/DE|VIR RECU|REMISE CHEQUE|PAIEMENT PAR CARTE|PAIEMENT CB|ACHAT CB|CARTE|CB|PRLV SEPA|PRELEVEMENT SEPA|PRLV|VIR SEPA RECU|VIR SEPA EMIS|VIR SEPA|VIR INST|VIREMENT SEPA|VIREMENT DE|VIREMENT|VIR)\b\s*(\/?\s*DE\b)?/i, ' ')
    .replace(/\b(CB|CARTE)?\s*\*?\s*X?\d{4}\b/gi, ' ')
    .replace(/\b\d{2}[/.]\d{2}([/.]\d{2,4})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = label.trim();
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s'’(-])([a-zà-ÿ])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

/** Keyword used to remember a user's categorisation: first significant word(s) of the label. */
export function keywordFromLabel(label: string): string | null {
  const words = normalize(label)
    .split(' ')
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !/\d/.test(w));
  if (!words.length) return null;
  return words.slice(0, words[0].length >= 5 ? 1 : 2).join(' ');
}

export type RuleKind = 'expense' | 'income' | 'sale' | 'ignore';

export interface Rule {
  id: number;
  pattern: string;
  kind: RuleKind;
  category_id: number | null;
}

/** Longest matching pattern wins; expense rules only apply to debits, income/sale rules to credits. */
export function matchRule(rules: Rule[], label: string, amount: number): Rule | null {
  const norm = ` ${normalize(label)} `;
  let best: Rule | null = null;
  for (const r of rules) {
    if (r.kind === 'expense' && amount > 0) continue;
    if ((r.kind === 'income' || r.kind === 'sale') && amount < 0) continue;
    const p = normalize(r.pattern);
    if (!p || !norm.includes(` ${p} `)) continue;
    if (!best || p.length > normalize(best.pattern).length) best = r;
  }
  return best;
}

/** Stable identity of a bank line, so importing overlapping statements never duplicates. */
export function importKeys(rows: ParsedTx[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (r.fitid) return `ofx:${r.fitid}`;
    const base = `${r.date}|${r.amount}|${normalize(r.label)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  });
}

// ─── Import plan ─────────────────────────────────────────────────────────────

export type TxKind = 'expense' | 'income' | 'sale';

export interface ExistingTx {
  id: number;
  type: TxKind;
  amount: number;
  date: string;
}

export interface PlannedRow {
  key: string;
  date: string;
  /** Absolute amount. */
  amount: number;
  isCredit: boolean;
  label: string;
  rawLabel: string;
  type: TxKind;
  categoryId: number | null;
  include: boolean;
  /** Already entered by hand (or generated fixed expense): linked instead of added. */
  matchId: number | null;
  /** Categorised by a rule (vs. left uncategorised). */
  ruleMatched: boolean;
}

export interface ImportPlan {
  rows: PlannedRow[];
  /** Lines already imported by a previous import. */
  alreadyImported: number;
}

const MATCH_DAYS = 4;

function dayDiff(a: string, b: string): number {
  return Math.abs(parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000;
}

export function planImport(
  parsed: ParsedTx[],
  knownKeys: Set<string>,
  unlinked: ExistingTx[],
  rules: Rule[],
): ImportPlan {
  const keys = importKeys(parsed);
  const available = [...unlinked];
  const rows: PlannedRow[] = [];
  let alreadyImported = 0;
  parsed.forEach((p, i) => {
    if (knownKeys.has(keys[i])) { alreadyImported++; return; }
    const isCredit = p.amount > 0;
    const amount = Math.abs(p.amount);
    const rule = matchRule(rules, p.label, p.amount);
    const type: TxKind = !isCredit ? 'expense' : rule?.kind === 'sale' ? 'sale' : 'income';
    // Same amount & direction within a few days → probably the manual entry of this very operation.
    let matchIdx = -1;
    available.forEach((t, j) => {
      const sameDir = isCredit ? t.type !== 'expense' : t.type === 'expense';
      if (!sameDir || Math.abs(t.amount - amount) > 0.001) return;
      const dd = dayDiff(t.date, p.date);
      if (dd <= MATCH_DAYS && (matchIdx < 0 || dd < dayDiff(available[matchIdx].date, p.date))) matchIdx = j;
    });
    const match = matchIdx >= 0 ? available.splice(matchIdx, 1)[0] : null;
    rows.push({
      key: keys[i],
      date: p.date,
      amount,
      isCredit,
      label: cleanLabel(p.label),
      rawLabel: p.label,
      type,
      categoryId: rule && rule.kind !== 'sale' && rule.kind !== 'ignore' ? rule.category_id : null,
      include: !match && rule?.kind !== 'ignore',
      matchId: match?.id ?? null,
      ruleMatched: !!rule,
    });
  });
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { rows, alreadyImported };
}
