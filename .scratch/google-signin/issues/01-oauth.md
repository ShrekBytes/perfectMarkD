# 01 — OAuth flow: routes, identities, auto-link, bootstrap

Status: ready-for-agent
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
