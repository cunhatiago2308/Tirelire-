/// <reference types="node" />
// Builds small real PDFs (Helvetica text at given positions) to test statement parsing.

export interface PdfText {
  x: number;
  y: number;
  text: string;
  /** Right-align the text on x (amount columns). */
  right?: boolean;
}

const SIZE = 9;
// Rough Helvetica advance widths (in 1/1000 em) for right alignment.
const width = (s: string) =>
  [...s].reduce((w, c) => w + (/[0-9]/.test(c) ? 556 : c === ' ' ? 278 : /[,.]/.test(c) ? 278 : c === '-' ? 333 : 600), 0) * SIZE / 1000;

// WinAnsi: € is 0x80.
const esc = (s: string) => s.replace(/€/g, '\x80').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export function makePdf(pages: PdfText[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font, then per page: page + contents
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let id = 4;
  for (const texts of pages) {
    const content = texts
      .map((t) => `BT /F1 ${SIZE} Tf ${(t.right ? t.x - width(t.text) : t.x).toFixed(2)} ${t.y} Td (${esc(t.text)}) Tj ET`)
      .join('\n');
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
    pageIds.push(id);
    id += 2;
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
