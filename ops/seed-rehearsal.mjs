// Seeding for the restore rehearsal (launch/03) — run INSIDE the api
// container. Creates, through the app's real code paths:
//   - a premium user with a known password (login works after restore)
//   - one Export History row + encrypted file (decryption proves db, files,
//     and HISTORY_ENCRYPTION_KEY all line up after a restore)
//   - a queued-then-failed export job (the pre-Chromium production state)
//
//   docker compose cp ops/seed-rehearsal.mjs api:/seed.mjs
//   docker compose exec -T api node /seed.mjs
//
// Prints the seed facts as JSON for the verification steps to assert on.

import { createDatabase } from '/app/dist/db/database.js';
import { createHistoryStore } from '/app/dist/history/store.js';
import { users, entitlements } from '/app/dist/db/schema.js';
import { hashPassword } from '/app/dist/auth/passwords.js';

const DB_PATH = process.env.DB_PATH ?? '/data/perfectmarkd.db';
const HISTORY_DIR = process.env.HISTORY_DIR ?? '/data/history';
const KEY = process.env.HISTORY_ENCRYPTION_KEY;
const EMAIL = 'restore-rehearsal@example.com';
const PASSWORD = 'rehearsal-pass-1';

if (!KEY) {
  console.error('HISTORY_ENCRYPTION_KEY must be in the environment');
  process.exit(1);
}

const db = createDatabase(DB_PATH);
const history = createHistoryStore({ db, dir: HISTORY_DIR, masterKey: KEY });

// Clean slate for idempotent reruns (the rehearsal only runs on a fresh db,
// but a half-run retry must not leave duplicates).
db.run(`delete from users where email = '${EMAIL}'`);

const user = await (async () => {
  const hash = await hashPassword(PASSWORD);
  return db
    .insert(users)
    .values({ email: EMAIL, passwordHash: hash, isAdmin: 0 })
    .returning()
    .get();
})();

db.insert(entitlements)
  .values({
    userId: user.id,
    plan: 'premium',
    expiresAt: new Date('2030-01-01'),
  })
  .onConflictDoUpdate({
    target: entitlements.userId,
    set: { plan: 'premium', expiresAt: new Date('2030-01-01') },
  })
  .run();

// The plaintext we expect to decrypt after the restore: a PDF-ish header so
// the verification can eyeball `%PDF-` without a real renderer.
const plaintext = Buffer.from(
  `%PDF-1.4 rehearsal\n${'rehearsal bytes '.repeat(64)}\n%%EOF\n`,
  'utf8',
);
const row = history.store({
  userId: user.id,
  name: 'rehearsal.pdf',
  pages: 3,
  pdf: plaintext,
  now: new Date(),
});

// A marker row outside history too: settings_kv is seeded by createDatabase;
// leave a custom trace of the pre-backup state in audit_logs via direct SQL.
db.run(
  `insert into audit_logs (admin_user_id, admin_email, action, target_type, target_id, created_at) values (${user.id}, '${EMAIL}', 'order.verify', 'user', ${user.id}, 0)`,
);

console.log(
  JSON.stringify({
    userId: user.id,
    email: EMAIL,
    password: PASSWORD,
    historyId: row.id,
    historyName: row.name,
    plaintextPrefix: plaintext.subarray(0, 8).toString('hex'),
    plaintextSize: plaintext.byteLength,
  }),
);
