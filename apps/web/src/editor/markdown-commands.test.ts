// @vitest-environment jsdom
// CodeMirror's EditorState touches DOM-adjacent globals; jsdom keeps parity
// with how the commands run in the app.
import { markdown } from '@codemirror/lang-markdown';
import {
  EditorSelection,
  EditorState,
  type Extension,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  cycleHeading,
  insertAssetImages,
  insertLink,
  insertPageBreak,
  insertTable,
  toggleBold,
  toggleBulletList,
  toggleItalic,
} from './markdown-commands';

/** Runs a command against a state, capturing the dispatched transaction. */
function run(
  command: StateCommand,
  doc: string,
  anchor: number,
  head = anchor,
  extensions: Extension[] = [],
): { applied: boolean; transaction: Transaction | null } {
  let transaction: Transaction | null = null;
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions,
  });
  const applied = command({
    state,
    dispatch: (tr: Transaction) => {
      transaction = tr;
    },
  });
  return { applied, transaction };
}

/** Doc text after running the command (unchanged when it applied no changes). */
function doc(
  command: StateCommand,
  doc: string,
  anchor: number,
  head = anchor,
  extensions: Extension[] = [],
) {
  const { applied, transaction } = run(command, doc, anchor, head, extensions);
  return applied && transaction ? transaction.state.doc.toString() : doc;
}

/** Main selection of the state produced by the command. */
function selection(
  command: StateCommand,
  doc: string,
  anchor: number,
  head = anchor,
  extensions: Extension[] = [],
) {
  const { applied, transaction } = run(command, doc, anchor, head, extensions);
  if (!applied || !transaction) return null;
  const range = transaction.state.selection.main;
  return { anchor: range.anchor, head: range.head };
}

describe('toggleBold', () => {
  it('inserts an empty bold pair at the cursor', () => {
    expect(doc(toggleBold, 'ab', 1)).toBe('a****b');
    expect(selection(toggleBold, 'ab', 1)).toEqual({ anchor: 3, head: 3 });
  });

  it('wraps the selection and keeps the inner text selected', () => {
    expect(doc(toggleBold, 'a hello b', 2, 7)).toBe('a **hello** b');
    expect(selection(toggleBold, 'a hello b', 2, 7)).toEqual({
      anchor: 4,
      head: 9,
    });
  });

  it('unwraps when the markers surround the selection', () => {
    expect(doc(toggleBold, 'a **hello** b', 4, 9)).toBe('a hello b');
    expect(selection(toggleBold, 'a **hello** b', 4, 9)).toEqual({
      anchor: 2,
      head: 7,
    });
  });

  it('unwraps when the selection includes the markers', () => {
    expect(doc(toggleBold, 'a **hello** b', 2, 11)).toBe('a hello b');
  });

  it('wraps rather than unwrapping markers from a previous line', () => {
    // The opening `**` sits on another line, so it cannot close this one.
    expect(doc(toggleBold, '**\ntext', 3, 7)).toBe('**\n**text**');
  });

  it('closes the active pair when the cursor sits inside it', () => {
    // The Ctrl+B → type → Ctrl+B flow: the second press moves the caret past
    // the closing markers instead of nesting another pair.
    const md = [markdown()];
    expect(doc(toggleBold, '**bold**', 6, 6, md)).toBe('**bold**');
    expect(selection(toggleBold, '**bold**', 6, 6, md)).toEqual({
      anchor: 8,
      head: 8,
    });
  });

  it('removes an empty pair when toggled twice without typing', () => {
    const md = [markdown()];
    expect(doc(toggleBold, 'a **** b', 4, 4, md)).toBe('a  b');
    expect(selection(toggleBold, 'a **** b', 4, 4, md)).toEqual({
      anchor: 2,
      head: 2,
    });
  });
});

describe('toggleItalic', () => {
  it('inserts an empty italic pair at the cursor', () => {
    expect(doc(toggleItalic, 'ab', 1)).toBe('a**b');
  });

  it('wraps the selection with a single asterisk', () => {
    expect(doc(toggleItalic, 'a hello b', 2, 7)).toBe('a *hello* b');
  });

  it('unwraps an existing italic marker pair', () => {
    expect(doc(toggleItalic, 'a *hello* b', 3, 8)).toBe('a hello b');
  });

  it('closes the active italic pair when the cursor sits inside it', () => {
    const md = [markdown()];
    expect(doc(toggleItalic, '*it*', 3, 3, md)).toBe('*it*');
    expect(selection(toggleItalic, '*it*', 3, 3, md)).toEqual({
      anchor: 4,
      head: 4,
    });
  });
});

describe('cycleHeading', () => {
  it('turns a plain line into a level-1 heading', () => {
    expect(doc(cycleHeading, 'Title', 2)).toBe('# Title');
  });

  it('deepens an existing heading by one level', () => {
    expect(doc(cycleHeading, '## Title', 4)).toBe('### Title');
  });

  it('returns a level-6 heading to plain text', () => {
    expect(doc(cycleHeading, '###### Title', 4)).toBe('Title');
  });

  it('cycles every line the selection touches', () => {
    expect(doc(cycleHeading, 'one\ntwo\nthree', 1, 9)).toBe(
      '# one\n# two\n# three',
    );
  });

  it('leaves empty lines untouched inside a multi-line selection', () => {
    expect(doc(cycleHeading, 'one\n\ntwo', 1, 7)).toBe('# one\n\n# two');
  });
});

describe('toggleBulletList', () => {
  it('prefixes selected lines with a bullet', () => {
    expect(doc(toggleBulletList, 'one\ntwo', 1, 5)).toBe('- one\n- two');
  });

  it('removes bullets when every selected line has one', () => {
    expect(doc(toggleBulletList, '- one\n- two', 3, 7)).toBe('one\ntwo');
  });

  it('adds bullets when only some selected lines have one', () => {
    expect(doc(toggleBulletList, '- one\ntwo', 3, 9)).toBe('- one\n- two');
  });

  it('keeps existing indentation when adding a bullet', () => {
    expect(doc(toggleBulletList, 'one\n  two', 1, 9)).toBe('- one\n  - two');
  });

  it('does not bullet empty lines inside the selection', () => {
    expect(doc(toggleBulletList, 'one\n\ntwo', 1, 7)).toBe('- one\n\n- two');
  });
});

describe('insertLink', () => {
  it('wraps the selection and selects the placeholder URL', () => {
    expect(doc(insertLink, 'a text b', 2, 6)).toBe('a [text](url) b');
    expect(selection(insertLink, 'a text b', 2, 6)).toEqual({
      anchor: 9,
      head: 12,
    });
  });

  it('inserts a template on an empty selection and selects the text', () => {
    expect(doc(insertLink, 'ab', 1)).toBe('a[link text](url)b');
    expect(selection(insertLink, 'ab', 1)).toEqual({ anchor: 2, head: 11 });
  });
});

describe('insertTable', () => {
  it('inserts a GFM table on an empty line and selects the first header cell', () => {
    const result = doc(insertTable, '', 0);
    expect(result).toBe(
      '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n',
    );
    expect(selection(insertTable, '', 0)).toEqual({ anchor: 2, head: 10 });
  });

  it('starts the table on a fresh line when the current line has text', () => {
    const result = doc(insertTable, 'intro', 5);
    expect(result).toBe(
      'intro\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n',
    );
  });
});

describe('insertPageBreak', () => {
  it('writes the marker on the current line and blanks the next', () => {
    expect(doc(insertPageBreak, '', 0)).toBe('///\n\n');
    expect(selection(insertPageBreak, '', 0)).toEqual({ anchor: 5, head: 5 });
  });

  it('breaks the line when the cursor is inside text', () => {
    expect(doc(insertPageBreak, 'abc', 2)).toBe('ab\n///\n\nc');
  });

  it('appends after the current line when the cursor is at its end', () => {
    expect(doc(insertPageBreak, 'abc', 3)).toBe('abc\n///\n\n');
  });
});

describe('insertAssetImages', () => {
  const one = { ref: 'asset://a-1', alt: 'first' };
  const two = { ref: 'asset://b-2', alt: 'second' };

  it('inserts the image markdown on a fresh line and parks the cursor after it', () => {
    expect(doc(insertAssetImages([one]), '', 0)).toBe(
      '![first](asset://a-1)\n',
    );
    expect(selection(insertAssetImages([one]), '', 0)).toEqual({
      anchor: 22,
      head: 22,
    });
  });

  it('breaks the current line so the image renders as its own block', () => {
    expect(doc(insertAssetImages([one]), 'abc', 2)).toBe(
      'ab\n![first](asset://a-1)\nc',
    );
  });

  it('inserts several images on consecutive lines', () => {
    expect(doc(insertAssetImages([one, two]), 'abc', 3)).toBe(
      'abc\n![first](asset://a-1)\n![second](asset://b-2)\n',
    );
  });

  it('anchors to an explicit position when given (drop point)', () => {
    expect(doc(insertAssetImages([one], 1), 'abc', 3)).toBe(
      'a\n![first](asset://a-1)\nbc',
    );
  });

  it('clamps an out-of-range drop position into the document', () => {
    expect(doc(insertAssetImages([one], 99), 'abc', 3)).toBe(
      'abc\n![first](asset://a-1)\n',
    );
  });

  it('does nothing without items', () => {
    expect(doc(insertAssetImages([]), 'abc', 0)).toBe('abc');
  });
});
