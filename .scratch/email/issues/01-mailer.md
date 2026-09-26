# 01 — Mailer: Resend client, env config, boot gate

Status: ready-for-agent

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
