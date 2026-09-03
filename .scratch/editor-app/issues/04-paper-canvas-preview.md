# 04 — Paper Canvas (live paginated preview)

Status: ready-for-agent
Blocked by: editor-app/01, engine-port/04, engine-port/05, engine-port/06, engine-port/07

The core UX: run the engine pipeline (markdown → paginate → layouts) and render pages into the Paper Canvas — one shadow-DOM per page using the plugin's proven approach (adopted stylesheets, background → banners → header → content → footer → frame layering ported from `drawPreview`). Debounced auto-render (400ms) + manual Ctrl/Cmd+Enter. Floating zoom pill (35–100%, fit-width button), page labels, loading shimmer, RTL `dir` support, in-page anchor click → scroll to target page. Render loop guarded by token (cancel stale renders). Large-doc soft warning >100 pages (toast, "render anyway").

**Accepts**: sample doc renders multi-page pages pixel-consistent with export HTML (same docCSS source); zoom, labels, dark-mode chrome with white paper.
