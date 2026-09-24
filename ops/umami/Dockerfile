# syntax=docker/dockerfile:1
# Umami analytics, built with BASE_PATH baked in (launch/01).
#
# Who builds it: .github/workflows/umami-image.yml, which publishes the result
# to GHCR so the deployment host only pulls it (ADR-0012). Building locally is
# supported and is one command — see docker-compose.yml.
#
# Why a custom image instead of the published one: Umami's BASE_PATH is
# a *build-time* variable — its own Dockerfile takes `ARG BASE_PATH` and feeds
# it to `pnpm build:docker` — so the prebuilt image can only ever serve from the
# root of an origin. PerfectMarkD serves analytics at /analytics on its own
# origin (one origin, no extra DNS record, no extra Tunnel hostname), which
# needs its own build.
#
# Everything below is umami's Dockerfile at the pinned tag, unchanged except
# that the build context is the release tarball rather than a checkout. Bump
# UMAMI_VERSION deliberately: the runner stage pins Prisma to the version
# umami's package.json expects, and BASE_PATH is only right for a version that
# still reads it.
#
# The image is stateless apart from the database: no volume, nothing written
# outside /app. The compose service points it at umami-db.

ARG NODE_IMAGE_VERSION="22-alpine"
ARG PNPM_VERSION="12.3.4"
ARG PRISMA_VERSION="7.10.0"
ARG UMAMI_VERSION="3.4.0"

# The subpath the app is served under. Compose passes it to the runtime too:
# umami's proxy middleware reads BASE_PATH at startup for its CSP and
# collect-endpoint routing, while Next.js reads it from the build.
ARG BASE_PATH="/analytics"

# The upstream source at the pinned tag, as the stand-in for a build context.
FROM node:${NODE_IMAGE_VERSION} AS src
ARG UMAMI_VERSION
RUN apk add --no-cache curl \
	&& mkdir -p /src \
	&& curl -fsSL "https://github.com/umami-software/umami/archive/refs/tags/v${UMAMI_VERSION}.tar.gz" \
		| tar -xz -C /src --strip-components=1

# Install dependencies only when needed
FROM node:${NODE_IMAGE_VERSION} AS deps
ARG PNPM_VERSION

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=src /src/package.json /src/pnpm-lock.yaml /src/pnpm-workspace.yaml ./
# Workspace packages (@umami/api-client, @umami/mcp) must be present for a frozen install.
COPY --from=src /src/packages/api-client/package.json ./packages/api-client/
COPY --from=src /src/packages/mcp/package.json ./packages/mcp/
COPY --from=src /src/packages/mcp/bin ./packages/mcp/bin/
RUN npm install -g pnpm@${PNPM_VERSION}

RUN printf 'strictDepBuilds: false\n' >> pnpm-workspace.yaml

RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:${NODE_IMAGE_VERSION} AS builder
ARG PNPM_VERSION
ARG BASE_PATH
WORKDIR /app
# build:openapi shells out to pnpm, so the builder stage needs it too
RUN npm install -g pnpm@${PNPM_VERSION}
COPY --from=src /src ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api-client/node_modules ./packages/api-client/node_modules
COPY --from=deps /app/packages/mcp/node_modules ./packages/mcp/node_modules
COPY --from=src /src/docker/proxy.ts ./src

ENV BASE_PATH=$BASE_PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"
# No MaxMind download: PerfectMarkD records no visitor location, so the
# geo database would be dead weight in the image and a build-time fetch.
ENV SKIP_BUILD_GEO=1

RUN pnpm build:docker

# Production image, copy all the files and run next
FROM node:${NODE_IMAGE_VERSION} AS runner
WORKDIR /app

ARG PNPM_VERSION
ARG PRISMA_VERSION
ARG BASE_PATH

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Read at startup by src/proxy.ts; must match the build-time value above.
ENV BASE_PATH=$BASE_PATH

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Bootstrap pnpm with the bundled npm, then remove npm in the same layer so the
# vulnerable packages vendored inside the npm CLI are not shipped in the final
# image. pnpm is the only package manager needed at build and runtime.
RUN set -x \
	&& apk add --no-cache curl libc6-compat \
	&& npm install -g pnpm@${PNPM_VERSION} \
	&& rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

RUN echo {} > package.json

RUN printf "allowBuilds:\n  '@prisma/engines': true\n  prisma: false\nverifyDepsBeforeRun: false\n" > pnpm-workspace.yaml

# Script dependencies
RUN pnpm add npm-run-all dotenv chalk semver \
	prisma@${PRISMA_VERSION} \
	@prisma/client@${PRISMA_VERSION} \
	@prisma/adapter-pg@${PRISMA_VERSION}

# Assert the @prisma/engines postinstall actually downloaded the engine
# binaries. If pnpm blocked the build script (e.g. allowBuilds not honored by
# the installed pnpm version), prisma would try to download engines at runtime
# as the non-root user and fail with a permissions error.
RUN ls node_modules/.pnpm/@prisma+engines@${PRISMA_VERSION}/node_modules/@prisma/engines/*engine* \
	|| (echo "ERROR: Prisma engine binaries missing - @prisma/engines postinstall was blocked" && exit 1)

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/generated ./generated

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["sh", "scripts/start-docker.sh"]
