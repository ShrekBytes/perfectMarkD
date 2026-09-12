#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PerfectMarkD restore (launch/03) — the mechanical half of
# docs/ops/restore.md. Run on a FRESH machine (or after a data loss) from the
# repo checkout, with .env present (see the runbook's §From nothing for the
# bootstrap order — the .env itself is restored from the backup).
#
#   ops/restore.sh [--db dump.db] [--skip-env] [--skip-history]
#
# What it does:
#   1. Fetches the newest (or the named) db dump from $BACKUP_REMOTE/db/
#      and the history mirror from $BACKUP_REMOTE/history/ into a staging dir.
#   2. Restores .env from $BACKUP_REMOTE/env/.env (the keys; without
#      HISTORY_ENCRYPTION_KEY history files stay ciphertext forever) unless
#      --skip-env. Values are read from .env BEFORE it is overwritten.
#   3. Populates the api-data volume via a one-off api container
#      (docker compose run --no-deps): perfectmarkd.db + history/, as the
#      image's node user, before the stack has ever booted (so no fresh
#      database ever exists to be clobbered mid-boot).
#
# Idempotent: re-running overwrites the volume's db and history files.
# Prerequisites: docker compose, rclone, and a reachable $BACKUP_REMOTE.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

die() { echo "restore: $*" >&2; exit 1; }

DB_DUMP=""
SKIP_ENV=0
SKIP_HISTORY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db) DB_DUMP="$2"; shift 2 ;;
    --db=*) DB_DUMP="${1#--db=}"; shift ;;
    --skip-env) SKIP_ENV=1; shift ;;
    --skip-history) SKIP_HISTORY=1; shift ;;
    *) die "unknown argument: $1 (see header comment)" ;;
  esac
done

command -v rclone >/dev/null || die "rclone not found on PATH"
command -v docker >/dev/null || die "docker not found on PATH"

# Restoring under a running api is a race: the live process would re-create
# and re-write the database files we are replacing.
running="$(docker compose ps --status running api --format '{{.Name}}' 2>/dev/null)"
[[ -z "$running" ]] || die "the api container is running — stop it first (docker compose stop api)"

# Read the remote from .env before (possibly) restoring .env itself.
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source <(grep -E '^(BACKUP_REMOTE|BACKUP_STAGE)=' .env)
fi
: "${BACKUP_REMOTE:?BACKUP_REMOTE must be set in .env (rclone remote:path)}"

STAGE="$(mktemp -d /tmp/perfectmarkd-restore.XXXXXX)"
# The one-off api container reads the stage as an unprivileged bind mount —
# mktemp's default 700 would block it at traversal.
chmod 755 "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

echo "restore: fetching database dump from $BACKUP_REMOTE/db"
# Dump names embed a UTC timestamp (perfectmarkd-YYYYmmdd-HHMMSS.db), so the
# lexicographically newest name is the newest backup on every backend — no
# reliance on modtime ordering, which not all rclone backends implement.
if [[ -n "$DB_DUMP" ]]; then
  DUMP="$DB_DUMP"
else
  DUMP="$(rclone lsf --files-only "$BACKUP_REMOTE/db" | sort | tail -n 1)"
  [[ -n "$DUMP" ]] || die "no database dumps found under $BACKUP_REMOTE/db"
fi
rclone copyto "$BACKUP_REMOTE/db/$DUMP" "$STAGE/db/$DUMP"
DUMP_PATH="$STAGE/db/$DUMP"
[[ -f "$DUMP_PATH" ]] || die "dump $DUMP did not download"

if [[ "$SKIP_HISTORY" -eq 0 ]]; then
  echo "restore: fetching history from $BACKUP_REMOTE/history"
  # A deployment that never had a history entry (fresh, or all exports
  # expired) has no remote history/ yet — an empty local history dir is the
  # correct restore, not a failure.
  if rclone lsf "$BACKUP_REMOTE/history" >/dev/null 2>&1; then
    rclone copy "$BACKUP_REMOTE/history" "$STAGE/history"
  else
    echo "restore: no remote history/ — restoring an empty history"
    mkdir -p "$STAGE/history"
  fi
fi

if [[ "$SKIP_ENV" -eq 0 ]]; then
  echo "restore: fetching .env from $BACKUP_REMOTE/env"
  if [[ -f .env ]]; then
    cp .env "$STAGE/env.before"
    echo "restore: existing .env kept at $STAGE/env.before (inside this temp dir)"
  fi
  rclone copy "$BACKUP_REMOTE/env" "$STAGE/env"
  cp "$STAGE/env/.env" .env
  echo "restore: .env restored (SESSION_SECRET + HISTORY_ENCRYPTION_KEY must match the backup)"
fi

echo "restore: populating api-data volume with $DUMP"
docker compose run --rm --no-deps \
  -v "$STAGE:/restore:ro" \
  --entrypoint sh \
  api -c '
    set -e
    mkdir -p /data /data/history
    rm -f /data/perfectmarkd.db /data/perfectmarkd.db-wal /data/perfectmarkd.db-shm
    cp "$(ls /restore/db/*.db | head -n 1)" /data/perfectmarkd.db
    if [ -d /restore/history ]; then cp -a /restore/history/. /data/history/; fi
    chown -R node:node /data 2>/dev/null || true
    echo "restore: volume now holds:"
    ls -la /data
    ls /data/history | head
  '

echo "restore: done. Next: docker compose up -d, then verify (docs/ops/restore.md §verify)."
