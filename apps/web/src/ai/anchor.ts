// ─────────────────────────────────────────────────────────────────────────────
// Anchoring the `/ai` surfaces to the caret (spec §The two commands: "anchored
// below the caret inside the editor pane and clamped to it"). The pane is the
// containing block, so each panel positions itself with a top/left pair
// measured from the caret's client rect — or a bottom/left pair when there is
// no room below — and is capped in height so it can never hang out of the pane.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import type { EditorView } from '@codemirror/view';

/** The prompt popover's authored width (`w-80`), used only to clamp its left. */
const POPOVER_WIDTH = 320;
/** The gap between the caret's line and the panel beside it. */
const GAP = 4;
/** The pane's own inset, so a clamped panel never touches the edge. */
const INSET = 8;
/**
 * Below this much room the panel would be a useless sliver, so it prefers the
 * side with more space instead of the side the caret is on.
 */
const COMFORTABLE_BELOW = 200;

/**
 * A panel's position beside the caret, clamped to the pane. Falls back to the
 * pane's top-left when the caret cannot be measured — a headless test, or a
 * caret scrolled out of view — because a panel in the corner still works and
 * one off-screen does not.
 *
 * The returned `maxHeight` is part of the contract, not a suggestion: the
 * panel's height is only known after it renders, so capping it from the space
 * the caret leaves is what keeps the panel inside the pane on the first paint
 * rather than after a measured correction.
 */
export function caretAnchorStyle(
  view: EditorView | null,
  pos: number,
  pane: HTMLElement | null,
): CSSProperties {
  if (!pane) return { top: INSET, left: INSET, maxHeight: '100%' };
  const rect = pane.getBoundingClientRect();
  const coords = view ? caretCoords(view, pos) : null;
  if (!coords) {
    return { top: INSET, left: INSET, maxHeight: rect.height - INSET * 2 };
  }

  const left = clamp(
    coords.left - rect.left,
    INSET,
    Math.max(INSET, rect.width - POPOVER_WIDTH - INSET),
  );
  const below = rect.bottom - coords.bottom - GAP - INSET;
  const above = coords.top - rect.top - GAP - INSET;

  if (below >= COMFORTABLE_BELOW || below >= above) {
    return {
      top: coords.bottom - rect.top + GAP,
      left,
      maxHeight: Math.max(below, 0),
    };
  }
  return {
    bottom: rect.bottom - coords.top + GAP,
    left,
    maxHeight: Math.max(above, 0),
  };
}

function caretCoords(
  view: EditorView,
  pos: number,
): { left: number; top: number; bottom: number } | null {
  try {
    const clamped = Math.min(Math.max(0, pos), view.state.doc.length);
    return view.coordsAtPos(clamped);
  } catch {
    // CodeMirror measures lazily; a caret that cannot be measured yet is not
    // an error worth surfacing.
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
