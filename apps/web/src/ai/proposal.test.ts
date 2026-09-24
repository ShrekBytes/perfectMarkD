import { describe, expect, it } from 'vitest';
import {
  applyProposal,
  isProposalStale,
  stylesheetTarget,
} from './proposal';
import type { AiTarget } from './types';

const target = (text: string): AiTarget => ({
  kind: 'selection',
  text,
  from: 0,
  to: text.length,
});

describe('stylesheetTarget', () => {
  it('spans the whole box as the staleness baseline', () => {
    const t = stylesheetTarget('.a {}');
    expect(t).toEqual({ kind: 'document', text: '.a {}', from: 0, to: 5 });
  });
});

describe('applyProposal', () => {
  it('applies only the checked anchored edits', () => {
    const t = target('One\nTwo\nThree');
    const proposal = {
      kind: 'anchored' as const,
      edits: [
        { search: 'One', replace: '1' },
        { search: 'Three', replace: '3' },
      ],
    };
    expect(applyProposal(t, proposal, new Set([0]))).toEqual({
      ok: true,
      text: '1\nTwo\nThree',
    });
    expect(applyProposal(t, proposal, new Set([1]))).toEqual({
      ok: true,
      text: 'One\nTwo\n3',
    });
    expect(applyProposal(t, proposal, new Set([0, 1]))).toEqual({
      ok: true,
      text: '1\nTwo\n3',
    });
  });

  it('refuses when an anchor is ambiguous rather than applying the rest', () => {
    const result = applyProposal(
      target('same same'),
      { kind: 'anchored', edits: [{ search: 'same', replace: 'different' }] },
      new Set([0]),
    );
    expect(result.ok).toBe(false);
  });

  it('leaves the text unchanged when nothing is checked', () => {
    expect(
      applyProposal(target('a'), { kind: 'replace', text: 'b' }, new Set()),
    ).toEqual({ ok: true, text: 'a' });
    expect(
      applyProposal(
        target('a'),
        { kind: 'anchored', edits: [{ search: 'a', replace: 'b' }] },
        new Set(),
      ),
    ).toEqual({ ok: true, text: 'a' });
  });

  it('applies a replacement when checked', () => {
    expect(
      applyProposal(
        target('old'),
        { kind: 'replace', text: 'new' },
        new Set([0]),
      ),
    ).toEqual({ ok: true, text: 'new' });
  });
});

describe('isProposalStale', () => {
  it('detects the target text changing underneath a proposal', () => {
    const t: AiTarget = { kind: 'selection', text: 'abc', from: 2, to: 5 };
    expect(isProposalStale(t, 'xxabc')).toBe(false);
    expect(isProposalStale(t, 'xxabd')).toBe(true);
  });
});
