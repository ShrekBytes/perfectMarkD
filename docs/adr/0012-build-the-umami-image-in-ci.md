# Build the Umami image in CI and pull it, rather than compiling it on the host

Umami serves analytics at `/analytics` on the app's own origin (launch/01).
Its `BASE_PATH` is read by `next.config.ts` before `next build`, so it lands in
both the server's routing and the compiled client bundle — the upstream
prebuilt image, built with it unset, can only ever serve an origin root. Path
hosting therefore requires compiling Umami ourselves, which is why
`ops/umami/Dockerfile` exists.

That compile does not happen on the deployment host. It runs in GitHub Actions
(`.github/workflows/umami-image.yml`), which publishes the result to GHCR as a
public package, and `docker compose` pulls it. The host needs a registry
connection and a few hundred MB of free space, nothing else.

Why: the deployment host is the Admin's own machine (ADR-0010), and it is the
dev/prod-parity box rather than a build server. Compiling a Next.js app from
source writes well over a hundred thousand files across two `pnpm install`s, a
`next build`, and the Prisma runtime — a workload that needs both a full build
toolchain and metadata headroom on the filesystem. Pulling a finished image
writes a fraction of that. The same reasoning already applies to the api image,
which bakes headless Chromium; the difference is that the api image is *ours*
and is rebuilt whenever its source changes, whereas Umami is a third-party tree
that changes only on a version bump.

Trade-offs accepted deliberately. The repository must live on GitHub for the
workflow to run at all, and the published package has to stay public or every
deployment needs a registry login — a small amount of the deployment's supply
chain now sits outside the Admin's machine. A Umami version bump is no longer a
local edit: it is a CI run plus the tag in `docker-compose.yml`, so the two can
drift if the bump is half-done. And the workflow is now a piece of CI that has
to keep working, on a repository that previously needed only lint, typecheck,
build, and test. Against that: the deploy host never needs a compiler, the build
is reproducible and cached, and a self-hoster can still build the image locally
with the one-line `docker build` recorded in `docker-compose.yml`.

Revisit when the stack moves to a VPS with room to spare (ADR-0010's deferred
move), or if the published package stops being public — at which point the
`docker build` path in `docker-compose.yml` becomes the primary one.
