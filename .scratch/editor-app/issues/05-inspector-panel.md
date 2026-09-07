# 05 — Inspector panel (Page / Style / Header-Footer)

Status: resolved
Blocked by: editor-app/04, editor-app/09

Three tabs per PLAN.md §2, backed by the settings snapshot per document. **Page**: size (A4/A3/A5/Letter/Legal/custom W×H mm — custom locked), orientation, margins (4 inputs, mm), frame (enable, style, color, thickness, margin), background image (upload → asset, fit/scope/opacity — locked). **Style**: preset gallery as visual thumbnails (render tiny page previews per preset with CSS — no full engine run), typography (font family from bundled catalog, size, line height, paragraph spacing, heading scale), colors (accent/body/bold/heading/blockquote/code/table), code theme dropdown (Shiki catalog), code font + ligatures. **Header-Footer**: show/hide, first-page suppression, text + alignment, font size/color, borders, page numbers (show, position, format template with `{{current}}/{{total}}/{{title}}`, start), banner image upload (locked). Locked controls show 🔒 → pricing modal (ticket 09); in Phase 1 every gate is locked for everyone.

**Accepts**: every change re-renders the canvas (debounced); locks visible on the five gated controls; settings persist per document.

## Comments

Implemented 2026-09-08 (picked up from a prior claimed-but-incomplete session;
`apps/web/src/inspector/` arrived untracked with the AppShell wiring,
`LockIcon`, `CODE_THEMES`, and most tests already in place).

- `apps/web/src/inspector/Inspector.tsx` — tab shell (Page/Style/Header-Footer
  roles, `tabpanel` per tab), empty state when no document is open, `set`
  patches through `updateActive` (new settings object identity → canvas
  re-renders on its debounced subscription; store autosaves ~500ms, so edits
  persist per document), `PricingModal` opened from every lock.
- `PageTab.tsx` — named sizes (Custom option disabled), locked custom W×H
  preview bound to `settings.customPageWidth/Height`, orientation via
  `applyOrientation` (swaps custom dims), 4 margin inputs, full frame group,
  background gate: one lock + upload plus disabled fit/scope/opacity previews
  bound to the snapshot.
- `StyleTab.tsx` — 7-preset radiogroup gallery (`PresetThumb` CSS sketches,
  no engine run), typography (bundled body catalog, size, line height,
  paragraph spacing, heading scale), 8 color pickers + striped tables, Shiki
  `CODE_THEMES` dropdown, code font + ligatures, locked Custom fonts /
  Custom stylesheet rows.
- `HeaderFooterTab.tsx` — per-band show, first-page suppression, text,
  alignment, font size/color, borders; page numbers (show, position, format
  template with `{{current}}/{{total}}/{{title}}` hint, start); locked banner
  upload in each band.
- `controls.tsx` — Field/Section/inputs/select/color/checkbox primitives,
  `GateLock` (lock → pricing modal) + `LockedRow`, `FauxUploadButton`;
  `pickerHex` hardened with a neutral fallback so non-hex values
  (`transparent`) never reach the native color input.
- `settings-edit.ts` — pure `applyPreset` (DocStyle-only adoption) +
  `applyOrientation`; `fonts.ts` bundled catalog; `PresetThumb.tsx` thumbnails.
- `packages/core/src/render.ts` — `CODE_THEMES` export (`none` + sorted Shiki
  ids) with `code-themes.test.ts`; `AppShell.tsx` mounts `Inspector`;
  `AppShell.test.tsx` pins the shell wiring (Inspector live, settings edit →
  canvas pages).
- Tests: 33 inspector (tabs, margins incl. draft/clamp, orientation, frame,
  page size, gates incl. new background sub-controls + custom fonts/CSS,
  presets, typography, colors, Shiki catalog, ligatures, code font,
  header/footer text/suppression/format/position/start/banners/sizes/colors,
  modal from any lock, autosave round-trip, object-identity re-render).
  Full workspace suite 552 passing; typecheck/eslint/prettier clean.
- Two-axis review fixes applied: custom W×H now bound to the snapshot (was
  hardcoded 210×297); `pickerHex` fallback (comment already promised it).
  Recorded, not changed: lock buttons count six (banner images gated once per
  spec.md but rendered per band); background fit/scope/opacity share the
  gate's single lock; `codeFontSize` has no control (issue asks only for code
  font + ligatures); a persisted `pageSize: 'Custom'` renders a blank select
  (unreachable in Phase 1 — Custom can't be set).
