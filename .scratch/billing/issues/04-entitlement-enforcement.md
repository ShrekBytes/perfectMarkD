# 04 — Entitlement enforcement + unlock wiring

Status: ready-for-agent
Blocked by: server/04, billing/02

Single source of truth for gates: `GET /api/me` → {plan, expiry, quota, flags}. Apps/web: feature-flag store consumes it; the five gated Inspector controls unlock (🔒 → enabled) for active Pro/Premium; expiry handled (graceful re-lock + clear notice, no data loss — settings persist, just gated again). Server Export dropdown item replaces "coming soon" with quota chip + Premium queue-priority note. Over-quota/expired export attempts → typed error + upgrade prompt. Free logged-out users never gain gates (flags default locked).

**Accepts**: verify → gates open within one `me` refresh; expiry → re-lock; quota chip accurate; logged-out = locked.
