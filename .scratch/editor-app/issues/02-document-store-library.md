# 02 — Document store + Library panel

Status: resolved
Blocked by: editor-app/01

Zustand store + IndexedDB (idb wrapper): documents (id, name, markdown, settings snapshot, asset ids, createdAt/updatedAt), assets (id → Blob). Debounced autosave (500ms) with "saved/saving" affordance. Library panel: list sorted by recency, inline rename, duplicate, delete (undoable toast), "New document", "Import .md" (picker + drag-drop anywhere), "Export .md". Import creates a new document. Multi-tab safety: `BroadcastChannel` last-writer-wins with staleness notice.

**Accepts**: create/edit/rename/duplicate/delete/import/export round-trips; reload restores state; offline-first (no network calls).

## Comments

Implemented (2026-09-06), TDD at two seams (`db`, `store`) plus component tests; 205 workspace tests green; every library round-trip plus reload-restore and offline-first verified in a real browser.

- Layout: `apps/web/src/documents/` — `types.ts` (DocumentRecord with settings snapshot + assetIds, AssetRecord), `db.ts` (thin idb wrapper: documents + assets stores, CRUD, recency list), `store.ts` (Zustand store factory + `useDocumentStore` singleton), `text.ts` (name uniquification, import/export file names, relative times). UI in `apps/web/src/library/` — `LibraryPanel` (slide-in drawer over the shell: recency list, hover row actions, inline rename, New document, Import .md picker), `DeleteToast` (bottom-center, 7s window, Undo), `useFileDrop` (window-level .md drag-drop with drop overlay), `download.ts` (Blob download side effect). `StaleBanner` lives in `shell/`.
- Autosave: edits mark the working copy dirty and flush after 500ms; flush also fires on pagehide, visibilitychange→hidden, and document switches. TopBar shows "Saving…"/"Saved" next to the doc name.
- Multi-tab: every write broadcasts `doc-saved`/`doc-deleted` on a BroadcastChannel. Peers adopt a newer active-document record when clean; when they hold unflushed edits they keep theirs and raise the staleness banner ("Load changes" adopts the peer version / "Keep mine" lets the next flush win). Out-of-order (older) broadcasts are ignored in both branches.
- Deletes are undoable for the most recent deletion: the record and its orphaned assets are held in memory until Undo or the toast's 7s timeout; a newer delete supersedes the pending snapshot (single toast slot). Deleting a document removes only assets no remaining document references; duplicate shares assetIds, so deleting a sibling keeps them alive.
- First run seeds one blank "Untitled document" so the shell is immediately usable; issue 07's sample-onboarding will layer on top. Blank documents share the "Untitled" name (uniquified names only for copies/imports); the active-doc pointer persists in localStorage (`perfectmarkd:activeDoc`).
- Design decisions worth noting: one global store holding the library + the active working copy (the workstream spec's "store per document" reads as per-document *state*, which the working copy provides — a store per document would fragment the library list); staleness notice shipped with explicit "Load changes"/"Keep mine" actions rather than a bare notice; drag-drop imports every dropped .md file while the picker imports one.
- Test infrastructure: `testing/stub-idb.ts` (fresh fake-indexeddb factory + IDB globals per test) and `testing/stub-broadcast-channel.ts` (same-process channel registry for two-tab simulations). Web's tsconfig includes core's `vendor-types.d.ts` because the base tsconfig aliases `@perfectmarkd/core` to its source.
- Code review fixes applied: extracted `persistAndBroadcast`/`activateFallback` helpers, stale-broadcast guard added to the dirty branch (out-of-order messages no longer raise the banner; regression test added), `StaleBanner` extracted from AppShell, `--danger` design token (light/dark) replaces raw `text-red-600`, `isMarkdownFile` un-exported, two LibraryPanel tests hardened with `waitFor` (flaked under parallel load).
