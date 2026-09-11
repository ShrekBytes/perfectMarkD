import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { exportsHistory, users } from '../db/schema.js';
import {
  HISTORY_RETENTION_DAYS,
  createHistoryStore,
  type HistoryStore,
} from './store.js';
import { purgeExpiredHistory, startHistoryPurge } from './purge.js';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

function makePurgeFixture(): {
  db: AppDatabase;
  store: HistoryStore;
  userId: number;
} {
  const { db, dir } = createTestDatabase();
  const historyDir = mkdtempSync(join(tmpdir(), 'pmd-purge-'));
  cleanup = () => {
    removeTestDatabase(dir);
    rmSync(historyDir, { recursive: true, force: true });
  };
  const userId = db
    .insert(users)
    .values({ email: 'purge@test.dev', passwordHash: 'x' })
    .returning({ id: users.id })
    .get()!.id;
  return {
    db,
    store: createHistoryStore({
      db,
      dir: historyDir,
      masterKey: 'a'.repeat(64),
    }),
    userId,
  };
}

const NOW = new Date('2026-09-12T00:00:00Z');
const RETENTION_MS = HISTORY_RETENTION_DAYS * 86_400_000;

function historyRowCount(db: AppDatabase): number {
  return db.all<{ count: number }>(
    sql`select count(*) as count from exports_history`,
  )[0]!.count;
}

describe('purgeExpiredHistory', () => {
  it('deletes expired rows and their files, keeps live ones', () => {
    const { db, store, userId } = makePurgeFixture();
    const ancient = store.store({
      userId,
      name: 'Ancient',
      pages: 1,
      pdf: new Uint8Array([1]),
      now: new Date(NOW.getTime() - RETENTION_MS - 1000),
    });
    const fresh = store.store({
      userId,
      name: 'Fresh',
      pages: 1,
      pdf: new Uint8Array([2]),
      now: NOW,
    });
    expect(existsSync(ancient.storedPath)).toBe(true);

    const result = purgeExpiredHistory(db, store, NOW);

    expect(result).toEqual({ purged: 1, failedFiles: 0 });
    expect(existsSync(ancient.storedPath)).toBe(false);
    expect(existsSync(fresh.storedPath)).toBe(true);
    expect(historyRowCount(db)).toBe(1);
  });

  it('removes the row when the file is already gone', () => {
    const { db, store, userId } = makePurgeFixture();
    const row = store.store({
      userId,
      name: 'Vanished',
      pages: 1,
      pdf: new Uint8Array([3]),
      now: new Date(NOW.getTime() - RETENTION_MS - 1000),
    });
    rmSync(row.storedPath);

    const result = purgeExpiredHistory(db, store, NOW);

    expect(result).toEqual({ purged: 1, failedFiles: 0 });
    expect(historyRowCount(db)).toBe(0);
  });

  it('counts (and never follows) a stored path outside the history root', () => {
    const { db, store, userId } = makePurgeFixture();
    db.insert(exportsHistory)
      .values({
        userId,
        name: 'Escaped',
        pages: 1,
        sizeBytes: 1,
        storedPath: '/etc/passwd',
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() - 1000),
      })
      .run();

    const result = purgeExpiredHistory(db, store, NOW);

    expect(result).toEqual({ purged: 1, failedFiles: 1 });
    expect(historyRowCount(db)).toBe(0);
  });

  it('is a no-op with nothing expired', () => {
    const { db, store, userId } = makePurgeFixture();
    store.store({
      userId,
      name: 'Fresh',
      pages: 1,
      pdf: new Uint8Array([4]),
      now: NOW,
    });

    expect(purgeExpiredHistory(db, store, NOW)).toEqual({
      purged: 0,
      failedFiles: 0,
    });
  });
});

describe('startHistoryPurge', () => {
  it('purges immediately when started, then on every interval until stopped', () => {
    vi.useFakeTimers();
    const { db, store, userId } = makePurgeFixture();
    const expired = store.store({
      userId,
      name: 'Old',
      pages: 1,
      pdf: new Uint8Array([5]),
      now: new Date(NOW.getTime() - RETENTION_MS - 1000),
    });

    const logLines: string[] = [];
    const stop = startHistoryPurge({
      db,
      store,
      intervalMs: 1000,
      now: () => NOW,
      log: (line) => logLines.push(line),
    });

    // The boot sweep ran: file and row are gone, and the operator was told.
    expect(existsSync(expired.storedPath)).toBe(false);
    expect(logLines.join('\n')).toMatch(/removed 1 expired export/);

    // A row that expires only later is swept by the next tick, not before.
    const later = store.store({
      userId,
      name: 'Later',
      pages: 1,
      pdf: new Uint8Array([6]),
      now: NOW,
    });
    vi.advanceTimersByTime(1000);
    expect(existsSync(later.storedPath)).toBe(true);
    db.update(exportsHistory)
      .set({ expiresAt: new Date(NOW.getTime() - 1000) })
      .where(eq(exportsHistory.id, later.id))
      .run();
    vi.advanceTimersByTime(1000);
    expect(existsSync(later.storedPath)).toBe(false);

    stop();
    const last = store.store({
      userId,
      name: 'After stop',
      pages: 1,
      pdf: new Uint8Array([7]),
      now: new Date(NOW.getTime() - RETENTION_MS - 1000),
    });
    vi.advanceTimersByTime(10_000);
    expect(existsSync(last.storedPath)).toBe(true);
    // The caller can still clean up on shutdown.
    stop();
    expect(existsSync(last.storedPath)).toBe(true);
  });
});
