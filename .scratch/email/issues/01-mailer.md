# 01 — Mailer: Resend client, env config, boot gate

Status: resolved

The foundation ticket: the server gains the ability to send transactional
email, and nothing user-visible changes yet. A Mailer with one send operation
per transactional email is injected at the composition root (alongside the
session secret and the clock); production wires a Resend HTTP API client
configured from environment variables (API key, from-address). The API
refuses to boot without the mail configuration — same pattern as the history
encryption key. Local development may select a console-capturing Mailer (links
printed to the server log) only through an explicit `MAIL_MODE=console`
environment variable: boot still refuses when the Resend configuration is
absent and the variable is not set, so silent absence never boots and the dev
escape cannot double as an accidental kill switch (ADR-0013 rejects a
switchable-off mailer). Tests never use this escape — fakes are injected at
the composition root. The
sending domain (`perfectmarkd.00022000.xyz`) is verified in Resend with
DKIM/SPF records at the DNS host. This ticket **owns the Privacy page
rewrite** for the email feature set (ADR-0013), holding ADR-0010's two
constraints intact: no hosting topology or transport is named, and the page's
existing no-third-party-loads claim keeps its precise scope. Later tickets
append sections to this structure rather than restructuring the page.

**Accepts**: `pnpm test` covers the Resend client's error mapping with
stubbed fetch (implementation detail behind the seam — nothing else tests it);
typecheck and lint green; boot-gate test proves refusal without configuration.

## Comments

Implemented (uncommitted at the time of writing). `pnpm lint`, `pnpm typecheck`,
`pnpm format:check` and `pnpm test` (1,611 tests, +19) are green, and the boot
gate was checked by running the API four ways: no mail configuration refuses
with the `RESEND_API_KEY` message, a key without `MAIL_FROM` refuses naming
`MAIL_FROM`, `MAIL_MODE=off` refuses the same way (no kill switch), and
`MAIL_MODE=console` boots and listens. The Privacy page was verified in a real
browser (Chromium, Vite dev server): the new Email section renders in the Light
Table like its neighbours, no console errors.

What landed:

- **The seam** (`apps/server/src/mail/mailer.ts`): one send operation per
  transactional email — `sendVerification`, `sendPasswordReset`,
  `sendEmailChangedNotice` — each taking an address and, where the message
  carries one, an absolute one-time link. There is no operation that takes free
  text, so no route can mail Document content whatever it means to (ADR-0013).
  `MailerError` is the one failure shape (`transport` / `timeout` / `http` /
  `invalid_response`), and no message in it names the provider.
- **The Resend client** (`mail/resend.ts`): one POST per email, key in the
  header only, four-field plain-text body, 10s deadline. `messages.ts` owns the
  copy (subject + plain-text body per email, no HTML part) so both clients share
  it and the "a link and a sentence or two" promise lives in one file.
- **The console mailer** (`mail/console.ts`) and the resolver + boot gate
  (`mail/config.ts`): `resolveMail` throws when the provider configuration is
  absent unless `MAIL_MODE=console` is set by name; any other value is not a
  mode, so the gate stays shut. `main.ts` calls it beside the other two gates
  and hands the Mailer to `createApp`, which puts it on `c.var.mailer`.
- **Env** (`env.ts`): `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_MODE`. Compose
  forwards all three with empty defaults — it cannot mark the first two required
  the way it marks the secrets, because the console escape boots without them.
- **Privacy page**: a new Email section (what a message carries, when it is sent,
  the hashed one-time link, and that there is no switch), and the no-third-party
  claim back to its one page-load exception. Tests pin both, including that the
  claim does *not* list email as a page-load exception.

Deliberate decisions and deferrals:

- **`c.var.mailer` has no reader yet.** Nothing in this ticket sends a message;
  the AppEnv variable is the mechanism email/02's routes read, and it is how
  `c.var.db` already works. If it turns out email/02 wants the Mailer passed
  into a route factory instead (as the AI seam does), that ticket moves it.
- **The Resend wire is deliberately unpinned.** The spec asks for "narrow
  stubbed-fetch tests for error mapping only", so `resend.test.ts` covers only
  the failure mapping (plus one accepted send). The privacy guarantee that a
  message carries an address and a link is enforced by the seam's types rather
  than by a test that would fail on a legitimate refactor.
- **The transport boilerplate duplicates `ai/provider.ts` on purpose.** The two
  clients are independent seams with different error vocabularies and different
  response readers; the shared shape would need five knobs and would couple the
  mail feature to the AI one. Left as two ~50-line bodies.
- **Copy speaks in verification, not confirmation** (`CONTEXT.md` lists
  "confirmation" and "confirmed email" as avoid words).
- **Docs the boot gate invalidated were updated too**: `.env.example`,
  `docker-compose.yml`, `PRODUCTION.md`, `README.md`, `AGENTS.md`, and the
  restore runbook (its placeholder bootstrap now sets `MAIL_MODE=console`, since
  compose starting is not enough any more — the api refuses to boot).
- `MAIL_FROM` ships blank in `.env.example`, like every other operator-supplied
  value: a pre-filled domain of ours would let a Self-Hosted Instance boot
  happily and then fail every send at the provider.

**What is left is the human step** (hence the label): create the Resend account,
add the sending domain `perfectmarkd.00022000.xyz` with its DKIM/SPF records at
the DNS host, create an API key, and paste `RESEND_API_KEY` + `MAIL_FROM` into
`.env`. Resend only delivers to your own address until the domain is verified,
so that is also what gates a real end-to-end email check — the code path is
verified here with `MAIL_MODE=console` and the stubbed-fetch tests. Use the
`wizard` skill for the dashboard steps.

## Answer

The human step is done and the ticket is closed. Verified against the running
instance on 2026-09-27, not just against the local checkout:

- **The deployed artifact is this code.** The self-host runs
  `ghcr.io/shrekbytes/perfectmarkd-api:latest`, and `/healthz` reports
  `commit a0f81c4` — the commit after `b6a3836` — with
  `/app/dist/mail/resend.js` present in the image.
- **The boot gate, on the deployed image, four ways.** No mail configuration
  refuses with the `RESEND_API_KEY` message; `RESEND_API_KEY` without
  `MAIL_FROM` refuses naming `MAIL_FROM`; `MAIL_MODE=off` refuses the same way
  (still no kill switch); `MAIL_MODE=console` passes the gate. The instance's
  own `.env` supplies a key and a from-address, and the API boots.
- **A real send through the app's own client**, run inside the api container
  against its own environment: `sendVerification` from
  `PerfectMarkD <hello@perfectmarkd.00022000.xyz>` was accepted in ~1s, and the
  operator confirms the message arrived. That is the end-to-end check this
  ticket was waiting on.
- **DNS is Resend's verified pattern**: DKIM at
  `resend._domainkey.perfectmarkd.00022000.xyz`, SPF and MX on
  `send.perfectmarkd.00022000.xyz` → `send.forge.rmta.net`.
- **The Privacy page** was re-checked in a real browser on the live host: the
  Email section renders in the Light Table, no console or page errors.
- The API key is a **send-only** (restricted) Resend key, so the domain cannot
  be read back through the API — least privilege, and the reason "verified" is
  established above by a send rather than a query.

Two things this ticket leaves for the next one:

- **No public-origin variable exists**, so the caller that builds the absolute
  one-time link has nothing to build it from. `EXPORT_ORIGIN` is not a
  substitute — on this instance it is `http://caddy`, the loopback origin the
  export worker loads `/export` from, which would put a dead link in a real
  inbox. email/02 settles this before it writes a route that sends.
- The Privacy copy already promises an address is "verified once before the
  first sign-in". That promise is email/02's to keep.

No `map.md` exists for this effort, so there is no Decisions-so-far to append
to; the `Blocked by:` line on email/02 is what this resolution unblocks.
