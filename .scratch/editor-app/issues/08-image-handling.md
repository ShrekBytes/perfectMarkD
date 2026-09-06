# 08 — Image handling (paste, drop, picker)

Status: resolved
Blocked by: editor-app/02, editor-app/03

Images are local assets, never uploaded (privacy posture): paste from clipboard, drag-drop onto editor, or picker → Blob in IndexedDB asset store → markdown ref inserted as `![alt](asset://<id>)`. `AssetResolver` maps refs to blob URLs for preview and to data: URIs for Client Export HTML. Image Inspector affordance: clicking an image in the canvas shows alt/width controls (optional, cheap). Refuse >20 MB single assets with a clear message. Store media type; svg allowed.

**Accepts**: paste/drop/picker round-trip; images survive reload; export HTML embeds them (data:); oversized rejected gracefully.

## Comments

**Implementation** (commit a0f829c, plus 418546c for a pre-existing test-env fix it surfaced):

- `apps/web/src/assets/ingest.ts` — `prepareAsset` validates before reading bytes: >20 MB (`MAX_ASSET_BYTES`) → `too-large`; type from MIME or file extension (map includes `image/svg+xml`) → else `unsupported`. Alt text derived from the file name, brackets/newlines stripped. `assetRef`/`parseAssetRef` are the `asset://<id>` codec.
- `AssetRecord` stores **raw bytes + mediaType** instead of a Blob (deviation from the ticket's "Blob in IndexedDB" wording, and from spec.md's "assets (id → Blob)"): fake-indexeddb under jsdom corrupts Blobs through structured clone (bytes survive), the media type is explicit as the ticket asks, and the payload serializes for Server Export later. Resolvers rebuild a Blob from `bytes` + `mediaType` on read.
- `apps/web/src/assets/resolver.ts` — `createAssetResolver(db, 'blob-url' | 'data-uri')` is the host side of core's `AssetResolver` seam. Async IDB reads behind a sync facade: `warmup(refs)` pre-resolves, then plain calls hit the cache; `dispose()` revokes blob URLs; non-asset refs (https:, data:) pass through untouched; unresolvable refs return undefined.
- Store: `addAsset(file)` puts the asset durable **before** the ref exists in markdown, pushes the id into `pendingAssetIds`, and marks dirty so the next flush persists `assetIds` even without a text edit. Pending ids merge at flush time so a peer's last-writer-wins adoption between addAsset and flush can't drop the reference. Orphan cleanup on delete/undo already works off `assetIds` (ticket 02).
- Editor: `insertAssetImages(items, at?)` inserts the refs as their own block (line-broken, undoable). Paste (images only; text wins if the clipboard has both) and drop (at `posAtCoords`, falling back to the cursor) go through `EditorView.domEventHandlers`; the drop handler claims **all** file drops so CodeMirror's own file-as-text insertion can't race the window-level .md import. The toolbar picker is a hidden input, self-wired in the pane (`onPickImage` prop removed). Failures surface as a `role="status"` notice strip above the word count (auto-dismisses, 6 s).
- Oversize/type notices quote the failing file's name; the format list is deliberately non-exhaustive ("PNG, JPEG, WebP, SVG, or similar") so it can't drift from the extension map.
- Acceptance: round-trip and reload tests in `store.test.ts`/`EditorPane.test.tsx`; `export-embed.test.ts` proves a stored asset rides `buildExportHTML` as `data:image/png;base64,…` with no `asset://` left. Full suite 364 passing; typecheck/lint/prettier clean.
- Deferred: the optional Image Inspector alt/width affordance (needs the Paper Canvas — ticket 04).

**Contract notes for ticket 04 (Paper Canvas):**

- Resolve refs via `createAssetResolver(db, 'blob-url')`; call `warmup(refs)` with the document's `asset://` refs before/at render, then read synchronously. A lazily-resolved ref returns `undefined` until its read lands (no invalidation callback — re-warm after doc switches).
- Call `dispose()` when the canvas tears down or the document changes, or blob URLs accumulate for the session.

**Contract notes for ticket 06 (Client Export):**

- Use `createAssetResolver(db, 'data-uri')`, `warmup()` every `asset://` ref in the document, swap `img[src]` on the page nodes (or pass the resolver straight to `buildExportHTML` for banner/background layers), then export — see `export-embed.test.ts` for the shape.

**Open, not spec'd here:** assets orphaned by deleting an image ref from the markdown stay in the store until the document is deleted (delete-time cleanup only). If that matters, slot it into ticket 04/06 scope.
