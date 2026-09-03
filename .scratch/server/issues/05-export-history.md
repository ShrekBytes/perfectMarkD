# 05 — Export History (Premium, 30 days, encrypted at rest)

Status: ready-for-agent
Blocked by: server/03

Premium-only: store generated PDFs on disk per user (path outside web root), encrypted at rest (per-user key derived server-side, key material in env/KMS-file), row in `exports_history` with `expires_at = +30d`. `GET /api/history` (list) + `GET /api/history/:id` (decrypt + stream). Purge job (daily) deletes expired rows + files. History modal in apps/web (name, date, pages, size, download). Disable cleanly when plan downgrades below Premium (rows age out naturally; new exports rejected).

**Accepts**: round-trip list/download; encryption at rest verified; purge removes expired; non-Premium gets typed rejection.
