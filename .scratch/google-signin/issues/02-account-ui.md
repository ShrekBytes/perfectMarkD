# 02 — Account UI: Google button, set password, sign-in method

Status: ready-for-agent
Blocked by: google-signin/01, google-signin/01b

The SPA surface: a Google Sign-In button on the sign-in/registration pages,
rendered only when the server advertises the feature (absent, never broken,
when unconfigured), with a clear inline fallback when Google's leg fails
(cancelled consent, network). The Account page renders the two states 01b makes
readable — a "Set password" section for an account with no password of its own,
and a line showing the account's sign-in methods — off the sign-in-methods
block, and shows the ordinary Change Password form when the account has a
password. The Privacy page gets a Google Sign-In section **appended to the
structure email/01 established** — no restructuring of the page; the copy must
hold ADR-0010's scoped claim (a user-initiated redirect to Google is not the
page loading a third-party resource).

**Accepts**: component tests with mocked clients (prior art: the Account page
tests) cover button presence given the server's advertisement, the failure
fallback, and the Account page states.

## Comments

- Nothing here needs Google credentials: the button is a plain link to the start
  endpoint, its visibility reads the server's advertisement, and the fallback
  reads the code the callback redirected with. Only the real round trip through
  Google's consent screen does, and the spec already rules that out of CI.
