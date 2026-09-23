# 06 — Launch checklist

Status: ready-for-agent
Blocked by: launch/01, launch/04, billing/04

End-to-end pass before announcement: test crypto payment (small real USDT-TRC20 + LTC transaction through Order → Verification → gates open → expiry → re-lock); browser matrix (Chrome/Edge/Firefox/Safari: preview, print, server export); 50 MB + page-cap boundaries; empty/error states; privacy posture verified (no content on disk, no content in logs, third-party request audit — including the Cloudflare edge the Cloudflare Tunnel now puts in the request path, and the Privacy page's copy matching it); AGPL source + license present in repo; docs accurate; admin runbook (verify a payment, reset a password, change a wallet) written in `docs/ops/`. Then: Show HN / Obsidian community / r/Markdown announcement drafts.

**Accepts**: checklist document all-green with dates; runbooks committed.

## Comments

- `launch/02` was dropped from the `Blocked by:` line (2026-09-23). It is `wontfix` — superseded by `ai-transforms/02`, which shipped — so under the frontier rule ("a ticket is actionable once every id in its `Blocked by:` line is resolved") it could never clear and this ticket was permanently unreachable. Do not re-add it.
