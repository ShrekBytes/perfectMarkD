// ─────────────────────────────────────────────────────────────────────────────
// Export History storage (server/05) — the only place user content rests
// server-side (PLAN.md §Security posture).
//
// Finished Premium PDFs are encrypted at rest with AES-256-GCM under a key
// derived per user (HKDF-SHA256 from the master key in the environment), so a
// leaked disk image leaks nothing readable without the process's key material.
// On disk each file is `iv(12) ‖ gcm-tag(16) ‖ ciphertext`, one directory per
// user under the history root; the database row carries the metadata the
// History modal shows and the expiry the daily purge enforces.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { AppDatabase } from '../db/database.js';
import { exportsHistory, type ExportHistory } from '../db/schema.js';

/** How long a Server Export stays re-downloadable (the ticket's 30 days). */
export const HISTORY_RETENTION_DAYS = 30;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** The row the History modal's list is built from. */
export type ExportHistoryRow = ExportHistory;

/** The referenced row does not exist, belongs to someone else, names a path
 *  outside the history root, or names a file that has vanished. */
export class HistoryNotFoundError extends Error {
  constructor(message = 'Export not found.') {
    super(message);
    this.name = 'HistoryNotFoundError';
  }
}

/** The row exists but its retention window has passed (purge pending). */
export class HistoryExpiredError extends Error {
  constructor(message = 'This export has expired.') {
    super(message);
    this.name = 'HistoryExpiredError';
  }
}

/**
 * The history master key: 32 raw bytes as hex (64 characters — the format
 * `openssl rand -hex 32` emits, matching the SESSION_SECRET guidance) or as
 * base64. Anything else is a boot-time configuration error.
 */
export function parseMasterKey(raw: string): Buffer {
  const bytes = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      'HISTORY_ENCRYPTION_KEY must be 32 bytes of hex (openssl rand -hex 32) or base64',
    );
  }
  return bytes;
}

function userKey(masterKey: Buffer, userId: number): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      'perfectmarkd:export-history:v1',
      `user:${userId}`,
      KEY_BYTES,
    ),
  );
}

function insideDir(dir: string, storedPath: string): boolean {
  const root = resolve(dir);
  const target = resolve(storedPath);
  return target === root || target.startsWith(root + sep);
}

export interface HistoryStoreOptions {
  db: AppDatabase;
  /** Root directory for the encrypted files (kept outside any web root). */
  dir: string;
  /** Master key material — raw bytes or a parseMasterKey-compatible string. */
  masterKey: Buffer | string;
}

export class HistoryStore {
  private readonly db: AppDatabase;
  /** Absolute, resolved at construction so stored paths are always absolute
   *  (the account-deletion cleanup in billing/03 unlinks absolute paths). */
  readonly dir: string;
  private readonly masterKey: Buffer;
  private readonly keyCache = new Map<number, Buffer>();

  constructor({ db, dir, masterKey }: HistoryStoreOptions) {
    this.db = db;
    this.dir = resolve(dir);
    this.masterKey = Buffer.isBuffer(masterKey)
      ? masterKey
      : parseMasterKey(masterKey);
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Encrypts the PDF into the user's directory and records the row the
   * History modal lists. The caller decides who qualifies (Premium, server/05)
   * and treats failures as non-fatal — the export itself has already
   * succeeded.
   */
  store(input: {
    userId: number;
    name: string;
    pages: number;
    pdf: Uint8Array;
    now: Date;
  }): ExportHistoryRow {
    const userDir = join(this.dir, String(input.userId));
    mkdirSync(userDir, { recursive: true });
    const storedPath = join(userDir, `${randomUUID()}.pdf`);

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key(input.userId), iv);
    const ciphertext = Buffer.concat([
      cipher.update(input.pdf),
      cipher.final(),
    ]);
    writeFileSync(
      storedPath,
      Buffer.concat([iv, cipher.getAuthTag(), ciphertext]),
    );

    return this.db
      .insert(exportsHistory)
      .values({
        userId: input.userId,
        name: input.name.trim() || 'Untitled',
        pages: input.pages,
        sizeBytes: input.pdf.byteLength,
        storedPath,
        createdAt: input.now,
        expiresAt: new Date(
          input.now.getTime() + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        ),
      })
      .returning()
      .get();
  }

  /**
   * Decrypts the user's stored export, returning the bytes plus the row (the
   * download's filename comes from `row.name`). Ownership and the retention
   * window are checked here so every caller (route, future admin tooling)
   * gets the same answer; a tampered path that escapes the history root reads
   * as missing.
   */
  read(input: { userId: number; id: number; now?: Date }): {
    bytes: Uint8Array;
    row: ExportHistoryRow;
  } {
    const row = this.rowFor(input.userId, input.id);
    if (input.now && row.expiresAt.getTime() <= input.now.getTime()) {
      throw new HistoryExpiredError();
    }
    if (!insideDir(join(this.dir, String(input.userId)), row.storedPath)) {
      throw new HistoryNotFoundError();
    }

    let file: Buffer;
    try {
      file = readFileSync(row.storedPath);
    } catch {
      // The row outlived its file (manual deletion, partial purge): gone is
      // gone, whatever the reason.
      throw new HistoryNotFoundError();
    }
    if (file.length < IV_BYTES + TAG_BYTES) {
      throw new HistoryNotFoundError();
    }

    const iv = file.subarray(0, IV_BYTES);
    const tag = file.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(input.userId),
      iv,
    );
    decipher.setAuthTag(tag);
    // A wrong key, rotated key material, or a corrupted file fails the GCM
    // tag check here and surfaces as a server fault (500), never as bytes.
    const bytes = new Uint8Array(
      Buffer.concat([
        decipher.update(file.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]),
    );
    return { bytes, row };
  }

  /**
   * The user's live rows, newest first — exactly what GET /api/history lists.
   * Expired rows are hidden immediately (the daily purge deletes them soon
   * after), so the modal never offers a download that would fail.
   */
  list(userId: number, now: Date): ExportHistoryRow[] {
    return this.db
      .select()
      .from(exportsHistory)
      .where(
        and(
          eq(exportsHistory.userId, userId),
          gt(exportsHistory.expiresAt, now),
        ),
      )
      .orderBy(desc(exportsHistory.createdAt), desc(exportsHistory.id))
      .all();
  }

  /**
   * Unlinks a stored file. Outside-the-root paths are refused (rows are
   * ours, but they live in a mutable database); an already-missing file
   * counts as removed so purge and cleanup stay idempotent.
   */
  remove(storedPath: string): void {
    if (!insideDir(this.dir, storedPath)) {
      throw new HistoryNotFoundError();
    }
    rmSync(storedPath, { force: true });
  }

  private key(userId: number): Buffer {
    let key = this.keyCache.get(userId);
    if (!key) {
      key = userKey(this.masterKey, userId);
      this.keyCache.set(userId, key);
    }
    return key;
  }

  private rowFor(userId: number, id: number): ExportHistoryRow {
    const row = this.db
      .select()
      .from(exportsHistory)
      .where(eq(exportsHistory.id, id))
      .get();
    if (!row || row.userId !== userId) throw new HistoryNotFoundError();
    return row;
  }
}

export function createHistoryStore(options: HistoryStoreOptions): HistoryStore {
  return new HistoryStore(options);
}
