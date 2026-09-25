# 12 — Backups must be opt-in, and must work with or without a remote

Status: ready-for-agent
Blocked by:

`ops/backup.sh:50` hard-requires a remote — `: "${BACKUP_REMOTE:?BACKUP_REMOTE must be set in .env ...}"` — so a deployment that wants no off-machine copy cannot install the timer at all, and a run without a remote fails loudly instead of doing the part it can. The Admin's machine has no backup remote configured for this project (rclone carries `filen:` and `proton:`, neither pointed at PerfectMarkD), and the intent is that backups work *with or without* one rather than forcing a choice.

The script also cannot run as shipped on the deployment host: `ops/perfectmarkd-backup.service` hardcodes `WorkingDirectory=/opt/perfectmarkd` and installs as a **system** unit running as root, while the stack runs rootless under the user's podman — so a root-run `docker compose` cannot see the containers it is meant to dump. `ops/backup.sh` itself shells out to `docker compose`.

**What to build:**

- A `BACKUP_ENABLED` switch in `.env`, default `0`. At `0` the script exits 0 having done nothing — so an installed timer is harmless, and turning backups on later needs no systemd change. At `1` it runs as it does today.
- With `BACKUP_ENABLED=1` and **no** `BACKUP_REMOTE`: local-only. Dump the database with the existing `PRAGMA quick_check` verification, mirror the history directory, prune the staging dir by age, then stop — no rclone call, no failure. Same staging layout (`$BACKUP_STAGE/db/`, `$BACKUP_STAGE/history/`) so pointing a remote at it later uploads a consistent tree.
- With a remote set, the existing upload / `--backup-dir` / 30-day remote prune path runs unchanged.
- `.env.example` gains `BACKUP_ENABLED`; `BACKUP_REMOTE` and `BACKUP_STAGE` are already documented there (commented out, near the end), so only their "Unset = the backup job refuses to run" note needs rewriting for the switch.
- The unit: make it installable on a host that is not `/opt/perfectmarkd` and that runs rootless podman. Either ship it as a **user** unit (`systemctl --user`, with `loginctl enable-linger`) or document `DOCKER_HOST` pointing at the podman socket, and make `backup.sh` work when the compose driver is `podman compose`. Pick one and say why in the unit's comment; the current comment tells the operator to edit the path by hand and says nothing about the rootless case.
- `docs/ops/restore.md` follows: the prerequisites section states the switch, and says plainly that with backups disabled there is **no** recovery path — that is the trade the operator is choosing, and it should not be discovered at restore time.

**Accepts:** with `BACKUP_ENABLED=0` an installed timer is a silent no-op; with `1` and no remote it produces a verified dump and a history mirror under `$BACKUP_STAGE` and exits 0; with a remote it uploads and prunes as before. The unit runs against a checkout that is not `/opt/perfectmarkd` on a rootless-podman host and reaches the running api container.

**Notes:** the local-only path is the honest middle ground for the Admin's deployment — it costs nothing, needs no account, and covers "I deleted the wrong thing". A remote can be added later by setting one variable.

## Comments

- Filed 2026-09-26 from the Admin's decision: no remote backup for now, and the feature must not force one.
