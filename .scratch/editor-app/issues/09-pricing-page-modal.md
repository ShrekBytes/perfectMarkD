# 09 — /pricing page + pricing modal (Phase-1 inert state)

Status: ready-for-agent
Blocked by: editor-app/01

`/pricing` route (static content in the SPA): three-column plan comparison from PLAN.md §1 table, AGPL note, "payments launching soon" state in Phase 1. Pricing modal (opened from Inspector 🔒 and from Export dropdown's Server Export item): same comparison, compact; CTA in Phase 1 = "Get notified / coming soon" (mailto or nothing — no email infra). Built so Phase 2 swaps the CTA to the real upgrade flow (billing workstream) without redesign. GitHub + license badge links in footer.

**Accepts**: page + modal render from a single shared plan-data module (single source of truth for plan features/prices, later fed by admin settings).
