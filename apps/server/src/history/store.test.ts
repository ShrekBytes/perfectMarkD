import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { exportsHistory, users } from '../db/schema.js';
import {
  HISTORY_RETENTION_DAYS,
  HistoryExpiredError,
  HistoryNotFoundError,
  HistoryStore,
  createHistoryStore,
  parseMasterKey,
} from './store.js';

const MASTER_KEY = 'a'.repeat(64); // 32 bytes hex

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeStore(): {
  store: HistoryStore;
  db: AppDatabase;
  historyDir: string;
  userA: number;
  userB: number;
} {
  const { db, dir: dbDir } = createTestDatabase();
  const historyDir = mkdtempSync(join(tmpdir(), 'pmd-history-'));
  cleanup = () => {
    removeTestDatabase(dbDir);
    rmSync(historyDir, { recursive: true, force: true });
  };
  const ids = [1, 2].map(
    (n) =>
      db
        .insert(users)
        .values({ email: `u${n}@test.dev`, passwordHash: 'x' })
        .returning({ id: users.id })
        .get()!.id,
  );
  return {
    store: createHistoryStore({ db, dir: historyDir, masterKey: MASTER_KEY }),
    db,
    historyDir,
    userA: ids[0]!,
    userB: ids[1]!,
  };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x2d, 1, 2, 3, 4, 5, 6, 7, 8]);
const NOW = new Date('2026-09-12T00:00:00Z');

/** A row whose storedPath was tampered with (or corrupted) to point outside
 *  the history directory — the store must refuse it, not follow it. */
function insertEscapedPathRow(
  db: AppDatabase,
  userId: number,
  storedPath: string,
): number {
  return db
    .insert(exportsHistory)
    .values({
      userId,
      name: 'X',
      pages: 1,
      sizeBytes: 1,
      storedPath,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + HISTORY_RETENTION_DAYS * 86_400_000),
    })
    .returning({ id: exportsHistory.id })
    .get()!.id;
}

describe('HistoryStore', () => {
  it('round-trips a stored PDF through store → read', () => {
    const { store, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'My Document',
      pages: 3,
      pdf: PDF,
      now: NOW,
    });
    expect(row.name).toBe('My Document');
    expect(row.pages).toBe(3);
    expect(row.sizeBytes).toBe(PDF.byteLength);
    expect(row.expiresAt.getTime()).toBe(
      NOW.getTime() + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(store.read({ userId: userA, id: row.id, now: NOW }).bytes).toEqual(
      PDF,
    );
  });

  it('encrypts at rest: the file never contains the plaintext', () => {
    const { store, historyDir, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'Secret',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    expect(existsSync(row.storedPath)).toBe(true);
    const onDisk = readFileSync(row.storedPath);
    // Not the plaintext…
    expect(onDisk.subarray(28)).not.toEqual(Buffer.from(PDF));
    // …and exactly the envelope: 12-byte IV + 16-byte GCM tag + ciphertext.
    expect(onDisk.byteLength).toBe(12 + 16 + PDF.byteLength);
    // Stored under the user's own directory.
    expect(row.storedPath).toContain(join(resolve(historyDir), '1'));
  });

  it('derives a different key per user, so one user cannot read another’s', () => {
    const { store, userA, userB } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'Mine',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    // The row belongs to user 1; user 2 cannot read it…
    expect(() => store.read({ userId: userB, id: row.id, now: NOW })).toThrow(
      HistoryNotFoundError,
    );
    // …and the file itself lives in user 1's directory only.
    expect(row.storedPath).toContain('1');
  });

  it('throws HistoryNotFoundError for an unknown id', () => {
    const { store, userA } = makeStore();
    expect(() => store.read({ userId: userA, id: 999, now: NOW })).toThrow(
      HistoryNotFoundError,
    );
  });

  it('throws HistoryExpiredError once the retention window has passed', () => {
    const { store, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'Old',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    const afterRetention = new Date(
      NOW.getTime() + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(() =>
      store.read({ userId: userA, id: row.id, now: afterRetention }),
    ).toThrow(HistoryExpiredError);
    // And the expired row disappears from the list…
    expect(store.list(1, afterRetention)).toEqual([]);
    // …while it is still listed before expiry.
    expect(store.list(1, NOW)).toHaveLength(1);
  });

  it('lists the user’s rows newest-first with the modal’s fields', () => {
    const { store, userA, userB } = makeStore();
    store.store({ userId: userA, name: 'First', pages: 1, pdf: PDF, now: NOW });
    const second = store.store({
      userId: userA,
      name: 'Second',
      pages: 2,
      pdf: PDF,
      now: new Date(NOW.getTime() + 1000),
    });
    store.store({
      userId: userB,
      name: 'Theirs',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });

    const rows = store.list(1, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(second.id);
    expect(rows[0]!.name).toBe('Second');
    expect(rows[0]!.sizeBytes).toBe(PDF.byteLength);
    expect(rows.every((r) => r.userId !== userB)).toBe(true);
  });

  it('remove deletes the file; a missing file is already gone (idempotent)', () => {
    const { store, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'Gone',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    expect(existsSync(row.storedPath)).toBe(true);
    store.remove(row.storedPath);
    expect(existsSync(row.storedPath)).toBe(false);
    expect(() => store.remove(row.storedPath)).not.toThrow();
  });

  it('refuses a storedPath that escapes the history directory', () => {
    const { store, db, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'X',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    const escaped = insertEscapedPathRow(db, userA, '/etc/passwd');
    expect(() => store.read({ userId: userA, id: escaped, now: NOW })).toThrow(
      HistoryNotFoundError,
    );
    expect(() => store.remove('/etc/passwd')).toThrow(HistoryNotFoundError);
    expect(existsSync(row.storedPath)).toBe(true);
  });

  it('streams the stored export without buffering the plaintext whole', async () => {
    const { store, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'Streamed',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    const { stream, row: meta } = store.stream({
      userId: userA,
      id: row.id,
      now: NOW,
    });
    expect(meta.id).toBe(row.id);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(PDF));
  });

  it('stream throws before any bytes flow for expired or foreign rows', async () => {
    const { store, userA, userB } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'X',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    const afterRetention = new Date(
      NOW.getTime() + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(() =>
      store.stream({ userId: userA, id: row.id, now: afterRetention }),
    ).toThrow(HistoryExpiredError);
    expect(() => store.stream({ userId: userB, id: row.id, now: NOW })).toThrow(
      HistoryNotFoundError,
    );
  });

  it('fails integrity when decrypted with a different master key', () => {
    const { store, db, historyDir, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: 'X',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    // Same directory, rotated key: the path check passes, so the read truly
    // reaches the GCM integrity check.
    const rotated = createHistoryStore({
      db,
      dir: historyDir,
      masterKey: 'b'.repeat(64),
    });
    expect(() =>
      rotated.read({ userId: userA, id: row.id, now: NOW }),
    ).toThrow();
  });

  it('falls back to "Untitled" for a blank name', () => {
    const { store, userA } = makeStore();
    const row = store.store({
      userId: userA,
      name: '   ',
      pages: 1,
      pdf: PDF,
      now: NOW,
    });
    expect(row.name).toBe('Untitled');
  });
});

describe('parseMasterKey', () => {
  it('accepts 32-byte hex and base64, rejects everything else', () => {
    expect(parseMasterKey(MASTER_KEY)).toHaveLength(32);
    expect(parseMasterKey(Buffer.alloc(32, 7).toString('base64'))).toHaveLength(
      32,
    );
    expect(() => parseMasterKey('short')).toThrow();
    expect(() => parseMasterKey('z'.repeat(64))).toThrow(); // not hex
    expect(() => parseMasterKey('a'.repeat(63))).toThrow(); // wrong length
  });
});
