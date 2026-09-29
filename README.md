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
cp .env.example .env    # then fill in the four secrets it asks for,
                        # UMAMI_APP_SECRET + UMAMI_DB_PASSWORD, and the
                        # RESEND_API_KEY + MAIL_FROM + PUBLIC_ORIGIN the api
                        # refuses to start without

# Dev checkout — build the app images locally:
docker compose up -d --build

# Deployment host — pull the published images and build nothing:
podman compose pull && podman compose up -d --no-build
```

The api and caddy images are compiled by [`.github/workflows/images.yml`](.github/workflows/images.yml) and published to GHCR as public packages, so a deployment host needs no toolchain, no registry login, and no room for a Chromium install — the same arrangement as the Umami image ([ADR-0012](docs/adr/0012-build-the-umami-image-in-ci.md)). Pin `PERFECTMARKD_IMAGE_TAG` to a `sha-…` tag for a reproducible deploy; the default is `latest`.

The shipped deployment serves the stack behind a Cloudflare Tunnel, which terminates TLS in front of Caddy ([ADR-0010](docs/adr/0010-deploy-on-own-machine-behind-cloudflare-tunnel.md)) — so `SITE_ADDRESS` stays `:80` and no inbound ports are needed. Server Export (paid plans) works out of the box: headless Chromium is baked into the api image.

Runbooks live in [`docs/ops/`](docs/ops/): [admin.md](docs/ops/admin.md) for verifying payments, resetting passwords and changing wallets · [hosting.md](docs/ops/hosting.md) for what the host does not need · [restore.md](docs/ops/restore.md) for backups and getting back from a bad day.

### Versions and releases

The app's version is the `version` field in the root [`package.json`](package.json) — currently **0.1.0**. It is the only place a release number is _set_: the workspace packages stay at `0.0.0` because they are private and never published, and nothing derives a version from anywhere else.

CI reads that field and stamps it into both images as `APP_VERSION`, alongside the short commit sha as `APP_COMMIT`. Both halves of the running stack then report what they are without anyone looking it up:

- the app, in the footer of every public page — `0.1.0 (abc1234)`
- the API, on the health probe — `curl -s localhost:3000/healthz` → `{"ok":true,"version":"0.1.0","commit":"abc1234"}`

A build with nothing stamped in — `pnpm dev`, or a hand-built image from a dev checkout — reports `dev (local)` rather than guessing at a version.

Cutting a release is three commands, and the tag and the number are checked against each other so they cannot drift:

```sh
# bump "version" in package.json, commit, then:
git tag v0.1.0 && git push --tags
```

The tag publishes `perfectmarkd-api` and `perfectmarkd-caddy` under that version as well as `sha-…`; `PERFECTMARKD_IMAGE_TAG=0.1.0` then pins the deployment to it. A tag that disagrees with `package.json` fails the workflow rather than publishing an image that reports a different number than the tag it was published under.

### Analytics

Analytics is self-hosted Umami, served at `/analytics` on the same origin — no third-party service, no cookies, no stored addresses. It is off until you point the app at it:

1. Bring the stack up, open `https://<domain>/analytics`, and sign in with `admin` / `umami` — change the password immediately.
2. Add a website for your domain and copy its id.
3. Put it in `.env` as `ANALYTICS_WEBSITE_ID` and restart Caddy: `docker compose up -d caddy`. Caddy serves the id to the app at runtime, so a restart is all it takes — the published image is never rebuilt.

With no id set, the instance loads no tracker and collects nothing.

Umami's image is compiled by [`.github/workflows/umami-image.yml`](.github/workflows/umami-image.yml) and published to GHCR as a public package, so `docker compose up -d` pulls it — the deployment host never needs a build toolchain or room for a 100k-file compile ([ADR-0012](docs/adr/0012-build-the-umami-image-in-ci.md)). `ops/umami/Dockerfile` is the source it builds from; a local build is one command, recorded in `docker-compose.yml`.

Exposing a host directly instead? Set `SITE_ADDRESS=<domain>` in `.env` and Caddy provisions TLS automatically.

## Operations

Runbooks live in [`docs/ops/`](docs/ops/): [admin](docs/ops/admin.md) for verifying a payment, resetting a password, and changing a wallet · [restore](docs/ops/restore.md) for backup and recovery · [hosting](docs/ops/hosting.md) for what the stack does _not_ need · [launch checklist](docs/ops/launch-checklist.md) and [announcement drafts](docs/ops/announcements.md) for going live.

## License

[AGPL-3.0](LICENSE) — see [docs/adr/0001-agpl3-open-codebase.md](docs/adr/0001-agpl3-open-codebase.md) for why.
