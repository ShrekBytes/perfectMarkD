# 04 — Production deploy (VPS, TLS, monitoring)

Status: ready-for-agent
Blocked by: server/06, launch/03

Provision VPS (Hetzner, 2–4 vCPU / 4–8 GB), Docker Compose up (caddy + api + umami), Caddy automatic TLS with the domain, Cloudflare DNS (proxy off for Caddy's own TLS, or full strict with origin certs). Playwright deps baked into the api image (`npx playwright install --with-deps chromium`). Basic monitoring: Uptime Kuma (or healthchecks.io ping) + disk/memory alerts. Log rotation. Restart policy + SQLite WAL checkpoint job.

**Accepts**: https://domain serves the app; export works end-to-end from production; alerts fire on a stopped container (tested).
