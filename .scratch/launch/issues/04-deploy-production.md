# 04 — Deploy on the Admin's machine behind a Cloudflare Tunnel

Status: ready-for-agent
Blocked by: server/06, launch/03, launch/10

Serve the Compose stack (caddy + api + umami) from the **Admin's own machine**,
published at the real domain through a **Cloudflare Tunnel**. Nothing in the
application changes: Caddy keeps serving plain HTTP on `:80` inside the compose
network and the tunnel publishes that origin; TLS terminates at Cloudflare's
edge, so Caddy's automatic ACME TLS is unused in this deployment. The Admin
connects and configures the tunnel and DNS themselves — **tunnel setup is not
part of this ticket**, and an agent should not write instructions for it.

Remaining work on the host machine:

- Check the repo out at `~/self-hosted/perfectmarkd` and bring the stack up by **pulling** the published images (launch/10) — `podman compose pull && podman compose up -d --no-build` — with `SITE_ADDRESS=:80` and the domain reachable through the tunnel. Nothing is built on this machine.
- Confirm Server Export works from the public origin — the worker loads the SPA's `/export` page over the compose loopback (`EXPORT_ORIGIN=http://caddy`, already the shipped default), not the public URL, so this is a verify-on-the-real-host step rather than a change.
- Log rotation, restart policy, and the SQLite WAL checkpoint job. **No uptime monitoring** (decision, 2026-09-26): no Uptime Kuma, no healthchecks.io, no alert channel — the stack is expected to be looked at, not paged about.
- Backups: install the launch/03 timer as a **user** unit and leave it governed by `BACKUP_ENABLED` (launch/12). No remote for now — local-only is the accepted state, and it must not be forced.
- Host realities a VPS would have handled for you: disable sleep so the machine stays awake, confirm the Docker service itself starts on boot (the Compose services are already `restart: unless-stopped`, but that does not start the daemon), and confirm the stack comes back unattended after a reboot.
- Runtime knobs the compose file does not forward: `EXPORT_CONCURRENCY`, `EXPORT_BURST_PER_MINUTE`, and `EXPORT_RENDER_TIMEOUT_MS` are read by `apps/server/src/env.ts` but absent from `docker-compose.yml`'s api `environment`. Set `EXPORT_CONCURRENCY=1` — the default of 2 concurrent headless-Chromium renders against this host's available memory is an OOM waiting to happen. Adding the pass-through is a compose edit, so it is part of this ticket's host work.

**Accepts**: `https://<domain>` serves the app from the Admin's machine; Client Export and Server Export both complete end-to-end from the public URL; a reboot brings the stack back with no intervention.

## Comments

- **Hosting decision (user, 2026-09-23)** — supersedes the 2026-09-13 AWS note below: launch runs on the Admin's own machine, published by a Cloudflare Tunnel at the real domain (ADR-0010). Why: no server rent before there is revenue; the machine is already the dev/prod-parity environment (Chromium, the Compose stack, and rootless podman all verified there); and an outbound tunnel needs no port forwarding, no static IP, and no inbound firewall rules, so the home IP is never exposed. Trade-offs accepted: the service is up only while the machine is up, home upload bandwidth caps Server Export throughput, and all user traffic passes through Cloudflare's edge — a third party in the path that the app itself makes no requests to, which the Privacy page should state plainly rather than leave implied by the "no third-party analytics" line. The VPS move is deferred, not rejected; see ADR-0010 for the revisit triggers.
- **VPS path, deferred**: the AWS EC2 t4g.micro paid by GitHub Student credits (ARM Graviton, 2 GB, swapfile, `EXPORT_CONCURRENCY=1`) remains a viable box when the move happens, alongside a €4–5/mo Hetzner instance. launch/03's backup/restore flow is the migration path in either case — a clean-machine restore onto the new host.
- **Chromium is done** (commit 59fd5b3): headless Chromium baked into the api image (`playwright install --with-deps --only-shell chromium`, browsers at `/ms-playwright`) — pulled forward from this ticket at the user's call so local testing is production parity for every feature. Verified in the local compose stack: a Premium job rendered a 2-page PDF through the baked browser (`status: done`, auto-stored in Export History). This ticket keeps only the host-side work: stack up, tunnel-fronted domain, monitoring, log rotation, restart policy, backups remote.
- From server/06: the shipped Caddyfile's automatic ACME TLS path (`SITE_ADDRESS=<domain>` with the Cloudflare DNS record proxy-off) is **not used in this deployment** — the tunnel terminates TLS and Caddy stays on plain `:80`. That path stays documented in the Caddyfile for a directly-exposed host, so a future VPS move can use it unchanged.
- **Deployment decisions (Admin, 2026-09-26)** — the deploy becomes a pull, not a build:
  - **The host pulls published images.** Checkout at `~/self-hosted/perfectmarkd`; the stack comes up from GHCR with `podman compose pull && podman compose up -d --no-build`. That is a new prerequisite, filed as launch/10 (and launch/11 behind it, because the analytics website id is currently a build-time value and a published image cannot carry an instance's id). This ticket is now blocked by launch/10.
  - **The public host is `perfectmarkd.00022000.xyz`**, a hostname on the Admin's existing Cloudflare Tunnel. The subdomain does not exist yet; the Admin creates it. Tunnel and DNS remain the Admin's work, as the body already says.
  - **Tunnel origin is the host's `CADDY_HTTP_PORT`**, which `.env` already sets to `8901` — nginx holds `:80` on this machine. The port choice itself is not load-bearing.
  - **`api-data` may be wiped.** The volume currently holds the previous stack's database and encrypted history; a clean start is acceptable, so a fresh `HISTORY_ENCRYPTION_KEY` is fine and no migration is needed.
  - **No monitoring.** The Uptime Kuma / healthchecks.io bullet is dropped, along with the alert clause in Accepts.
  - **Backups are local-only and optional**, governed by a switch — filed as launch/12. No remote account.
  - **`sudo` is available** if a step needs it, though podman and cloudflared both run without it.
  - **AI is active** at launch (`AI_API_KEY` is set in `.env`), so launch/06's AI prerequisites apply.
- **Host state verified 2026-09-26** (the deployment target is this machine, `abyss`): `podman compose` delegates to the docker compose plugin v5.5.1 and needs `unix:///run/user/1000/podman/podman.sock`, which does **not** exist while `podman.socket` is inactive — `systemctl --user enable --now podman.socket` is step zero. `Linger=yes` is already set. The four `perfectmarkd-*` containers exist but are exited (~21 h). 7.5 GB RAM with ~2.3 GB available and swap already at 3.3/7.5 GB; 40 GB free of 178 GB. It is a laptop (`BAT0`), so disabling sleep is real work. Neighbours not to disturb: nginx, `vaultwarden`, `dash-dash-dash`, and the active `vaultwarden` tunnel.
- **The pull path is proven on this host, not just planned** (2026-09-26). launch/10 shipped, the Admin pushed and made both packages public, and `podman compose pull && podman compose up -d --no-build` was run here: all four refs pulled with no registry credential, the stack came up with api/umami/umami-db `healthy`, and `/healthz`, `/` and `/pricing` all answered `200` on `:8901`. So this ticket's remaining work is genuinely the host-side half — tunnel, monitoring-free log rotation and restart policy, the WAL checkpoint job, backups, sleep, reboot — and not the stack itself.
- **Caveat for the deferred VPS path**: the published images are `linux/amd64` only, and the `t4g.micro` named below is arm64. Either publish multi-arch or build on the new host before the move; do not assume the pull works there.
