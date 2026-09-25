# 10 — Publish the api and caddy images to GHCR, and let the host pull instead of build

Status: ready-for-agent
Blocked by: launch/11

The deployment host must not compile anything. Both app images are heavy build-host work: `apps/server/Dockerfile` installs headless Chromium with its apt dependencies, and `apps/web/Dockerfile` runs a workspace-wide `pnpm install` plus a Vite build of the whole app. The host is the Admin's own machine (ADR-0010) — 7.5 GB of RAM with ~2.3 GB available and 40 GB free — and it should pull, not build.

The pattern already exists for the third image: `ops/umami/Dockerfile` is compiled by `.github/workflows/umami-image.yml` and published to GHCR (ADR-0012), precisely because the deployment host should not be compiling a Next.js app. This ticket does the same for the two images the app itself runs, and teaches the compose file to pull them.

**What to build:**

- `.github/workflows/images.yml`, modelled on `umami-image.yml` — lowercase the owner (GHCR rejects uppercase repository names), `docker/setup-buildx-action@v3`, `docker/login-action@v3` with `secrets.GITHUB_TOKEN`, `docker/build-push-action@v6`, gha cache — publishing:
  - `ghcr.io/<owner>/perfectmarkd-api` — context `.`, file `apps/server/Dockerfile`.
  - `ghcr.io/<owner>/perfectmarkd-caddy` — context `.`, file `apps/web/Dockerfile`, build arg `VITE_ANALYTICS_URL=/analytics` only. The website id is a **runtime** value by then (launch/11) and must not be a build arg here.
- Tags: `:latest` and `:sha-<short>` on every push to `main`; `:<version>` additionally when a `v*` tag is pushed. There are no git tags in the repo today, so `:latest` + `:sha` is what the deployment consumes for now. `workflow_dispatch` for a manual rebuild.
- Trigger paths: a push to `main` that touches either Dockerfile, `apps/web/**`, `apps/server/**`, `packages/core/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, or the workflow itself. Both images resolve `@perfectmarkd/core` to its built `dist/`, so a `packages/core` change has to rebuild **both** — do not filter one image out on a core-only change.
- `docker-compose.yml`: add `image:` beside the existing `build:` on `caddy` and `api`, naming the published refs behind a `${PERFECTMARKD_IMAGE_TAG:-latest}` override. A dev checkout keeps building (`podman compose up -d --build`); the deployment host pulls (`podman compose pull && podman compose up -d --no-build`). One compose file, both paths, and the dev path must not regress.
- Both packages must be **public**, so the host needs no registry login — same as the umami package.
- Docs: `README.md`'s Deployment block and `docs/ops/restore.md` §4 both tell the operator to `docker compose up -d --build`; the deployment path becomes pull-only, with the build command kept as the dev/local alternative.

**Accepts:** a push to `main` publishes both images; on the host, `podman compose pull && podman compose up -d --no-build` brings the whole stack up without building anything; `/healthz` answers and the SPA serves; a dev checkout still builds from source with the unchanged `--build` command.

**Notes:** the compose file is the single source for both paths — resist adding a second `docker-compose.prod.yml` unless the `image:` + `build:` pairing turns out not to work under `podman compose` (podman 6.1.2 delegates to the docker compose plugin v5.5.1, so it should). Verify that pairing on the host before writing a second file.

## Comments

- Filed 2026-09-26 from the Admin's stated deployment plan: finish the app, publish one complete image to GHCR, then host it by pulling at `~/self-hosted/perfectmarkd`.
- The app itself is feature-complete — the tracker's only other open ticket is launch/04 (this one blocks it) and launch/06 behind that. Nothing here is app work.
