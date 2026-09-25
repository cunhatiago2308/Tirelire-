// Bank statement import: parsing (CSV / OFX), label cleaning, rule-based categorisation and
// de-duplication. Pure functions only — no database access here.
import { unzipSync } from 'fflate';
import { isValidDateStr, parseDate } from './dates.ts';
import { round2 } from './money.ts';

export interface ParsedTx {
  date: string;
  /** Signed: negative = debit, positive = credit. */
  amount: number;
  label: string;
  /** Bank's own transaction id (OFX FITID), when available. */
  fitid: string | null;
  /** Clean merchant name some banks provide ("Libellé suggéré"): shown instead of the raw label. */
  displayLabel?: string | null;
  /** The bank's own category ("Alimentation", "Transports"…): extra text for rule matching. */
  bankCategory?: string | null;
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
  display?: number | null;
  categories?: number[];
}

const HAS_CENTS = /^[-+−]?\s*[\d\s.,]*[.,]\d{2}\s*(€|EUR)?$/i;

/**
 * Amount column when the header has no "Montant"/"Débit"/"Crédit" (e.g. Boursorama names it "Solde",
 * next to a real balance column also called "Solde"): among columns holding amounts with cents,
 * the one with negative values and the most distinct values — a balance barely changes.
 */
function guessAmountColumn(h: string[], data: string[][], exclude: Set<number>): number {
  let best = -1;
  let bestScore = -1;
  h.forEach((_c, i) => {
    if (exclude.has(i)) return;
    const cells = data.map((r) => (r[i] ?? '').trim()).filter(Boolean);
    if (cells.length < Math.max(1, data.length * 0.8)) return;
    if (!cells.every((c) => HAS_CENTS.test(c) && parseBankAmount(c) != null)) return;
    const values = cells.map((c) => parseBankAmount(c)!);
    const score = new Set(values).size + (values.some((v) => v < 0) ? 1000 : 0);
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function columnsFromHeader(header: string[], data: string[][]): Columns | null {
  const h = header.map(normalize);
  const dateCols = h.map((c, i) => (/\bDATE/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (!dateCols.length) return null;
  const date = dateCols.find((i) => !/VALEUR/.test(h[i])) ?? dateCols[0];
  const find = (re: RegExp) => h.findIndex((c, i) => i !== date && re.test(c));
  let amount = find(/\b(MONTANT|AMOUNT|SOMME|VALEUR EUR)\b/);
  const debit = find(/\bDEBIT\b/);
  const credit = find(/\bCREDIT\b/);
  const isText = (c: string) => !/\bDATE/.test(c) && !/COMPTE/.test(c);
  const labels = h
    .map((c, i) => (isText(c) && /\b(LIBELLE|LABEL|DESCRIPTION|INTITULE|DETAIL|NATURE|OPERATION|BENEFICIAIRE|TIERS|COMMENTAIRE|MEMO)\b/.test(c) ? i : -1))
    .filter((i) => i >= 0);
  const categories = h.map((c, i) => (/\bCATEGOR/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (amount < 0 && debit < 0 && credit < 0) {
    amount = guessAmountColumn(h, data, new Set([...dateCols, ...labels, ...categories]));
    if (amount < 0) return null;
  }
  const display = labels.find((i) => /SUGGERE|SIMPLIFIE|MARCHAND|COMMERCANT|ENSEIGNE/.test(h[i]));
  return {
    date,
    labels: labels.filter((i) => i !== display),
    amount: amount >= 0 ? amount : null,
    debit: debit >= 0 ? debit : null,
    credit: credit >= 0 ? credit : null,
    display: display ?? null,
    categories,
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
    cols = columnsFromHeader(rows[i], rows.slice(i + 1, i + 31));
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
    const displayLabel = cols.display != null ? (r[cols.display] ?? '').trim() || null : null;
    const bankCategory = (cols.categories ?? []).map((i) => r[i] ?? '').filter(Boolean).join(' ') || null;
    out.push({ date, amount, label: label || displayLabel || 'Opération', fitid: null, displayLabel, bankCategory });
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

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * Reads a statement file as picked by the user: CSV / OFX, or a ZIP containing them
 * (some banks, e.g. Boursorama, zip the CSV together with PDFs — those are ignored).
 */
export function parseStatementFile(bytes: Uint8Array): ParseResult {
  if (!isZip(bytes)) return parseStatement(decodeBytes(bytes));
  const entries = unzipEntries(bytes, 0);
  const results: ParseResult[] = [];
  const errors: string[] = [];
  // Every file is tried whatever its name (".CSV", ".txt", no extension…); PDFs and other binaries are skipped.
  for (const [name, data] of entries) {
    if (isBinary(data)) continue;
    try {
      results.push(parseStatement(decodeBytes(data)));
    } catch (e) {
      errors.push(`${baseName(name)} : ${(e as Error).message}`);
    }
  }
  if (!results.length) {
    const list = entries.map(([n]) => baseName(n)).join(', ') || 'rien';
    throw new Error(
      errors.length
        ? `Relevé illisible dans ce ZIP. ${errors.join(' ')}`
        : `Aucun relevé (CSV ou OFX) trouvé dans ce ZIP. Il contient : ${list}.`,
    );
  }
  return {
    format: results[0].format,
    rows: results.flatMap((r) => r.rows),
    skipped: results.reduce((n, r) => n + r.skipped, 0),
  };
}

const baseName = (path: string) => path.split('/').pop() ?? path;

/** Files of a ZIP (sorted by name), including those of ZIPs nested inside it. */
function unzipEntries(bytes: Uint8Array, depth: number): [string, Uint8Array][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new Error(`Fichier ZIP illisible (${(e as Error).message}).`);
  }
  const out: [string, Uint8Array][] = [];
  for (const name of Object.keys(files).sort()) {
    const data = files[name];
    const base = baseName(name);
    if (name.endsWith('/') || name.startsWith('__MACOSX') || base.startsWith('._') || !data.length) continue;
    if (isZip(data) && depth < 2) out.push(...unzipEntries(data, depth + 1));
    else out.push([name, data]);
  }
  return out;
}

/** PDF, images, Office files…: NUL bytes or a known binary signature in the first bytes. */
function isBinary(b: Uint8Array): boolean {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return true; // %PDF
  const n = Math.min(b.length, 1024);
  for (let i = 0; i < n; i++) if (b[i] === 0) return true;
  return false;
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
    // Merchant keywords first; the bank's own category only as a fallback.
    const rule =
      matchRule(rules, [p.label, p.displayLabel].filter(Boolean).join(' '), p.amount) ??
      (p.bankCategory ? matchRule(rules, p.bankCategory, p.amount) : null);
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
      label: p.displayLabel ? cleanLabel(p.displayLabel) : cleanLabel(p.label),
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
