// Local storage with SQLite (expo-sqlite). Everything stays on the phone.
// Saves each recording's summary and its per-second results.
// Raw EEG chunk files (brief section 12) are a later step.

import * as SQLite from 'expo-sqlite';
import type { RecordingSummary } from '../core/engine';
import type { WindowResult } from '../core/types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync('neuralsense.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          started_at INTEGER NOT NULL,
          summary_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS window_results (
          session_id TEXT NOT NULL,
          t REAL NOT NULL,
          result_json TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_results_session ON window_results(session_id, t);
      `);
      return d;
    })();
  }
  return dbPromise;
}

export async function saveSession(summary: RecordingSummary, results: WindowResult[]): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('INSERT INTO sessions (id, started_at, summary_json) VALUES (?, ?, ?)', [
      summary.id,
      summary.startedAt,
      JSON.stringify(summary),
    ]);
    for (const r of results) {
      await d.runAsync('INSERT INTO window_results (session_id, t, result_json) VALUES (?, ?, ?)', [
        summary.id,
        r.t,
        JSON.stringify(r),
      ]);
    }
  });
}

export async function listSessions(): Promise<RecordingSummary[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ summary_json: string }>('SELECT summary_json FROM sessions ORDER BY started_at DESC');
  return rows.map((r) => JSON.parse(r.summary_json));
}

export async function getSessionResults(id: string): Promise<WindowResult[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ result_json: string }>(
    'SELECT result_json FROM window_results WHERE session_id = ? ORDER BY t',
    [id],
  );
  return rows.map((r) => JSON.parse(r.result_json));
}

export async function deleteSession(id: string): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM window_results WHERE session_id = ?', [id]);
    await d.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
  });
}
