// ─────────────────────────────────────────────────────────────────────────────
// A pure line-level diff (spec §The review surface): what the Custom
// Stylesheet's box shows while a proposal is pending. Rows come back in
// document order — removed lines before added ones at the same spot — so the
// view reads "what the box held, then what replaces it".
//
// No DOM, no I/O: the rules are unit-tested without a component.
// ─────────────────────────────────────────────────────────────────────────────

/** One line of the diff: what it is, and its text. */
export interface LineDiffRow {
  kind: 'same' | 'del' | 'add';
  text: string;
}

/** Above this many lines a side, the LCS is skipped for a coarse whole-side
 *  diff — a stylesheet that large is scrolled, not read line by line. */
const MAX_LINES = 1500;

/**
 * Lines of `before` and `after` woven into one sequence, with the common lines
 * shared. An LCS over lines: a stylesheet proposal is a whole-CSS replacement,
 * so most of it matches and the LCS is what makes the diff read as changes
 * rather than two documents.
 */
export function diffLines(before: string, after: string): LineDiffRow[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text): LineDiffRow => ({ kind: 'del', text })),
      ...b.map((text): LineDiffRow => ({ kind: 'add', text })),
    ];
  }

  // table[i * (m + 1) + j] is the LCS length of a[i..] and b[j..].
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  // Non-negative indexes only; the `!` assertions are array-bounds facts the
  // loops guarantee, which noUncheckedIndexedAccess cannot see.
  const at = (i: number, j: number): number => table[i * width + j]!;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const rows: LineDiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i]! });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      rows.push({ kind: 'del', text: a[i]! });
      i += 1;
    } else {
      rows.push({ kind: 'add', text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ kind: 'del', text: a[i]! });
    i += 1;
  }
  while (j < m) {
    rows.push({ kind: 'add', text: b[j]! });
    j += 1;
  }
  return rows;
}
