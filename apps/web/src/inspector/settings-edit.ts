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
