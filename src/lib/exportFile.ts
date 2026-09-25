import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportCsv } from '../db/repo.ts';
import type { Db } from '../db/types.ts';
import { todayStr } from './dates.ts';

/** Writes the full history to a CSV file and opens the share sheet (Drive, mail, Files…). */
export async function shareCsvExport(db: Db): Promise<void> {
  const csv = await exportCsv(db);
  const file = new File(Paths.cache, `tirelire-${todayStr()}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage de fichiers n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Exporter mes données Tirelire',
  });
}
