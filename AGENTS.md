## Browser Automation & Visual Verification

For frontend, `/impeccable`, and any UI work — plus backend changes that affect rendered state — verify in a real browser. The loop branches on image-input support:

- **Vision:** take `agent-browser screenshot`s and inspect the pixels directly.
- **Text-only:** screenshots are unreadable to you — verify structure with `snapshot` and DOM/text extraction, and save screenshots for the user's aesthetic review. Report their verdict, never a sighting of your own. `pnpm test:e2e` guards the rendered paper and pane layout only — a pass says nothing about the app chrome's look.

Prefer the `agent-browser` skill (run `agent-browser skills get core` for the full guide; `agent-browser --help` for commands). Use an isolated session: `export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix task)"`

Core loop:
1. `agent-browser open <url>` — navigate
2. `agent-browser snapshot -i` — get refs (`@e1`, `@e2`)
3. `agent-browser click @e1` / `fill @e2 "text"` — interact via refs; `screenshot` if you can read images
4. Re-snapshot after any page change — refs expire

If `agent-browser` is unavailable (not installed, `doctor` fails), fall back to whatever browser automation your current harness provides and note the fallback in your reply. Don't drive the user's visible browser without permission. Run `agent-browser close` when done.

Existing `test:e2e` suite still uses Playwright — run it as-is. The agent-browser rule is for ad-hoc browsing/verification only.

## Workspace
pnpm@11.3.0, node >=22. `pnpm -r build` / `pnpm typecheck` / `pnpm test` / `pnpm lint`.
Apps: `apps/web` (Vite + React, `pnpm --filter @perfectmarkd/web dev` → `http://localhost:5173`), `apps/server` (Hono + Drizzle, `http://localhost:3000`), `packages/core`. Web `/api` proxies to the API origin.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as `Status:` lines on issues. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Communication

Talk to me in clear, plain language — avoid unnecessary jargon, explain technical terms when used. Be direct; don't pad responses. Plain language, not less detail — give thorough explanations when needed.

Applies to conversation only. Code, docs, commit messages, etc. follow normal professional/technical conventions.
