# 01 — Scaffold the pnpm monorepo

Status: claimed
Blocked by: —

Create the repo layout per PLAN.md §3 and ADR-0004: `apps/web`, `apps/server`, `packages/core`; shared tsconfig bases; eslint + prettier; vitest at root; `LICENSE` = AGPL-3.0; README stub. `packages/core` builds with tsup (ESM + types). CI: GitHub Actions running typecheck + lint + tests on PR.

**Accepts**: `pnpm i && pnpm build && pnpm test` succeeds from root with hello-world packages wired (web imports a function from core).
