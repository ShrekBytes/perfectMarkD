# 02 — Email Verification: token infra, sign-in gate

Status: resolved
Blocked by: email/01

Registration sends a verification link (one-time opaque token, stored hashed,
24h expiry, single shared token table with purpose + payload + expiry + used-at,
swept opportunistically). The users table gains a verified-at timestamp;
sign-in rejects unverified accounts with a distinct, resend-offering response,
and the "check your inbox" page shows the address. Re-registering an address
that belongs to an unverified account reuses that row and resends (success-
shaped, indistinguishable from fresh registration); registration against a
verified address keeps the existing duplicate rejection. Send endpoints sit
behind the existing fixed-window rate limiter, keyed per IP and per address.
Verification is what makes every paying user reachable at a proven address
(ADR-0005's Manual Payment flow) and is the state Google Sign-In will later
share (google-signin/spec.md).

**Accepts**: server tests through the in-process HTTP seam with a recording
fake Mailer (prior art: the auth route tests) cover the gate, the resend path,
re-registration, token single-use/expiry, and rate limits; component tests
cover the check-your-inbox page and the verification landing.

## Comments

### Prerequisite found while verifying email/01 on a live instance: the public origin

email/01 is resolved (see its `## Answer`), and with it the last blocker. But
the first thing this ticket writes — a route that sends a link — runs into a
gap the codebase has no answer for, so it is decided here rather than
rediscovered mid-diff.

**The gap.** The Mailer takes an absolute `url`, and nothing in the server
knows the address users' browsers reach the instance on. `env.ts` has no such
variable. The Mailer's own doc comment claims "the caller … is the only place
that knows the app's public origin" — that caller does not exist yet.

**`EXPORT_ORIGIN` is not it, and reusing it is the trap.** On a deployment
behind a tunnel it is `http://caddy`: a name that resolves only inside the
compose network, set because the export worker loads `/export` from it
(`docker-compose.yml`, `EXPORT_ORIGIN: http://caddy`). It is correct for a
hidden render surface nobody types, and dead for a link a human clicks. Reusing
it means Resend happily sends a real, DKIM-signed email from the real domain
containing `http://caddy/verify-email?token=…`, and the link fails only when a
user opens it — invisible to every check that exists today.

**Decision: a new `PUBLIC_ORIGIN`, required, and the API refuses to boot
without it** — a fourth gate beside `SESSION_SECRET`,
`HISTORY_ENCRYPTION_KEY` and the mail configuration in `main.ts`. The three
options weighed:

- *Required, refuse to boot* — chosen. A missing value can never reach a
  user, and it behaves identically to its three neighbours: named in the
  message, stops the boot, one rule to learn.
- *Defaulted to `http://localhost:<port>`, log loudly* — rejected. In the one
  case that matters (a tunnel deployment, variable forgotten) it produces
  exactly the dead link above, invisibly, while the instance looks healthy.
- *Optional, fail the individual send* — rejected. Reinstates the quiet
  failure the boot gates exist to prevent, one level down (ADR-0013 rejects a
  mailer that silently does nothing), and shows a new user an error page at
  sign-up instead of a clear boot failure.

**Also rejected: deriving the origin from the request.** No new variable, and
correct on the happy path — the registration POST carries the site's own
`Host`. But `Host` is attacker-supplied: a crafted registration would make the
instance send a link to the attacker's page, from our domain, carrying our
DKIM signature, which passes spam filtering because it genuinely is from us.
That is story 24's spam-cannon concern made concrete, so the header is never
trusted for this.

Naming: `PUBLIC_ORIGIN`, not `APP_ORIGIN` — the Caddyfile comments already use
"public" in contrast to the internal loopback origin, and `APP_ORIGIN` reads
too close to the existing `EXPORT_ORIGIN`. The value is validated at load
(must parse as an absolute URL, `http:` or `https:`) so a schemeless
`perfectmarkd.example.com` fails at boot instead of producing a link no browser
can open; a trailing slash is stripped so joining a path is unambiguous.

**Shape, for sizing** — the config lands with its first reader, in one diff:

| File | Change | Lines |
| --- | --- | --- |
| `apps/server/src/env.ts` | `publicOrigin` field, one line in `loadEnv`, `parsePublicOrigin` beside `parsePort` | ~29 |
| `apps/server/src/main.ts` | the fourth gate beside the other three throws | ~8 |
| `apps/server/src/env.test.ts` | two fixtures, one new test (valid / blank / missing / schemeless / wrong scheme) | ~14 |
| `docker-compose.yml` | `PUBLIC_ORIGIN: ${PUBLIC_ORIGIN:-}` passthrough + comment | 3 |
| `.env.example` | documented, blank, beside the mail keys | ~7 |
| `docs/ops/restore.md` | the bootstrap `printf` appears in four places | 4 |
| `README.md`, `AGENTS.md` | the lines listing what the API refuses to boot without | 2 |

**Deployment trap, for whoever runs this against the live instance.** Two files
outside the repo must change or the api will not come back up:
`~/self-hosted/perfectmarkd/docker-compose.yml` needs the same passthrough (the
compose the host runs is a copy, not the repo's), and `~/self-hosted/perfectmarkd/.env`
needs `PUBLIC_ORIGIN=https://perfectmarkd.00022000.xyz`. Verify by starting the
image without it, as email/01's answer describes.

**Open sub-decision, not yet settled by the operator.** `main.ts` has no test
at all today: the mail gate is covered only because its logic lives in
`mail/config.ts` (`resolveMail`), while the three inline throws are verified by
running the image. Either put the new gate inline with its neighbours (4 fewer
lines, the "is it set" branch untested) or extract a small
`requirePublicOrigin()` so every branch is covered by `pnpm test`. The
recommendation is the latter, for ~6 lines.

**Separately, the Privacy page already promises** an address is "verified once
before the first sign-in" (shipped in email/01). This ticket is what makes that
true — keep the two in step.

## Answer

Done, in one diff. `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test`
(1,668 tests, +57) are green, the fourth boot gate was checked by starting the
API three ways, and the whole flow was driven in a real browser (Chromium, Vite
dev server, `MAIL_MODE=console`): register → check-your-inbox → the logged link
→ verified and signed in; a second account stopped at the sign-in gate with its
resend; a spent link offered a fresh one; and the upgrade dialog's new
registration step rendered in the Light Table. No console or page errors.

**The prerequisite, settled as the ticket decided it.** `PUBLIC_ORIGIN` is
required and the API refuses to boot without it — a fourth gate beside the other
three. The open sub-decision went the recommended way: `requirePublicOrigin()`
lives in `mail/config.ts` beside `resolveMail`, so the branch is covered by
`pnpm test` rather than only by running the image. `parsePublicOrigin` in
`env.ts` validates at load (absolute, `http:`/`https:`, trailing slash
stripped), so `perfectmarkd.example.com` fails at boot instead of producing a
link no browser can open. Verified by starting the API: unset refuses naming
`PUBLIC_ORIGIN`, schemeless refuses from `loadEnv`, and
`PUBLIC_ORIGIN=https://app.test/` boots and listens.

What landed:

- **The token store** (`auth/tokens.ts`): opaque 256-bit tokens, stored only as
  a digest, redeemed by an `UPDATE … WHERE used_at IS NULL AND expires_at > now
  RETURNING` so a link presented twice redeems once, plus the sweep and the
  absolute-link builder. The sweep rides the *issue* path: the table only grows
  when a message goes out, so issuing is when its predecessors are collected —
  no timer, nothing to schedule. Spent and expired rows of every purpose go in
  one statement.
- **Schema** (`db/schema.ts`, migration `0007_light_ultimates.sql`):
  `users.verified_at`, and the one shared `email_tokens` table — purpose,
  `user_id`, payload, expiry, used-at. The payload column is there for
  email/04's new address; verification and reset links carry none.
- **Routes** (`auth/routes.ts`): registration creates the unverified account,
  mails the link, and starts **no** session; `POST /resend-verification` is
  success-shaped for every address; `POST /verify-email` spends the token,
  stamps `verified_at`, and signs the user in; login answers an unverified
  account with `403` + `code: email_unverified`.
- **One send budget for both send endpoints** (`auth/rate-limit.ts`):
  `emailSend: { perAddress, perIp }` — 3 links an hour per address, 10 per IP.
  Registration and the resend draw on the same one, because they are the same
  kind of act, and registration's own per-IP rule (10/min, about account
  creation) is not a mail limit at all. Both numbers are deliberately not "under
  Resend's 100/day" arithmetic: behind a Cloudflare Tunnel (ADR-0010) every
  visitor can arrive under one key, so a per-IP send limit sized for a single
  attacker would rate-limit the whole instance. The per-address key is the sharp
  one and the per-IP key is the coarse brake.
- **Composition** (`index.ts`, `main.ts`): the Mailer and `publicOrigin` are
  both *required* on `createApp`, and `c.var.mailer` is no longer nullable. The
  gate is a property of every composition rather than a per-request check that
  a test could forget — the boot gates exist for exactly this. The cost was
  honest and small: every suite now spreads `testMailComposition()`, and
  `auth/testing.ts` is the shared "be signed in" path (`registerAndVerify`),
  which registers and then follows the emailed link.
- **Web**: `/check-inbox` and `/verify-email` (new routes), the resend
  affordance on the sign-in gate, the upgrade flow's new inbox step (it names
  the address too), and the address kept in `sessionStorage` rather than the URL.

Decisions worth keeping:

- **Re-registration re-sends; it does not re-key.** The row is reused and a
  fresh link goes out behind a response identical to a fresh registration, and
  the existing password hash is left alone. Overwriting it would let anyone who
  knows an unverified address set the password and sign in the moment the owner
  verifies — so a user who re-registers the same address with a different
  password keeps the first one, and the recovery for "I forgot it" is
  email/03's password reset, not this path.
- **The link resolves to a page; the page spends the token.** The token is read
  from the query string and sent over `POST /api/auth/verify-email`, so an inbox
  link scanner that follows every URL it sees cannot consume a user's link. The
  page then takes the token back out of the address bar before spending it: a
  bearer credential does not belong in history or a Referer, and leaving it
  there meant Back re-spent a spent link and told a user who had *just*
  verified that it had expired.
  **The browser found the cost of the first half of that:** React's development
  double-mount ran the effect twice, spent the one-time link twice, and turned
  a successful verification into "That link has expired". A ref guard in
  `VerifyEmailPage` fixes it, with a StrictMode regression test — a component
  test that does not wrap in StrictMode would not have caught it.
- **One answer for every dead link.** Unknown, expired, spent and
  wrong-purpose all return the same `400` + `code: link_invalid`, because the
  recovery is identical and distinguishing them would tell a stranger holding a
  dead link something about the account behind it.
- **The sign-in gate sits behind the password check**, so it is not an
  enumeration oracle: with a wrong password the answer is still the plain 401.
- **Verifying signs the user in.** Following the link is the proof of inbox
  ownership, so nobody has to type the password again.
- **`payload` and the shared table are the ticket's shape, not speculation** —
  email/04 writes its new address through the same store.

**Two things the operator has to do**, unchanged from the ticket's warning:
`~/self-hosted/perfectmarkd/docker-compose.yml` needs the `PUBLIC_ORIGIN`
passthrough (the host runs a copy, not the repo's), and
`~/self-hosted/perfectmarkd/.env` needs
`PUBLIC_ORIGIN=https://perfectmarkd.00022000.xyz`. Until both land the api will
not come back up — which is the gate doing its job.

**And one consequence of the migration to expect on the live instance:** the
column is nullable and nothing backfills it, so every account that exists today
— the Admin among them — is unverified after the deploy and is refused at
sign-in until it follows one link. That is the honest reading of "verified
before the first sign-in" for accounts created before verification existed, and
it is a free end-to-end check of the deployed feature. The way back is the
resend on the sign-in form: correct password → the gate explains itself → send
a new link → verify → sign in. (An Admin who has forgotten the password has no
way back until email/03 lands; on a pre-launch instance that is the Admin, who
can also reset it in the panel as before.)

The Privacy page needed no change: it already said links work once, expire, can
always be re-sent, are stored hashed, and that an address is verified before the
first sign-in. All five are now true.

**A two-axis review ran over the diff before the commit** (standards against
`AGENTS.md` / `DESIGN.md` / `CONTEXT.md` / the ADRs, and spec against this file
and `spec.md`). What it changed: the send budget above (registration was
minding only the per-IP account-creation rule — 10 a minute, and every one of
them a DKIM-signed link), the token scrub above, the copy that claimed a resend
"replaces" the previous link when it does not, the unreachable fallback branch
in `AuthForm` (it would also have wedged the submit button), the duplicated
`hashToken` now shared with `sessions.ts` as `auth/opaque-token.ts`, DESIGN.md
naming the two new auth surfaces, and `PageHeader`'s comment, which had claimed
the dependency the other way round. Nothing it raised was left unaddressed but
one, on purpose: `auth/tokens.test.ts` stays a module-level test, because the
properties it pins — the raw token is nowhere in the database, a token cannot be
spent as another purpose, the sweep collects — are the ones the HTTP seam cannot
see, and the repo tests its stores that way elsewhere.
