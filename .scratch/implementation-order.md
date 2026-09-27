# Implementation order — email + Google Sign-In

Reference for working through `.scratch/email/` and `.scratch/google-signin/`.
The `Blocked by` lines on the tickets encode the same order; strictly
sequential, one ticket per session, keeps each diff reviewable. Specs:
`.scratch/email/spec.md` and `.scratch/google-signin/spec.md`.

| # | Ticket | Agent can do | Needs you | Interaction level |
|---|--------|--------------|-----------|-------------------|
| 1 | `email/01` Mailer | Everything code-side: Mailer seam, Resend client, boot gate, `MAIL_MODE=console`, tests, Privacy-page copy, `.env.example` update | Create Resend account, add DKIM/SPF records at Cloudflare, create API key + sender address, paste into `.env` | **Moderate, one-time** — only needed to verify against the real provider; the agent can finish and test the whole ticket with the fake Mailer first. Resend only sends to your own address until the domain is verified, so DNS setup gates real smoke-testing |
| 2 | `email/02` Verification | All of it: token table, sign-in gate, re-registration, SPA pages, tests | Nothing. Optional: receive one real email to confirm deliverability | **None** |
| 3 | `email/03` Password reset | All of it | Nothing (same optional inbox check) | **None** |
| 4 | `email/04` Email change | All of it | Nothing | **None** |
| 5 | `email/05` Admin reset | All of it | Nothing | **None** |
| 6 | `google-signin/01` OAuth flow | All of it: routes, identities table, auto-link, bootstrap, tests with the fake exchange | Google Cloud Console: create project + OAuth consent screen + OAuth Client, register both redirect URIs, paste client id/secret into `.env` | **Moderate, one-time** — needed only for real-browser verification; the agent builds and fully tests with fakes without it |
| 7 | `google-signin/01b` Account support | All of it: the sign-in-methods block on `/api/me`, the first-password write, the `user_id` index, server tests | Nothing | **None** |
| 8 | `google-signin/02` Account UI | All of it (button is env-gated; component tests with mocks) | Nothing | **None** |

## Notes

- **Frontier rule:** once `email/01` lands, `google-signin/01` is unblocked, so
  sessions 2 and 6 can swap or interleave — sequential as numbered is simplest.
- **01b exists** because both Account-page states the Google spec asks for
  (a passwordless account's "Set password" section, the sign-in-method line) are
  *server* facts: `/api/me` has to report them and something has to write the
  first password. Split out so the SPA ticket renders a contract that already
  exists.
- **The two human steps share a pattern:** the agent implements and tests
  everything with injected fakes, then hands over a short checklist (DNS
  records, console clicks, two env vars). Ask for the `wizard` skill at that
  point — it walks you through the dashboard steps.
- **Total human time:** roughly 30–45 minutes, all up front in tickets 1 and 6.

*(Written 2026-09-27, after the specs and review fixes landed in commit
`746630d`.)*
