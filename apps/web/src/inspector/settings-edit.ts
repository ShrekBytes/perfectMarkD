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

// ─── Custom Stylesheet layer (ai-transforms/01) ──────────────────────────────
// The layer is a switch beside the CSS, never a style value: turning it on
// and off must leave the text (and the chosen Preset) untouched.

/** The layer can only be on while there is CSS to apply — emptying the box
 *  turns it off automatically, so the gallery never claims the paper is
 *  styled when it isn't. */
export const stylesheetHasCSS = (s: DocumentSettings): boolean =>
  !!s.customStylesheet.trim();

/** Edits the Custom Stylesheet text. A non-empty edit leaves the layer's
 *  state alone (typing while off stays off — the tile turns the layer on);
 *  emptying the box turns it off. */
export function editStylesheet(
  s: DocumentSettings,
  css: string,
): Partial<DocumentSettings> {
  return {
    customStylesheet: css,
    customStylesheetEnabled: css.trim() ? s.customStylesheetEnabled : false,
  };
}

/** Switches the layer on or off. Turning on without CSS is a no-op — the
 *  tile routes that click to the Stylesheet tab instead, and the tab's
 *  toggle sits disabled until there is something to apply. */
export function setStylesheetEnabled(
  s: DocumentSettings,
  on: boolean,
): Partial<DocumentSettings> {
  return { customStylesheetEnabled: on && stylesheetHasCSS(s) };
}

/** Writes an accepted AI stylesheet proposal into the box.
 *
 *  The proposal was drawn on the paper while it was under review (the
 *  provisional render, ai-transforms/06), and the spec's rule is that it is
 *  reverted on Reject — so Accept is what keeps it. Writing the box with the
 *  layer off would make the accepted look vanish at the moment of accepting,
 *  which is the one thing the review surface exists to prevent. The switch is
 *  right there in the tab, so the turn-on is visible, not silent; an accepted
 *  empty stylesheet turns the layer off, as emptying the box always does. */
export function applyStylesheetProposal(
  css: string,
): Partial<DocumentSettings> {
  return {
    customStylesheet: css,
    customStylesheetEnabled: css.trim() !== '',
  };
}
