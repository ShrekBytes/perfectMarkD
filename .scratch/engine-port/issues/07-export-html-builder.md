# 07 — Export HTML builder (the shared print document)

Status: ready-for-agent
Blocked by: engine-port/03, engine-port/05, engine-port/06

Port the export-path half of `export-modal.ts` (`buildExportDocument`'s page HTML assembly: background layer → header banner → header text → content → footer banner → footer text → frame, one `page-break-after` div per page, `@page` size, print CSS) into `packages/core` as a pure function `buildExportHTML(layouts, settings, assets) → string`. Asset refs resolve through the `AssetResolver`. This one function feeds both Client Export (hidden iframe) and Server Export (Playwright `/export` route) — ADR-0003's single-pipeline guarantee.

**Accepts**: golden snapshot test of the HTML for a 2-page sample with header/footer/frame/background enabled.
