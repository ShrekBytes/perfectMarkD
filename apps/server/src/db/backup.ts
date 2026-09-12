// ─────────────────────────────────────────────────────────────────────────────
// Database backup (launch/03) — SQLite `VACUUM INTO` snapshots for the nightly
// object-storage job (ops/backup.sh).
//
// VACUUM INTO is SQLite's supported way to copy a live database: the source
// (WAL mode, with the API writing to it) is read under a consistent snapshot
// and a complete, standalone copy is written to the target path — no
// sidecar files, no checkpoint, no locks held against the writer beyond the
// read transaction the dump takes. The result opens anywhere as a plain
// database file, which is exactly what restore.sh puts back.
// ─────────────────────────────────────────────────────────────────────────────

import { rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
export interface VacuumIntoResult {
  /** Absolute path of the produced dump. */
  targetPath: string;
  /** Size of the dump in bytes (matches statSync on the target). */
  sizeBytes: number;
}

export interface VacuumIntoOptions {
  /**
   * Replace an existing target instead of failing. The nightly job writes a
   * fixed `latest.db` working file and overwrites it each run.
   */
  overwrite?: boolean;
}

/**
 * Copies the database at `sourcePath` into a standalone dump at `targetPath`
 * via `VACUUM INTO`, then verifies the dump with `PRAGMA quick_check` before
 * returning. The source is never written to, checkpointed, or migrated.
 *
 * Throws if the source file does not exist (the backup of a vanished database
 * must fail loudly, never create-and-dump an empty one) or if the target
 * already exists and `overwrite` was not requested — the two ways a backup
 * script can silently destroy good output.
 */
export function vacuumInto(
  sourcePath: string,
  targetPath: string,
  options: VacuumIntoOptions = {},
): VacuumIntoResult {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);

  if (options.overwrite) {
    rmSync(target, { force: true, recursive: true });
  }

  // fileMustExist: a missing source is a configuration or deployment error,
  // not an empty backup waiting to happen.
  const sqlite = new Database(source, { fileMustExist: true });
  try {
    sqlite.pragma('busy_timeout = 5000');
    sqlite.prepare('VACUUM INTO ?').run(target);
  } finally {
    sqlite.close();
  }

  // The dump must be a working database before this returns — a truncated or
  // corrupt upload is worse than no backup, because it looks like one.
  const verify = new Database(target, { readonly: true, fileMustExist: true });
  try {
    const check = verify.prepare('PRAGMA quick_check').get() as {
      quick_check?: string;
    };
    if (check?.quick_check !== 'ok') {
      throw new Error(
        `backup verification failed for ${target}: quick_check = ${String(check?.quick_check)}`,
      );
    }
  } finally {
    verify.close();
  }

  return { targetPath: target, sizeBytes: statSync(target).size };
}
