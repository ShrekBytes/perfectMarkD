# 06 — Port page layout builder + outline/bookmark injection

Status: ready-for-agent
Blocked by: engine-port/02, engine-port/05

Port `buildPageLayouts` (header/footer zones, page-number template `{{current}}/{{total}}/{{title}}`, first-page suppression, display-number offset) and `extractOutlineEntries` + `injectPDFOutline` (pdf-lib bookmark tree, XYZ destinations, collapsed subtrees, UseOutlines) verbatim into `packages/core`. Rename `PDFExportSettings` references to `DocumentSettings` per ticket 02.

**Accepts**: `injectPDFOutline` unit test — build a 3-page dummy PDF, inject entries, assert outline objects with pdf-lib read-back.
