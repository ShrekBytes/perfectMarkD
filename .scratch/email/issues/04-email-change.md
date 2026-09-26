# 04 — Email change on the Account page

Status: ready-for-agent
Blocked by: email/02

Self-service email change (new capability — nothing exists today): on the
Account page, confirm current password → submit new address → a token whose
payload is the new address is mailed there → clicking the link atomically
swaps and verifies. Uniqueness of the new address is checked at swap time; the
old address receives a courtesy notice. The password confirmation is what
keeps a stolen session from silently redirecting the account.

**Accepts**: server tests through the HTTP seam cover the password check, the
swap-on-click (including a collision at swap time), and the courtesy notice;
component tests cover the Account page section (prior art: the Account page
tests).

## Comments
