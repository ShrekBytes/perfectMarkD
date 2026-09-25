# Restore runbook (launch/03)

How to bring a PerfectMarkD deployment back from backups onto a clean
machine, and how the nightly backup that feeds it is set up. Written for the
Admin's own-machine deployment (Compose stack, published through a Cloudflare
Tunnel — ADR-0010); the same procedure is the migration path onto a VPS when
that move happens, since it is a clean-machine restore either way. Every
command has been executed against the Compose stack as part of launch/03.

> **Secrets reminder**: the backup bucket contains `.env` — which contains
> `SESSION_SECRET` and `HISTORY_ENCRYPTION_KEY`. Treat the bucket's
> credentials as password-grade. Without `HISTORY_ENCRYPTION_KEY` a restored
> database's Export History files remain ciphertext forever (each download
> fails the GCM tag check and returns a 500).

> **Backups are opt-in, and off until switched on** (launch/12).
> `ops/backup.sh` exits 0 having done nothing unless `BACKUP_ENABLED=1` is in
> `.env`, so the timer can be installed before you decide. With backups
> disabled there is **no recovery path** — no dump, no history mirror, nothing
> to restore from, and this runbook has nothing to work with. That is a
> deliberate trade rather than an oversight; make it knowingly.

## What a backup contains

`ops/backup.sh` (nightly, via systemd timer) writes this layout to
`$BACKUP_REMOTE` (an rclone remote:path, e.g. `b2:perfectmarkd-backups`) — or,
with `BACKUP_REMOTE` left unset, to `$BACKUP_STAGE` on this host and nowhere
else. That is a **local-only backup**: the same dump and the same history
mirror, no upload, and no `env/.env` copy, because the point of that copy is
surviving the loss of this machine. Nothing in the table below survives a dead
host in local-only mode, and a history file deleted from the app is gone from
staging after the next run (the mirror is rebuilt from scratch each night).

| Path | What | Retention |
|---|---|---|
| `db/perfectmarkd-YYYYmmdd-HHMMSS.db` | one `VACUUM INTO` snapshot per night — a standalone SQLite file (no WAL sidecars) | pruned at 30 days |
| `history/` | exact mirror of the api container's `/data/history` (encrypted PDFs) | mirrors deletions after 30 days of grace (see below) |
| `history-prev/YYYYmmdd-HHMMSS/` | history files deleted since the previous run (the 30-day retention purge puts expired exports here) | pruned at 30 days |
| `env/.env` | the deployment's keys | overwritten each night |

The same 30-day retention applies to the host staging dir
(`$BACKUP_STAGE`, default `/var/backups/perfectmarkd`) — old dumps are
deleted there too, so it stays bounded at roughly one month of dumps plus
the current history mirror.

The dump is produced inside the running api container (`node
dist/db/backup-cli.js`), which reads the live WAL database under a consistent
snapshot and verifies the result with `PRAGMA quick_check` before it is
uploaded. Backups run online; the API never pauses.

Retention mechanics: `rclone sync --backup-dir` never *destroys* remote
history files when they vanish locally — it moves them into that night's
`history-prev/` directory. Both the dated db dumps and the `history-prev`
trees are pruned at 30 days with `rclone delete --min-age 30d`.

## Prerequisites (once per host)

1. The stack from the README: `git clone` this repo, `cp .env.example .env`,
   fill in `SESSION_SECRET` + `HISTORY_ENCRYPTION_KEY`, and bring the stack up
   — pull the published images on a deployment host, or build from a dev
   checkout (README's Deployment block).
2. In `.env`: `BACKUP_ENABLED=1`. Without it the nightly job is a no-op — and
   with no backups there is **no recovery path**: no dump, no history mirror,
   nothing for this runbook to work with. Everything below assumes it is on.
3. `rclone` on the host (`apt install rclone` or the single binary) — needed
   only if you are uploading.
4. An object-storage bucket (Backblaze B2 or any rclone-supported backend —
   "~€1/mo" at this project's scale) and an rclone remote configured on the
   host: `rclone config create b2backup b2 account=... key=...`.
5. In `.env`: `BACKUP_REMOTE=b2backup:perfectmarkd-backups` (and optionally
   `BACKUP_STAGE=/var/backups/perfectmarkd`). Leaving `BACKUP_REMOTE` unset is
   supported and gives a local-only backup; steps 3 and 4 are then unnecessary,
   and so is every restore below that reads from `$BACKUP_REMOTE`.

## Installing the nightly timer

A **user** unit, not a system one: the deployment host runs rootless podman, so
the stack belongs to your user, and a root unit cannot see those containers — it
could not dump the very stack it exists to back up (launch/12). Linger has to be
on so the timer fires with nobody logged in.

```sh
loginctl enable-linger "$USER"

mkdir -p ~/.config/systemd/user
cp ops/perfectmarkd-backup.{service,timer} ~/.config/systemd/user/
# Edit WorkingDirectory= and ExecStart= in the service if the checkout is not
# ~/self-hosted/perfectmarkd, then:
systemctl --user daemon-reload
systemctl --user enable --now perfectmarkd-backup.timer
systemctl --user list-timers perfectmarkd-backup.timer   # next run at 03:00
```

The unit sets `DOCKER_HOST` to podman's API socket, which is what makes
`ops/backup.sh`'s `docker compose` calls reach the containers `podman compose`
created — the CLI is the docker one, the engine is podman. On a host running
rootful Docker instead, install the same file as a system unit and drop that
line.

Run it once by hand and watch it succeed before you trust it:

```sh
systemctl --user start perfectmarkd-backup.service
journalctl --user -u perfectmarkd-backup.service -n 50
# or, without systemd: ops/backup.sh
```

Before `BACKUP_ENABLED=1` is set, that run reports `backup: disabled` and exits
0. That is what a correct install looks like at this stage: the timer is live
and doing nothing, and the switch that changes that lives in `.env`.

## From nothing: a clean-machine restore

The order matters: compose refuses to even parse without
`SESSION_SECRET`/`HISTORY_ENCRYPTION_KEY` (and, since launch/01, the two
`UMAMI_*` secrets), but the real `.env` is *inside the backup* — so
bootstrap with placeholder secrets, pull the real `.env` from the backup,
then restore data.

1. **Fresh host, repo checked out** (`git clone` at e.g. `/opt/perfectmarkd`),
   `rclone` installed, the same rclone remote configured (`rclone config
   create b2backup b2 account=... key=...` — the credentials live in your
   password manager, not in the backup).
2. **Bootstrap `.env`** with placeholders (values are about to be replaced):

   ```sh
   cp .env.example .env
   printf 'SESSION_SECRET=%s\nHISTORY_ENCRYPTION_KEY=%s\nUMAMI_APP_SECRET=%s\nUMAMI_DB_PASSWORD=%s\n' \
     "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" \
     "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" >> .env
   printf 'BACKUP_REMOTE=b2backup:perfectmarkd-backups\n' >> .env
   ```

3. **Restore everything** (db + history + the real `.env`):

   ```sh
   ops/restore.sh
   ```

   It fetches the newest db dump by default; pass `--db
   perfectmarkd-YYYYmmdd-HHMMSS.db` to pick a specific night, `--skip-env`
   to keep the current `.env`, `--skip-history` for a db-only restore. The
   script populates the `api-data` volume through a one-off api container —
   the stack has not booted yet, so there is no fresh database to clobber,
   and the restored dump gets any pending migrations applied by the first
   real boot.

4. **Boot the stack**: `podman compose pull && podman compose up -d --no-build`
   on a deployment host, or `docker compose up -d --build` from a dev checkout
   (README's Deployment block).

## §verify: proving the restore worked

The point of a restore is not "containers are green" — it is that the data
came back *decryptable*. Check in this order (all through the published Caddy
origin, i.e. the same path users take):

```sh
BASE=http://localhost            # or https://your-domain in production
curl -fsS "$BASE/healthz" && echo " — app up"

# 1. Log in as a pre-existing user (proves users + password hashes + sessions):
curl -fsS -c /tmp/pmd.jar "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' >/dev/null

# 2. List Export History (proves history rows survived):
curl -fsS -b /tmp/pmd.jar "$BASE/api/history"

# 3. Download one export and check its bytes (proves db row + encrypted file
#    + HISTORY_ENCRYPTION_KEY all line up — GCM fails loudly if they don't):
curl -fsS -b /tmp/pmd.jar -o /tmp/restored.pdf "$BASE/api/history/<id>"
head -c 5 /tmp/restored.pdf   # %PDF-
```

If step 3 returns 500 on a file that exists, the restored
`HISTORY_ENCRYPTION_KEY` does not match the one that encrypted the files —
find the `.env` that did (the backup's, or your password manager).

**Verifying Server Export end-to-end** additionally exercises Chromium, which
is already baked into the api image (`playwright install --with-deps
--only-shell chromium`, browsers at `/ms-playwright` — commit 59fd5b3): enqueue
a Server Export from the app (or `POST /api/export`), poll
`GET /api/export/jobs/<id>` until `done`, download the PDF.

## Recovering a purged history file

Files the 30-day retention removed live on for 30 more days under
`history-prev/`:

```sh
rclone lsf b2backup:perfectmarkd-backups/history-prev/
rclone lsf b2backup:perfectmarkd-backups/history-prev/20260901-030000/
# put it back for one user (re-encrypting is impossible; the original key
# decrypted it — dropping it into the user's history dir restores it):
rclone copyto b2backup:perfectmarkd-backups/history-prev/20260901-030000/<uuid>.pdf \
  /tmp/<uuid>.pdf   # then docker compose cp api:/data/history/<userId>/ …
```

The database row for a purged file no longer exists (it was purged too), so a
file restored this way is not listed in the UI — it is an emergency dig-out,
not a rollback.

## Testing the restore (rehearsal on a workstation)

The full cycle — backup a seeded stack, wipe it, restore onto "clean
machinery", verify — can be rehearsed without any cloud account by pointing
`BACKUP_REMOTE` at a local directory (rclone treats absolute paths as the
local backend):

```sh
export BACKUP_REMOTE=/tmp/pmd-backup-rehearsal   # in .env, not just exported!
cp .env.example .env && printf 'SESSION_SECRET=%s\nHISTORY_ENCRYPTION_KEY=%s\nUMAMI_APP_SECRET=%s\nUMAMI_DB_PASSWORD=%s\nBACKUP_ENABLED=1\nBACKUP_REMOTE=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$BACKUP_REMOTE" >> .env

docker compose up -d --build
# Seed a premium user + an encrypted-history entry through the app's own
# code paths — login and post-restore decryption are what §verify asserts:
docker compose cp ops/seed-rehearsal.mjs api:/seed.mjs
docker compose exec -T api node /seed.mjs
ops/backup.sh                         # needs BACKUP_ENABLED=1 in .env (above)
docker compose down -v                # the "clean machine"
rm .env && cp .env.example .env       # …placeholder secrets, real ones restored
printf 'SESSION_SECRET=%s\nHISTORY_ENCRYPTION_KEY=%s\nUMAMI_APP_SECRET=%s\nUMAMI_DB_PASSWORD=%s\nBACKUP_ENABLED=1\nBACKUP_REMOTE=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$BACKUP_REMOTE" >> .env
ops/restore.sh && docker compose up -d
# …then §verify with the seed facts the seeder printed (email, password, id)
```

This exact rehearsal is what launch/03 executed for its acceptance; keep it
green when you touch the backup scripts.

## Notes

- Self-hosters: this runbook is the Admin's own deployment story. A
  Self-Hosted Instance backs up its own data its own way (`db/` + `history/`
  + keys are the complete state; `docker compose down -v` loses everything
  not on your own disks).
- Analytics is deliberately not backed up (launch/01): `umami-db-data` holds
  anonymous visit counts and nothing else, so a restore starts the statistics
  empty. Losing them costs numbers, never user data.
- Backups require the api container to be running (the dump runs inside it);
  a stopped stack fails the job loudly rather than uploading a stale or
  empty backup. Monitor the timer (`journalctl --user -u
  perfectmarkd-backup.service` — it is a user unit, see above), and treat a
  failed night as an alert, not a warning.
- `BACKUP_REMOTE` accepting a local path is what makes the rehearsal above
  possible — on the real deployment it is a real remote, never a local path.
- A **local-only** backup (BACKUP_ENABLED=1, no BACKUP_REMOTE) is the mode the
  Admin's own deployment runs: it produces the same dump and history mirror in
  `$BACKUP_STAGE` and uploads nothing. Recovering from one is a manual job —
  the files are on the host, and `restore.sh` wants a `BACKUP_REMOTE` to read
  from. Set `BACKUP_REMOTE` to a path if you want the scripted restore against
  a local target.
