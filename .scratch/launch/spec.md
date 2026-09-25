# launch — Polish, ops, and go-live (Phase 3)

Everything that turns the built product into an operated service. None of it blocks Phase 1's public free launch except deployment — Phase 1 deploys with ticket 05 minimal, the rest lands in Phase 3.

Hosting target (ADR-0010): the Compose stack runs on the Admin's own machine and is published at the real domain through a Cloudflare Tunnel, which terminates TLS. No VPS, no inbound ports; the VPS move is deferred until availability or bandwidth demands it, and launch/03's restore flow is the migration path when it comes.

Scope: self-hosted Umami analytics (anonymous events only — page views, export clicks, upgrade-modal opens; no personal data, no cookies beyond session) · docs page · backups + restore runbook · the app's own images published to GHCR so the deployment host pulls rather than builds (10, 11) · opt-in backups (12) · performance guards · launch checklist.

Deployment on the Admin's own machine behind a Cloudflare Tunnel was ticketed here and has since been removed: its project-side output all shipped (the compose knob pass-through, ADR-0010, and the documented deployment contract), and what remained was host configuration on one machine rather than project work. The findings worth keeping are in `docs/ops/hosting.md`; the rollout itself is the Admin's.

No uptime monitoring is in scope (decision, 2026-09-26): no Uptime Kuma, no healthchecks.io, no alert channel.
