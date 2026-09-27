# Google Sign-In

Status: ready-for-agent

## Problem Statement

A user who wants to use the product with their Google identity must invent and
remember yet another password, confirm yet another email, and later recover it
through yet another reset flow. Sign-up friction at the exact moment the user
is deciding whether the product is worth trying costs registrations, and the
"which password did I use here?" problem feeds the Password Reset flow
forever. The product already proves email ownership through Email
Verification; a Google account proves the same thing at sign-in time — but
today there is no way to use it.

## Solution

A **Google Sign-In** button on the sign-in and registration pages. Choosing it
sends the user through Google's consent screen and back: existing accounts
with a matching verified Google email are signed into (auto-linked), new
users are registered without ever setting a password, and Google's proof of
email ownership counts as Email Verification — no verification email is sent.
Password remains optional: a Google-registered user can set one later from
the Account page, and Password Reset is the recovery path when they forget
whether they ever had one. The feature is configured by environment variables
and simply does not exist when unconfigured, so Self-Hosted Instances are
never forced into Google Cloud setup.

## User Stories

1. As a new visitor, I want to register with my Google account in one click, so that I can start using the editor without inventing a password.
2. As a returning user with a Google-registered account, I want to sign in with one click, so that I never touch a password form.
3. As a user with an existing email+password account whose email matches my Google account, I want Google Sign-In to sign me into that same account, so that I do not end up with two accounts for one inbox.
4. As a user who signs in with Google, I want to skip the verification email entirely, so that I am not asked to prove what Google has already proven.
5. As a Google-registered user, I want the optional ability to set a password from the Account page, so that I can also sign in without Google if I ever want to.
6. As a Google-registered user who never set a password, I want Password Reset to work for me, so that forgetting which sign-in method I used is never a lockout.
7. As a Google-registered user whose Google account becomes unavailable, I want to regain access through Password Reset, so that my documents are not hostage to one identity provider.
8. As a visitor, I want the Google button absent rather than broken when the deployment has not configured it, so that I am never shown an option that leads nowhere.
9. As a user whose Google sign-in fails at Google's end (cancelled consent, network), I want a clear inline message and my password form intact, so that I can fall back without losing my place.
10. As a user with an unverified email+password account whose email matches my Google account, I want signing in with Google to verify my email as a side effect, so that the two paths converge on one usable account.
11. As the operator, I want the first account registered with the admin email to become the Admin regardless of whether it was registered by password or by Google, so that bootstrap does not depend on the sign-in method.
12. As the operator, I want the Google client credentials in environment variables, so that each deployment (including Self-Hosted Instances) uses its own Google project.
13. As the operator, I want per-IP rate limiting on the sign-in start and callback endpoints, so that the endpoints cannot be hammered.
14. As a user, I want the consent screen to request nothing beyond my name, email, and basic profile, so that I am not asked for sensitive scopes.
15. As a user reading the Privacy page, I want Google Sign-In disclosed — what Google receives and what the app stores — so that the disclosure is honest.
16. As a signed-in user, I want my Account page to show how I can sign in (password and/or Google), so that I always know what my credentials are.

## Implementation Decisions

- **OAuth 2.0 Authorization Code flow**, server-side: the API starts the flow
  (redirect to Google with state), and handles the callback (code exchange,
  identity fetch). Scopes: `openid`, `email`, `profile` only — non-sensitive,
  so no Google app verification audit applies. The redirect URI is
  same-origin in production (Caddy serves the SPA and proxies `/api` from one
  hostname) plus a localhost entry for development, registered in a single
  Google OAuth Client.
- **Identity storage.** A new table links accounts to Google identities
  (Google's account id plus the verified email at link time). One account may
  have a Google identity and a password simultaneously; a Google identity
  links to at most one account.
- **Auto-link rule.** The callback matches by Google account id first, then by
  email: a matching account with a password signs in (no email sent); a
  matching unverified account signs in and is marked verified; no match
  registers a new passwordless account, marked verified. Google-verified
  emails are treated as Verified Email by construction (per the glossary).
  The claimed email at registration time keeps its uniqueness guarantee — a
  Google email colliding with an already-verified account signs into that
  account, because Google has proven ownership of that address.
- **Session issuance is identical** to password sign-in: the same signed,
  httpOnly session cookie, the same rolling TTL. An unlinked Google callback
  and a password failure are indistinguishable to the session machinery.
- **State parameter** (random, short-lived, cookie-bound) protects the
  callback against CSRF; the flow's rate limits use the existing
  fixed-window limiter.
- **Configuration and boot behavior.** Client id, client secret, and the
  redirect URI come from environment variables. Unconfigured means the
  feature is absent: the server does not expose the routes, and the SPA does
  not render the button. Unlike the mailer (ADR-0013's boot gate), this is a
  convenience feature — a deployment without it is complete, not degraded.
- **SPA surface.** The Google button on the sign-in/registration pages (only
  when the server advertises the feature), a "Set password" section on the
  Account page for passwordless accounts, and the sign-in-method line on the
  Account page. Both Account-page states read one API addition — a
  sign-in-methods block on `/api/me` saying whether the account has a password
  and whether it has a Google identity — so the page renders what the server
  reports and never guesses: an account with a password gets the Change Password
  form, one without gets the section that sets its first password.
- **The first password is set by the session, or not at all.** Change Password
  asks for the current password, which a passwordless account cannot answer. A
  separate write sets the *first* password on an account that has none: the
  session is the whole check, the same minimum policy applies, the caller's own
  session survives and every other session the account has is signed out (the
  rule Change Password and Password Reset already follow). An account that
  already has a password is refused — this is not a second way to overwrite a
  password without the current one, and Password Reset remains the recovery
  path. It is deliberately not rate limited: the limiter the password routes
  share exists to bound password guessing, and this write asks for no secret.
  **Sign-in method** is the glossary term for what `/api/me` reports; an account
  may have both, and gaining one never removes the other.
- **The mailer is untouched.** Google Sign-In sends no email; Password Reset
  from the email spec is its recovery path, and setting a first password mails
  nothing because the address is already verified. The Admin temp-password
  replacement and the admin email change live in the email spec.
- **First-account bootstrap** (the admin email rule) is method-agnostic:
  registration by Google callback counts exactly like registration by
  password.
- No changes to Quota, Orders, Verification (the on-chain kind), Entitlements,
  or either export path. Google-registered accounts are ordinary accounts in
  every other respect — same Free Tier, same plan gating.

## Testing Decisions

- The spec adds **no new seam**: Google's token exchange is injected at the
  same composition-root point as the Mailer (approved in the email spec — one
  composition-root seam serves both). Tests inject a fake that returns canned
  identities; production wires Google's endpoints.
- Server behavior is tested through the existing in-process HTTP seam: the
  full flow with the fake identity exchange — new registration, auto-link to
  a password account, converge-on-unverified, admin bootstrap, session cookie
  issuance, rate limiting, and absent-feature behavior when unconfigured
  (prior art: the auth route tests).
- SPA changes are covered by component tests with mocked clients (prior art:
  the Account page tests): button presence given the server's advertisement,
  error fallback, the Account page's set-password and sign-in-method states.
- The Account page's server support is tested through the same HTTP seam as
  everything else auth: the sign-in-methods block in each of its states, the
  first password being set (other sessions revoked, the caller's kept), and the
  refusal for an account that already has a password.
- The Google client (token exchange, identity fetch) gets narrow
  stubbed-fetch tests for error mapping only — an implementation detail
  behind the injected seam.
- No new e2e suite: real Google sign-in cannot be exercised in CI; the
  existing e2e suites stay untouched.
- A good test asserts external behavior (what a user can observe: sessions,
  account state, response shapes), not internal wiring.

## Out of Scope

- Other identity providers (GitHub, Apple, Microsoft, passkeys) — the
  identity table is designed so another provider is an additive change, but
  none is built here.
- Two-factor authentication and device/session management.
- Importing anything from Google beyond the identity: name, email, and
  Google's account id. No contacts, files, or profile pictures.
- The email flows themselves (verification, reset, change) — specified in
  `email/spec.md`, which this spec builds on.
- Any change to billing, Quota, Export History, or the export pipeline.

## Further Notes

- ADR-0013 covers the mailer this feature deliberately does not use; Google
  Sign-In adds no third-party data flow beyond the sign-in redirect itself.
- Glossary terms live in `CONTEXT.md`: Google Sign-In (auto-link, counts as
  Email Verification, password optional), Sign-in method (what `/api/me`
  reports: password and/or Google), Verified Email.
- The work is three tickets, in this order: `01` the OAuth flow and the identity
  link, `01b` the Account page's server support (the sign-in-methods block and
  the first-password write), `02` the SPA surface. 01b exists because both
  Account-page states are *server* facts, and both are verifiable on their own —
  a full spec check should not read the Account page as needing anything the
  flow's ticket did not build. None of the three needs real Google credentials
  to implement or to test: the button is a link to the start endpoint, its
  visibility reads the server's advertisement, and only the round trip through
  Google's consent screen does not.
- Ordered after the email spec's mailer ticket only in the sense that its
  composition-root change should land on top of the Mailer's; both specs'
  tickets carry explicit `Blocked by` lines where they exist. Commit scope:
  `google-signin/01b` for the middle ticket, `google-signin/02` for the last.
