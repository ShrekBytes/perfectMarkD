# server — apps/server (Phase 2)

Node + Hono + Drizzle + SQLite API: auth, Orders/Entitlements, quotas, Server Export pipeline, Export History. Also hosts the export worker in-process (single container, no queue infra). The client it serves is the static `apps/web` build — the server never renders markdown itself; it drives Chromium through the app's own `/export` route (ADR-0003).

## Data model (sketch)

`users` (id, email, password_hash, is_admin, created_at) · `sessions` (token, user_id, expires_at) · `orders` (id, reference_code, user_id, plan, duration, coin, network, txid, amount_expected, amount_claimed, status[pending|verified|rejected], reject_reason, note, created_at, decided_at) · `entitlements` (user_id, plan, expires_at, updated_at) — one row per user (current state) with history in orders · `export_usage` (user_id, period, count) · `exports_history` (id, user_id, name, pages, stored_path, created_at, expires_at) · `settings_kv` (wallets, prices).

## Security posture

httpOnly session cookies, SameSite=Lax; bcrypt/argon2 passwords; payload ≤ 50 MB hard cap; per-user burst limits; documents processed in memory only; exports history encrypted at rest; `/export` route `noindex`; admin routes gated by `is_admin`.
