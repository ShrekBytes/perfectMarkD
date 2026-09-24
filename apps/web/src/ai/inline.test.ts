import { describe, expect, it } from 'vitest';
import { locateProposal } from './inline';
import type { AiTarget } from './types';

const DOC = 'Alpha\nBeta\nGamma\nDelta';
const target = (text: string, from = 0): AiTarget => ({
  kind: 'document',
  text,
  from,
  to: from + text.length,
});

describe('locateProposal', () => {
  it('locates anchored edits as document-offset hunks', () => {
    const hunks = locateProposal(target(DOC), {
      kind: 'anchored',
      edits: [
        { search: 'Beta', replace: 'Beta!' },
        { search: 'Delta', replace: '' },
      ],
    });
    expect(hunks).toEqual([
      { id: 0, from: 6, to: 10, insert: 'Beta!' },
      { id: 1, from: 17, to: 22, insert: '' },
    ]);
  });

  it('offsets by the target position in the Document', () => {
    const prefix = 'Intro\n\n';
    const hunks = locateProposal(target('Beta', prefix.length), {
      kind: 'anchored',
      edits: [{ search: 'Beta', replace: 'BETA' }],
    });
    expect(hunks).toEqual([
      {
        id: 0,
        from: prefix.length,
        to: prefix.length + 4,
        insert: 'BETA',
      },
    ]);
  });

  it('returns one hunk for a replacement proposal', () => {
    const hunks = locateProposal(target('one two three'), {
      kind: 'replace',
      text: 'ONE TWO THREE',
    });
    expect(hunks).toEqual([
      { id: 0, from: 0, to: 13, insert: 'ONE TWO THREE' },
    ]);
  });

  it('sorts hunks into document order without renumbering the ids', () => {
    const hunks = locateProposal(target(DOC), {
      kind: 'anchored',
      // The model quoted Delta before Beta.
      edits: [
        { search: 'Delta', replace: 'Δ' },
        { search: 'Beta', replace: 'β' },
      ],
    })!;
    expect(hunks.map((hunk) => hunk.id)).toEqual([1, 0]);
    expect(hunks[0]).toMatchObject({ from: 6, insert: 'β' });
  });

  it('refuses an anchor that is not in the target', () => {
    expect(
      locateProposal(target(DOC), {
        kind: 'anchored',
        edits: [{ search: 'Omega', replace: 'Ω' }],
      }),
    ).toBeNull();
  });

  it('refuses an anchor that matches more than once', () => {
    expect(
      locateProposal(target('Echo\nEcho\nDelta'), {
        kind: 'anchored',
        edits: [{ search: 'Echo', replace: 'ECHO' }],
      }),
    ).toBeNull();
  });

  it('refuses an empty anchor', () => {
    expect(
      locateProposal(target(DOC), {
        kind: 'anchored',
        edits: [{ search: '', replace: 'x' }],
      }),
    ).toBeNull();
  });
});
