// Toolbar editing commands as CodeMirror `Command`s: pure state → transaction
// transforms so they are testable without a mounted editor and integrate with
// the undo history for free.

import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
  type SelectionRange,
  type StateCommand,
} from '@codemirror/state';

/** Wraps/unwraps `marker` around each selection range (multi-cursor aware).
 *  Markers only pair within one line, matching how markdown renders. */
function toggleInlineMarker(
  marker: string,
  nodeType: 'StrongEmphasis' | 'Emphasis',
): StateCommand {
  return ({ state, dispatch }) => {
    const changes: ChangeSpec[] = [];
    const placed: SelectionRange[] = [];
    // Ranges are disjoint and sorted; `shift` is the net length added by the
    // changes of earlier ranges, so `from`/`to` below are the range's
    // endpoints in the document the range's own change applies to, while
    // reads against `state` keep using the original `range` positions.
    let shift = 0;

    for (const range of state.selection.ranges) {
      const from = range.from + shift;
      const to = range.to + shift;
      const text = state.sliceDoc(range.from, range.to);
      const startLine = state.doc.lineAt(range.from);
      const endLine = state.doc.lineAt(range.to);
      const opens =
        range.from - marker.length >= startLine.from &&
        state.sliceDoc(range.from - marker.length, range.from) === marker;
      const closes =
        range.to + marker.length <= endLine.to &&
        state.sliceDoc(range.to, range.to + marker.length) === marker;

      let next: { anchor: number; head: number };
      let delta: number;

      if (range.empty) {
        // Inside an existing emphasis node: Ctrl+B → type → Ctrl+B should
        // close the pair (and toggling twice with nothing typed removes it),
        // never nest another pair.
        const node = emphasisNodeAt(state, range.from, nodeType);
        // An empty pair like `****` parses as a thematic break, so the tree
        // cannot see it — there the markers hugging the cursor are the tell,
        // which is exactly the opens/closes pair check on an empty range.
        if (node && node.to - node.from > marker.length * 2) {
          // Non-empty node: the second Ctrl+B of the type flow just closes it.
          next = { anchor: node.to + shift, head: node.to + shift };
          delta = 0;
        } else if (node || (opens && closes)) {
          // Empty pair (or an unparsed `****`): remove it.
          const at = (node ? node.from : range.from - marker.length) + shift;
          const end = (node ? node.to : range.to + marker.length) + shift;
          changes.push({ from: at, to: end });
          next = { anchor: at, head: at };
          delta = at - end;
        } else {
          changes.push({ from, insert: marker.repeat(2) });
          next = { anchor: from + marker.length, head: from + marker.length };
          delta = marker.length * 2;
        }
      } else if (opens && closes) {
        changes.push({ from: from - marker.length, to: from });
        changes.push({ from: to, to: to + marker.length });
        next = {
          anchor: from - marker.length,
          head: to - marker.length,
        };
        delta = -marker.length * 2;
      } else if (
        text.length >= marker.length * 2 &&
        text.startsWith(marker) &&
        text.endsWith(marker)
      ) {
        changes.push({ from, to: from + marker.length });
        changes.push({ from: to - marker.length, to });
        next = { anchor: from, head: to - marker.length * 2 };
        delta = -marker.length * 2;
      } else {
        changes.push({ from, insert: marker });
        changes.push({ from: to, insert: marker });
        next = { anchor: from + marker.length, head: to + marker.length };
        delta = marker.length * 2;
      }

      placed.push(EditorSelection.range(next.anchor, next.head));
      shift += delta;
    }

    dispatch(
      state.update({
        changes,
        selection: EditorSelection.create(placed),
        scrollIntoView: true,
      }),
    );
    return true;
  };
}

/** Innermost `nodeType` ancestor containing the position (lezer-markdown's
 *  StrongEmphasis/Emphasis nodes span their markers). Without a markdown
 *  parser in the state — as in the pure command tests — there is no tree and
 *  this returns null. */
function emphasisNodeAt(
  state: EditorState,
  pos: number,
  nodeType: 'StrongEmphasis' | 'Emphasis',
): { from: number; to: number } | null {
  const node = syntaxTree(state).resolveInner(pos, -1);
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === nodeType) return { from: n.from, to: n.to };
  }
  return null;
}

export const toggleBold: StateCommand = toggleInlineMarker(
  '**',
  'StrongEmphasis',
);
export const toggleItalic: StateCommand = toggleInlineMarker('*', 'Emphasis');

const HEADING = /^(#{1,6})\s+/;

/** Cycles every selected line: plain → H1 → … → H6 → plain. Empty lines are
 *  left alone so cycling a paragraph block doesn't pepper them with markers. */
export const cycleHeading: StateCommand = ({ state, dispatch }) => {
  const main = state.selection.main;
  const first = state.doc.lineAt(main.from).number;
  const last = state.doc.lineAt(main.to).number;
  const changes: ChangeSpec[] = [];

  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    if (line.text.trim().length === 0) continue;
    const match = HEADING.exec(line.text);
    const level = match ? (match[1]?.length ?? 0) : 0;
    const next = level >= 6 ? 0 : level + 1;
    changes.push({
      from: line.from,
      to: match ? line.from + match[0].length : line.from,
      insert: next === 0 ? '' : `${'#'.repeat(next)} `,
    });
  }

  if (changes.length === 0) return false;
  dispatch(state.update({ changes, scrollIntoView: true }));
  return true;
};

const BULLET = /^[ \t]*[-*+][ \t]+/;

/** Toggles `- ` bullets across the selected lines: removes when every
 *  non-empty line has one, adds otherwise. */
export const toggleBulletList: StateCommand = ({ state, dispatch }) => {
  const main = state.selection.main;
  const first = state.doc.lineAt(main.from).number;
  const last = state.doc.lineAt(main.to).number;
  const lines: { from: number; text: string }[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    if (line.text.trim().length > 0) lines.push(line);
  }
  if (lines.length === 0) return false;

  const remove = lines.every((line) => BULLET.test(line.text));
  const changes: ChangeSpec[] = [];
  for (const line of lines) {
    if (remove) {
      const match = BULLET.exec(line.text)!;
      changes.push({
        from: line.from,
        to: line.from + match[0].length,
        insert: '',
      });
    } else if (!BULLET.test(line.text)) {
      // Adding skips lines that already have a bullet instead of doubling it.
      const indent = /^[ \t]*/.exec(line.text)![0];
      changes.push({ from: line.from + indent.length, insert: '- ' });
    }
  }

  if (changes.length === 0) return false;
  dispatch(state.update({ changes, scrollIntoView: true }));
  return true;
};

/** Wraps the selection as `[text](url)` with the URL selected for typing, or
 *  inserts a template with the text placeholder selected. */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const { from, to } = state.selection.main;
  if (from !== to) {
    dispatch(
      state.update({
        changes: [
          { from, insert: '[' },
          { from: to, insert: '](url)' },
        ],
        selection: EditorSelection.range(to + 3, to + 6),
        scrollIntoView: true,
      }),
    );
    return true;
  }
  dispatch(
    state.update({
      changes: { from, insert: '[link text](url)' },
      selection: EditorSelection.range(from + 1, from + 10),
      scrollIntoView: true,
    }),
  );
  return true;
};

const TABLE =
  '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |';

/** Inserts a starter GFM table on a fresh line and selects the first header
 *  cell so typing replaces it. */
export const insertTable: StateCommand = ({ state, dispatch }) => {
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const lead = line.text.length === 0 ? '' : '\n';
  const insert = `${lead}${TABLE}\n`;
  dispatch(
    state.update({
      changes: { from, insert },
      selection: EditorSelection.range(
        from + lead.length + 2,
        from + lead.length + 10,
      ),
      scrollIntoView: true,
    }),
  );
  return true;
};

/** Inserts a `///` Page Break marker alone on its line, breaking the current
 *  line when the cursor sits inside text. */
export const insertPageBreak: StateCommand = ({ state, dispatch }) => {
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const insert = `${line.text.length === 0 ? '' : '\n'}///\n\n`;
  dispatch(
    state.update({
      changes: { from, insert },
      selection: EditorSelection.cursor(from + insert.length),
      scrollIntoView: true,
    }),
  );
  return true;
};
