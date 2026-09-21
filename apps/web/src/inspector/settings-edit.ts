// ─────────────────────────────────────────────────────────────────────────────
// Pure settings-edit logic for the Inspector: how a settings snapshot changes
// when a control turns. No DOM, no React — the tab components stay thin and
// every rule is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { PRESETS, type DocumentSettings } from '@perfectmarkd/core';

/**
 * Switches the style preset. The DocStyle fields adopt the chosen preset's
 * values; everything outside DocStyle (page size, margins stay in-style, but
 * header/footer text, page numbers, frame, custom page dims…) keeps its
 * current value — a preset is a look, not a document layout. `preset` follows
 * the selection so the gallery can mark it active.
 */
export function applyPreset(
  s: DocumentSettings,
  presetKey: string,
): DocumentSettings {
  const preset = PRESETS[presetKey];
  if (!preset) return s;
  return { ...s, ...preset, preset: presetKey };
}

/** Sets orientation, swapping the custom page dimensions so a custom sheet's
 *  landscape is the same paper turned, not a different one. Named sizes need
 *  no swap — resolvePageDims applies orientation itself. */
export function applyOrientation(
  s: DocumentSettings,
  orientation: DocumentSettings['orientation'],
): DocumentSettings {
  if (s.orientation === orientation) return s;
  return {
    ...s,
    orientation,
    customPageWidth: s.customPageHeight,
    customPageHeight: s.customPageWidth,
  };
}

// ─── Custom-font picker mapping (billing/05) ─────────────────────────────────
// The pickers list uploaded fonts alongside the bundled catalog, but every
// uploaded font resolves to the same settings pair the engine speaks
// (`fontFamily: '__custom__'` + customFontName — resolveFont/resolveCodeFont).
// A `__custom__:<name>` option value makes each font a distinct <option>
// while decoding back to the sentinel pair.

const CUSTOM_FONT_PREFIX = '__custom__:';

/** The <option> value for one uploaded family. */
export function customFontValue(family: string): string {
  return `${CUSTOM_FONT_PREFIX}${family}`;
}

/** Decodes a picker selection into the settings patch: bundled families set
 *  the family string directly, `__custom__:<name>` entries select an
 *  uploaded font through the sentinel pair. The code picker passes its own
 *  field names (codeFontFamily/customCodeFontName). */
export function fontChange(
  value: string,
  familyField: 'fontFamily' | 'codeFontFamily',
  nameField: 'customFontName' | 'customCodeFontName',
): Partial<DocumentSettings> {
  if (!value.startsWith(CUSTOM_FONT_PREFIX)) {
    return { [familyField]: value };
  }
  const family = value.slice(CUSTOM_FONT_PREFIX.length).trim();
  return { [familyField]: '__custom__', [nameField]: family };
}
