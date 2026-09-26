# 02 — Email Verification: token infra, sign-in gate

Status: ready-for-agent
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
