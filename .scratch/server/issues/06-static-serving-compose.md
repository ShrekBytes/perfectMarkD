# 06 — Static serving + Docker Compose wiring

Status: ready-for-agent
Blocked by: server/01, editor-app/01

Serve the built `apps/web` static bundle (Caddy: static files + reverse proxy `/api` and admin routes to the api container). `/export` route must be served from the same origin the worker hits (loopback to Caddy). Compose services: `caddy`, `api`. TLS via Caddy + Cloudflare DNS (docs in launch/04). Volumes: sqlite db, exports-history dir.

**Accepts**: `docker compose up` serves the app with working API + same-origin `/export` reachable by the worker.
