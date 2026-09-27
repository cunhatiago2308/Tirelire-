// Text extraction from PDF statements with pdf.js (Mozilla), entirely on the device.
// Web only: pdf.js doesn't run in the native JS engine (see pdfText.ts).
import type { PdfPage, PdfTextExtractor } from './pdfText.types.ts';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjs: Promise<PdfJs> | null = null;

/** Loaded on first use only (it's big), with its "worker" running on the main thread. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (async () => {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })();
  return pdfjs;
}

export const extractPdfText: PdfTextExtractor = async (bytes) => {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'PasswordException') throw new Error('Ce PDF est protégé par un mot de passe.');
    throw new Error('PDF illisible ou endommagé.');
  }
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: PdfPage['items'] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
    }
    pages.push({ items });
  }
  await task.destroy();
  return pages;
};
