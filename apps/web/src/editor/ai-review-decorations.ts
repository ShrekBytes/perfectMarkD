// ─────────────────────────────────────────────────────────────────────────────
// The inline AI review (spec §The review surface, as reshaped): a `/ai`
// proposal is drawn where it lands in the editor, not in a modal. Each change
// renders as the original text struck through and faded, with the proposed
// text as a suggestion block right below it; an unchecked change's suggestion
// is dimmed, so what Accept will apply is exactly what reads solid.
//
// Block decorations cannot ride a view plugin, so the set lives in a state
// field: the pane dispatches `pushAiReview` whenever the review under it
// changes (new proposal, toggled checkbox, closed review), and any Document
// change clears the field — the hunks' offsets then name somebody else's text,
// which is exactly what the review bar's stale reason already says. The
// suggestion blocks are widgets: they never become part of the Document.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import {
  Range,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state';
import type { InlineHunk } from '../ai/inline';

/**
 * Range construction through a cast: CodeMirror's declaration marks the
 * constructor private (it steers callers to RangeSetBuilder), but the runtime
 * constructor is a plain class and `Decoration.set(ranges, true)` is the API
 * that sorts a mixed set of marks and block widgets correctly.
 */
const makeRange = Range as unknown as new (
  from: number,
  to: number,
  value: Decoration,
) => Range<Decoration>;

/** What the pane pushes into the editor when the review changes. */
export interface AiReviewInput {
  /** All changes, in document order. */
  hunks: readonly InlineHunk[];
  /** The ids Accept will apply; ids absent from it render dimmed. */
  checked: ReadonlySet<number>;
}

const delMark = Decoration.mark({ class: 'cm-ai-del' });

/**
 * The proposed text, drawn as an inset suggestion block below the struck
 * region. Hidden from the accessibility tree: the review bar above the editor
 * is the review surface, and a widget cannot take part in selection or undo.
 */
class SuggestionWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly checked: boolean,
  ) {
    super();
  }

  override eq(other: SuggestionWidget): boolean {
    return other.text === this.text && other.checked === this.checked;
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = this.checked
      ? 'cm-ai-suggestion'
      : 'cm-ai-suggestion cm-ai-dimmed';
    wrap.setAttribute('aria-hidden', 'true');
    for (const line of this.text.split('\n')) {
      const row = document.createElement('div');
      row.textContent = line;
      wrap.appendChild(row);
    }
    return wrap;
  }

  // The widget itself is inert; clicks and keys fall through to the editor's
  // ordinary handling rather than being swallowed.
  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Builds the decoration set for one review state: the struck original over its
 * own range, and the suggestion block under the hunk's last line, so the
 * reader sees "what is there, then what replaces it".
 *
 * Exported for tests: CodeMirror draws only the measured viewport, which is
 * zero-height under jsdom, so the set is asserted directly rather than through
 * rendered DOM (real rendering is the browser e2e suite's job).
 */
export function buildDecorations(
  hunks: readonly InlineHunk[],
  checked: ReadonlySet<number>,
  docLength: number,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const hunk of hunks) {
    const from = Math.min(hunk.from, docLength);
    const to = Math.min(hunk.to, docLength);
    if (to > from) {
      ranges.push(new makeRange(from, to, delMark));
    }
    if (hunk.insert !== '') {
      // Block widgets must sit on a line boundary; the end line's start with
      // side 1 draws the block directly below the struck region.
      const under = Math.min(to, docLength);
      ranges.push(
        new makeRange(
          under,
          under,
          Decoration.widget({
            widget: new SuggestionWidget(hunk.insert, checked.has(hunk.id)),
            block: true,
            side: 1,
          }),
        ),
      );
    }
  }
  return Decoration.set(ranges, true);
}

/**
 * The review state in the editor: the drawn set, or null when nothing is
 * under review. Null — not `Decoration.none` — is the resting marker, so the
 * pane and the tests can tell "cleared" from "an empty review".
 */
const setReview = StateEffect.define<DecorationSet | null>();

/** The review field, exported for tests (the assertion seam for the drawn set). */
export const reviewField = StateField.define<DecorationSet | null>({
  create: () => null,
  update(set, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setReview)) return effect.value;
    }
    // A Document change invalidates the hunks' offsets: draw nothing until the
    // next push (the review bar's staleness reason covers the gap).
    return transaction.docChanged ? null : set;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (set) => set ?? Decoration.none),
});

/** The inline review extension; pair it with `pushAiReview` calls. */
export function aiReviewDecorations(): Extension {
  return reviewField;
}

/**
 * Draws the review (or clears it with null). Called by the pane whenever the
 * review state changes — a new proposal, a toggled checkbox, a close.
 * @param view the editor whose field receives the set.
 */
export function pushAiReview(
  view: EditorView,
  input: AiReviewInput | null,
): void {
  const set = input
    ? buildDecorations(input.hunks, input.checked, view.state.doc.length)
    : null;
  view.dispatch({ effects: setReview.of(set) });
}

export { SuggestionWidget };
