# 04 — Quota accounting + usage endpoint

Status: claimed
Blocked by: server/03

Monthly usage per user (`export_usage` keyed by YYYY-MM, lazy reset on first use), plan quota lookup (300/1000) from settings, `GET /api/me` returning {plan, expires_at, quota: {used, limit}, is_admin}. Apps/web top bar shows the quota chip for logged-in paid users; over-quota exports rejected with typed error → upgrade prompt. Burst accounting separate from monthly quota.

**Accepts**: usage increments only on successful export; resets on period change; chip displays correctly; over-quota → 402-style typed error.
