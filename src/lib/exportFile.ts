import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportCsv } from '../db/repo.ts';
import type { Db } from '../db/types.ts';
import { todayStr } from './dates.ts';

/** Writes the full history to a CSV file and opens the share sheet (Drive, mail, Files…). */
export async function shareCsvExport(db: Db): Promise<void> {
  const csv = await exportCsv(db);
  const name = `marge-${todayStr()}.csv`;
  if (Platform.OS === 'web') return shareOrDownloadOnWeb(csv, name);
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage de fichiers n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Exporter mes données',
  });
}

/** Share sheet when the browser can share files (iOS / Android), plain download otherwise. */
async function shareOrDownloadOnWeb(csv: string, name: string): Promise<void> {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const file = new globalThis.File([blob], name, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
