# 05 — Export History (Premium, 30 days, encrypted at rest)

Status: resolved
Blocked by: server/03

Premium-only: store generated PDFs on disk per user (path outside web root), encrypted at rest (per-user key derived server-side, key material in env/KMS-file), row in `exports_history` with `expires_at = +30d`. `GET /api/history` (list) + `GET /api/history/:id` (decrypt + stream). Purge job (daily) deletes expired rows + files. History modal in apps/web (name, date, pages, size, download). Disable cleanly when plan downgrades below Premium (rows age out naturally; new exports rejected).

**Accepts**: round-trip list/download; encryption at rest verified; purge removes expired; non-Premium gets typed rejection.

## Comments

**Implementation** (2026-09-12):

- **Storage** (`history/store.ts`): AES-256-GCM at rest, envelope `iv(12) ‖ tag(16) ‖ ciphertext`, one file per export under `HISTORY_DIR/<userId>/<uuid>.pdf` (absolute path — billing/03's account-deletion unlinker requires it). Per-user key derived with HKDF-SHA256 from a master key; the store validates stored paths stay inside the history root, so a tampered row can't be followed. Retention: `expires_at = created + 30d` (`HISTORY_RETENTION_DAYS`).
- **Schema**: one migration (`0005`) adding `exports_history.size_bytes` — the modal shows the plaintext PDF's size, and the encrypted file's stat would lie by the envelope overhead.
- **Worker hook**: after a successful Premium render (plan snapshot at enqueue), the PDF is copied to history — best effort; a history failure is logged and never fails the job (the export already succeeded and stays downloadable from memory). Pro/comped exports are never stored; the immediate download still rides the in-memory result, unchanged from server/03.
- **API** (`history/routes.ts`, mounted at `/api/history`): Premium-only via a router-wide gate — 401 signed-out; 403 `{code: 'premium_required'}` for free/Pro/expired (Pro is the one tier without History); `GET /` lists live rows newest-first; `GET /:id` decrypts and streams with `content-disposition` from the document name. Foreign rows → 404; expired rows are hidden from the list and answer 410 `history_expired`.
- **Purge** (`history/purge.ts`): `purgeExpiredHistory` deletes expired rows + files (missing files count as purged; unremovable ones counted, row still goes). `startHistoryPurge` sweeps at boot then daily; the timer lives in `main.ts` (composition root owns it) and is released on SIGTERM/SIGINT.
- **Env/ops**: `HISTORY_ENCRYPTION_KEY` (32-byte hex/base64, `openssl rand -hex 32`) is required at boot — Premium exports are supposed to be retained, so a deployment without the key must not start quietly; `HISTORY_DIR` (default `./data/history`, `/data/history` in the image, inside the existing volume). `.env.example` documents both.
- **Web**: `history/api.ts` (list + object-URL download via `library/download.ts`'s new `downloadBlob`), `history/HistoryDialog.tsx` (list rows with name/date/pages/size, download with busy state, Premium-gated state → "View plans", empty state, retry), reached from the account menu's new "Export history" item (shell-owned dialog, same pattern as Upgrade status).

TDD at the seams: HistoryStore (round-trip, at-rest encryption envelope, per-user keys, path safety, expiry), routes through `createApp` (gates, list, download, ownership, expiry, unmounted case), the worker hook, the purge, and the dialog. 902 workspace tests green (37 new); typecheck + lint clean. Verified the `size_bytes` migration applies on top of `0004`.

**Code review** (two commits: `75339cd` + fold `181722d`):

- *Spec axis*: the download now genuinely **decrypts + streams** (ciphertext → decipher → response, content-length from `sizeBytes`; a GCM failure truncates rather than ever yielding a wrong file); the purge deletes via `DELETE…RETURNING` so a row can never be deleted past a file that wasn't seen; `store()` inserts the row before writing the file (a failed write ages out as a missing row, never an untracked file); the shutdown comment matches the handler.
- *Standards axis*: the entitlement-gate shape is deduplicated into `findActiveEntitlement` (quota.ts) shared by `/api/me`, export enforcement, and the history gate; terminology follows CONTEXT.md's avoid-list ("Server Exports by Premium users", not "Premium exports"); `read()`'s clock is required (no default hides expiry); `masterKey` is string-only.
- *Accepted deviations, deliberate*: `size_bytes` extends the spec's data-model sketch (the modal's size column needs the plaintext size); `HISTORY_ENCRYPTION_KEY` is boot-required (fail-loud like SESSION_SECRET — Premium users' exports are supposed to be retained); the download's `.pdf`-naming rule exists on both sides of the wire (the header serves non-browser clients, the anchor needs its own name).

Process note: tickets here used `Status: ready-for-agent` → `resolved` directly; kept that (no `claimed` step — see server/01's note on the tracker-docs disagreement).
