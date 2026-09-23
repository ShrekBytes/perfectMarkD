// ─────────────────────────────────────────────────────────────────────────────
// Turning an AI Proposal into the review surface's change set (spec §The
// review surface and §What the model returns).
//
// Pure and DOM-free: the dialog renders `changes` and reports which are
// checked; this module decides what text that produces. An anchored proposal
// yields one change per block (partial acceptance passes only the checked
// blocks to the engine's applier, so an unchecked block is never applied); a
// replacement proposal — a selection, an empty-Document generation, or a
// stylesheet — is one change.
// ─────────────────────────────────────────────────────────────────────────────

import { applyAnchoredEdits } from '@perfectmarkd/core';
import type { AiProposal, AiTarget } from './types';

/** Lines of context shown around each change. */
const CONTEXT_LINES = 3;

export interface AiChange {
  id: number;
  /** The lines this change removes (empty for a pure insertion). */
  before: string[];
  /** The lines this change adds (empty for a pure deletion). */
  after: string[];
  contextBefore: string[];
  contextAfter: string[];
}

export interface AiChangeSet {
  target: AiTarget;
  changes: AiChange[];
}

export type ApplyResult =
  { ok: true; text: string } | { ok: false; reason: string };

/** Builds the change set the review dialog renders. */
export function buildChangeSet(
  target: AiTarget,
  proposal: AiProposal,
): AiChangeSet {
  if (proposal.kind === 'anchored') {
    return {
      target,
      changes: proposal.edits.map((edit, id) => {
        const context = anchoredContext(target.text, edit.search);
        return {
          id,
          before: splitLines(edit.search),
          after: splitLines(edit.replace),
          contextBefore: context.before,
          contextAfter: context.after,
        };
      }),
    };
  }
  return {
    target,
    changes: [
      {
        id: 0,
        before: splitLines(target.text),
        after: splitLines(proposal.text),
        contextBefore: [],
        contextAfter: [],
      },
    ],
  };
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
  proposal: AiProposal,
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

/**
 * Whole lines of context around an anchor. The partial line the anchor starts
 * on and the partial line it ends on are not context — the change itself is
 * already shown line by line — so the boundary fragments are dropped rather
 * than rendered as a blank line above and below every change.
 */
function anchoredContext(
  text: string,
  search: string,
): { before: string[]; after: string[] } {
  const at = text.indexOf(search);
  if (at === -1) return { before: [], after: [] };
  const beforeLines = text.slice(0, at).split('\n');
  beforeLines.pop();
  const afterLines = text.slice(at + search.length).split('\n');
  afterLines.shift();
  return {
    before: beforeLines.slice(Math.max(0, beforeLines.length - CONTEXT_LINES)),
    after: afterLines.slice(0, CONTEXT_LINES),
  };
}

function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}
