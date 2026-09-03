# 01 — App shell + design tokens

Status: ready-for-agent
Blocked by: engine-port/01

Vite React app: Tailwind v4 with design tokens as CSS variables — Inter (self-hosted via @fontsource), accent `#7c6af7`, warm-gray canvas, hairline borders, radii 8–10px, motion 150–200ms ease-out; light + dark themes (`prefers-color-scheme` default + manual toggle, persisted). Shell components: TopBar (wordmark, doc name inline-edit, Library, theme toggle, Export split-button placeholder), three-pane layout with collapse toggles and pane-resize (min widths), fullscreen-canvas mode (all panes collapsed). Empty pane states.

**Accepts**: shell renders three collapsible panes + topbar in light/dark; matches the layout contract in spec; no engine integration yet.
