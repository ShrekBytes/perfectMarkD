# 04 — Production deploy (VPS, TLS, monitoring)

Status: ready-for-agent
Blocked by: server/06, launch/03

Provision VPS (Hetzner, 2–4 vCPU / 4–8 GB), Docker Compose up (caddy + api + umami), Caddy automatic TLS with the domain, Cloudflare DNS (proxy off for Caddy's own TLS, or full strict with origin certs). Playwright deps baked into the api image (`npx playwright install --with-deps chromium`). Basic monitoring: Uptime Kuma (or healthchecks.io ping) + disk/memory alerts. Log rotation. Restart policy + SQLite WAL checkpoint job.

**Accepts**: https://domain serves the app; export works end-to-end from production; alerts fire on a stopped container (tested).

## Comments

- From server/06: the shipped Caddyfile provisions TLS via ACME HTTP-01 automatically once `SITE_ADDRESS=<domain>` — that works with Cloudflare DNS as long as the record is **proxy off** (grey cloud). If you choose full-strict with Cloudflare **origin certs** instead (or want DNS-01 / a wildcard), the Caddyfile's site block needs a `tls` directive added — `SITE_ADDRESS` alone won't do it. ~~Also remember to bake Chromium into the api image here (`npx playwright install --with-deps chromium`) — server/06 deliberately skipped it; exports fail per-job until this ticket adds it.~~
- **Chromium is done** (commit 59fd5b3): headless Chromium baked into the api image (`playwright install --with-deps --only-shell chromium`, browsers at `/ms-playwright`) — pulled forward from this ticket at the user's call so local testing is production parity for every feature. Verified in the local compose stack: a Premium job rendered a 2-page PDF through the baked browser (`status: done`, auto-stored in Export History). This ticket keeps only the VPS-side work: provision, security group, domain + TLS, monitoring, log rotation, restart policy.
- **Hosting decision (user, 2026-09-13)**: launch will target an **AWS EC2 box paid by GitHub Student credits** (5–6 months of runway), then migrate to a €4–5/mo box (Hetzner or similar) when credits end — the launch/03 backup/restore flow is the migration path. Shape: **t4g.micro (ARM Graviton, 2 GB)** — ARM images confirmed working under local rootless podman (the stack builds and runs multi-arch); add a swapfile (micro instances ship none) and consider `EXPORT_CONCURRENCY=1` there — Chromium renders are the memory spikes. AWS specifics to handle in this ticket: security group opening 80/443 (SSH to your IP only), Elastic IP or Cloudflare DDNS (public IP changes on stop/start; Elastic IP is free while attached to a *running* instance), and the free-tier-compatible backup remote (Cloudflare R2 / Backblaze B2) for `ops/backup.sh`.
