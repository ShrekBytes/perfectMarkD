# 03 — Server Export pipeline (Playwright worker)

Status: ready-for-agent
Blocked by: server/01, editor-app/06

`POST /api/export` (auth): validate payload ≤ 50 MB + page caps by plan → enqueue job (SQLite queue table; payload held in memory of the API process). Implement a **stub plan guard** here (reject anything without an active entitlement) — billing/04 replaces it with real entitlement checks and quota enforcement, so this ticket does not wait on billing. In-process worker (concurrency 2, configurable): launch Playwright Chromium → load `<origin>/export` route → inject document + settings + assets (postMessage from the route's bootstrap; assets as data: URIs) → run the same engine pipeline → `Page.pdf()` (preferCSSPageSize for custom sizes) → `injectPDFOutline` → stream PDF back → delete payload. Premium jobs jump the queue; burst limiter (max N concurrent/minute per user). Errors surface as typed job failures. `/export` route: no chrome, `noindex`, renders via the exact Client Export document builder.

**Accepts**: end-to-end export returns a PDF whose text/pages match the Paper Canvas; quota decrement; payload deleted (test asserts); queue visible in DB.
