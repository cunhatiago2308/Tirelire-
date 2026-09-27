// Rebuilds bank statement operations from the text of a PDF (no AI, no OCR): text pieces are
// grouped into lines by their position, the Débit / Crédit / Montant / Solde columns are located
// from the table header, and each line starting with a date becomes an operation.
import type { ParsedTx, ParseResult } from './bankImport.ts';
import { isValidDateStr } from './dates.ts';
import type { PdfPage, PdfTextItem } from './pdfText.types.ts';

interface Line {
  y: number;
  items: PdfTextItem[];
  text: string;
}

type ColumnKind = 'debit' | 'credit' | 'amount' | 'balance';

interface Column {
  kind: ColumnKind;
  /** Right edge of the header word: amounts are right-aligned under it. */
  right: number;
  center: number;
}

const MONTHS: Record<string, number> = {
  JANV: 1, JAN: 1, FEVR: 2, FEV: 2, FEB: 2, MARS: 3, MAR: 3, AVR: 4, APR: 4, MAI: 5, MAY: 5, JUIN: 6, JUN: 6,
  JUIL: 7, JUL: 7, AOUT: 8, AOU: 8, AUG: 8, SEPT: 9, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/[ÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÎÏ]/g, 'I').replace(/[ÔÖ]/g, 'O')
    .replace(/[ÙÛÜ]/g, 'U').replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();

// ─── Lines ───────────────────────────────────────────────────────────────────

function toLines(page: PdfPage): Line[] {
  const items = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2.5);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it], text: '' });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str.trim()).filter(Boolean).join(' ');
  }
  return lines.sort((a, b) => b.y - a.y);
}

// ─── Values ──────────────────────────────────────────────────────────────────

const AMOUNT = /^([-+−]\s?)?\d{1,3}(?:[ .  ]?\d{3})*,\d{2}(\s?(€|EUR))?$|^([-+−]\s?)?\d+\.\d{2}(\s?(€|EUR))?$/i;
const isAmount = (s: string) => AMOUNT.test(s.trim());

function amountValue(s: string): number {
  const t = s.trim();
  const neg = /^[-−]/.test(t);
  const digits = t.replace(/[^\d,.]/g, '');
  const value = digits.includes(',') ? Number(digits.replace(/\./g, '').replace(',', '.')) : Number(digits);
  return neg ? -value : value;
}

interface DateMatch {
  day: number;
  month: number;
  year: number | null;
  length: number;
}

function matchDate(text: string): DateMatch | null {
  let m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d,])/.exec(text);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    return { day: Number(m[1]), month: Number(m[2]), year, length: m[0].length };
  }
  m = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})\.?(?:\s+(\d{4}))?(?=\s|$)/.exec(text);
  if (m) {
    const month = MONTHS[norm(m[2]).slice(0, 4)] ?? MONTHS[norm(m[2]).slice(0, 3)];
    if (month) return { day: Number(m[1]), month, year: m[3] ? Number(m[3]) : null, length: m[0].length };
  }
  return null;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Latest full date written in the document (statement end), used to complete "dd/mm" dates. */
function referenceDate(lines: Line[], today: string): string {
  let best: string | null = null;
  for (const l of lines) {
    for (const m of l.text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
      const d = iso(Number(m[3]), Number(m[2]), Number(m[1]));
      if (isValidDateStr(d) && d <= today && (!best || d > best)) best = d;
    }
  }
  return best ?? today;
}

function completeDate(m: DateMatch, ref: string): string | null {
  let year = m.year ?? Number(ref.slice(0, 4));
  let d = iso(year, m.month, m.day);
  // "28/12" on a statement ending in January belongs to the previous year.
  if (m.year == null && d > ref && Number(d.slice(5, 7)) - Number(ref.slice(5, 7)) > 1) {
    year -= 1;
    d = iso(year, m.month, m.day);
  }
  return isValidDateStr(d) ? d : null;
}

// ─── Structure ───────────────────────────────────────────────────────────────

function headerColumns(line: Line): Column[] | null {
  const cols: Column[] = [];
  for (const it of line.items) {
    const w = norm(it.str);
    const kind: ColumnKind | null = /^DEBITS?\b|^DEBIT /.test(w) || w === 'DEBIT' || w === 'DEBITS'
      ? 'debit'
      : /^CREDITS?\b/.test(w)
        ? 'credit'
        : /^(MONTANT|SOMME)\b/.test(w)
          ? 'amount'
          : /^(SOLDE|BALANCE)\b/.test(w)
            ? 'balance'
            : null;
    if (kind) cols.push({ kind, right: it.x + it.width, center: it.x + it.width / 2 });
  }
  const kinds = new Set(cols.map((c) => c.kind));
  const hasDate = /\bDATE\b/.test(norm(line.text));
  if ((kinds.has('debit') && kinds.has('credit')) || (kinds.has('amount') && (hasDate || kinds.size > 1))) return cols;
  return null;
}

const SUMMARY = /^(SOLDE|ANCIEN SOLDE|NOUVEAU SOLDE|TOTAL|TOTAUX|REPORT|SOUS TOTAL|MONTANT TOTAL)\b|\bSOLDE (AU|CREDITEUR|DEBITEUR|PRECEDENT|FINAL|INITIAL)\b|\bTOTAL DES (OPERATIONS|MOUVEMENTS)\b/;
const CREDIT_WORDS = /\b(VIR(EMENT)? (SEPA )?(RECU|INST RECU)|VIREMENT DE|VIR DE|EN VOTRE FAVEUR|REMBOURSEMENT|REMB|REMISE|AVOIR|SALAIRE|PAIE|PRIME|ALLOCATION|CAF|DEPOT|VERSEMENT|INTERETS CREDITEURS|MANGOPAY)\b/;

/** Column of an amount: the header column whose right edge is closest to the amount's right edge. */
function columnOf(item: PdfTextItem, cols: Column[]): Column | null {
  let best: Column | null = null;
  let bestDist = Infinity;
  const right = item.x + item.width;
  for (const c of cols) {
    const d = Math.min(Math.abs(c.right - right), Math.abs(c.center - (item.x + item.width / 2)));
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

export function parsePdfStatement(pages: PdfPage[], today: string): ParseResult {
  const allLines = pages.map(toLines);
  const textChars = allLines.flat().reduce((n, l) => n + l.text.length, 0);
  if (textChars < 20) {
    throw new Error(
      "Ce PDF ne contient pas de texte (document scanné ou photo) : il ne peut pas être lu sans OCR. Télécharge le relevé depuis l'app ou le site de ta banque.",
    );
  }
  const ref = referenceDate(allLines.flat(), today);
  const rows: ParsedTx[] = [];
  let skipped = 0;
  let cols: Column[] | null = null;

  for (const lines of allLines) {
    let last: { tx: ParsedTx; extra: number } | null = null;
    for (const line of lines) {
      const header = headerColumns(line);
      if (header) { cols = header; last = null; continue; }

      const date = matchDate(line.text);
      const amounts = line.items.filter((i) => isAmount(i.str));
      const upper = norm(line.text);

      if (!date) {
        // Wrapped label: text-only line right under an operation.
        if (last && !amounts.length && last.extra < 2 && !SUMMARY.test(upper) && line.text.length < 80) {
          last.tx.label += ' ' + line.text;
          last.extra++;
        } else last = null;
        continue;
      }

      // Text after the date(s), before the first amount = label.
      let rest = line.text.slice(date.length).trim();
      const valueDate = matchDate(rest);
      if (valueDate) rest = rest.slice(valueDate.length).trim();
      const firstAmount = amounts[0];
      const label = (firstAmount ? rest.slice(0, rest.indexOf(firstAmount.str.trim())) : rest).trim();
      if (SUMMARY.test(norm(label)) || !label) { last = null; continue; }
      if (!amounts.length) { skipped++; last = null; continue; }

      const d = completeDate(date, ref);
      if (!d) { skipped++; last = null; continue; }

      let amount: number | null = null;
      if (cols) {
        for (const a of amounts) {
          const col = columnOf(a, cols);
          const v = amountValue(a.str);
          if (!col || col.kind === 'balance') continue;
          amount = col.kind === 'debit' ? -Math.abs(v) : col.kind === 'credit' ? Math.abs(v) : v;
          break;
        }
      } else {
        // No table header: explicit sign, otherwise wording of the label.
        const v = amountValue(amounts[0].str);
        amount = /^[-−+]/.test(amounts[0].str.trim()) ? v : CREDIT_WORDS.test(norm(label)) ? Math.abs(v) : -Math.abs(v);
      }
      if (amount == null || amount === 0) { skipped++; last = null; continue; }

      const tx: ParsedTx = { date: d, amount: Math.round(amount * 100) / 100, label, fitid: null };
      rows.push(tx);
      last = { tx, extra: 0 };
    }
  }
  if (!rows.length) {
    throw new Error("Aucune opération trouvée dans ce PDF (il faut un relevé avec des lignes « date … montant »).");
  }
  return { format: 'pdf', rows, skipped };
}
