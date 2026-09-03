# editor-app — apps/web (Phase 1)

The React SPA: three-pane editor shell, local document library, Inspector, Paper Canvas, Client Export. Phase 1 ships with **no accounts and no server calls** — feature gates are inert lock icons that open a "coming soon" pricing modal. All design specifics per PLAN.md §2: Excalidraw-low-chrome + modern polish, Inter UI, violet `#7c6af7`, light default + dark toggle (pages stay white paper in dark mode), desktop-first.

## Layout contract

- **Top bar**: wordmark · editable doc name · Library button · theme toggle · (Phase 2: quota chip) · `⬇ Export ▾` split button.
- **Editor pane** (~38%, collapsible): CodeMirror 6, slim toolbar, import/export `.md`, word count.
- **Paper Canvas** (flexible): warm-gray backdrop, centered white pages, soft ambient shadows, floating zoom pill (− 90% + ⤢), per-page "Page N of M" labels, render loading state.
- **Inspector** (320px, collapsible): tabs **Page** / **Style** / **Header-Footer**. Locked controls show 🔒 (custom page size, banner images, background image, custom CSS, custom fonts) → pricing modal.

## State & persistence

Zustand store per document; IndexedDB persistence via a thin wrapper: documents (id, name, markdown, settings snapshot, updatedAt) + assets (id → Blob). Assets referenced from markdown as `asset://<id>` internally, resolved to blob URLs at render time via the engine's `AssetResolver`. Autosave debounced ~500ms.

## Non-goals this phase

accounts, server calls, custom CSS/font upload UIs (Phase 2, billing workstream), cloud sync, mobile-specific layouts.
