/** A piece of text on a PDF page, with its position (PDF units, origin bottom-left). */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface PdfPage {
  items: PdfTextItem[];
}

export type PdfTextExtractor = (bytes: Uint8Array) => Promise<PdfPage[]>;
