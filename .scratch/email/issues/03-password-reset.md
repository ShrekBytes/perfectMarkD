# 03 — Password Reset: request, link, set

Status: resolved
Blocked by: email/02

From the sign-in page: request a reset link (success-shaped for every
address — registered or not, the response is identical). The link (30-minute
single-use token) opens a set-new-password page; success stores the new
argon2id hash — creating one for accounts without any — and revokes all of the
account's sessions. Works for every account kind, including ones with no
password (the recovery path Google-registered users will rely on). A request
from an unverified account sends the verification link instead, so the flows
repair each other instead of dead-ending.

**Accepts**: server tests through the HTTP seam cover the success-shaped
request, the unverified-account branch, set + session revocation, and
single-use/expiry; component tests cover the request form, the set form, and
the expired-link state.

## Comments

## Answer

Done. `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test` (1,706 tests,
+38) are green, and the whole flow was driven in a real browser (Chromium, Vite
dev server, `MAIL_MODE=console`): sign in → "Forgot password?" → the address →
the logged link → a new password → the old one refused, the new one accepted,
and every session gone. A spent link, a missing token, a too-short password, and
a request for an unregistered address were each checked in the browser too. No
console or page errors.

**What landed**

- **Two API routes.** `POST /api/auth/request-password-reset` is
  success-shaped for every address (`{ sent: true }`, whether or not one is
  registered, and the same 400 for a malformed one). `POST
  /api/auth/reset-password` spends the link, writes the argon2id hash, revokes
  every session, clears the caller's cookie, and returns 204 with no session
  started — the user signs in again with the password they just chose.
- **The branch the ticket asks for** (story 14): a verified account gets a reset
  link, an unverified one gets a verification link. The response is identical
  either way, so the branch is invisible from outside. Verified in the browser:
  an unverified account's request produced `console mail: verification link … →
  /verify-email?token=…`.
- **30 minutes, from a map, not a constant** (`auth/tokens.ts`): `TOKEN_TTL_MS`
  is keyed by purpose, so a new flow brings its own length instead of silently
  inheriting verification's 24 hours. `TOKEN_PURPOSES` gains `password_reset`,
  and **no migration is needed** — the `purpose` column is unconstrained text
  (schema.ts), as it was designed to be.
- **`deleteUserSessions`** beside `deleteOtherSessions`: all sessions, no
  exception. A password *change* keeps the device that made it; a *reset* has no
  such device, since nobody is signed in when a link is followed.
- **Rate limits**: the request draws on email/02's shared send budget, on both
  keys. One test pins that the counters really are shared — the registration
  below it spends the first of two.
- **Web**: two new pages in the existing proof-sheet chrome — `/reset-password`
  (the request and its "check your inbox" answer) and `/set-password` (the page
  a link resolves to) — and the sign-in form's "Forgot password?" is now a link
  to the first, replacing the disclosure that named the Admin as the only way
  in.

**Decisions worth keeping**

- **The policy is checked before the token is redeemed.** A password under eight
  characters is the user's typo, and a reset link is often the only way they
  have in — so the refusal costs nothing and the link still works. Tested.
- **The link is spent when a password is chosen, never on load** (an inbox link
  scanner follows every URL it sees), and it is taken out of the address bar
  before that. The dead-link answer is therefore discovered on submit rather than
  on arrival: the form renders, and only the submit says "That link has
  expired". That is the deliberate cost of not burning the link on a page load,
  and the browser run confirms the recovery — a "Request a new link" button — is
  one click from there.
- **The confirmation hedges, and says which link an unverified account gets.**
  "If that address has a PerfectMarkD account…" never claims an account was
  found (story 10), and a third paragraph names the verification-link case, so a
  user is not left watching an inbox for a message that was never going to
  arrive. The address is kept in `sessionStorage`, so a refresh still names the
  inbox — the page has to survive the likeliest thing between "Send the link" and
  reading mail.
- **A server failure leaves the set form open** with what the user typed and no
  field flagged: a 5xx is ours, not the user's, and flagging the field would
  point them at the wrong thing. Only a 400 — the policy — flags. A
  `link_invalid` reply is the one case that replaces the form, because its
  recovery is a different page.
- **`invalidLink` now names no flow** ("That link is no longer valid…"). The one
  answer now serves both links, and on the verification page it is never
  displayed anyway: that page branches on the code and renders its own copy.

**The review found two things only a browser could**

- A ghost `<Link>` styled as a full-width target rendered as inline text: an
  anchor is inline by default, so `h-9 w-full border` did nothing without
  `flex`. Every component test passed. Fixed on both link-shaped targets.
- `minLength={8}` on the new-password field meant Chrome's native bubble
  pre-empted the styled message, so a test was asserting an alert no real user
  can ever see. Dropped, matching the Account page's `ChangePasswordForm` — the
  countdown hint and one styled error, instead of two competing systems.

**A two-axis review ran over the diff before the commit** (standards against
`AGENTS.md` / `DESIGN.md` / `CONTEXT.md` / the ADRs, and spec against this file
and `spec.md`). What it changed: the field-flagging bug above; the shared
account lookup and send-budget check (`/resend-verification` and
`/request-password-reset` were line-for-line twins); `tokenFromUrl`, `Panel` and
`COPY_CLASS` extracted into `auth/link-page.tsx` so the two link pages cannot
drift; the refresh-surviving address; the cookie clear; `errorToUserMessage`
lifted into `api/client.ts` (which also gave `VerifyEmailPage` the
fallback-body branch — now covered by a test); and `pending-verification.ts`
renamed to `pending-email.ts`, since two flows now keep an address in it.

**Three things it raised that this ticket did not change, for the record**

- **A contradiction inside `spec.md`, flagged rather than silently resolved.**
  §Verified Email state says "the reset flow (below) and Google Sign-In are the
  only other writers of `verified-at`", but §Password reset request (and this
  ticket) send an *unverified* account a verification link instead — so the
  reset flow never writes `verified_at`. The second passage is the specific,
  later one and the implementation follows it; the first sentence is the stale
  one. Which way to fix the spec is a maintainer's call.
- **The upgrade dialog's "Forgot password?" now navigates away from `/pricing`.**
  `AuthForm` is embedded in `UpgradeDialog`, so the link leaves the page and the
  plan/duration/method picked in the dialog is dropped. The same dialog already
  tells users to leave for their inbox and pick the plan again, so this is
  consistent with it — but it is a real consequence of putting the affordance on
  a `Link`, and whether the dialog should instead keep a device is the
  maintainer's call.
- **Two `PASSWORD_MIN = 8` constants and three field-error rules** are the
  repo's existing pattern (the server owns the policy; each form states it), so
  they were left alone rather than centralised for two call sites.

**Not touched, deliberately:** `users.password_hash` is still `NOT NULL`, so no
account can hold "no password" yet. Story 13's account arrives with Google
Sign-In (`google-signin/spec.md`); the write here is the same whatever the column
held, so nothing needs changing then. A test stands in for that case today by
clearing the column.
