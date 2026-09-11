// ─────────────────────────────────────────────────────────────────────────────
// Export History purge (server/05).
//
// Retention (30 days) is enforced by a daily sweep: expired rows are deleted
// together with their encrypted files, so the history directory never grows
// past a month of Premium users' Server Exports and a downgraded user's rows
// age out naturally. The schedule lives in the composition root (main.ts),
// which owns timers the way it owns the process.
// ─────────────────────────────────────────────────────────────────────────────

import { lte } from 'drizzle-orm';
import type { AppDatabase } from '../db/database.js';
import { exportsHistory } from '../db/schema.js';
import type { Clock } from '../auth/sessions.js';
import type { LogSink } from '../request-logger.js';
import type { HistoryStore } from './store.js';

export interface PurgeResult {
  /** Rows (and, except where noted, their files) removed. */
  purged: number;
  /** Files that could not be unlinked — their rows are gone regardless. */
  failedFiles: number;
}

/**
 * Deletes every expired row together with its encrypted file: one DELETE…
 * RETURNING statement is the source of both the paths to unlink and the rows
 * to remove, so a row can never be deleted past a file that wasn't seen.
 * A file that is already gone counts as purged; one that refuses to be
 * unlinked (or names a path outside the history root) is counted in
 * failedFiles while its row still goes — retention means the row must not
 * outlive its window.
 */
export function purgeExpiredHistory(
  db: AppDatabase,
  store: HistoryStore,
  now: Date,
): PurgeResult {
  const deleted = db
    .delete(exportsHistory)
    .where(lte(exportsHistory.expiresAt, now))
    .returning({ storedPath: exportsHistory.storedPath })
    .all();

  let failedFiles = 0;
  for (const row of deleted) {
    try {
      store.remove(row.storedPath);
    } catch {
      failedFiles += 1;
    }
  }
  return { purged: deleted.length, failedFiles };
}

export interface HistoryPurgeOptions {
  db: AppDatabase;
  store: HistoryStore;
  /** Sweep cadence; the ticket's number is daily. */
  intervalMs?: number;
  /** Injectable clock (tests control expiry). */
  now?: Clock;
  /** Purge outcomes at info level; silent by default in tests. */
  log?: LogSink;
}

/**
 * Starts the daily purge: one sweep immediately (rows expired while the
 * process was down), then one per interval. Returns the stop function —
 * call it on shutdown to release the timer.
 */
export function startHistoryPurge({
  db,
  store,
  intervalMs = 24 * 60 * 60 * 1000,
  now = () => new Date(),
  log = () => {},
}: HistoryPurgeOptions): () => void {
  const sweep = (): void => {
    const { purged, failedFiles } = purgeExpiredHistory(db, store, now());
    if (purged > 0 || failedFiles > 0) {
      log(
        `history purge: removed ${purged} expired export(s)${failedFiles > 0 ? `, ${failedFiles} file(s) failed to unlink` : ''}`,
      );
    }
  };
  sweep();
  const timer = setInterval(sweep, intervalMs);
  return () => clearInterval(timer);
}
