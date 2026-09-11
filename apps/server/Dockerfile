# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f apps/server/Dockerfile -t perfectmarkd-api .

# Full SDK image: carries a toolchain so better-sqlite3 can compile its
# native binding when no prebuilt binary matches the platform.
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
COPY apps/server apps/server
# Core first: the export pipeline (server/03) imports @perfectmarkd/core at
# runtime, and its package entry points resolve to built dist/ files.
RUN pnpm --filter @perfectmarkd/core build \
	&& pnpm --filter @perfectmarkd/server build

# Pruned, self-contained production tree: the server package plus only its
# runtime dependencies (pnpm deploy resolves the workspace lockfile).
# --legacy: the workspace doesn't use injected workspace packages.
FROM node:24-bookworm AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/core packages/core
# Build core before deploying: the deployed server imports it at runtime
# (PDF outline injection, settings validation).
RUN pnpm --filter @perfectmarkd/core build \
	&& pnpm --filter @perfectmarkd/server deploy --prod --legacy /out

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY --from=deps /out ./
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/perfectmarkd.db \
    HISTORY_DIR=/data/history
# Database (SQLite WAL) and Export History's encrypted files (server/05) live
# on a volume so they survive container upgrades.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
