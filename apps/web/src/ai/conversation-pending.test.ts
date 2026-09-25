import { describe, expect, it } from 'vitest';
import { pendingProposal, previewReply } from './conversation';
import type { StylesheetTurn } from './conversation';

const turn = (
  over: Partial<Extract<StylesheetTurn, { status: 'proposal' }>>,
): StylesheetTurn => ({
  id: 1,
  instruction: 'thinner rules',
  against: '.a {}',
  status: 'proposal',
  reply: '.a { color: red; }',
  decision: null,
  ...over,
});

describe('pendingProposal', () => {
  it('picks the newest undecided proposal with its baseline and reply', () => {
    const turns = [
      turn({ id: 1, decision: 'accepted' }),
      turn({ id: 2, against: '.b {}', reply: '.b { color: blue; }' }),
    ];
    expect(pendingProposal(turns)).toEqual({
      id: 2,
      against: '.b {}',
      reply: '.b { color: blue; }',
    });
  });

  it('ignores decided and failed turns, and an empty log', () => {
    expect(pendingProposal([])).toBeNull();
    expect(pendingProposal(undefined)).toBeNull();
    expect(pendingProposal([turn({ decision: 'rejected' })])).toBeNull();
  });

  it('agrees with previewReply about which turn is under review', () => {
    const turns: StylesheetTurn[] = [turn({ id: 7 })];
    const pending = pendingProposal(turns);
    expect(pending?.id).toBe(7);
    expect(previewReply(turns)).toBe(pending?.reply);
  });
});
