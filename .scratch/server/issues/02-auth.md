# 02 — Accounts: email + password (no verification)

Status: resolved
Blocked by: server/01

Register (email+password, argon2), login, logout, session cookie (httpOnly, SameSite=Lax, 30d rolling), change password. No email verification, no email sending — password reset is manual via admin (billing/03) per PLAN. Login/register pages in apps/web (minimal, match design language) — free users never see them except from the upgrade flow. Rate-limit auth endpoints. First registered user becomes admin if `ADMIN_EMAIL` matches (bootstrap).

**Accepts**: register/login/logout/round-trips; sessions persist; rate limits trigger; admin bootstrap works.

## Comments

**Implementation** (2026-09-11):

- **Dependency**: `@node-rs/argon2` (2.2.0) — argon2id with library defaults (19 MiB, 2 iterations), prebuilt binaries so the Docker image needs no extra toolchain.
- **Session model** (`auth/sessions.ts`): opaque 256-bit random token; only its SHA-256 digest is stored, so a DB leak can't be replayed. Cookie is Hono-signed with `SESSION_SECRET` (the secret server/01 left for this ticket), `httpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=30d`, plus `Secure` whenever the request arrived over HTTPS (`x-forwarded-proto`) so plain-http localhost still works. "30d rolling" is real at both layers: each authenticated request past a 24 h threshold extends the stored expiry *and* re-issues the cookie (`ResolvedSession.rolled` → middleware refreshes) — without the cookie refresh, browsers would still drop it on day 30.
- **Routes** (`auth/routes.ts`, mounted at `/api/auth`): `register` (201 + session), `login`, `logout` (204; unknown/invalid cookie still succeeds), `change-password` (204; revoked all *other* sessions — a stolen cookie must not survive a password change), `me` (401 when signed out). Validation: permissive email shape check + lowercase normalization; password policy is 8 chars on registration/change, but login accepts any non-empty password (an admin temp reset may be shorter). Duplicate registration returns 409, including the race where two inserts pass the existence check concurrently (mapped from the UNIQUE violation).
- **Anti-enumeration**: login always runs one argon2 verification — against a dummy hash when the email is unknown — and returns the same message for unknown-email and wrong-password.
- **Admin bootstrap**: registration with `ADMIN_EMAIL` (case-insensitive) sets `is_admin`. Since emails are unique, exactly one account can ever match.
- **Rate limiting** (`auth/rate-limit.ts`): in-memory fixed-window per route+IP, defaults 10/min, `429` + `Retry-After`; the sweeper prunes expired keys. IP is the **last** `x-forwarded-for` hop (Caddy appends the client it observed; earlier hops are client-controlled and spoofable) with `x-real-ip` fallback. `createApp` exposes overrides so tests trigger limits without waiting.
- **Boot**: `SESSION_SECRET` is now required by `main.ts` (clear error message); `createApp` requires it in its options. `createApp` also accepts an injectable `now` clock, which tests use to exercise rolling/expiry without waiting.
- **Web** (`apps/web/src/auth/`): `api.ts` (SDK-style register/login/logout/me/changePassword; server messages surface as `AuthError`), `AuthPage.tsx` (minimal email+password form in the design language, `role="alert"` errors, returns to the editor on success), routes `/login` + `/register` in the router and `App`. Free users still never see it: nothing links there yet — billing/01's upgrade flow does. Vite dev proxy `/api` → `http://localhost:3000` (`VITE_API_ORIGIN` override).
- **Tests**: 23 integration tests for the HTTP API (round-trips, cookie attributes, Secure flag, rolling at both layers, restart persistence, validation, duplicates incl. the race, admin bootstrap, both rate-limit properties, other-session revocation), 9 for the web client (mocked `fetch`), 7 for the auth page, plus router/App route-switch coverage. Full suite 593 passing; typecheck/lint/prettier/build green.
- **Process note** (same as server/01): this file used `Status: claimed` while in progress; `triage-labels.md` has no `claimed` status for implementation issues — left for the same future docs edit.
