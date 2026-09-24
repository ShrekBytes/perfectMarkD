# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f apps/web/Dockerfile -t perfectmarkd-web .
#
# Caddy image with the built SPA baked in: static files from /srv, reverse
# proxy to the api container, TLS per the Caddyfile. docker-compose.yml
# builds and wires this image.

# Full SDK image: pnpm install needs the whole workspace's lockfile entries,
# so every workspace package.json is copied (see apps/server/Dockerfile).
FROM node:24-bookworm AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
# Core first: the web bundle resolves @perfectmarkd/core to its built dist/.
#
# Analytics (launch/01) is baked in here because the bundle is static: Vite
# inlines VITE_* at build time, so the website id has to be known now. An
# empty id produces a bundle with no analytics at all — no tracker request,
# nothing collected.
ARG VITE_ANALYTICS_URL="/analytics"
ARG VITE_ANALYTICS_WEBSITE_ID=""
ENV VITE_ANALYTICS_URL=$VITE_ANALYTICS_URL
ENV VITE_ANALYTICS_WEBSITE_ID=$VITE_ANALYTICS_WEBSITE_ID
RUN pnpm --filter @perfectmarkd/core build \
	&& pnpm --filter @perfectmarkd/web build

FROM caddy:2
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
