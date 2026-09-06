import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDatabase } from './database.js';
import { getSetting, setSetting } from './settings.js';
import { PAYMENT_METHODS, sessions } from './schema.js';
import { createTestDatabase, removeTestDatabase } from './testing.js';

const SPEC_TABLES = [
  'users',
  'sessions',
  'orders',
  'entitlements',
  'export_usage',
  'exports_history',
  'settings_kv',
];

let scratchDir: string;

beforeAll(() => {
  scratchDir = createTestDatabase().dir;
});

afterAll(() => {
  removeTestDatabase(scratchDir);
});

describe('createDatabase', () => {
  it('applies migrations, creating every spec table', () => {
    const { db } = createTestDatabase();
    const tables = db
      .all<{ name: string }>(
        sql`select name from sqlite_master where type = 'table'`,
      )
      .map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(SPEC_TABLES));
  });

  it('enables WAL journaling and foreign key enforcement', () => {
    const { db } = createTestDatabase();
    expect(db.get<{ journal_mode: string }>(sql`pragma journal_mode`)).toEqual({
      journal_mode: 'wal',
    });
    expect(db.get<{ foreign_keys: number }>(sql`pragma foreign_keys`)).toEqual({
      foreign_keys: 1,
    });
  });

  it('actually enforces foreign keys', () => {
    const { db } = createTestDatabase();
    expect(() =>
      db
        .insert(sessions)
        .values({ token: 't', userId: 999, expiresAt: new Date() })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('is idempotent across restarts and preserves edited settings', () => {
    const { db, path } = createTestDatabase();
    const edited = Object.fromEntries(
      PAYMENT_METHODS.map((method) => [method, `addr-${method}`]),
    );
    setSetting(db, 'wallets', edited);
    db.$client.close();

    const reopened = createDatabase(path);
    expect(getSetting(reopened, 'wallets')).toEqual(edited);
  });

  it('creates missing parent directories', () => {
    const { dir } = createTestDatabase();
    const deepPath = `${dir}/nested/parents/db.sqlite`;
    expect(() => createDatabase(deepPath)).not.toThrow();
  });
});
