// ─────────────────────────────────────────────────────────────────────────────
// Locating an AI Proposal inside the Document (spec §The review surface,
// inline): the editor shows each change where it lands — the original text
// struck, the proposed text beside it — instead of a modal diff. Pure and
// DOM-free: the decorations extension renders what this returns.
//
// The ids are the change ids the acceptance path already speaks (an anchored
// proposal's edit index, a replacement's single 0), so a partial acceptance
// and the decoration it dims can never disagree about which change is which.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiEditProposal, AiTarget } from './types';

/** One change, located: replace `[from, to)` with `insert` in the Document. */
export interface InlineHunk {
  id: number;
  /** Document offset where the removed text starts (=== `to` for a pure
   *  insertion). */
  from: number;
  /** Document offset where the removed text ends. */
  to: number;
  /** The replacement text ('' for a pure deletion). */
  insert: string;
}

/**
 * Locates a proposal against the target it was computed against, as offsets
 * into the Document (the target's `from` is where it sits in the Document).
 * Null when the changes cannot be shown where they land — an anchor that is
 * missing or ambiguous — and the review bar then says so instead of drawing
 * decorations in the wrong place.
 */
export function locateProposal(
  target: AiTarget,
  proposal: AiEditProposal,
): InlineHunk[] | null {
  if (proposal.kind === 'replace') {
    // A selection rewrite or a from-nothing generation: one change covering
    // the target. (A whole-Document markdown reply is anchored edits, never a
    // replacement, so this is always a bounded range.)
    return [{ id: 0, from: target.from, to: target.to, insert: proposal.text }];
  }
  const hunks: InlineHunk[] = [];
  for (const [id, edit] of proposal.edits.entries()) {
    if (edit.search === '') return null;
    // Same rule as the engine's applier: exactly once, overlaps counted. An
    // anchor that matches twice cannot be shown honestly, let alone applied.
    if (countOccurrences(target.text, edit.search) !== 1) return null;
    const at = target.text.indexOf(edit.search);
    hunks.push({
      id,
      from: target.from + at,
      to: target.from + at + edit.search.length,
      insert: edit.replace,
    });
  }
  // The acceptance path applies edits in the order given; decorations must be
  // in document order. Sorting a copy keeps both: ids carry the identity.
  return hunks.sort((x, y) => x.from - y.from || x.to - y.to);
}

/** How many times a needle can be read in the text, overlaps counted — the
 *  engine's own rule, mirrored so both refuse the same proposals. */
function countOccurrences(text: string, search: string): number {
  let count = 0;
  let index = text.indexOf(search);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(search, index + 1);
  }
  return count;
}
