# 01 — Server scaffold + schema + settings

Status: resolved
Blocked by: engine-port/01

Hono app with typed routes, Drizzle + SQLite (WAL) migrations implementing the spec's data model, `settings_kv` seeded with wallets (USDT-TRC20, USDT-BEP20, LTC) and plan prices (3/7 USDT, durations 1/3/6/12, 12 = 10×). Env config (PORT, DB_PATH, SESSION_SECRET, ADMIN_EMAIL bootstrap). Request logging with **no document content ever logged** (privacy posture). Health endpoint. Dockerfile.

**Accepts**: migrations run; settings readable via typed accessor; container builds and serves health check.

Process note: this file used `Status: claimed` while in progress; triage-labels.md's canonical set has no `claimed` (only the wayfinding section defines it) — the tracker docs disagree on which statuses implementation issues may carry; left for a future triage-labels edit. (Same note as editor-app/04.)

## Comments

Implemented 2026-09-06.

- **Schema** (`apps/server/src/db/schema.ts`): every spec table and column, including `entitlements` as one-row-per-user (PK on `user_id`, history in orders) and the exact order status set. Money amounts (`amount_expected`, `amount_claimed`) are decimal strings so they round-trip exactly what the user sees and the Admin compares. Open text columns (`plan`, `coin`, `network`, `status`) are constrained as TS union types rather than SQLite CHECKs, so admin-configurable growth doesn't become a migration.
- **Migrations**: `drizzle/0000_init.sql` generated via drizzle-kit (`pnpm --filter @perfectmarkd/server db:generate`); applied at boot in `createDatabase` (`src/db/database.ts`), folder resolved relative to the module so it works from `src` (tsx/vitest) and `dist` alike. Pragmas: WAL, `foreign_keys = ON`, `busy_timeout = 5000`.
- **Settings** (`src/db/settings.ts`): seeded on boot with `wallets` (three receiving methods, empty addresses until the Admin fills them in per PLAN §Launch checklist) and `prices` (pro 3 / premium 7 USDT monthly; durations 1/3/6/12 at 1×/3×/6×/10×). Seed is insert-only-if-absent, so admin edits survive restarts. Typed accessors `getWallets`/`getPlanPrices` validate the stored JSON shape on every read and throw clear errors on malformed values; `getSetting`/`setSetting` handle arbitrary keys.
- **Env** (`src/env.ts`): `PORT` (integer 1–65535, default 3000; 0 rejected — a container needs a predictable port), `DB_PATH` (default `./data/perfectmarkd.db`, parent dirs created), `SESSION_SECRET` and `ADMIN_EMAIL` parsed but optional until server/02 consumes them. `.env.example` documents the contract.
- **Request logging** (`src/request-logger.ts`): method, path, status, duration — never query strings, never bodies (documents arrive in bodies; privacy posture). HTTPException-aware so auth failures won't log as 500 later.
- **App** (`src/index.ts`): `createApp` factory with chained typed routes (`AppType` export for hono clients), db exposed to handlers via `c.var.db`, `/healthz`. `main.ts` wires env → database → app → serve.
- **Dockerfile** (`apps/server/Dockerfile`, build context = repo root): tsc build stage, `pnpm deploy --prod --legacy` for a pruned dependency tree, `node:24-bookworm-slim` runtime, non-root user, `/data` volume for SQLite, `HEALTHCHECK` against `/healthz`.
- **Verification**: server suite (27 tests, written red-first): migration tables, WAL/FK enforcement, seed idempotency + preserved admin edits, settings validation, env parsing, logging privacy (query/body leak test), health. Full repo suite 469 green; typecheck/lint/format green. Container verified end-to-end with podman (Docker daemon not running here): image builds (OCI + docker formats), container serves `{"ok":true}` at `/healthz`, typed accessor reads seeded wallets/prices inside the container, `HEALTHCHECK` passes.
- Gotchas for later tickets: pnpm 11 requires `--legacy` for `pnpm deploy` without `inject-workspace-packages`; podman's default OCI image format drops `HEALTHCHECK` (Docker honors it — compose in server/06 is unaffected).
- Two-axis code review ran afterwards; fixes applied: Order/Manual Payment vocabulary in the orders doc comment, HTTPException-aware log status, finite-number check on duration prices, exact-key wallets validation, `PORT=0` rejection, single `consoleSink` default.
