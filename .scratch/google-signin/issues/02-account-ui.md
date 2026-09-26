# 02 — Account UI: Google button, set password, sign-in method

Status: ready-for-agent
Blocked by: google-signin/01

The SPA surface: a Google Sign-In button on the sign-in/registration pages,
rendered only when the server advertises the feature (absent, never broken,
when unconfigured), with a clear inline fallback when Google's leg fails
(cancelled consent, network). The Account page gains a "Set password"
section for passwordless accounts and a line showing the sign-in methods the
account has. The Privacy page gets a Google Sign-In section **appended to the
structure email/01 established** — no restructuring of the page; the copy must
hold ADR-0010's scoped claim (a user-initiated redirect to Google is not the
page loading a third-party resource).

**Accepts**: component tests with mocked clients (prior art: the Account page
tests) cover button presence given the server's advertisement, the failure
fallback, and the Account page states.

## Comments
