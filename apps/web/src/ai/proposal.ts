// ─────────────────────────────────────────────────────────────────────────────
// The review surface's pure half (spec §What the model returns): applying an
// accepted proposal and detecting a stale target. The diff rendering moved to
// the inline review (ai/inline.ts, ai/line-diff.ts); what remains here is the
// acceptance logic both review surfaces share.
// ─────────────────────────────────────────────────────────────────────────────

import { applyAnchoredEdits } from '@perfectmarkd/core';
import type { AiEditProposal, AiTarget } from './types';

export type ApplyResult =
  { ok: true; text: string } | { ok: false; reason: string };

/**
 * The target a stylesheet proposal was computed against: the whole box, as it
 * stood when the request was sent. A replace proposal is one change, so the
 * target's text is both the diff's "before" and the staleness baseline.
 */
export function stylesheetTarget(css: string): AiTarget {
  return { kind: 'document', text: css, from: 0, to: css.length };
}

/**
 * Applies the checked changes to the target text. An anchored proposal passes
 * only the checked blocks to the shared applier, so an unchecked block leaves
 * its anchor alone; a replacement proposal applies only when checked.
 * `checked` is empty when the user unchecked everything — the caller disables
 * Accept in that case, and this returns the original text unchanged.
 */
export function applyProposal(
  target: AiTarget,
  proposal: AiEditProposal,
  checked: ReadonlySet<number>,
): ApplyResult {
  if (proposal.kind === 'replace') {
    return { ok: true, text: checked.has(0) ? proposal.text : target.text };
  }
  const edits = proposal.edits.filter((_, index) => checked.has(index));
  const applied = applyAnchoredEdits(target.text, edits);
  return applied.ok
    ? { ok: true, text: applied.text }
    : {
        ok: false,
        reason:
          'One of the changes no longer matches the document — it cannot be applied.',
      };
}

/** Whether the target text changed under the proposal (spec §stale). */
export function isProposalStale(
  target: AiTarget,
  currentText: string,
): boolean {
  return currentText.slice(target.from, target.to) !== target.text;
}
