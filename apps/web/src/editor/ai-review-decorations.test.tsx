// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cleanup, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach } from 'vitest';
import {
  SuggestionWidget,
  aiReviewDecorations,
  buildDecorations,
  pushAiReview,
  reviewField,
} from './ai-review-decorations';
import { locateProposal } from '../ai/inline';
import type { InlineHunk } from '../ai/inline';

afterEach(cleanup);

const DOC = 'Alpha\nBeta\nGamma';

/**
 * The decoration set as plain ranges. CodeMirror draws only the measured
 * viewport — zero-height under jsdom — so the set is asserted directly rather
 * than through rendered DOM; real rendering is the browser e2e suite's job.
 */
function ranges(set: ReturnType<typeof buildDecorations>) {
  const out: { from: number; to: number; specClass: string | null }[] = [];
  set.between(0, 1e9, (from, to, value) => {
    out.push({
      from,
      to,
      specClass: value.spec.class ?? (value.spec.widget ? 'widget' : null),
    });
  });
  return out;
}

function mountEditor(): EditorView {
  let view: EditorView | null = null;
  function Host() {
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      view = new EditorView({
        parent: host.current!,
        state: EditorState.create({
          doc: DOC,
          extensions: [aiReviewDecorations()],
        }),
      });
      return () => view?.destroy();
    }, []);
    return <div ref={host} />;
  }
  render(<Host />);
  if (!view) throw new Error('editor not mounted');
  return view;
}

describe('buildDecorations', () => {
  it('draws a struck region over the change and a suggestion block under it', () => {
    const set = buildDecorations(
      [{ id: 0, from: 6, to: 10, insert: 'BETA!' }],
      new Set([0]),
      DOC.length,
    );
    expect(ranges(set)).toEqual([
      { from: 6, to: 10, specClass: 'cm-ai-del' },
      { from: 10, to: 10, specClass: 'widget' },
    ]);
  });

  it('omits the block for a pure deletion', () => {
    const set = buildDecorations(
      [{ id: 0, from: 0, to: 5, insert: '' }],
      new Set([0]),
      DOC.length,
    );
    expect(ranges(set)).toEqual([{ from: 0, to: 5, specClass: 'cm-ai-del' }]);
  });

  it('clamps hunks past the document (typed under the review)', () => {
    const set = buildDecorations(
      [{ id: 0, from: 10, to: 40, insert: 'x' }],
      new Set([0]),
      DOC.length,
    );
    const drawn = ranges(set);
    expect(drawn.every((range) => range.to <= DOC.length)).toBe(true);
  });

  it('locates real proposal edits into hunks the decorations can draw', () => {
    // The seam the controller uses: proposal + target → hunks.
    const hunks = locateProposal(
      { kind: 'document', text: DOC, from: 0, to: DOC.length },
      {
        kind: 'anchored',
        edits: [
          { search: 'Alpha', replace: 'ALPHA' },
          { search: 'Gamma', replace: 'Γ' },
        ],
      },
    )!;
    expect(hunks.map((hunk) => hunk.id)).toEqual([0, 1]);
    const set = buildDecorations(hunks, new Set([0, 1]), DOC.length);
    const drawn = ranges(set);
    expect(drawn.filter((range) => range.specClass === 'cm-ai-del')).toEqual([
      { from: 0, to: 5, specClass: 'cm-ai-del' },
      { from: 11, to: 16, specClass: 'cm-ai-del' },
    ]);
    expect(drawn.filter((range) => range.specClass === 'widget')).toHaveLength(
      2,
    );
  });
});

describe('the editor integration', () => {
  it('pushes a review in, and a Document change clears it', () => {
    const view = mountEditor();
    const hunks: InlineHunk[] = [{ id: 0, from: 6, to: 10, insert: 'BETA!' }];

    expect(view.state.field(reviewField)).toBeNull();
    pushAiReview(view, { hunks, checked: new Set([0]) });
    expect(ranges(view.state.field(reviewField)!)).toHaveLength(2);

    // A Document edit clears the decorations: the offsets no longer match.
    view.dispatch({ changes: { from: 0, insert: 'x ' } });
    expect(view.state.field(reviewField)).toBeNull();

    // A fresh push draws again.
    pushAiReview(view, { hunks, checked: new Set([0]) });
    expect(ranges(view.state.field(reviewField)!)).toHaveLength(2);

    // A null push (review closed) clears.
    pushAiReview(view, null);
    expect(view.state.field(reviewField)).toBeNull();
  });
});

describe('the suggestion widget', () => {
  it('renders one row per line and hides itself from the a11y tree', () => {
    const widget = new SuggestionWidget('one\ntwo', true);
    const dom = widget.toDOM();
    expect(dom.className).toBe('cm-ai-suggestion');
    expect(dom.getAttribute('aria-hidden')).toBe('true');
    expect(dom.children).toHaveLength(2);
    expect(widget.eq(new SuggestionWidget('one\ntwo', true))).toBe(true);
    expect(widget.eq(new SuggestionWidget('one', true))).toBe(false);
    expect(widget.eq(new SuggestionWidget('one\ntwo', false))).toBe(false);
  });

  it('marks unchecked suggestions dimmed', () => {
    const dimmed = new SuggestionWidget('x', false).toDOM();
    expect(dimmed).toHaveClass('cm-ai-dimmed');
  });
});
