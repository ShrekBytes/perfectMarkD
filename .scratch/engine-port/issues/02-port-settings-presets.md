# 02 — Port settings model + presets

Status: ready-for-agent
Blocked by: engine-port/01

Port `settings.ts` (PAGE_SIZES, DocStyle, PDFExportSettings, PRESETS ×7, DEFAULT_SETTINGS, validate) into `packages/core`. Cleanups while porting: drop `previewScale` (UI concern, moves to apps/web), rename settings interface to `DocumentSettings` (glossary: Document), keep custom page size (mm) fields, keep `includeOutline`, header/footer band sizing, banner paths (become asset refs), background image fields. Add a settings version field for future migrations. Unit tests for validation clamping.

**Accepts**: presets + defaults compile framework-free; validation tests pass.
