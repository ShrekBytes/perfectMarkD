import { describe, expect, it } from 'vitest';
import { diffLines } from './line-diff';

describe('diffLines', () => {
  it('marks common lines as same', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('pairs a changed block as del-then-add', () => {
    const rows = diffLines('.a { color: red; }', '.a { color: blue; }');
    expect(rows).toEqual([
      { kind: 'del', text: '.a { color: red; }' },
      { kind: 'add', text: '.a { color: blue; }' },
    ]);
  });

  it('keeps the surrounding CSS readable as context', () => {
    const rows = diffLines(
      '.mpdf-doc h1 { letter-spacing: 0.3em; }\n.mpdf-doc p { margin: 0; }',
      '.mpdf-doc h1 { letter-spacing: 0.05em; }\n.mpdf-doc p { margin: 0; }',
    );
    expect(rows).toEqual([
      { kind: 'del', text: '.mpdf-doc h1 { letter-spacing: 0.3em; }' },
      { kind: 'add', text: '.mpdf-doc h1 { letter-spacing: 0.05em; }' },
      { kind: 'same', text: '.mpdf-doc p { margin: 0; }' },
    ]);
  });

  it('diffs an empty before side as pure additions', () => {
    expect(diffLines('', '.a {}\n.b {}')).toEqual([
      { kind: 'add', text: '.a {}' },
      { kind: 'add', text: '.b {}' },
    ]);
  });

  it('diffs an empty after side as pure deletions', () => {
    expect(diffLines('.a {}\n.b {}', '')).toEqual([
      { kind: 'del', text: '.a {}' },
      { kind: 'del', text: '.b {}' },
    ]);
  });

  it('interleaves additions into an otherwise unchanged rule', () => {
    const rows = diffLines('.a {}\n.b {}\n.c {}', '.a {}\n.x {}\n.b {}\n.c {}');
    expect(rows).toEqual([
      { kind: 'same', text: '.a {}' },
      { kind: 'add', text: '.x {}' },
      { kind: 'same', text: '.b {}' },
      { kind: 'same', text: '.c {}' },
    ]);
  });

  it('handles more lines than the LCS budget with a coarse whole-side diff', () => {
    const before = Array.from({ length: 1600 }, (_, i) => `old ${i}`);
    const after = Array.from({ length: 1600 }, (_, i) => `new ${i}`);
    const rows = diffLines(before.join('\n'), after.join('\n'));
    expect(rows.filter((row) => row.kind === 'del')).toHaveLength(1600);
    expect(rows.filter((row) => row.kind === 'add')).toHaveLength(1600);
    expect(rows.filter((row) => row.kind === 'same')).toHaveLength(0);
  });
});
