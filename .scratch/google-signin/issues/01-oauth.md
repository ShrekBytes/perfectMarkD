# 01 — OAuth flow: routes, identities, auto-link, bootstrap

Status: resolved
Blocked by: email/01

Server-side OAuth 2.0 Authorization Code flow with Google: start endpoint
(redirect with cookie-bound `state`) and callback endpoint (code exchange,
identity fetch, session issuance identical to password sign-in — same signed
httpOnly cookie, same rolling TTL). Scopes: `openid`, `email`, `profile`.
A new identities table (Google account id + email at link time, one identity ↔
one account) and the auto-link rule: match by Google account id, then by email
— password account signs in; unverified account signs in and is marked
verified; no match registers a passwordless verified account. First-account
admin bootstrap counts registrations from either method. Configuration from
environment variables (client id, secret, redirect URI — production
`https://perfectmarkd.00022000.xyz/auth/google/callback` plus the localhost
entry); the identity exchange is injected at the composition root next to the
Mailer, and when unconfigured the routes do not exist. Rate limits use the
existing fixed-window limiter.

**Accepts**: server tests through the HTTP seam with a fake identity exchange
cover the full flow, the auto-link branches, bootstrap, session issuance, rate
limits, and absent-feature behavior when unconfigured; stubbed-fetch tests
cover the Google client's error mapping.

## Comments

- Routes are mounted at the app's root (`/auth/google/start`, `/auth/google/callback`), not under `/api`, because the redirect URI is what the operator registers with the OAuth client. `Caddyfile` passes `/auth/google/*` to the api container, and the web dev proxy does the same, so the button can be a plain relative link in both environments.
- Failures redirect to `/login?google=declined|error|rate_limited` — a browser navigation never gets a JSON body here; the sign-in page owns the wording.
- A passwordless account is written with an empty `password_hash` (NOT NULL column), which is also how the Account page will tell "has a password of its own?" in google-signin/02.
- `GET /api/auth/providers` → `{ google: boolean }` was added here rather than in 02: the routes do not exist when unconfigured, so an unconfigured instance has to *say* so, and 02 is blocked by this ticket.
- Human step still to do (unchanged by this ticket): create the Google Cloud OAuth client and register both redirect URIs, then paste the id/secret into `.env` — see the GOOGLE_* block in `.env.example`.
