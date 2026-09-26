# 05 — Admin reset: send links, change a user's email

Status: ready-for-agent
Blocked by: email/03

The admin panel's user view replaces the temporary-password display (which
exists today only because no mailer did) with "send reset link" — the Admin
never sees or sets a password again. The panel also gains the dead-mailbox
escape hatch: change a user's account email directly (same swap-on-link-click
mechanics as email/04, without the password confirmation — the Admin is the
operator). Admin routes keep their existing admin-session gate.

**Accepts**: server tests through the HTTP seam (prior art: the admin route
tests) cover the reset-link send and the admin email change; component tests
cover the panel's new controls.

## Comments
