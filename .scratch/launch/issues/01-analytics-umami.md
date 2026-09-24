# 01 — Self-hosted Umami analytics

Status: needs-info
Blocked by: server/06

Add `umami` (+ its DB) to Compose behind Caddy at `/analytics`-subdomain. Anonymous events only: page views, Client Export click, Server Export click, upgrade modal open, plan select. No cookies beyond the app session, no IP storage (Umami configured to hash/anonymize), no personal data — per PLAN §1 posture. Event wiring via a tiny wrapper (no global `data-` sprawl). Admin dashboard access restricted to the Admin.

**Accepts**: events flow and are visible in Umami; page loads make no third-party requests; posture doc updated.

## Comments

- **Implementation landed; the image build is blocked on this machine's disk (2026-09-24).**

  The web side is complete and green. `apps/web/src/analytics/tracker.ts` is the one
  wrapper: it injects the self-hosted tracker once (same origin, `data-auto-pageview="false"`,
  `data-do-not-track`, `data-exclude-search`), queues calls until the script lands, and
  no-ops entirely when a build has no `VITE_ANALYTICS_WEBSITE_ID` — which is how a
  self-hoster without Umami runs and why tests never touch the network. Page views come
  from `App.tsx`, one per route change, with the hidden `/export` render surface the export
  worker loads excluded (counting machine renders as visits would make the numbers
  meaningless). The four click events fire at their single call sites: `client-export` and
  `server-export` in `ExportSplitButton` (the click, not the render — a Free visitor
  reaching the Server Export item is the paywall funnel), `upgrade-modal-open` on
  `PricingModal`'s mount, `plan-select` with the plan id in `PlanComparison`. Compose
  carries `umami` + `umami-db` (postgres 15, UTC, `PRIVATE_MODE`/`DISABLE_TELEMETRY`/
  `DISABLE_UPDATES` on), the Caddyfile routes `/analytics` and `/analytics/*`, and
  `docker compose config` validates. Privacy page, README, `.env.example`, and
  `docs/ops/restore.md` updated. Full unit suite (1561 tests), typecheck, and lint green.

  What is **not** proven is the acceptance itself. `ops/umami/Dockerfile` builds Umami
  v3.4.0 from the release tarball with `BASE_PATH=/analytics` baked in — required, because
  `BASE_PATH` is a build-time variable (`next.config.ts` reads it before `next build`), so
  the prebuilt image can only ever serve from an origin root. That build **fails on this
  machine**: `/home` is btrfs at 82% with `Device unallocated: 1.00 MiB`, so the last stage
  dies with `no space left on device`, and the failed build's intermediate containers cannot
  be cleaned up afterwards (`podman rmi` fails the same way — btrfs cannot allocate the
  metadata for the overlay rename). No event has been observed in Umami, and `/analytics`
  has never been served.

  This is a design call, not a bug fix — the two ways forward:

  1. **Keep `/analytics`** — free ~15–20 GB on `/` (or run `btrfs balance` as root) and the
     build completes. The cost stays afterwards: every Umami version bump rebuilds a ~2 GB
     image locally, on the deployment host.
  2. **Move Umami to `analytics.<domain>`** — delete `ops/umami/Dockerfile`, point the
     service at the official prebuilt image, add one Cloudflare Tunnel hostname (the Admin's
     own setup, exactly as launch/04 already assumes). ~400 MB, no build, and a version bump
     becomes a one-line tag change.

  Decision (user, 2026-09-24): **keep `/analytics` and free disk space first.** So the work
  above is final as written — the image is correct, it just needs room. Until then the
  change is uncommitted: `git add` fails with `No space left on device` too, so the same
  free-space step unblocks both the commit and the build.

- **The compile moves off the host (ADR-0012, 2026-09-24).** Diagnosing the ENOSPC above
  showed the real problem: `/home` is btrfs at 82% with `Device unallocated: 1.00 MiB`, so
  btrfs cannot allocate metadata chunks. Small metadata operations fail while bulk data
  writes succeed — a `mv` of a 0-byte file and `git add` both returned ENOSPC in the same
  window a 500 MB `dd` wrote fine. A from-source Next.js build writes 100k+ files and is
  exactly the workload that trips it, and the deployment host is the Admin's own machine
  (ADR-0010), which should not be a build server anyway.

  So `ops/umami/Dockerfile` is now built by `.github/workflows/umami-image.yml` and
  published to GHCR as a public package; `docker-compose.yml` pulls
  `ghcr.io/shrekbytes/perfectmarkd-umami:<version>`, and a local `docker build` stays
  documented for self-hosters. This needs the repository on GitHub, which it currently is
  not — there is no remote configured yet, and PLAN §7's "decide the GitHub org/repo name"
  is still open. `apps/web/src/pages/site-links.ts` already points at
  `https://github.com/ShrekBytes/perfectMarkD`, so that is the intended name.

  Git history was scanned before any publish was proposed: no `.env`, key, or credential
  has ever been committed, and the only secret-shaped matches are placeholder templates.
  474 tracked files, 8.6 MB of history.

  **Open**: create the GitHub repository and push, run the workflow, then pull on the host
  and finish the end-to-end proof. The free-space step is still needed for the *pull*
  (a few hundred MB of image layers) even though the compile no longer happens here.
