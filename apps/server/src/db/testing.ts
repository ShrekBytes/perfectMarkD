import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type AppDatabase } from './database.js';

/** Fresh database in a per-test temp directory; cleaned up by the caller. */
export function createTestDatabase(): {
  db: AppDatabase;
  path: string;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'pmd-server-'));
  const path = join(dir, 'test.db');
  return { db: createDatabase(path), path, dir };
}

export function removeTestDatabase(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
