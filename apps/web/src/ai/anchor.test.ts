import { describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { caretAnchorStyle } from './anchor';

/** A pane whose box is 400×500 at (0, 0). */
function pane(height = 500, width = 400): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
    }),
  } as unknown as HTMLElement;
}

/** A view whose caret sits at a known client rect. */
function view(caret: {
  left: number;
  top: number;
  bottom: number;
}): EditorView {
  return {
    state: { doc: { length: 100 } },
    coordsAtPos: () => caret,
  } as unknown as EditorView;
}

describe('caretAnchorStyle', () => {
  it('sits just below the caret when there is room', () => {
    const style = caretAnchorStyle(
      view({ left: 40, top: 100, bottom: 120 }),
      10,
      pane(),
    );
    expect(style.top).toBe(124);
    expect(style.left).toBe(40);
    expect(style.bottom).toBeUndefined();
    // The cap is the space the caret leaves below it, less the inset.
    expect(style.maxHeight).toBe(500 - 120 - 4 - 8);
  });

  it('flips above the caret when the space below is too small', () => {
    // The caret is on the pane's last line: below is 16px, above is 456px.
    const style = caretAnchorStyle(
      view({ left: 12, top: 460, bottom: 480 }),
      10,
      pane(),
    );
    expect(style.bottom).toBe(500 - 460 + 4);
    expect(style.top).toBeUndefined();
    expect(style.maxHeight).toBe(460 - 0 - 4 - 8);
  });

  it('stays below when the space below is merely smaller than comfortable', () => {
    // 150px below is under the comfort threshold but still more than above.
    const style = caretAnchorStyle(
      view({ left: 0, top: 100, bottom: 340 }),
      10,
      pane(500),
    );
    expect(style.top).toBe(344);
    expect(style.maxHeight).toBe(500 - 340 - 4 - 8);
  });

  it('clamps the left edge so the panel never leaves the pane', () => {
    const narrow = caretAnchorStyle(
      view({ left: 380, top: 100, bottom: 120 }),
      10,
      pane(),
    );
    // 400 wide pane, 320 wide panel, 8px inset.
    expect(narrow.left).toBe(72);

    const negative = caretAnchorStyle(
      view({ left: -20, top: 100, bottom: 120 }),
      10,
      pane(),
    );
    expect(negative.left).toBe(8);
  });

  it('falls back to the pane corner when the caret cannot be measured', () => {
    const unmeasurable = {
      state: { doc: { length: 100 } },
      coordsAtPos: () => null,
    } as unknown as EditorView;

    expect(caretAnchorStyle(unmeasurable, 10, pane())).toEqual({
      top: 8,
      left: 8,
      maxHeight: 484,
    });
    expect(
      caretAnchorStyle(view({ left: 0, top: 0, bottom: 0 }), 10, null),
    ).toEqual({
      top: 8,
      left: 8,
      maxHeight: '100%',
    });
  });

  it('never returns a negative height cap', () => {
    const style = caretAnchorStyle(
      view({ left: 0, top: 0, bottom: 600 }),
      10,
      pane(500),
    );
    expect(style.maxHeight).toBe(0);
  });
});
