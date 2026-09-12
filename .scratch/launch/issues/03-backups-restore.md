# 03 — Backups + restore runbook

Status: resolved
Blocked by: server/01

Nightly jobs on the VPS (systemd timers in Compose host): SQLite `VACUUM INTO` dump → rclone to object storage (Backblaze B2 or similar, ~€1/mo) with 30-day retention; exports-history dir synced the same way. Restore runbook in `docs/ops/restore.md`: bring up fresh VPS, restore db + history keys + files, verify export works. Test the restore once for real.

**Accepts**: a restore from backup onto a clean machine produces a working service (executed, not just written).

## Comments

- **Acceptance executed for real** (rootless podman + `docker compose`, rclone 1.75 pointed at a local-directory `BACKUP_REMOTE`): seeded a stack with a real premium user + a real encrypted-history file via the app's own `HistoryStore`, ran `ops/backup.sh`, ran `docker compose down -v` + deleted `.env` (the clean machine), bootstrapped a placeholder `.env`, ran `ops/restore.sh`, `docker compose up`, then verified: `/healthz`, login as the pre-existing user, `GET /api/history`, and a history download **byte-identical** to the pre-backup download — proving db + encrypted files + `HISTORY_ENCRYPTION_KEY` all line up. A `POST /api/export` on the restored stack passed the entitlement check and queued a job that failed with the documented pre-launch/04 `render_failed` (no Chromium in the api image yet — launch/04's addition); full export-from-production verification belongs to launch/04.
- Retention semantics exercised: a vanished history file moved to `history-prev/<stamp>/` (recoverable 30 more days, not destroyed), 40-day-old db dumps and `history-prev` trees were pruned.
- **What shipped**:
  - `apps/server/src/db/backup.ts` + `backup-cli.ts` — `VACUUM INTO` snapshot with `PRAGMA quick_check` verification; the CLI is what `ops/backup.sh` execs inside the api container (`node dist/db/backup-cli.js /data/perfectmarkd.db /data/backups/latest.db --force`). 6 unit tests in `backup.test.ts` pin: standalone dump content, live-WAL source without checkpointing, missing-source failure, existing-target refusal, `--force` overwrite, restore-style reopen.
  - `ops/backup.sh` — nightly job: in-container dump → `docker compose cp` to staging → tar-stream history mirror → rclone upload (`db/` dated dumps, `history/` mirror, `history-prev/` via `--backup-dir`, `env/.env`) → 30-day prune. Requires api running (fails loudly otherwise); first-run tolerant about absent `history-prev`.
  - `ops/restore.sh` — fetches newest dump (by timestamped name — lexicographic, backend-independent; modtime ordering isn't implemented by all rclone backends), history, and `.env`; populates the `api-data` volume via a one-off api container *before* first boot (no fresh db to clobber). `--db <name>`, `--skip-env`, `--skip-history` flags; refuses to run while api is up.
  - `ops/perfectmarkd-backup.{service,timer}` — systemd units (03:00, `Persistent=true`).
  - `docs/ops/restore.md` — the runbook: prerequisites, timer install, clean-machine bootstrap order (placeholder `.env` first because compose requires the secrets at parse time and the real `.env` is *in* the backup), the §verify ladder, purged-file recovery, and the rehearsal recipe.
  - `.env.example` gains `BACKUP_REMOTE` / `BACKUP_STAGE`.
  - `ops/seed-rehearsal.mjs` — the rehearsal seeder (runs in-container; real code paths).
- The backup bucket holds `.env` (both secrets) — the runbook says treat bucket credentials as password-grade. Without `HISTORY_ENCRYPTION_KEY`, restored history stays ciphertext forever (500s on download).
- Design notes: host-side rclone + `docker compose exec/cp` rather than containerized rclone — the ticket says systemd on the Compose host, and a plain-path `BACKUP_REMOTE` is what makes the rehearsal executable without a cloud account. `VACUUM INTO` (not file-copy) because the db lives in WAL mode with a live writer; the dump is standalone and self-verifying.
- Pre-existing, unrelated: `pnpm test`'s `NODE_OPTIONS=--no-webstorage` wrapper fails on node ≤ 26 (`--no-webstorage` is a node-26 flag; CI pins 24). Ran the suite as `npx vitest run` (980 tests green). Worth its own tiny fix.
