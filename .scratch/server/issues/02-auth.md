# 02 — Accounts: email + password (no verification)

Status: ready-for-agent
Blocked by: server/01

Register (email+password, argon2), login, logout, session cookie (httpOnly, SameSite=Lax, 30d rolling), change password. No email verification, no email sending — password reset is manual via admin (billing/03) per PLAN. Login/register pages in apps/web (minimal, match design language) — free users never see them except from the upgrade flow. Rate-limit auth endpoints. First registered user becomes admin if `ADMIN_EMAIL` matches (bootstrap).

**Accepts**: register/login/logout/round-trips; sessions persist; rate limits trigger; admin bootstrap works.
