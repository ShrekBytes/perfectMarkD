// ─────────────────────────────────────────────────────────────────────────────
// Backup CLI (launch/03) — the in-container entry point ops/backup.sh drives:
//
//   docker compose exec -T api node dist/db/backup-cli.js \
//     /data/perfectmarkd.db /data/backups/latest.db --force
//
// Thin by design: argument parsing, the output-directory mkdir, and exit
// codes. The database logic lives in backup.ts (unit-tested there); this
// exists so the nightly job can reach it inside the api container, where the
// database file and better-sqlite3 already live.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { vacuumInto } from './backup.js';

function usage(): never {
  console.error(
    'usage: backup-cli.js <source.db> <target.db> [--force]\n' +
      '  --force  overwrite an existing target (the nightly latest.db path)',
  );
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const positional = args.filter((arg) => arg !== '--force');
  if (positional.length !== 2) usage();

  const [sourcePath, targetPath] = positional as [string, string];
  mkdirSync(dirname(resolve(targetPath)), { recursive: true });

  const result = vacuumInto(sourcePath, targetPath, { overwrite: force });
  console.log(
    `backup ok: ${result.targetPath} (${result.sizeBytes} bytes, quick_check ok)`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `backup failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
