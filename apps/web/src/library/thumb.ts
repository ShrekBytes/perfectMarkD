// ─────────────────────────────────────────────────────────────────────────────
// Drawer-row geometry for the Library's miniature sheet: 28px wide, its
// height from the document's own page size and orientation, so the sheet's
// shape is legible at a glance in the row. Page dimensions come from the
// engine's own derivation (resolvePageDims) — never a local copy.
// ─────────────────────────────────────────────────────────────────────────────

import { resolvePageDims, type DocumentSettings } from '@perfectmarkd/core';

/** The row's leading thumbnail footprint in px. */
export function thumbFootprint(settings: DocumentSettings): {
  width: number;
  height: number;
} {
  const width = 28;
  const size = resolvePageDims(settings);
  const heightOverWidth =
    settings.orientation === 'portrait' ? size.h / size.w : size.w / size.h;
  return { width, height: Math.round(width * heightOverWidth) };
}
