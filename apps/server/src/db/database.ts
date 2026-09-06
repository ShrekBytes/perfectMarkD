import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { seedSettings } from './settings.js';

/** What drizzle() actually returns: the ORM plus the raw client handle. */
export type AppDatabase = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

// Resolved relative to this module so it works from src (tsx/vitest) and
// dist (built server) alike: both end up two levels below apps/server.
const migrationsFolder = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

/**
 * Opens the SQLite database, applies pending migrations, and seeds default
 * settings. WAL journaling keeps concurrent API reads and the in-process
 * export worker from blocking each other.
 */
export function createDatabase(dbPath: string): AppDatabase {
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  seedSettings(db);
  return db;
}
