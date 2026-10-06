// Raw EEG CSV files on the phone: <app documents>/raw_eeg/<session id>.csv
// They stay on the phone until the user exports (shares) them.

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { RawCsvRecorder, RawSink } from '../core/rawCsv';

const rawDir = () => new Directory(Paths.document, 'raw_eeg');
const rawFile = (sessionId: string) => new File(rawDir(), `${sessionId}.csv`);

/** Pass to engine.startRecording() to save raw EEG while recording. */
export function createRawEegSink(sessionId: string, startedAt: number): RawSink {
  const dir = rawDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const file = rawFile(sessionId);
  file.create({ overwrite: true });
  return new RawCsvRecorder(startedAt, {
    write: (text) => file.write(text, { append: true }),
    remove: () => file.exists && file.delete(),
  });
}

/** File size in bytes, or null if this session has no raw file. */
export function rawEegSize(sessionId: string): number | null {
  const file = rawFile(sessionId);
  return file.exists ? file.size : null;
}

export function deleteRawEeg(sessionId: string): void {
  const file = rawFile(sessionId);
  if (file.exists) file.delete();
}

/** Opens the phone's share sheet (AirDrop, Mail, Files, Drive…) for the CSV. */
export async function shareRawEeg(sessionId: string): Promise<void> {
  const file = rawFile(sessionId);
  if (!file.exists) throw new Error('No raw EEG file for this session.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export raw EEG (CSV)',
  });
}
