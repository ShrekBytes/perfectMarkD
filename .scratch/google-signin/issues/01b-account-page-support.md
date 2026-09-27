# 01b — Account page's server support: first password, and how an account signs in

Status: resolved
Blocked by: google-signin/01

The two facts the Account page needs, which Google Sign-In's flow (01) did not
have to build: whether an account has a password of its own, and a way to give
it one. Today `/api/me` says nothing about either, and the only password write
is Change Password, which asks for the current password — a question a
passwordless account cannot answer, so Password Reset is the only way in.

`/api/me` grows a **sign-in-methods** block: whether the account has a password
and whether it has a Google identity (an `identities` row, the first query by
account, so the table gets its `user_id` index here). An account can be both, or
neither-in-name-only: Google Sign-In never removes a password, and setting a
password never removes an identity.

One endpoint sets the **first** password on an account that has none. The
session is the whole check — there is no current password to ask for, and no
guess to rate-limit — the policy is the same minimum the rest of the flows use,
and the outcome matches Change Password: the caller's own session survives, every
other session the account has is signed out. An account that already has a
password is **refused**, so this can never become a password overwrite that
sidesteps the current-password check; that account's route is Password Reset or
Change Password, and the Account page offers the form that matches what `/api/me`
reported. No email goes out: the address is already verified, and the account did
not ask to be reachable somewhere new.

**Accepts**: server tests through the HTTP seam cover both states of the
sign-in-methods block (passwordless-and-Google, password only, both), the first
password being set with the other sessions revoked and the caller's kept, and
the refusal for an account that already has a password. The index arrives with
its migration. No SPA work in this ticket — rendering these is 02.

## Comments

- The endpoint belongs beside Change Password in the auth router, not in the
  Google routes: it is an ordinary signed-in write that happens to serve a
  Google-registered account, and it must keep working for an account that later
  has both a password and an identity.
- Not rate limited, deliberately: the limiter the password routes share exists to
  bound password *guessing*, and this endpoint asks for no secret. The session
  is the gate.
- The two facts land as `signIn: { password, google }` on `/api/me`, beside the
  other blocks (`flags`, `ai`). A password of its own is a non-empty
  `password_hash`; a Google identity is an `identities` row, and that lookup by
  account is what migration `0009`'s `identities_user_id_idx` serves.
- The route is `POST /api/auth/set-password` (204, 409 when the account already
  has one). The refusal is the *write's* `where password_hash = ''`, not a
  check above it: two requests that both read the account before either wrote
  would otherwise both pass one check, and the second would overwrite the
  first's password — a test drives exactly that race and expects `[204, 409]`.
- `Set Password` is now a CONTEXT.md term, distinct from Password Reset (followed
  while signed out) and Change Password (replaces one, asks for the current).
  Note for 02: `apps/web/src/auth/SetPasswordPage.tsx` is the *Password Reset*
  page, so the Account page's section needs its own name.
- The Google flow helpers the new tests need (`fakeGoogleSignIn`, `cookiePair`,
  `signInWithGoogle`) live in `auth/testing.ts` rather than in each suite;
  `google/routes.test.ts` keeps its own versions, which are entangled with the
  per-code identity maps and `exchange.codes` assertions that suite is built on.
