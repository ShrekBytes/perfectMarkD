#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PerfectMarkD nightly backup (launch/03) — run by ops/perfectmarkd-backup.timer
# on the Compose host, or by hand.
#
# What it does, in order:
#   1. VACUUM INTO dump of the live SQLite database, inside the api container
#      (consistent snapshot of a WAL database; no sidecar files, no locks
#      against the running API) → /data/backups/latest.db on the api-data
#      volume, verified with PRAGMA quick_check.
#   2. Copy the dump out to a host staging dir under a timestamped name.
#   3. Mirror the encrypted Export History directory out to staging (tar
#      stream; staging is rebuilt from scratch each run so it mirrors the
#      source exactly).
#   4. If a remote is configured, rclone everything to object storage:
#        db/<timestamp>.db            — a fresh dump every night
#        history/                     — an exact mirror of /data/history
#        history-prev/<date>/         — history files deleted since the last
#                                       run (the 30-day purge lands here),
#                                       moved there by rclone --backup-dir
#        env/.env                     — the keys; without HISTORY_ENCRYPTION_KEY
#                                       a restored database cannot decrypt
#                                       history files
#   5. Prune: db dumps and history-prev trees older than 30 days are deleted.
#
# Configuration (.env in the repo checkout — compose already requires it):
#   BACKUP_ENABLED  "1" turns backups on. Anything else, unset included, makes
#                   this script exit 0 having done nothing — so an installed
#                   timer is harmless and the feature is opt-in (launch/12).
#   BACKUP_REMOTE   rclone remote:path root, e.g. "b2:perfectmarkd-backups".
#                   A plain absolute path also works (rclone treats local
#                   paths as a "local" remote) — that is what the restore
#                   rehearsal in docs/ops/restore.md uses. Optional: unset
#                   means a local-only backup, which keeps steps 1-3 and the
#                   staging prune and skips every upload. The env/.env copy is
#                   deliberately part of the upload and not of the staging: it
#                   exists so the keys outlive this host, which is not a thing
#                   a local-only backup can promise.
#   BACKUP_STAGE    host staging dir (default /var/backups/perfectmarkd).
#
# Requires on the host: docker compose — with DOCKER_HOST set when the runtime
# is rootless podman (ops/perfectmarkd-backup.service does that) — and rclone
# only when BACKUP_REMOTE is set. The api service must be running: backups are
# online, but a stopped service is a deployment error that should fail loudly,
# not be silently skipped.
#
# A local-only backup is not a substitute for a remote one. The history mirror
# is rebuilt from scratch each night, so a history file deleted from the app is
# gone from staging after the next run, and nothing at all survives losing the
# host. docs/ops/restore.md says the same in plainer words.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

die() { echo "backup: $*" >&2; exit 1; }

# .env provides the three BACKUP_* settings (and the compose secrets). An
# already-exported value wins, the way compose treats its own `environment:`
# over a .env file, so a one-off run can point at a different remote or staging
# dir without editing .env.
if [[ -f .env ]]; then
  while IFS= read -r setting; do
    name="${setting%%=*}"
    # shellcheck disable=SC2163
    [[ -v "$name" ]] || export "$setting"
  done < <(grep -E '^(BACKUP_ENABLED|BACKUP_REMOTE|BACKUP_STAGE)=' .env)
fi

# Opt-in, and off unless asked for. Exiting 0 rather than failing means the
# timer can be installed before the operator decides, which is the point: the
# switch is in .env, not in systemd.
if [[ "${BACKUP_ENABLED:-0}" != "1" ]]; then
  echo "backup: disabled (BACKUP_ENABLED=${BACKUP_ENABLED:-0}); nothing to do"
  exit 0
fi

BACKUP_STAGE="${BACKUP_STAGE:-/var/backups/perfectmarkd}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP_NAME="perfectmarkd-${STAMP}.db"

command -v docker >/dev/null || die "docker not found on PATH"
if [[ -n "$BACKUP_REMOTE" ]]; then
  command -v rclone >/dev/null \
    || die "rclone not found on PATH (see docs/ops/restore.md §prerequisites), or unset BACKUP_REMOTE for a local-only backup"
fi

# The api container must be up: the dump runs inside it. (Format the name
# and require a non-empty line — a plain `ps` prints its header even with
# no matches, which would fool a grep for "api".)
running="$(docker compose ps --status running api --format '{{.Name}}')"
[[ -n "$running" ]] \
  || die "api container is not running — start the stack before backing up (docker compose up -d)"

mkdir -p "$BACKUP_STAGE/db" "$BACKUP_STAGE/history"

echo "backup: dumping database → /data/backups/latest.db (in api container)"
docker compose exec -T api node dist/db/backup-cli.js \
  /data/perfectmarkd.db /data/backups/latest.db --force

echo "backup: staging db dump as $DUMP_NAME"
docker compose cp "api:/data/backups/latest.db" "$BACKUP_STAGE/db/$DUMP_NAME"

echo "backup: staging history (tar stream from /data/history)"
rm -rf "$BACKUP_STAGE/history"
mkdir -p "$BACKUP_STAGE/history"
docker compose exec -T api tar -C /data -cf - history | tar -C "$BACKUP_STAGE" -xf -

if [[ -n "$BACKUP_REMOTE" ]]; then
  echo "backup: uploading to $BACKUP_REMOTE"
  # Dated database dumps — one file per night, pruned by age below.
  rclone copyto "$BACKUP_STAGE/db/$DUMP_NAME" "$BACKUP_REMOTE/db/$DUMP_NAME"
  # History mirror: --backup-dir keeps files the purge deleted (or a disaster
  # removed) recoverable for 30 more days under history-prev/<stamp>/.
  rclone sync "$BACKUP_STAGE/history" "$BACKUP_REMOTE/history" \
    --backup-dir "$BACKUP_REMOTE/history-prev/${STAMP}"
  # The .env: SESSION_SECRET + HISTORY_ENCRYPTION_KEY. The bucket holding this
  # is as sensitive as the .env itself — see docs/ops/restore.md.
  rclone copyto .env "$BACKUP_REMOTE/env/.env"

  echo "backup: pruning remote (30-day retention)"
  # First-run tolerance: a remote that has never had a purge (no history-prev)
  # or no old dumps yet simply has nothing to prune; rclone errors on listing a
  # nonexistent directory.
  rclone delete --min-age 30d "$BACKUP_REMOTE/db"
  if rclone lsf "$BACKUP_REMOTE/history-prev" >/dev/null 2>&1; then
    rclone delete --min-age 30d "$BACKUP_REMOTE/history-prev"
    rclone rmdirs --leave-root "$BACKUP_REMOTE/history-prev" || true
  fi
else
  echo "backup: local-only (BACKUP_REMOTE unset) — nothing uploaded; $BACKUP_STAGE holds the dump and the history mirror"
fi

echo "backup: pruning staging (30-day retention)"
# The same retention on the local staging dir — otherwise the host accumulates
# one full dump per night forever. This runs in both modes.
find "$BACKUP_STAGE/db" -name 'perfectmarkd-*.db' -mtime +30 -delete

echo "backup: done (db=$DUMP_NAME, remote=${BACKUP_REMOTE:-none})"
