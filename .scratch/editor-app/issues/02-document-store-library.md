# 02 — Document store + Library panel

Status: ready-for-agent
Blocked by: editor-app/01

Zustand store + IndexedDB (idb wrapper): documents (id, name, markdown, settings snapshot, asset ids, createdAt/updatedAt), assets (id → Blob). Debounced autosave (500ms) with "saved/saving" affordance. Library panel: list sorted by recency, inline rename, duplicate, delete (undoable toast), "New document", "Import .md" (picker + drag-drop anywhere), "Export .md". Import creates a new document. Multi-tab safety: `BroadcastChannel` last-writer-wins with staleness notice.

**Accepts**: create/edit/rename/duplicate/delete/import/export round-trips; reload restores state; offline-first (no network calls).
