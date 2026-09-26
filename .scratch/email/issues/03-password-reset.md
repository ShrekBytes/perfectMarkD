# 03 — Password Reset: request, link, set

Status: ready-for-agent
Blocked by: email/02

From the sign-in page: request a reset link (success-shaped for every
address — registered or not, the response is identical). The link (30-minute
single-use token) opens a set-new-password page; success stores the new
argon2id hash — creating one for accounts without any — and revokes all of the
account's sessions. Works for every account kind, including ones with no
password (the recovery path Google-registered users will rely on). A request
from an unverified account sends the verification link instead, so the flows
repair each other instead of dead-ending.

**Accepts**: server tests through the HTTP seam cover the success-shaped
request, the unverified-account branch, set + session revocation, and
single-use/expiry; component tests cover the request form, the set form, and
the expired-link state.

## Comments
