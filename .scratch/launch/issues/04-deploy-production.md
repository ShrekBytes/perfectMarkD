# 04 — Deploy on the Admin's machine behind a Cloudflare Tunnel

Status: ready-for-agent
Blocked by: server/06, launch/03

Serve the Compose stack (caddy + api + umami) from the **Admin's own machine**,
published at the real domain through a **Cloudflare Tunnel**. Nothing in the
application changes: Caddy keeps serving plain HTTP on `:80` inside the compose
network and the tunnel publishes that origin; TLS terminates at Cloudflare's
edge, so Caddy's automatic ACME TLS is unused in this deployment. The Admin
connects and configures the tunnel and DNS themselves — **tunnel setup is not
part of this ticket**, and an agent should not write instructions for it.

Remaining work on the host machine:

- Stack up via Compose with `SITE_ADDRESS=:80`, the domain reachable through the tunnel.
- Confirm Server Export works from the public origin — the worker loads the SPA's `/export` page over the compose loopback (`EXPORT_ORIGIN=http://caddy`, already the shipped default), not the public URL, so this is a verify-on-the-real-host step rather than a change.
- Monitoring: Uptime Kuma (or healthchecks.io) against the public URL, plus disk/memory alerts on the host. Log rotation. Restart policy + SQLite WAL checkpoint job.
- Backups: the launch/03 nightly systemd timer running on this machine against a real remote (Cloudflare R2 / Backblaze B2 free tier), not the rehearsal's local path.
- Host realities a VPS would have handled for you: disable sleep so the machine stays awake, confirm the Docker service itself starts on boot (the Compose services are already `restart: unless-stopped`, but that does not start the daemon), and confirm the stack comes back unattended after a reboot.

**Accepts**: `https://<domain>` serves the app from the Admin's machine; Client Export and Server Export both complete end-to-end from the public URL; alerts fire when a container is stopped (tested); a reboot brings the stack back with no intervention.

## Comments

- **Hosting decision (user, 2026-09-23)** — supersedes the 2026-09-13 AWS note below: launch runs on the Admin's own machine, published by a Cloudflare Tunnel at the real domain (ADR-0010). Why: no server rent before there is revenue; the machine is already the dev/prod-parity environment (Chromium, the Compose stack, and rootless podman all verified there); and an outbound tunnel needs no port forwarding, no static IP, and no inbound firewall rules, so the home IP is never exposed. Trade-offs accepted: the service is up only while the machine is up, home upload bandwidth caps Server Export throughput, and all user traffic passes through Cloudflare's edge — a third party in the path that the app itself makes no requests to, which the Privacy page should state plainly rather than leave implied by the "no third-party analytics" line. The VPS move is deferred, not rejected; see ADR-0010 for the revisit triggers.
- **VPS path, deferred**: the AWS EC2 t4g.micro paid by GitHub Student credits (ARM Graviton, 2 GB, swapfile, `EXPORT_CONCURRENCY=1`) remains a viable box when the move happens, alongside a €4–5/mo Hetzner instance. launch/03's backup/restore flow is the migration path in either case — a clean-machine restore onto the new host.
- **Chromium is done** (commit 59fd5b3): headless Chromium baked into the api image (`playwright install --with-deps --only-shell chromium`, browsers at `/ms-playwright`) — pulled forward from this ticket at the user's call so local testing is production parity for every feature. Verified in the local compose stack: a Premium job rendered a 2-page PDF through the baked browser (`status: done`, auto-stored in Export History). This ticket keeps only the host-side work: stack up, tunnel-fronted domain, monitoring, log rotation, restart policy, backups remote.
- From server/06: the shipped Caddyfile's automatic ACME TLS path (`SITE_ADDRESS=<domain>` with the Cloudflare DNS record proxy-off) is **not used in this deployment** — the tunnel terminates TLS and Caddy stays on plain `:80`. That path stays documented in the Caddyfile for a directly-exposed host, so a future VPS move can use it unchanged.
