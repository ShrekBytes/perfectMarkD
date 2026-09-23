# 06 — Launch checklist

Status: ready-for-agent
Blocked by: launch/01, launch/04, billing/04

End-to-end pass before announcement: test crypto payment (small real USDT-TRC20 + LTC transaction through Order → Verification → gates open → expiry → re-lock); browser matrix (Chrome/Edge/Firefox/Safari: preview, print, server export); 50 MB + page-cap boundaries; empty/error states; privacy posture verified (no content on disk, no content in logs, third-party request audit — including the Cloudflare edge the Cloudflare Tunnel now puts in the request path, and the Privacy page's copy matching it); AGPL source + license present in repo; docs accurate; admin runbook (verify a payment, reset a password, change a wallet) written in `docs/ops/`. Then: Show HN / Obsidian community / r/Markdown announcement drafts.

**AI prerequisites** (ai-transforms/08; the feature is absent until these are done, so run them before announcement if the launch includes AI Actions):

- [ ] `AI_API_KEY` is set in the deployment's environment (never in the settings table, a tracked file, or a log — ADR-0008); the API is restarted so the worker picks it up. Rotating the key is also a restart.
- [ ] A model is chosen with the per-Action cost arithmetic in mind: the Admin panel's "worst-case cost of one AI Action" is the number to compare against the plan's monthly AI Allowance and its price.
- [ ] The caps are sized to that model's window — context window, output cap, and input cap — with the panel's published numbers from Test connection as the reference; a mismatch is surfaced as a warning, not corrected silently.
- [ ] Test connection has been run to completion against the chosen model, and its published window, output cap, and price have been read (a model the endpoint does not know fails here rather than for the first user).
- [ ] The Privacy page still states what leaves the browser and what is never stored, and the Admin has confirmed the copy against the configured provider.
- [ ] The kill switch is left on (or off, deliberately): with no key or the flag off, no AI surface exists for anyone and no upsell appears.


**Accepts**: checklist document all-green with dates; runbooks committed.

## Comments

- `launch/02` was dropped from the `Blocked by:` line (2026-09-23). It is `wontfix` — superseded by `ai-transforms/02`, which shipped — so under the frontier rule ("a ticket is actionable once every id in its `Blocked by:` line is resolved") it could never clear and this ticket was permanently unreachable. Do not re-add it.
