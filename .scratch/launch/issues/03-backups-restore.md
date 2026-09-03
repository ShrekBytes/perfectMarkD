# 03 — Backups + restore runbook

Status: ready-for-agent
Blocked by: server/01

Nightly jobs on the VPS (systemd timers in Compose host): SQLite `VACUUM INTO` dump → rclone to object storage (Backblaze B2 or similar, ~€1/mo) with 30-day retention; exports-history dir synced the same way. Restore runbook in `docs/ops/restore.md`: bring up fresh VPS, restore db + history keys + files, verify export works. Test the restore once for real.

**Accepts**: a restore from backup onto a clean machine produces a working service (executed, not just written).
