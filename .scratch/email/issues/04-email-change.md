# 04 — Email change on the Account page

Status: resolved
Blocked by: email/02

Self-service email change (new capability — nothing exists today): on the
Account page, confirm current password → submit new address → a token whose
payload is the new address is mailed there → clicking the link atomically
swaps and verifies. Uniqueness of the new address is checked at swap time; the
old address receives a courtesy notice. The password confirmation is what
keeps a stolen session from silently redirecting the account.

**Accepts**: server tests through the HTTP seam cover the password check, the
swap-on-click (including a collision at swap time), and the courtesy notice;
component tests cover the Account page section (prior art: the Account page
tests).

## Comments

## Answer

Done. `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test` (1,731 tests,
+25) are green, and the flow was driven in a real browser (Chromium, Vite dev
server, `MAIL_MODE=console`): register → follow the link → the Account page →
the current password → the new address → the logged link → the change, with the
old address's notice in the log, the token gone from the address bar, a second
open of the same link refused, a wrong password refused with nothing sent, and
the collision refused with "already in use". No console or page errors.

**What landed**

- **The Mailer seam gains one operation**, `sendEmailChange` — the link to the
  new address. `sendEmailChangedNotice` already existed from email/01, so the
  seam now covers all four transactional emails. Every implementation of the
  interface grew a method: the copy (`messages.ts`), the console line, the
  Resend wiring, and the recording fake.
- **`email_change` joins `TOKEN_PURPOSES`**, with its own
  `EMAIL_CHANGE_TOKEN_TTL_MS`. Still no migration: the `purpose` column is
  unconstrained text, as it was designed to be.
- **Two API routes.** `POST /api/auth/change-email` proves the current password
  and mails the link; `POST /api/auth/confirm-email-change` spends it. The
  first is a session route, the second deliberately is not — the link is the
  proof, so it works in a browser that was never signed in (verified).
- **Web**: a `Login email` section leading the Account page, and
  `/confirm-email-change` — a seventh `AuthPageShell` page, so the proof-sheet
  marks, the token-out-of-the-address-bar rule, and the dead-link wording are
  the same ones the other link pages already use.

**Decisions worth keeping**

- **Uniqueness is checked at swap time, and the request refuses only the
  caller's own address.** Refusing an address someone else has registered would
  turn the Account page into a way to learn whose accounts exist, and the
  address can be claimed while the link is in flight anyway. That is why
  `email_taken` is a distinct code: the recovery is a *different* request, not a
  fresh link for the same one.
- **The swap is one statement** — email and `verifiedAt` together — because
  following the link is what proves the new address, so the account records when
  *this* address was proven rather than keeping the old address's date.
- **The current-password check shares change-password's limiter.** They are the
  same attack (guessing a password through a stolen session), and two budgets
  would only mean twice the guesses; the variable is now named for what it
  bounds, not for the route that happened to need it first.
- **Nothing about the session or the password changes.** The swap is keyed to the
  account, not to an address, so a session survives it and the user keeps
  signing in with the password they already had. That is the deliberate
  difference from Password Reset, which hands the account over and so kills
  every session.
- **The courtesy notice goes out after the swap, and its failure is logged
  rather than thrown.** A notice that failed would otherwise answer the link with
  a 500 and leave a user believing nothing happened when the change was already
  durable. `log` now reaches `authRoutes` (createApp already had it) for exactly
  this one line, which names the account and the failure code — never the
  address, per the request logger's privacy posture.
- **The link lives 24 hours, not reset's 30 minutes.** The requester already
  proved the password, so the link carries no authority they did not have: it
  moves the account's mail, it does not open the account. A day is the most
  exposure that convenience is worth.
- **The page spends the link on arrival**, like verification, because the
  recovery is one click either way — unlike the reset link, where a scanner
  burning it would cost a user their only way in. The three answers are kept
  distinct (changed / dead / taken) precisely because their recoveries differ.
- **The section leads the Account page and owns the address.** The page's
  standalone address line moved into it, so the email appears once on the page
  and the affordance sits with the value it changes. It is a named region, which
  is what lets both "Current password" fields be announced with their section.

**Not touched, deliberately**

- **`admin_logs` gains nothing.** The audit log records admin actions, and this is
  a user acting on their own account; email/05 owns the admin-side change and can
  add an action with it.
- **The Playwright e2e suites were not run** — this machine has no Playwright
  browser installed, and no spec in `apps/web/e2e/` visits `/account` (the one
  Privacy assertion a reader might worry about, `/account email/`, is on the
  "what we store" list, which this ticket did not touch). The suites are a
  separate CI step and CI runs them.
- **`users.password_hash` is still `NOT NULL`**, so the "confirm your current
  password" gate has nothing to do about a Google-only account yet; that arrives
  with `google-signin/spec.md`, and the same write applies whenever it lands.
- **`ADMIN_EMAIL` is still a registration-time address, and moving the Admin's
  email off it frees it** — the first account registered at that address would
  become a second Admin. This is not new (an Admin who deletes their account
  frees it the same way), and the fix is a policy question rather than this
  ticket's: whether the bootstrap should require that no Admin exists yet. Left
  alone deliberately, and flagged for whoever owns the Admin story.

**A two-axis review ran over the diff before the commit** (standards against
`AGENTS.md` / `DESIGN.md` / `CONTEXT.md` / the ADRs, and spec against this file
and `spec.md`). What it changed:

- **A regression the review caught in my own refactor.** Lifting the
  change-password form's `messageFor` into `api/client.ts` as
  `errorToFormFailure` kept the 5xx rule and dropped the sibling one — a body the
  client could not read, which the old code also refused to flag a field for. A
  400 with an unreadable body would have flagged the password field. Both rules
  now come from one `isServerFailure` predicate that `errorToUserMessage` uses
  too, so they cannot drift again, and a test covers the case (it was
  untested before, which is why the regression was invisible).
- **The send budget now comes after the password check** in `/change-email`. It
  is one counter for every message the instance sends, so the old order let a
  session that could not produce the password draw it down anyway — ten wrong
  guesses an hour and the whole instance's mail goes quiet, registrations and
  resets included. The guess budget is the limiter's job; the send budget is
  spent only when a message is about to go out. A test with a one-send budget
  pins it (and fails against the old order).
- **Two enumerations of the auth surface were stale**: the route switch's own
  test and `DESIGN.md`'s "all seven" now include `/confirm-email-change`, and
  `invalidLink`'s comment no longer names only two kinds of link.
- **The two current-password messages are constants now**, shared by
  `/change-password` and `/change-email`, so the words for the same failure
  cannot drift apart in one file.

Four findings were considered and declined, with the reasoning kept here rather
than buried:

- **Wrapping the swap's uniqueness check in an `isUniqueViolation` catch** (both
  axes raised it, and registration has that precedent). Registration needs it
  because an argon2 hash *awaits* between its check and its insert; the swap has
  no `await` between its check and its update, so two confirmations cannot
  interleave in that window on the single API process this project runs
  (`PLAN.md` §Infra, the same assumption the in-memory rate limiter rests on).
  Adding the catch would be unreachable code, so the invariant is now a comment
  on the check instead — with the instruction that anything introducing an await
  in that window has to bring the catch with it.
- **Extracting the link pages' shared mechanics into a hook.** The genuinely
  shared part is about six lines (read the token, clear the address bar, guard
  React's development double-mount); the rest of each effect is page-specific
  reasoning, and the pages deliberately differ — a verification link is spent on
  arrival, a reset link only when a password is chosen. `link-page.tsx` already
  holds what must not drift (the token read, the panel, the copy class).
  Rewriting the shipped verification flow on an email-change ticket is not worth
  six lines.
- **Sharing one field-class constant.** It is byte-identical in three files now
  (this section, the change-password form, `AuthForm`), but there is no shared
  styles module to put it in, and inventing one is an architectural decision
  rather than this ticket's.
- **The shared current-password limiter and `AuthOptions.log`.** The limiter is
  the one place where "scope creep" is the *safer* reading: two budgets would
  only mean twice the guesses against a stolen session, and no test or config
  depends on the two being separate. `log` is the diagnostics sink `createApp`
  already passes to the AI routes, the export worker, and the history purge — not
  a second testing seam; the swap is still asserted through the HTTP response, and
  the log line is asserted on an injected fake the way `index.test.ts` already
  does.
