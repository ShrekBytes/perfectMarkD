# 01 — App shell + design tokens

Status: resolved
Blocked by: engine-port/01

Vite React app: Tailwind v4 with design tokens as CSS variables — Inter (self-hosted via @fontsource), accent `#7c6af7`, warm-gray canvas, hairline borders, radii 8–10px, motion 150–200ms ease-out; light + dark themes (`prefers-color-scheme` default + manual toggle, persisted). Shell components: TopBar (wordmark, doc name inline-edit, Library, theme toggle, Export split-button placeholder), three-pane layout with collapse toggles and pane-resize (min widths), fullscreen-canvas mode (all panes collapsed). Empty pane states.

**Accepts**: shell renders three collapsible panes + topbar in light/dark; matches the layout contract in spec; no engine integration yet.

## Comments

Implemented (2026-09-04), TDD at two seams (`theme`, `pane-layout`) plus component tests; 97 workspace tests green; verified light/dark, collapse, fullscreen, drag-resize, and double-click reset in a real browser.

- Tokens: `apps/web/src/styles/global.css` — Tailwind v4 `@theme inline` over semantic CSS variables (`--canvas` warm gray, `--surface`, `--ink*`, `--hairline`, `--accent #7c6af7`, radii 8/10px); dark overrides under `[data-theme='dark']`; `--page` stays white in dark. Motion: default transition curve is ease-out with 150/200ms durations. Inter self-hosted via `@fontsource-variable/inter`.
- Theme: `theme.ts` `useTheme` — `prefers-color-scheme` default (followed live until the user picks a side), manual toggle persisted in `localStorage` (`perfectmarkd:theme`); no-FOUC inline script in `index.html` applies `data-theme` before first paint (kept in sync with `theme.ts` by comment — duplication accepted for FOUC prevention).
- Shell: `AppShell` = TopBar + three panes. Editor defaults to 38% (min 280), Inspector 320px (min 260), Paper Canvas flex with min 320. Dividers are drag handles + collapse chevrons; collapsed panes leave a floating restore toggle at the canvas edge; both collapsed = fullscreen-canvas mode (`data-fullscreen`). Double-click a divider resets its pane width. TopBar per contract: wordmark, inline-edit doc name (local state until app/02), Library + Export split-button placeholders (inert until app/02 / app/06).
- "One click gives a fullscreen canvas" is interpreted as: each pane collapses in one click and all-collapsed IS fullscreen mode (the ticket's own definition). A dedicated fullscreen control would break the TopBar contract; revisit if wanted.
- Node 26 ships native Web Storage, which breaks `localStorage` in vitest's jsdom environment (vitest issue #8757): root test scripts now run under `cross-env NODE_OPTIONS=--no-webstorage`.
- Code review fixes applied: side effect removed from `useTheme`'s toggle updater, dead ref deleted, `PaneId` reused by divider components, ease-out made the token-level default, canvas min-width enforced in CSS (not only during drags), tailwind moved to devDependencies, shared matchMedia test stub extracted.
