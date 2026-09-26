# Email: verification, password reset, account email

Status: ready-for-agent

## Problem Statement

The product's sign-in story is incomplete in a way users feel immediately. A
user who forgets their password has no self-service recovery: their only path
is asking the Admin for a temporary password. A user who typos their email at
registration creates an account no one can ever prove they own. And nothing
about an account's email is ever checked, so the Manual Payment flow (ADR-0005)
hands Entitlements to addresses that may not even exist — if the Admin ever
needs to contact the payer, there is no guarantee the inbox is real. All of
this stems from one missing piece: the server has no way to send email.

## Solution

The server gains a mailer (Resend's HTTP API, per ADR-0013), and on top of it:

- **Email Verification** — registration emails a one-time link; sign-in is
  blocked until the link is followed (Verified Email).
- **Password Reset** — a one-time emailed link sets a new password without
  signing in, revoking all existing sessions. Also the recovery path for
  accounts signed in with Google.
- **Email change** — self-service, on the Account page, verified the same way.
- **Admin reset** — the admin panel sends reset links instead of showing
  one-time temporary passwords, and can change an account's email when a
  mailbox has died.

Google Sign-In is a separate feature with its own spec (`google-signin/spec.md`);
it builds on the Verified Email semantics established here.

## User Stories

1. As a new user, I want a verification email sent when I register, so that I can prove the address is mine.
2. As a new user, I want a clear "check your inbox" page showing the address I used, so that I know what to do next and which inbox to open.
3. As a user who has not verified yet, I want sign-in to tell me my email is not verified (with a resend), so that I understand why I cannot get in instead of seeing a generic failure.
4. As a user whose verification link expired, I want the page to offer a fresh link, so that I am not stuck with a dead email.
5. As a user who lost my verification email, I want to request a resend, so that a spam filter or mis-delivery does not lock me out of my account.
6. As a user who typo'd my email at registration, I want to re-register the correct address even though the typo'd unverified account exists, so that my mistake does not poison the address I meant to use.
7. As a user trying to register an email that already belongs to an unverified account, I want the response to look the same as a fresh registration, so that nobody can learn whether an address is registered from the sign-up form.
8. As a user trying to register an email that belongs to a verified account, I want the existing duplicate-email rejection, so that my account cannot be hijacked through the sign-up form.
9. As a user who forgot my password, I want to request a reset link from the sign-in page, so that I can get back in without contacting anyone.
10. As a visitor who requests a reset for an address that is not registered, I want the same "check your inbox" response as everyone else, so that the form cannot be used to discover who has an account.
11. As a user with a valid reset link, I want a page that sets a new password, so that I regain access with credentials only I know.
12. As a user whose password was just reset, I want all other signed-in sessions ended, so that a stolen session cannot survive the recovery.
13. As a user who forgot whether I signed up with a password or with Google, I want the reset flow to work for me either way, so that there is exactly one recovery path to remember.
14. As a user with an unverified account who requests a password reset, I want the email to bring me to verification instead, so that the two flows repair each other instead of dead-ending.
15. As a signed-in user, I want to change my account's email from the Account page, so that I can move to a new address before the old one dies.
16. As a signed-in user changing my email, I want to confirm my current password first, so that a stolen session cannot silently redirect my account.
17. As a signed-in user changing my email, I want the change to happen only after I follow the link sent to the new address, so that a typo can never lock me out of my own account.
18. As a user whose email was changed away from, I want a notice at my old address, so that a hijacker cannot silently cut me off.
19. As a user, I want emails from a sender on the product's own domain, so that I recognize them and my provider trusts them.
20. As a user, I want emails that contain nothing but the link and a sentence or two, so that no part of any Document I write is ever exposed (ADR-0013).
21. As the Admin, I want to send a password reset link to a user from the admin panel, so that I no longer see or set anyone's password.
22. As the Admin, I want to change a user's account email from the admin panel, so that I can rescue a user whose mailbox died.
23. As the operator, I want the API to refuse to boot when mail sending is not configured, so that I never ship a deployment where users silently cannot sign in or recover.
24. As the operator, I want per-IP and per-address rate limits on every endpoint that triggers an email, so that hammering cannot exhaust the mail provider's daily cap or turn the product into a spam cannon.
25. As a Self-Hosted Instance operator, I want the mailer configured entirely through environment variables, so that my instance sends from my own domain and my own provider account.
26. As a user reading the Privacy page, I want it to say exactly what email sending shares (an address and a one-time link, nothing else), so that the disclosure is honest per ADR-0013.
27. As a user on the Free Tier, I want registration and Client Export to keep working exactly as before once my email is verified, so that verification adds one step and changes nothing else.

## Implementation Decisions

- **Mailer seam at the composition root.** App creation gains one new
  collaborator: a Mailer with a send operation per transactional email
  (verification, reset, email-change notice). Production wires a Resend HTTP
  API client; tests wire a fake that records sends. Configuration comes from
  environment variables: the Resend API key and the from-address. Following
  the AI provider precedent, the API key belongs to the deployment, not to any
  setting (ADR-0013).
- **Boot gate.** The API refuses to boot without the mail configuration — the
  same pattern as the history encryption key. Local development may select a
  console-capturing Mailer (links printed to the server log) only through an
  explicit environment variable; silent absence never boots, so the dev escape
  cannot double as an accidental kill switch (ADR-0013 rejects a
  switchable-off mailer). Tests never use the escape — fakes are injected at
  the composition root.
- **One-time tokens.** Links carry opaque random tokens (256-bit), stored
  hashed, single-use, expiring (verification 24h, reset 30 minutes). One table
  covers all purposes: purpose, hashed token, target user, optional payload
  (the new email for a change), expiry, used-at. Expired/used rows are swept
  opportunistically. Links resolve to SPA pages that complete the flow over
  the API.
- **Verified Email state.** The users table gains a verified-at timestamp.
  Sign-in rejects unverified accounts with a distinct, resend-offering
  response. Registration creates unverified accounts; the reset flow (below)
  and Google Sign-In are the only other writers of verified-at.
- **Re-registering an unverified address** reuses the existing row and sends a
  fresh verification link, with a success-shaped response identical to fresh
  registration. Registration against a verified address keeps the existing
  duplicate rejection (409).
- **Password reset request** is success-shaped for every address. For a
  verified account it sends a reset link; for an unverified account it sends a
  verification link (story 14). Following a reset link shows the new-password
  form; success sets the password hash (creating one for accounts without any)
  and revokes all of the account's sessions.
- **Email change** requires the current password, stores a token whose payload
  is the new email, and swaps + verifies on link click. Uniqueness of the new
  address is checked at swap time; the old address receives a courtesy notice.
- **Admin panel** replaces the temporary-password display with "send reset
  link", and gains an admin email change (no password confirmation — the
  Admin is already authenticated as the operator; the same swap-on-link-click
  mechanics apply).
- **Rate limits** use the existing fixed-window limiter on both send
  endpoints, keyed per IP and per address, sized comfortably under the mail
  provider's free-tier daily cap.
- **Deliverability setup** is part of the ticket, not an afterthought: the
  sending domain is verified in Resend with DKIM/SPF records added at the DNS
  host.
- **Privacy copy** on the Privacy page states what leaves the browser and
  when, per ADR-0013: email addresses and one-time links go to the mail
  provider; Document content never does. The mailer ticket owns the page
  rewrite and holds ADR-0010's constraints (no hosting topology named; the
  no-third-party-loads claim keeps its scope); later features append sections
  to the structure it establishes.
- No changes to Quota, Orders, Verification (the on-chain kind), Entitlements,
  or either export path (ADR-0002/0003). Verification gating sign-in means
  every paying user is reachable at a proven address by construction.

## Testing Decisions

- The spec adds exactly **one new seam**: the Mailer at the composition root
  (approved). Everything else is tested through existing seams.
- Server behavior is tested through the existing in-process HTTP seam: create
  the app with a recording fake Mailer and drive real requests (prior art:
  the auth route tests). Assertions cover status codes, user-visible response
  shapes (success-shaped vs. revealing), database-visible state (verified-at,
  session revocation, token single-use), and the emails the fake recorded —
  never internal call ordering.
- New SPA pages (check-your-inbox, verification landing, reset forms, Account
  email-change section) are covered by component tests with mocked clients
  (prior art: the Account page tests), asserting what renders per state.
- The Resend client gets narrow stubbed-fetch tests for error mapping only; it
  is an implementation detail behind the Mailer seam.
- No new e2e suite and no new browser seam: auth flows are exercised at the
  server seam where the fakes live; the existing e2e suites stay untouched.
- A good test asserts external behavior (what a user or attacker can observe:
  responses, emails, access), not implementation details.

## Out of Scope

- Google Sign-In — separate spec (`google-signin/spec.md`); this spec only
  establishes Verified Email semantics it builds on.
- Bounce/complaint handling and deliverability monitoring — links in emails
  are the product; mailbox diagnostics are not.
- Marketing or transactional email beyond the four flows named here.
- Two-factor authentication, passkeys, and session-device management.
- Any change to billing, Quota, Export History, or the export pipeline.

## Further Notes

- ADR-0013 records the privacy-posture decision this feature forces: Document
  content never leaves the browser; addresses and one-time links go to Resend.
- New glossary terms live in `CONTEXT.md`: Email Verification, Verified Email,
  Password Reset (also the recovery path for Google-only accounts).
- Tickets are ordered so each stands on the previous; the mailer ticket
  unblocks everything else. Commit scope: `email/NN`.
