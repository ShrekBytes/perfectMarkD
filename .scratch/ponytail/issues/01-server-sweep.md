# 01: Server sweep — shared fetch mechanics, admin helpers, small cuts

Status: resolved

The server package sheds ~340 lines of copy-paste and dead code with no
behavior change. The four outbound HTTP clients (AI provider, Resend mail,
Google token exchange, LTC rate provider) each carry their own
AbortController + `setTimeout(abort)` + clearTimeout + AbortError→timeout
mapping, a byte-identical `isAbortError` in all four, and a duplicated
`readDetail` (same 2,000-char cap) in two. One shared helper owns the
mechanics; each client keeps its own error vocabulary and response reader —
this is the boundary email/01 recorded when it declined a full merge, and
the sweep honors it (see the spec's decisions section). The admin routes
collapse their repeated scaffolding behind three small helpers. The AI
routes' three identical command skeletons become one. Two byte-identical
rolling-burst limiters become one. The dead script, the orphaned buffered
read, the write-only columns, and a handful of one-line dups go away. The
five feature flags that can only move together collapse to one boolean —
the web reader edit rides in this ticket so the payload change ships
atomically.

**Blocked by:** None (can start immediately).

**Accepts**:

- [x] One fetch-with-timeout helper (plus one `isAbortError` and one
  `readDetail`) replaces the mechanics in all four clients; each client's
  error class, error vocabulary, and response parsing are unchanged, and
  the clients' tests still pass without rework.
- [x] A `loadTargetUser` helper replaces the six repeated route preludes in
  the admin user routes, and the redundant per-route admin check goes away
  where the sub-app middleware already enforces it.
- [x] A `recordAudit` helper replaces the seven repeated audit-log inserts
  across the admin routes, settings routes, and user routes; audit rows are
  byte-identical before/after.
- [x] The verify/reject order routes share one decide-pending-order path
  instead of two copies of the same scaffold.
- [x] One `runAiCommand`-style helper replaces the three AI command
  skeletons (size gate → burst gate → provider call → reply check); the
  plan/edit/stylesheet routes keep their own messages and parsers.
- [x] One rolling-window burst limiter (home: the existing rate-limit
  module) replaces the twin implementations in the export and AI routes;
  the fixed-window auth limiter is untouched (different algorithm).
- [x] `scripts/mock-ai-provider.mjs` is deleted (referenced by no script,
  workflow, or doc).
- [x] `HistoryStore.read()` is deleted and its tests re-pointed at
  `stream()` or plain file reads; the download route is untouched.
- [x] The export worker's caller-less `stop()`, the test-only store size
  getters, the AI period-reset date re-derivation (delegates to the
  existing state helper), and the hono-RPC claim on the app-type export are
  gone.
- [x] The hand-rolled deferred in the export renderer uses
  `Promise.withResolvers()`.
- [x] A migration drops `entitlements.updated_at` and
  `settings_kv.updated_at` along with their write plumbing;
  `identities.email`/`createdAt` stay (provenance, per the spec).
- [x] `featureFlagsFor` returns a single paid-tier boolean; the web flags
  reader and its tests are updated in the same commit so no intermediate
  state reads a shape that no longer exists.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` green;
  `pnpm --filter @perfectmarkd/server test:e2e` green; boot behavior
  unchanged (env vars all still flow to consumers).

## Comments

- **Implemented in one commit plus a two-axis review pass (2026-09-29).**
  New modules: `src/fetch-with-timeout.ts` (the mechanics + `isAbortError` +
  `readDetail`) and `src/admin/audit.ts` (`recordAudit`, which takes the
  database *or* the caller's transaction so audit rows always commit with
  the action). The rolling limiter lives in `src/auth/rate-limit.ts` as
  `RollingWindowRateLimiter` with `max` read at acquire time — the AI
  routes' ceiling is a live Admin setting, the export routes' is a fixed
  option, and one signature serves both.
- **One toolchain change the ticket did not name:** `apps/server`'s tsconfig
  `lib` moves ES2023 → ES2024, because `Promise.withResolvers()` needs the
  ES2024 lib declarations. Runtime was already there (Node ≥ 22 ships it;
  CI runs 24) — this only lets TypeScript see it. Emission target is
  unchanged.
- **The flags payload change and the web reader landed in the same commit**
  as required: `flags` is now `{ paidTier: boolean }` on both sides
  (server `featureFlagsFor`, web `auth/flags.ts` + the Inspector tabs,
  `api.test.ts`, `UpgradeFlow.test.tsx`, and the four e2e `/api/me`
  stubs). `OPEN_FLAGS`/`LOCKED_FLAGS` keep their names, so the tests that
  use them whole needed no edits.
- **Review findings fixed:** an avoid-word ("rate feed") in the new
  helper's comment now reads "rate provider" (CONTEXT.md §Rate); the
  unused `nowDate` parameter on `decidePendingOrder` was removed; two
  comments in `db/settings.ts` that justified the Rate's own timestamps
  "rather than the row's `updated_at`" no longer lean on the dropped
  column. The ADR-0014 text keeps its historical wording — ADRs are
  records, not living docs.
- **Test re-pointing:** the HistoryStore tests drive `stream()` (the read
  path the download route serves) instead of the deleted buffered `read()`
  — the rotated-key integrity case now asserts the GCM failure at stream
  end, which is where streaming AEAD fails. The payload-deletion asserts
  use `take(id)` where they used the removed `size` getter.
- **Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
  `pnpm build`, `pnpm test` (1,913 tests), server e2e (5), and web e2e
  (69 — run because the flags fixtures changed) all green.
- Unblocks `02-core-sweep.md`.
