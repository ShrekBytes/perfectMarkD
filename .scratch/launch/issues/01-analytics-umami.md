# 01 — Self-hosted Umami analytics

Status: ready-for-agent
Blocked by: server/06

Add `umami` (+ its DB) to Compose behind Caddy at `/analytics`-subdomain. Anonymous events only: page views, Client Export click, Server Export click, upgrade modal open, plan select. No cookies beyond the app session, no IP storage (Umami configured to hash/anonymize), no personal data — per PLAN §1 posture. Event wiring via a tiny wrapper (no global `data-` sprawl). Admin dashboard access restricted to the Admin.

**Accepts**: events flow and are visible in Umami; page loads make no third-party requests; posture doc updated.
