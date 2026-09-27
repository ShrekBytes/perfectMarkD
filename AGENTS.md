## Project — PerfectMarkD

A web app that turns Markdown into perfectly laid-out PDFs. pnpm monorepo; AGPL-3.0; pre-launch. This section is project-specific and may change as the repository evolves.

### Project resources

- **Issue tracker:** local Markdown files under `.scratch/<feature>/` — one spec at `.scratch/<feature>/spec.md`, tickets at `.scratch/<feature>/issues/NN-<slug>.md` with a `Status:` line. No GitHub Issues. Work the frontier: a ticket is actionable once every id in its `Blocked by:` line is resolved, lowest number first (see `PLAN.md` §4 and `docs/agents/issue-tracker.md`).
- **Triage labels:** `needs-triage`, `needs-info`, `ready-for-agent`, `resolved`, `ready-for-human`, `wontfix`, recorded as `Status:` lines on tickets. See `docs/agents/triage-labels.md`.
- **Domain docs:** `CONTEXT.md` (canonical glossary) plus `docs/adr/` (numbered decisions, 0001–0010). See `docs/agents/domain.md`.
- **Architecture / codebase map:** `README.md` (package layout) and `PLAN.md` §3 (stack) are the map. `apps/web/DESIGN.md` is the binding visual system, and `apps/web/PRODUCT.md` records product scope; `packages/core/src/golden/README.md` explains the paginator regression net.
- **Commit format:** mostly conventional, `<type>(<scope>): <summary>` (e.g. `fix(web): custom-fonts review findings`, `feat(api): bake headless Chromium into the api image`). History also carries non-standard types (`polish`, `layout`, `redesign`, `clarify`) and occasional free-form messages, so neither is enforced. The most common scope is the ticket id (`server/03`, `launch/03`, `billing/04`) or a surface (`web`, `api`, `docs`, `scratch`); `core` is never used as a scope.

### Build & verify

```bash
pnpm install        # pnpm workspace install; native builds allowed via pnpm-workspace.yaml
pnpm build          # build every package (core: tsup; server: tsc; web: vite)
pnpm test           # repo-wide unit suites (vitest, browser-free)
pnpm test:watch     # vitest in watch mode
pnpm typecheck      # tsc --noEmit per package
pnpm lint           # eslint
pnpm format:check   # prettier check (pnpm format to write)
```

- **CI/headless-safe:** `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` — none need a browser. CI runs these first (Node 24; see `.github/workflows/ci.yml`).
- **Browser suites** (real Chromium; CI runs them as separate steps after `pnpm test`):
  - `pnpm --filter @perfectmarkd/core test:golden` — paginator goldens. Update with `test:golden:update`, and commit snapshots in the same commit as the engine change that caused them.
  - `pnpm --filter @perfectmarkd/server test:e2e` — Server Export e2e.
  - `pnpm --filter @perfectmarkd/web test:e2e` — web smoke suite (builds core + web, then drives the bundle in Chromium). Its visual baselines are Linux-only (`apps/web/e2e/visual.spec.ts-snapshots/*-linux.png`), so the suite fails on macOS/Windows.
  - One-time browser install: `pnpm --filter @perfectmarkd/core exec playwright install chromium --with-deps`.
- **Extra setup:** `cp .env.example .env`, then fill `SESSION_SECRET` and `HISTORY_ENCRYPTION_KEY` (the API refuses to boot without the history key) plus `RESEND_API_KEY`, `MAIL_FROM` and `PUBLIC_ORIGIN` (it refuses to boot without those either — `MAIL_MODE=console` is the local-only escape that prints transactional email to the log, and `PUBLIC_ORIGIN` is the public address the absolute one-time links in that mail are built from, never the internal `EXPORT_ORIGIN`). `ADMIN_EMAIL` bootstraps the first Admin. For local dev, run both servers side by side — `pnpm --filter @perfectmarkd/web dev` (Vite, `http://localhost:5173`) and `pnpm --filter @perfectmarkd/server dev` (API, `PORT` default 3000). Web proxies `/api` to `VITE_API_ORIGIN` (default `http://localhost:3000`); to browser-verify Server Export locally, set the API's `EXPORT_ORIGIN=http://localhost:5173` so the worker loads the SPA's `/export` page.
- **Toolchain versions:** pnpm 11.3.0 (via `corepack enable`), Node ≥ 22 (CI uses 24), TypeScript 6, ESM throughout.
- **Dependency provisioning:** `pnpm install` from the repo root. `pnpm-workspace.yaml` allows `better-sqlite3` and `esbuild` postinstall builds — don't disable them.

### Project-specific rules

- **Architecture:** `packages/core` is the framework-free engine (markdown → paginated, print-ready HTML); `apps/web` is the React + Vite SPA (editor, Paper Canvas, Client Export); `apps/server` is the Node + Hono + Drizzle API (auth, Orders, Entitlements, quotas, Export History, export worker). Keep the engine framework-free and shared.
- **The preview is the contract.** One rendering engine drives the on-screen preview, the browser print export, and the server export so they stay pixel-identical (ADR-0002, ADR-0003). A feature that can't hold that is not shippable.
- **Terminology is precision.** Use the terms defined in `CONTEXT.md` (Document, Page Break, Preset, Custom Stylesheet, Outline, Client Export, Server Export, Quota, Order, Verification, …). Respect the listed "avoid" words.
- **Privacy by default.** Free users' documents live in IndexedDB and never leave the browser; Server Export payloads are processed in memory and deleted immediately (Premium Export History excepted, encrypted at rest and purged after 30 days). No third-party requests from the editor, preview, exports, or fonts — AI Actions are the only exception that sends Document content to a third party (deliberate, paid, disclosed, switchable-off; ADR-0009), and transactional email is a second, non-switchable exception that never carries Document content (ADR-0013).
- **Web UI follows `apps/web/DESIGN.md`.** The Light Table system is ground truth: graphite monochrome chrome with no accent hue, 2px radii, IBM Plex Sans/Mono, corner crop marks, the 860px three-pane rule, and the 44px coarse-pointer floor; the **WCAG 2.2 AA** target is stated in `apps/web/PRODUCT.md`. When code and DESIGN.md disagree, fix one — never leave both. `PLAN.md` §2 is the strategic stance and defers to DESIGN.md.
- **Domain changes get recorded.** A new term goes in `CONTEXT.md`; a decision that's hard to reverse goes in `docs/adr/` as the next numbered ADR. Read existing ADRs before overriding one, and flag the conflict if you do.
- **`.scratch/` is agent working state,** not shipped code — it is eslint- and prettier-ignored (see `eslint.config.js`, `.prettierignore`). Keep the tracker conventions when adding specs or tickets.
- **Deployment is the Compose stack:** `docker compose up -d --build`, with Caddy serving the SPA and reverse-proxying `/api`. See `README.md` (Deployment) and `docs/ops/restore.md` for backup/restore.

#### Browser automation & visual verification

For frontend, `/impeccable`, and any UI work — plus backend changes that affect rendered state — verify in a real browser. The loop branches on image-input support:

- **Vision:** take `agent-browser screenshot`s and inspect the pixels directly.
- **Text-only:** screenshots are unreadable to you — verify structure with `snapshot` and DOM/text extraction, and save screenshots for the user's aesthetic review. Report their verdict, never a sighting of your own. `pnpm --filter @perfectmarkd/web test:e2e` guards the rendered paper, pane layout, and export parity — but it never screenshots the app chrome, so a pass says nothing about the chrome's look.

Prefer the `agent-browser` skill (run `agent-browser skills get core` for the full guide; `agent-browser --help` for commands). Use an isolated session: `export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix task)"`

Core loop:

1. `agent-browser open <url>` — navigate
2. `agent-browser snapshot -i` — get refs (`@e1`, `@e2`)
3. `agent-browser click @e1` / `fill @e2 "text"` — interact via refs; `screenshot` if you can read images
4. Re-snapshot after any page change — refs expire

When something's broken, check the browser's own signals before guessing from a screenshot — this applies to both the Vision and Text-only paths above:

- `agent-browser console --errors-only` — recent console errors
- `agent-browser errors` — uncaught JS exceptions
- `agent-browser network route` — inspect/filter failing requests
- `agent-browser inspect` — opens live DevTools on the active page for manual digging

If `agent-browser` is unavailable (not installed, `doctor` fails), fall back to whatever browser automation your current harness provides and note the fallback in your reply. Don't drive the user's visible browser without permission. Run `agent-browser close` when done.

The existing `test:e2e` suites still use Playwright — run them as-is. The agent-browser rule is for ad-hoc browsing/verification only.
