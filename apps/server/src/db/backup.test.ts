import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { createTestDatabase, removeTestDatabase } from './testing.js';
import { createDatabase } from './database.js';
import { vacuumInto } from './backup.js';

let scratchDir: string;
let sourcePath: string;

beforeAll(() => {
  // A real migrated, WAL-mode database with data in its write-ahead log —
  // the state the nightly backup runs against.
  const test = createTestDatabase();
  scratchDir = test.dir;
  sourcePath = test.path;
  test.db.run(
    sql`insert into users (email, password_hash, is_admin, created_at) values ('backup@example.com', 'x', 1, 0)`,
  );
  test.db.$client.close();
});

afterAll(() => {
  removeTestDatabase(scratchDir);
});

describe('vacuumInto', () => {
  it('writes a standalone database file containing the source rows', () => {
    const target = join(scratchDir, 'dump-1.db');
    const result = vacuumInto(sourcePath, target);

    expect(existsSync(target)).toBe(true);
    expect(result.sizeBytes).toBe(statSync(target).size);
    expect(result.sizeBytes).toBeGreaterThan(0);

    // The dump opens standalone (no WAL sidecar needed) and carries the data.
    const dump = new Database(target, { readonly: true });
    try {
      const rows = dump.prepare('select email, is_admin from users').all() as {
        email: string;
        is_admin: number;
      }[];
      expect(rows).toEqual([{ email: 'backup@example.com', is_admin: 1 }]);
      expect(dump.prepare('pragma quick_check').get()).toEqual({
        quick_check: 'ok',
      });
    } finally {
      dump.close();
    }
  });

  it('captures committed state from a live WAL source without checkpointing it', () => {
    // A second writer connection mimics the running API: rows sit in the
    // -wal file (small databases never hit the 1000-page auto-checkpoint).
    const live = new Database(sourcePath);
    live.pragma('journal_mode = WAL');
    live.pragma('busy_timeout = 5000');
    live
      .prepare(
        "insert into users (email, password_hash, created_at) values ('wal@example.com', 'x', 0)",
      )
      .run();

    const target = join(scratchDir, 'dump-2.db');
    // Small databases never hit the 1000-page auto-checkpoint, so the
    // inserted row lives in the -wal file when the dump runs.
    const walSize = existsSync(`${sourcePath}-wal`)
      ? statSync(`${sourcePath}-wal`).size
      : -1;
    vacuumInto(sourcePath, target);
    expect(walSize).toBeGreaterThan(0); // the premise: content sits in the WAL

    const dump = new Database(target, { readonly: true });
    try {
      const emails = (
        dump.prepare('select email from users').all() as {
          email: string;
        }[]
      ).map((r) => r.email);
      expect(emails).toContain('wal@example.com');
    } finally {
      dump.close();
      live.close();
    }
  });
  it('fails loudly when the source does not exist', () => {
    const missing = join(scratchDir, 'no-such.db');
    expect(() => vacuumInto(missing, join(scratchDir, 'out.db'))).toThrow(
      /unable to open database file/i,
    );
    expect(existsSync(join(scratchDir, 'out.db'))).toBe(false);
  });

  it('refuses to overwrite an existing target', () => {
    const target = join(scratchDir, 'dump-3.db');
    vacuumInto(sourcePath, target);
    const firstMtime = statSync(target).mtimeMs;

    expect(() => vacuumInto(sourcePath, target)).toThrow();
    expect(statSync(target).mtimeMs).toBe(firstMtime);
  });

  it('overwrites an existing target when asked (the nightly latest.db path)', () => {
    const target = join(scratchDir, 'dump-4.db');
    vacuumInto(sourcePath, target);
    const firstMtime = statSync(target).mtimeMs;

    const result = vacuumInto(sourcePath, target, { overwrite: true });
    expect(statSync(target).mtimeMs).toBeGreaterThanOrEqual(firstMtime);

    const dump = new Database(target, { readonly: true });
    try {
      expect(dump.prepare('pragma quick_check').get()).toEqual({
        quick_check: 'ok',
      });
    } finally {
      dump.close();
    }
    expect(result.sizeBytes).toBe(statSync(target).size);
  });

  it('produces a target that still passes a fresh restore-style open', () => {
    // What restore.sh does: open the dump with the app's own createDatabase.
    // Migrations are a no-op on an up-to-date dump; the data must survive.
    const target = join(scratchDir, 'dump-5.db');
    vacuumInto(sourcePath, target);
    const restored = createDatabase(target);
    try {
      const emails = restored
        .all<{ email: string }>(sql`select email from users`)
        .map((r) => r.email);
      expect(emails).toContain('backup@example.com');
    } finally {
      restored.$client.close();
    }
  });
});
