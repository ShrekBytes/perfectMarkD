# PerfectMarkD

Turns markdown into perfectly laid-out PDFs — the platform-independent successor to the [Advanced PDF Export](https://github.com/ShrekBytes/advanced-pdf-export) Obsidian plugin. Drop-in editor, no signup: what you see is exactly the PDF you get.

Status: pre-launch. The roadmap lives in [PLAN.md](PLAN.md), decisions in [docs/adr/](docs/adr/), tickets in `.scratch/`.

## Layout

pnpm monorepo:

| Package                          | Planned scope                                                           |
| -------------------------------- | ----------------------------------------------------------------------- |
| [`packages/core`](packages/core) | Framework-free rendering engine: markdown → paginated, print-ready HTML |
| [`apps/web`](apps/web)           | React + Vite SPA: editor, Paper Canvas preview, Client Export           |
| [`apps/server`](apps/server)     | Node + Hono API: auth, billing, Server Export worker                    |

## Development

Requires Node ≥ 22 and pnpm (via `corepack enable`).

```sh
pnpm install
pnpm build      # build all packages
pnpm test       # run every suite (vitest, watch: pnpm test:watch)
pnpm lint       # eslint
pnpm typecheck  # tsc per package
pnpm format     # prettier

pnpm --filter @perfectmarkd/web dev     # web app dev server
pnpm --filter @perfectmarkd/server dev  # API dev server
```

Pull requests run lint, typecheck, build, and tests via [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Deployment

Docker Compose runs the whole stack on one origin — Caddy serves the built app, reverse-proxies `/api` to the api container, and reverse-proxies `/analytics` to a self-hosted Umami instance:

```sh
cp .env.example .env    # fill in SESSION_SECRET + HISTORY_ENCRYPTION_KEY
                        # and UMAMI_APP_SECRET + UMAMI_DB_PASSWORD
docker compose up -d --build
```

The shipped deployment serves the stack behind a Cloudflare Tunnel, which terminates TLS in front of Caddy ([ADR-0010](docs/adr/0010-deploy-on-own-machine-behind-cloudflare-tunnel.md)) — so `SITE_ADDRESS` stays `:80` and no inbound ports are needed. Server Export (paid plans) works out of the box: headless Chromium is baked into the api image. Host-side rollout, monitoring, and backups: [.scratch/launch/issues/04-deploy-production.md](.scratch/launch/issues/04-deploy-production.md).

### Analytics

Analytics is self-hosted Umami, served at `/analytics` on the same origin ([launch/01](.scratch/launch/issues/01-analytics-umami.md)) — no third-party service, no cookies, no stored addresses. It is off until you point the app at it:

1. Bring the stack up, open `https://<domain>/analytics`, and sign in with `admin` / `umami` — change the password immediately.
2. Add a website for your domain and copy its id.
3. Put it in `.env` as `VITE_ANALYTICS_WEBSITE_ID` and rebuild the web image: `docker compose up -d --build caddy`.

With no id set, the bundle loads no tracker and collects nothing.

Umami's image is compiled by [`.github/workflows/umami-image.yml`](.github/workflows/umami-image.yml) and published to GHCR as a public package, so `docker compose up -d` pulls it — the deployment host never needs a build toolchain or room for a 100k-file compile ([ADR-0012](docs/adr/0012-build-the-umami-image-in-ci.md)). `ops/umami/Dockerfile` is the source it builds from; a local build is one command, recorded in `docker-compose.yml`.

Exposing a host directly instead? Set `SITE_ADDRESS=<domain>` in `.env` and Caddy provisions TLS automatically.

## License

[AGPL-3.0](LICENSE) — see [docs/adr/0001-agpl3-open-codebase.md](docs/adr/0001-agpl3-open-codebase.md) for why.
