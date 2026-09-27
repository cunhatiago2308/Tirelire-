// Native (Expo Go / store build): pdf.js doesn't run in React Native's JS engine.
// The web version (the installed app) has the real implementation in pdfText.web.ts.
import type { PdfTextExtractor } from './pdfText.types.ts';

export const extractPdfText: PdfTextExtractor = async () => {
  throw new Error(
    "L'import de relevés PDF fonctionne dans la version installée depuis le navigateur. Ici, utilise un export CSV ou OFX.",
  );
};
