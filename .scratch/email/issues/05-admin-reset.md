# 05 — Admin reset: send links, change a user's email

Status: resolved
Blocked by: email/03

The admin panel's user view replaces the temporary-password display (which
exists today only because no mailer did) with "send reset link" — the Admin
never sees or sets a password again. The panel also gains the dead-mailbox
escape hatch: change a user's account email directly (same swap-on-link-click
mechanics as email/04, without the password confirmation — the Admin is the
operator). Admin routes keep their existing admin-session gate.

**Accepts**: server tests through the HTTP seam (prior art: the admin route
tests) cover the reset-link send and the admin email change; component tests
cover the panel's new controls.

## Comments

## Answer

Done. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check` and
`pnpm test` (1,748 tests, +17) are green, and the flow was driven in a real
browser (Chromium, Vite dev server, `MAIL_MODE=console`): `/admin` → the user →
**Send reset link** → the confirmation naming the inbox → the logged link → a new
password → the old one refused, the new one accepted, every session gone. A
dead mailbox was moved the same way: **Change login email** → the link → the
logged `/confirm-email-change` link → the account on the new address, with the
old one told. A spent link was refused, the same-address request was refused with
the dialog intact, and a second link did not cancel the first. No console or page
errors.

**What landed**

- **Two API routes.** `POST /api/admin/users/:id/password` is no longer a
  temporary password; it mails a link and returns which kind plus the window. New:
  `POST /api/admin/users/:id/email` mails an `email_change` link to a new
  address. Both spend the instance-wide send budget (see the second pass below).
- **`PUBLIC_ORIGIN` reaches the admin router** (`adminRoutes` → `usersRoutes`,
  required on both). The panel's links are built from configuration like every
  other one, never from a request's Host header. That is also what deleted the
  argon2 hash from the admin path entirely: the most expensive handler in the
  admin tree is now a token insert and an HTTP POST to the mail provider.
- **A link is one function.** `createLinkSender` (`auth/tokens.ts`) takes a
  purpose and produces the token, the page, the window, and the message. Every
  route that can mail a user — six endpoints across two routers — calls it, so
  there is no place left to assemble a reset link carrying a verification token,
  or one pointing at a page that cannot spend it.
- **Two audit actions, `user.reset_link` and `user.email_change`**, both
  `after: { linkSent: true }` and neither recording an address — the reason
  `user.delete` does not either. `user.password_reset` is gone: nothing resets a
  password any more, and the old name would have read as a claim about the temp
  password that no longer exists.
- **Web**: `ResetPasswordDialog` became `SendResetLinkDialog`, and
  `ChangeEmailDialog` is new. The Account pane's two buttons are **Send reset
  link** and **Change login email**, with the destructive **Delete account**
  beside them.

**Decisions worth keeping**

- **An unverified account gets a verification link, and the panel says so.** A
  reset link buys an unverified account nothing — sign-in stays locked on Email
  Verification — so the panel sends the link that can actually get them in, which
  is email/03's repair rule applied to the same question. The reply carries the
  kind and the window, and the confirmation says *"This account's email was never
  verified, so a verification link went instead"*. Telling the Admin is not
  story 10's enumeration problem: they are already looking at the account, and
  telling them *which* link went out is what stops the panel claiming a reset
  the user cannot finish.
- **The Admin can send themselves a link, and the self-guard went with the
  temporary password.** The old 409 said *"Use Change password in your account
  menu"* — advice for a session that has the password, which is exactly the
  Admin who has lost it. A link needs no session to redeem, and the old refusal's
  whole reason (the panel was about to show a password to hand over) is gone.
  Pinned by a test, including that their own session survives.
- **The 30 minutes is the server's number, not the panel's.** The reply carries
  `expiresInMinutes` and the panel formats it, so the copy cannot fall behind the
  TTL the way a hard-coded 30 would.
- **`normalizeEmail` is exported from `auth/routes.ts`.** Two spellings of one
  address are the kind of drift email/02-04 have been closing, and the import now
  shows that coupling honestly instead of hiding it behind a second normalizer.
  (The three link *paths* are no longer exported at all: `createLinkSender` owns
  them, so there is nothing left to export.)
- **Uniqueness is still decided at swap time**, exactly as email/04 does it: an
  address can be claimed while the link is in flight, so an early refusal would
  refuse a state the user may never land in. The panel refuses only the one
  address it can refuse without hedging — the one already in use — and the
  swap-time refusal message now names both seats (*"from the Account page, or by
  asking the Admin"*), because email/05 made it reachable from a dead mailbox
  where there is no Account page to ask from.
- **A second link does not cancel the first.** The panel is where a second
  attempt comes from (a mistyped address, a lost link), so the two tokens are
  independent and whichever is opened first wins. Tested, and it is the honest
  consequence of sharing email/04's mechanics.

**A two-axis review ran over the diff before the commit** (standards against
`AGENTS.md` / `DESIGN.md` / `CONTEXT.md` / the ADRs, and spec against this file
and `spec.md`). What it changed:

- **The module header claimed an invariant the new routes cannot hold.** *"Every
  action lands with its audit entry in the same transaction"* was true when the
  password reset wrote a hash; the two mail actions have no transactional state
  to wrap, and their audit row has to land *after* the send so a provider that
  refused the message leaves no entry claiming it went out. The header now says
  so, in the same words as the helper that does it.
- **The deleted self-guard was untested.** Nothing pinned the new behaviour, so
  there is now a test for the Admin mailing themselves a link.
- **The runbook described a failure whose message misdirected.** It promised the
  swap would be refused "when the link is opened" without saying what the user
  sees; that message told a user with a dead mailbox to go to an Account page
  they cannot reach, so it now names both seats.
- **The duplicated reset branch** collapsed into one name, as above.
- **`RESET_LINK_MINUTES = 30` in the panel was a copy of the server's TTL** whose
  comment claimed it *was* the server's window. The server now reports it.

**Four findings were considered and declined, with the reasoning kept here rather
than buried:**

- **Extracting the "issue a token, build the link, mail it" shape.** The two
  send *with a payload* and the two send *to the account's current address* are
  different enough that a shared helper would need the whole mailer interface as
  parameters — a helper that mails anything, which is the thing `ADR-0013`'s
  seam exists to prevent. **Superseded:** the one helper that was worth having
  turned out to be exactly the thing whose shape the purpose decides, so
  `createLinkSender` in `auth/tokens.ts` is that helper and both routers call it.
  A link's page, window, Mailer operation, and token purpose are now one table
  that the compiler checks against `TOKEN_PURPOSES`, so a fourth purpose cannot
  arrive without a page, a message, and a window.
- **Sharing one field-class constant** between the new dialog and the existing
  ones. Byte-identical in three files now, but there is no shared styles module
  to put it in and inventing one is an architectural decision, not this
  ticket's — the same finding email/04 recorded and left.
- **Admin routes still have no rate limiting of any other kind**, and the panel's
  `POST /api/admin/users/:id/email` is a cheap POST behind the session gate.
  Pre-existing, and the send budget is now the part that mattered.
- **`ADMIN_EMAIL` and a self-serve email change** — see below; deliberately left
  to whoever owns the Admin story.

**A second pass, after the first review, closed the one gap it left open: the
send budget.** Story 24 names *every endpoint that triggers an email*, and the
first version of this ticket read the spec's "both send endpoints" as the two
user-facing ones. The panel's two routes were outside the pool — not drawing on
it, and not bounded by it. Fixed here, and the fix is smaller than the
alternatives were:

- **The budget is now the instance's, not the auth router's.** `createApp` builds
  one and hands the same object to `authRoutes` and `adminRoutes`, so "one
  budget for all of them" is a fact about the wiring rather than a convention
  each router has to remember. Both routers fall back to a private one when not
  given it, which is what a suite testing one of them in isolation wants — so no
  existing test had to change.
- **The panel's draw is keyed on the *target's* address**, so the sharp
  per-address rule protects the inbox itself: one address cannot be mailed three
  times an hour by anyone, the Admin included. What actually bounds the Admin is
  the per-IP key, since every click comes from one machine — and the per-address
  key means a user who has just been mailed a link is in the same share, so a
  burst of panel clicks can leave a customer who emails at that moment waiting.
  That is the honest cost of sharing, and the runbook now says it out loud rather
  than leaving an operator to discover it.
- **The budget is spent after the refusals, not before**, on both routes — the
  same ordering email/04's review pinned on `/change-email`. A request that was
  never going to send must not draw down a counter a locked-out user still needs.
  Tested with a budget tight enough that the ordering is the only thing that
  makes it pass.
- **The refusal says what happened.** The sign-in page's *"Too many attempts"*
  would send an operator hunting for a mistake they did not make — they clicked
  twice. The panel gets *"This instance has already mailed its share of links
  this hour."*
- **Three tests, one of which is the acceptance criterion**: a panel send spends
  the budget a customer's own request then cannot draw on (and an untouched
  address still can, so it is a shared counter and not a blanket refusal); the
  per-IP refusal, its message, and that a refused request leaves no token row and
  no audit entry; and the ordering above.

The ceiling is still `DEFAULT_AUTH_RATE_LIMITS` in `auth/rate-limit.ts` — a code
constant, not an env var, because nothing wires `authRateLimit` to the
environment. So if the shared budget is ever too tight, raising it is a one-line
change and not a refactor, which is what makes sharing the safe default here
rather than a trade-off.

**Not touched, deliberately**

- **No `admin_logs` row records the swap itself.** The audit entry is the Admin's
  action — a link was issued — and the swap lands later in a public auth route
  with no Admin in it. The account's own address is the record of what happened,
  and email/05's brief explicitly says a second audit action may be added *with*
  the admin-side change; the trail here is honest about the boundary rather than
  pretending the later step is attributable to the Admin.
- **`ADMIN_EMAIL` is still a registration-time address**, and `/:id/email` has no
  self-guard, so moving the Admin's own email off it frees it — the first
  account registered at that address would become a second Admin. This is not new
  (email/04 recorded the same exposure, and an Admin who deletes their account
  frees it identically), and the fix is the policy question email/04 deferred to
  whoever owns the Admin story rather than this ticket's.
- **The Playwright e2e suites were not run** — this machine has no Playwright
  browser installed, and no spec in `apps/web/e2e/` visits `/admin`. The suites
  are a separate CI step and CI runs them.
- **`users.password_hash` is still `NOT NULL`**, so no account holds "no
  password" yet; story 13's Google-only account arrives with
  `google-signin/spec.md` and changes nothing here.
