# 01 — Scaffold the pnpm monorepo

Status: resolved
Blocked by: —

Create the repo layout per PLAN.md §3 and ADR-0004: `apps/web`, `apps/server`, `packages/core`; shared tsconfig bases; eslint + prettier; vitest at root; `LICENSE` = AGPL-3.0; README stub. `packages/core` builds with tsup (ESM + types). CI: GitHub Actions running typecheck + lint + tests on PR.

**Accepts**: `pnpm i && pnpm build && pnpm test` succeeds from root with hello-world packages wired (web imports a function from core).

## Comments

Implemented in the scaffold commit (2026-09-04).

- Layout: `packages/core` (tsup, ESM + d.ts), `apps/web` (React + Vite), `apps/server` (Hono + `@hono/node-server`), per ADR-0004.
- Root: pnpm workspace (`pnpm-workspace.yaml` + `allowBuilds` for esbuild), shared `tsconfig.base.json` (strict, `paths` alias to core's source so packages typecheck before core is built), eslint 10 flat config with typescript-eslint, prettier, root vitest (alias to core source so tests run without a prior build).
- `LICENSE` = AGPL-3.0 (verbatim from gnu.org); README stub; CI workflow (`.github/workflows/ci.yml`) running lint → typecheck → build → test on PR and push to main.
- TypeScript pinned to 6.0.x: typescript-eslint 8.69 supports `<6.1.0`, and TS 7 (native) is unsupported; `ignoreDeprecations: "6.0"` set because tsup 8.5.1's dts build injects a default `baseUrl`, which TS 6 otherwise rejects.
- Acceptance verified: `pnpm i && pnpm build && pnpm test` from root passes; web bundle contains core's `hello` (checked the built bundle), server serves `/healthz` (tested via `app.request`), tests written before implementations (red → green).
