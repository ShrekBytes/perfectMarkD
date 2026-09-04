# 02 — Port settings model + presets

Status: resolved
Blocked by: engine-port/01

Port `settings.ts` (PAGE_SIZES, DocStyle, PDFExportSettings, PRESETS ×7, DEFAULT_SETTINGS, validate) into `packages/core`. Cleanups while porting: drop `previewScale` (UI concern, moves to apps/web), rename settings interface to `DocumentSettings` (glossary: Document), keep custom page size (mm) fields, keep `includeOutline`, header/footer band sizing, banner paths (become asset refs), background image fields. Add a settings version field for future migrations. Unit tests for validation clamping.

**Accepts**: presets + defaults compile framework-free; validation tests pass.

## Comments

Implemented 2026-09-04 (this commit).

- `packages/core/src/settings.ts`: `PAGE_SIZES`, `DocStyle`, `DocumentSettings` (renamed from `PDFExportSettings`), `PRESETS` ×7, `DEFAULT_SETTINGS`, plus the module's `PRESET_COLOR_KEYS` and `extractDocStyle`. Zero imports — framework-free; re-exported from the package index. All preset/default values ported value-for-value from the source module.
- `previewScale` dropped from the schema (UI concern; apps/web owns it when the Paper Canvas lands), so its clamp is not ported either.
- Banner fields renamed `headerImagePath`→`headerImageRef`, `footerImagePath`→`footerImageRef`, `backgroundImagePath`→`backgroundImageRef`: they are asset refs for the engine's `AssetResolver` (data:/blob:/https:), not vault paths.
- `settingsVersion: number` + `SETTINGS_VERSION = 1` added for future migrations.
- `validate(settings) → DocumentSettings` is pure (returns a repaired copy; the original mutated app state and warned on console — logging stays app-side). Ports every original clamp (unknown preset → `default`; font sizes ≥ 1; margins ≥ 0; custom page ≥ 10 mm; `pageNumberStart` ≥ 1; `pageNumberFormat` fallback) and extends them to fields the original predated: header/footer band heights ≥ 0, banner image margins ≥ 0, `backgroundImageOpacity` ∈ [0, 1].
- 18 unit tests: validation clamping incl. purity and pass-through, plus preset/defaults shape guards. Acceptance verified: full suite, typecheck, lint, and build all green; `settings.ts` has no imports.
- Two-axis code review: no violations. Deferred: `extractDocStyle` hand-copies the 26 DocStyle fields (kept for port fidelity; the shape-uniformity test guards drift — consider a `DOC_STYLE_KEYS`-driven pick if the schema grows).
