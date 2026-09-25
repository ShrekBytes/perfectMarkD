# 06 — Launch checklist

Status: ready-for-agent
Blocked by: launch/01, billing/04

**Precondition, not a tracked blocker:** the stack is live at the real domain. The verification half below — the crypto transaction, the browser matrix, the third-party request audit — runs against a deployed instance. That deployment is host work on the Admin's own machine rather than a project task, so it is not a ticket; it is recorded in [ADR-0010](../../docs/adr/0010-deploy-on-own-machine-behind-cloudflare-tunnel.md) and the README's Deployment section. The two repo-side deliverables below — the admin runbook and the Privacy page's Cloudflare-edge disclosure — need no deployment and are actionable now.

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
- `launch/04` was deleted and dropped from the `Blocked by:` line (2026-09-26). Every project-side thing it produced has shipped: the compose runtime-knob pass-through (`docker-compose.yml`), the hosting decision (ADR-0010), and the deployment contract (README Deployment, `docs/ops/restore.md`, the user-scoped backup unit). What remained was host configuration on one person's machine — the boot mechanism, disabling sleep, the Cloudflare tunnel and DNS, the reboot proof — which the ticket's own body called out as outside the application and outside an agent's remit. That is the operator's business, not a project task, so it no longer belongs in this tracker.
  The dependency itself is real and is now a **precondition in the body** rather than a tracked edge: a deleted ticket would leave `Blocked by:` pointing at nothing, which is the same permanent-unreachable trap as `launch/02` above. The reusable findings from that investigation were kept — see [`docs/ops/hosting.md`](../../../docs/ops/hosting.md).
