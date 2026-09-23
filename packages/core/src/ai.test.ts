import { describe, expect, it } from 'vitest';
import {
  applyAnchoredEdits,
  buildOutlineDigest,
  checkAiSendSize,
  decideAiLadder,
  estimateAiSize,
  extractSections,
  findPlanStepSection,
  parseAiPlan,
  parseAnchoredEdits,
  resolveAiScope,
  resolveParagraphRange,
  sectionLabel,
  sectionLabels,
  type AiBudgets,
} from './ai';

describe('estimateAiSize', () => {
  it('estimates nothing for empty text', () => {
    expect(estimateAiSize('')).toEqual({ characters: 0, estimatedTokens: 0 });
  });

  it('runs Latin text at roughly four characters per token, rounding up', () => {
    expect(estimateAiSize('a'.repeat(100))).toEqual({
      characters: 100,
      estimatedTokens: 25,
    });
    expect(estimateAiSize('a'.repeat(101)).estimatedTokens).toBe(26);
    expect(estimateAiSize('one two').estimatedTokens).toBe(2);
  });

  it('takes the tighter ratio when the non-ASCII letter share is high', () => {
    // Arabic, Persian, Chinese, and Japanese cost roughly twice the tokens of
    // the same character count in English.
    expect(estimateAiSize('字'.repeat(100))).toEqual({
      characters: 100,
      estimatedTokens: 50,
    });
    expect(estimateAiSize('م'.repeat(10))).toEqual({
      characters: 10,
      estimatedTokens: 5,
    });
    expect(estimateAiSize('한'.repeat(10)).estimatedTokens).toBe(5);
  });

  it('switches ratios exactly at the non-ASCII letter share', () => {
    // 25 of 100 letters non-ASCII: at the threshold, the tight ratio applies.
    const atThreshold = 'a'.repeat(75) + '字'.repeat(25);
    expect(estimateAiSize(atThreshold).estimatedTokens).toBe(50);
    // 24 of 100: just below it, the Latin ratio applies.
    const belowThreshold = 'a'.repeat(76) + '字'.repeat(24);
    expect(estimateAiSize(belowThreshold).estimatedTokens).toBe(25);
  });

  it('ignores non-letter characters when deciding the ratio', () => {
    // Digits, punctuation, whitespace, and symbols are not letters, so a
    // text without letters stays at the Latin ratio even when non-ASCII.
    expect(estimateAiSize('12345678')).toEqual({
      characters: 8,
      estimatedTokens: 2,
    });
    expect(estimateAiSize('!@#$%^&*')).toEqual({
      characters: 8,
      estimatedTokens: 2,
    });
    expect(estimateAiSize('😀😀😀😀').estimatedTokens).toBe(1);
  });

  it('counts an astral-plane character once', () => {
    expect(estimateAiSize('𠀀').characters).toBe(1);
  });

  it('estimates a script-heavy text above the same-length Latin text', () => {
    const latin = estimateAiSize('a'.repeat(60));
    const cjk = estimateAiSize('字'.repeat(60));
    expect(cjk.estimatedTokens).toBeGreaterThan(latin.estimatedTokens);
  });
});

describe('resolveAiScope', () => {
  const documentText = 'Hello brave world';

  it('resolves the whole Document when there is no selection', () => {
    const scope = resolveAiScope(documentText);
    expect(scope).toEqual({
      kind: 'document',
      text: documentText,
      from: 0,
      to: documentText.length,
      size: estimateAiSize(documentText),
    });
  });

  it('treats a cursor — an empty selection — as no selection', () => {
    const scope = resolveAiScope(documentText, { from: 5, to: 5 });
    expect(scope.kind).toBe('document');
    expect(scope.text).toBe(documentText);
  });

  it('resolves the selection when there is one', () => {
    const scope = resolveAiScope(documentText, { from: 6, to: 11 });
    expect(scope).toEqual({
      kind: 'selection',
      text: 'brave',
      from: 6,
      to: 11,
      size: estimateAiSize('brave'),
    });
  });

  it('measures the selection alone, not the Document around it', () => {
    const documentText = `abcdef${'字'.repeat(100)}`;
    const scope = resolveAiScope(documentText, { from: 0, to: 6 });
    expect(scope.size).toEqual(estimateAiSize('abcdef'));
    expect(scope.size.estimatedTokens).toBe(2);
  });

  it('resolves a selection that covers the whole Document as a selection', () => {
    const scope = resolveAiScope(documentText, {
      from: 0,
      to: documentText.length,
    });
    expect(scope.kind).toBe('selection');
    expect(scope.text).toBe(documentText);
  });

  it('resolves a selection at the Document edges', () => {
    const scope = resolveAiScope(documentText, {
      from: 12,
      to: documentText.length,
    });
    expect(scope.text).toBe('world');
    expect(scope.to).toBe(documentText.length);
  });
});

/** Builds a reply from the block markers and their content lines. */
function reply(lines: string[]): string {
  return lines.join('\n');
}

describe('parseAnchoredEdits', () => {
  it('refuses an empty reply', () => {
    expect(parseAnchoredEdits('')).toEqual({
      ok: false,
      code: 'no_blocks',
      blockIndex: 0,
    });
    expect(parseAnchoredEdits('   \n\n  ')).toEqual({
      ok: false,
      code: 'no_blocks',
      blockIndex: 0,
    });
  });

  it('refuses a reply that contains no blocks', () => {
    expect(parseAnchoredEdits('I rewrote the document for you.')).toEqual({
      ok: false,
      code: 'no_blocks',
      blockIndex: 0,
    });
  });

  it('parses one block', () => {
    const parsed = parseAnchoredEdits(
      reply([
        '<<<<<<< SEARCH',
        'old text',
        '=======',
        'new text',
        '>>>>>>> REPLACE',
      ]),
    );
    expect(parsed).toEqual({
      ok: true,
      edits: [{ search: 'old text', replace: 'new text' }],
    });
  });

  it('keeps blocks in the order they appear', () => {
    const parsed = parseAnchoredEdits(
      reply([
        '<<<<<<< SEARCH',
        'first',
        '=======',
        '1st',
        '>>>>>>> REPLACE',
        '<<<<<<< SEARCH',
        'second',
        '=======',
        '2nd',
        '>>>>>>> REPLACE',
      ]),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      { search: 'first', replace: '1st' },
      { search: 'second', replace: '2nd' },
    ]);
  });

  it('ignores prose around the blocks', () => {
    const parsed = parseAnchoredEdits(
      reply([
        'Here is the proposal:',
        '',
        '<<<<<<< SEARCH',
        'old',
        '=======',
        'new',
        '>>>>>>> REPLACE',
        '',
        'It tightens the opening.',
      ]),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      { search: 'old', replace: 'new' },
    ]);
  });

  it('keeps multi-line search and replacement text', () => {
    const parsed = parseAnchoredEdits(
      reply([
        '<<<<<<< SEARCH',
        'line one',
        '',
        'line three',
        '=======',
        'line one changed',
        '',
        'line three changed',
        '>>>>>>> REPLACE',
      ]),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      {
        search: 'line one\n\nline three',
        replace: 'line one changed\n\nline three changed',
      },
    ]);
  });

  it('accepts CRLF reply line endings', () => {
    const parsed = parseAnchoredEdits(
      reply([
        '<<<<<<< SEARCH',
        'old',
        '=======',
        'new',
        '>>>>>>> REPLACE',
      ]).replace(/\n/g, '\r\n'),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      { search: 'old', replace: 'new' },
    ]);
  });

  it('allows an empty replacement — a deletion', () => {
    const parsed = parseAnchoredEdits(
      reply(['<<<<<<< SEARCH', 'gone', '=======', '>>>>>>> REPLACE']),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      { search: 'gone', replace: '' },
    ]);
  });

  it('tolerates trailing whitespace and lowercase markers', () => {
    const parsed = parseAnchoredEdits(
      reply([
        '<<<<<<< search   ',
        'old',
        '=======  ',
        'new',
        '>>>>>>> replace',
      ]),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      { search: 'old', replace: 'new' },
    ]);
  });

  it('refuses a block with no divider', () => {
    expect(
      parseAnchoredEdits(reply(['<<<<<<< SEARCH', 'old', '>>>>>>> REPLACE'])),
    ).toEqual({ ok: false, code: 'malformed_block', blockIndex: 0 });
  });

  it('refuses a block with no closing marker', () => {
    expect(
      parseAnchoredEdits(reply(['<<<<<<< SEARCH', 'old', '=======', 'new'])),
    ).toEqual({ ok: false, code: 'malformed_block', blockIndex: 0 });
  });

  it('refuses a malformed block after a valid one, naming it', () => {
    expect(
      parseAnchoredEdits(
        reply([
          '<<<<<<< SEARCH',
          'first',
          '=======',
          '1st',
          '>>>>>>> REPLACE',
          '<<<<<<< SEARCH',
          'second',
        ]),
      ),
    ).toEqual({ ok: false, code: 'malformed_block', blockIndex: 1 });
  });

  it('refuses a nested SEARCH marker', () => {
    expect(
      parseAnchoredEdits(
        reply([
          '<<<<<<< SEARCH',
          'old',
          '<<<<<<< SEARCH',
          'again',
          '=======',
          'new',
          '>>>>>>> REPLACE',
        ]),
      ),
    ).toEqual({ ok: false, code: 'malformed_block', blockIndex: 0 });
  });

  it('refuses an empty anchor', () => {
    expect(
      parseAnchoredEdits(
        reply(['<<<<<<< SEARCH', '=======', 'inserted', '>>>>>>> REPLACE']),
      ),
    ).toEqual({ ok: false, code: 'empty_search', blockIndex: 0 });
  });

  it('ignores marker-like lines outside a block', () => {
    const parsed = parseAnchoredEdits(
      reply([
        '=======',
        'A setext underline in prose.',
        '>>>>>>> REPLACE',
        '',
        '<<<<<<< SEARCH',
        'old',
        '=======',
        'new',
        '>>>>>>> REPLACE',
      ]),
    );
    expect(parsed.ok && parsed.edits).toEqual([
      { search: 'old', replace: 'new' },
    ]);
  });
});

describe('applyAnchoredEdits', () => {
  it('replaces the anchor with the replacement', () => {
    expect(
      applyAnchoredEdits('The quick brown fox.', [
        { search: 'quick', replace: 'slow' },
      ]),
    ).toEqual({ ok: true, text: 'The slow brown fox.' });
  });

  it('applies several independent edits', () => {
    expect(
      applyAnchoredEdits('one two three', [
        { search: 'one', replace: '1' },
        { search: 'three', replace: '3' },
      ]),
    ).toEqual({ ok: true, text: '1 two 3' });
  });

  it('deletes with an empty replacement', () => {
    expect(
      applyAnchoredEdits('keep this\n', [{ search: ' this', replace: '' }]),
    ).toEqual({ ok: true, text: 'keep\n' });
  });

  it('inserts by anchoring around the insertion point', () => {
    expect(
      applyAnchoredEdits('a\nb', [{ search: 'b', replace: 'b\nc' }]),
    ).toEqual({ ok: true, text: 'a\nb\nc' });
  });

  it('applies blocks in the order given, re-reading the text each time', () => {
    // The second anchor exists only once the first block has been applied.
    expect(
      applyAnchoredEdits('foo', [
        { search: 'foo', replace: 'bar' },
        { search: 'bar', replace: 'baz' },
      ]),
    ).toEqual({ ok: true, text: 'baz' });
  });

  it('refuses reordered blocks rather than finding a different way to apply them', () => {
    expect(
      applyAnchoredEdits('foo', [
        { search: 'bar', replace: 'baz' },
        { search: 'foo', replace: 'bar' },
      ]),
    ).toEqual({ ok: false, code: 'not_found', blockIndex: 0, occurrences: 0 });
  });

  it('refuses a missing anchor, the whole change set included', () => {
    expect(
      applyAnchoredEdits('hello', [
        { search: 'hello', replace: 'hi' },
        { search: 'absent', replace: 'x' },
      ]),
    ).toEqual({ ok: false, code: 'not_found', blockIndex: 1, occurrences: 0 });
  });

  it('refuses an ambiguous anchor', () => {
    expect(
      applyAnchoredEdits('banana', [{ search: 'an', replace: 'AN' }]),
    ).toEqual({ ok: false, code: 'ambiguous', blockIndex: 0, occurrences: 2 });
  });

  it('counts overlapping readings of an anchor as ambiguous', () => {
    expect(applyAnchoredEdits('aaa', [{ search: 'aa', replace: 'X' }])).toEqual(
      { ok: false, code: 'ambiguous', blockIndex: 0, occurrences: 2 },
    );
  });

  it('refuses ambiguity created by an earlier block', () => {
    expect(
      applyAnchoredEdits('x', [
        { search: 'x', replace: 'yy' },
        { search: 'y', replace: 'z' },
      ]),
    ).toEqual({ ok: false, code: 'ambiguous', blockIndex: 1, occurrences: 2 });
  });

  it('matches an anchor that an earlier replacement introduced', () => {
    expect(
      applyAnchoredEdits('x', [
        { search: 'x', replace: 'y' },
        { search: 'y', replace: 'z' },
      ]),
    ).toEqual({ ok: true, text: 'z' });
  });

  it('matches a multi-line anchor', () => {
    expect(
      applyAnchoredEdits('first\nsecond\nthird', [
        { search: 'second\nthird', replace: 'replaced' },
      ]),
    ).toEqual({ ok: true, text: 'first\nreplaced' });
  });

  it('inserts replacement characters literally', () => {
    expect(
      applyAnchoredEdits('a', [{ search: 'a', replace: '$& $1 $$' }]),
    ).toEqual({ ok: true, text: '$& $1 $$' });
  });

  it('refuses an empty anchor', () => {
    expect(applyAnchoredEdits('abc', [{ search: '', replace: 'x' }])).toEqual({
      ok: false,
      code: 'empty_search',
      blockIndex: 0,
      occurrences: 0,
    });
  });

  it('leaves the text unchanged when there are no edits', () => {
    expect(applyAnchoredEdits('unchanged', [])).toEqual({
      ok: true,
      text: 'unchanged',
    });
  });
});

describe('extractSections', () => {
  const documentText = reply([
    'A short preamble.',
    '',
    '# Title',
    '',
    'Opening line of the title section.',
    'Second line.',
    '',
    '## Part One',
    '',
    '- item one',
    '- item two',
    '',
    '///',
    '',
    '## Part Two',
    '',
    'Closing words.',
  ]);

  it('returns no sections for an empty or blank Document', () => {
    expect(extractSections('')).toEqual([]);
    expect(extractSections('\n\n  \n')).toEqual([]);
  });

  it('treats a Document with no headings as a single section with no heading', () => {
    const sections = extractSections('Just some prose.');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      level: null,
      heading: null,
      text: 'Just some prose.',
      firstLine: 'Just some prose.',
    });
  });

  it('splits at headings and Page Breaks, in document order', () => {
    const sections = extractSections(documentText);
    expect(
      sections.map(({ heading, level, words, firstLine }) => ({
        heading,
        level,
        words,
        firstLine,
      })),
    ).toEqual([
      {
        heading: null,
        level: null,
        words: 3,
        firstLine: 'A short preamble.',
      },
      {
        heading: 'Title',
        level: 1,
        words: 9,
        firstLine: 'Opening line of the title section.',
      },
      {
        heading: 'Part One',
        level: 2,
        words: 8,
        firstLine: '- item one',
      },
      {
        heading: 'Part Two',
        level: 2,
        words: 4,
        firstLine: 'Closing words.',
      },
    ]);
  });

  it('slices each section exactly out of the source', () => {
    const sections = extractSections(documentText);
    for (const section of sections) {
      expect(section.text).toBe(documentText.slice(section.from, section.to));
      expect(section.text).not.toBe('');
    }
    // The Page Break between the last two sections belongs to none of them.
    expect(documentText.slice(sections[2]!.to, sections[3]!.from)).toContain(
      '///',
    );
  });

  it('strips heading markers from the heading, keeping the raw text', () => {
    const [section] = extractSections('## Background ##\n\nBody.');
    expect(section).toMatchObject({
      level: 2,
      heading: 'Background',
      text: '## Background ##\n\nBody.',
      firstLine: 'Body.',
    });
  });

  it('reads heading levels and leaves higher-level markers alone', () => {
    const sections = extractSections('# One\n\n### Three\n\n###### Six');
    expect(sections.map((section) => section.level)).toEqual([1, 3, 6]);
    expect(sections.map((section) => section.heading)).toEqual([
      'One',
      'Three',
      'Six',
    ]);
  });

  it('gives a heading-only section an empty first line', () => {
    const [section] = extractSections('# Alone');
    expect(section).toMatchObject({ words: 1, firstLine: '' });
  });

  it('accepts a heading indented up to three spaces', () => {
    const [section] = extractSections('   ## Indented\n\nBody.');
    expect(section).toMatchObject({ level: 2, heading: 'Indented' });
  });

  it('does not treat a hash without a space, or an indented hash, as a heading', () => {
    expect(extractSections('#nospace').map((s) => s.heading)).toEqual([null]);
    expect(extractSections('    # code\n\nbody').map((s) => s.heading)).toEqual(
      [null],
    );
  });

  it('does not treat headings inside a fence as section starts', () => {
    const markdown = reply([
      '# Real',
      '',
      '```',
      '# not a heading',
      '```',
      '',
      'tail',
    ]);
    const sections = extractSections(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe('Real');
    expect(sections[0]!.text).toContain('# not a heading');
  });

  it('splits on a Page Break even inside a fence, the way the renderer does', () => {
    const sections = extractSections(
      reply(['```', 'code', '///', 'more', '```']),
    );
    expect(sections.map((section) => section.text)).toEqual([
      '```\ncode',
      'more\n```',
    ]);
  });

  it('drops empty sections between consecutive Page Breaks', () => {
    const sections = extractSections('# A\n///\n///\n# B');
    expect(sections.map((section) => section.heading)).toEqual(['A', 'B']);
  });

  it('starts a no-heading section after a Page Break', () => {
    const sections = extractSections('first\n\n///\n\nsecond');
    expect(sections.map((section) => section.heading)).toEqual([null, null]);
    expect(sections.map((section) => section.text)).toEqual([
      'first',
      'second',
    ]);
  });

  it('accepts a Page Break with trailing spaces', () => {
    expect(extractSections('a\n///  \nb')).toHaveLength(2);
  });

  it('handles CRLF line endings without leaking the carriage return', () => {
    const markdown = '# Title\r\n\r\nBody.';
    const [section] = extractSections(markdown);
    expect(section).toMatchObject({
      heading: 'Title',
      firstLine: 'Body.',
      text: '# Title\r\n\r\nBody.',
    });
    expect(section!.text).toBe(markdown.slice(section!.from, section!.to));
  });

  it('counts words in a section, heading markers excluded', () => {
    const [section] = extractSections('# Two words\n\nand three more');
    expect(section!.words).toBe(5);
  });
});

describe('buildOutlineDigest', () => {
  it('builds one line per section with headings, levels, words, first lines', () => {
    const sections = extractSections(
      reply([
        'A short preamble.',
        '',
        '# Title',
        '',
        'Opening line.',
        '',
        '///',
        '',
        'Loose notes.',
        '',
        '## Part Two',
        '',
        'Closing words.',
      ]),
    );
    expect(buildOutlineDigest(sections)).toBe(
      [
        // Two sections have no heading, so the digest numbers them: a plan
        // has to be able to say which one a step means.
        '- (no heading 1) (3 words): A short preamble.',
        '- Title (h1, 3 words): Opening line.',
        '- (no heading 2) (2 words): Loose notes.',
        '- Part Two (h2, 4 words): Closing words.',
      ].join('\n'),
    );
  });

  it('omits the first line for a section that has none', () => {
    const digest = buildOutlineDigest(extractSections('# Alone'));
    expect(digest).toBe('- Alone (h1, 1 word)');
  });

  it('returns an empty digest for no sections', () => {
    expect(buildOutlineDigest([])).toBe('');
  });

  it('clips a long first line and marks the clip', () => {
    const longLine = 'word '.repeat(60).trim();
    const sections = extractSections(`# Long\n\n${longLine}`);
    expect(sections[0]!.firstLine.endsWith('…')).toBe(true);
    expect([...sections[0]!.firstLine].length).toBe(121);
    expect(buildOutlineDigest(sections)).toContain(sections[0]!.firstLine);
  });
});

// ─── The size ladder ────────────────────────────────────────────────────────

/** 1,000 characters sent, a 100-token output budget (write cap 50 tokens ≈
 *  200 characters of Latin text), a window with room to spare. */
const BUDGETS: AiBudgets = {
  maxInputCharacters: 1_000,
  maxOutputTokens: 100,
  contextWindow: 10_000,
};

/** A Document with three sections, small enough to send in full. */
const SMALL_DOCUMENT = reply([
  '# One',
  '',
  'Opening line of the document.',
  '',
  '## Two',
  '',
  'Body of part two.',
  '',
  '## Three',
  '',
  'Body of part three.',
]);

/** The same shape, past the 1,000-character send cap. */
const BIG_DOCUMENT = reply([
  '# One',
  '',
  'filler '.repeat(60).trim(),
  '',
  '## Two',
  '',
  'filler '.repeat(60).trim(),
  '',
  '## Three',
  '',
  'filler '.repeat(60).trim(),
]);

/** The whole Document as a scope, the way the editor resolves no selection. */
function whole(documentText: string) {
  return resolveAiScope(documentText, null);
}

/** A range of the Document as a scope, the way the editor resolves a selection. */
function selection(documentText: string, from: number, to: number) {
  return resolveAiScope(documentText, { from, to });
}

describe('decideAiLadder', () => {
  it('sends everything when the whole Document fits', () => {
    expect(
      decideAiLadder({
        documentText: SMALL_DOCUMENT,
        target: whole(SMALL_DOCUMENT),
        budgets: BUDGETS,
      }),
    ).toEqual({
      tier: 0,
      kind: 'all',
      characters: SMALL_DOCUMENT.length,
      context: null,
    });
  });

  it('sends everything with a selection when the whole Document still fits', () => {
    const target = selection(SMALL_DOCUMENT, 0, 5);
    const rest = SMALL_DOCUMENT.slice(5);
    expect(
      decideAiLadder({
        documentText: SMALL_DOCUMENT,
        target,
        budgets: BUDGETS,
      }),
    ).toEqual({
      tier: 0,
      kind: 'all',
      characters: 5,
      // The whole Document fits, so everything is sent with the selection.
      context: rest,
    });
  });

  it('sends the target in full and an outline of the rest when the Document does not fit', () => {
    const target = selection(BIG_DOCUMENT, 0, 5);
    const decision = decideAiLadder({
      documentText: BIG_DOCUMENT,
      target,
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(1);
    if (decision.tier !== 1) return;
    expect(decision.kind).toBe('partial');
    // Two sections are left over; the one the target sits in is not digested.
    expect(decision.otherSections).toBe(2);
    const lines = decision.digest.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^- Two \(h2, 61 words\): filler/);
    expect(lines[1]).toMatch(/^- Three \(h2, 61 words\): filler/);
    // The digest is clipped to one line per section, never the section itself.
    expect(decision.digest.length).toBeLessThan(BIG_DOCUMENT.length / 4);
  });

  it('offers a plan for a whole Document past the write cap', () => {
    const decision = decideAiLadder({
      documentText: BIG_DOCUMENT,
      target: whole(BIG_DOCUMENT),
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(2);
    if (decision.tier !== 2) return;
    expect(decision.kind).toBe('plan');
    expect(decision.sections).toHaveLength(3);
    expect(decision.digest.split('\n')).toHaveLength(3);
    expect(decision.characters).toBe(BIG_DOCUMENT.length);
  });

  it('plans a Document that fits the write cap but not the send cap', () => {
    const documentText = reply([
      '# One',
      '',
      'x'.repeat(600),
      '',
      '## Two',
      '',
      'y'.repeat(600),
    ]);
    const decision = decideAiLadder({
      documentText,
      target: whole(documentText),
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(2);
  });

  it('refuses a Document too large with no sections to plan against', () => {
    const documentText = 'word '.repeat(60).trim();
    const decision = decideAiLadder({
      documentText,
      target: whole(documentText),
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.refusal.code).toBe('unsplittable');
    expect(decision.refusal.message).toContain(
      documentText.length.toLocaleString('en-US'),
    );
    expect(decision.refusal.message).toContain('no headings or Page Breaks');
    expect(decision.refusal.message).toContain('50-token limit');
    expect(decision.refusal.message).toContain('50-token limit');
  });

  it('refuses a selection past the write cap, naming the cap', () => {
    const target = selection(BIG_DOCUMENT, 0, 400);
    const decision = decideAiLadder({
      documentText: BIG_DOCUMENT,
      target,
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.refusal.code).toBe('target_over_write_cap');
    expect(decision.refusal.message).toContain('50');
  });

  it('refuses a selection past the send cap', () => {
    const target = selection(BIG_DOCUMENT, 0, 1_400);
    const decision = decideAiLadder({
      documentText: BIG_DOCUMENT,
      target,
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.refusal.code).toBe('target_over_send_cap');
  });

  it('refuses a target whose digest would still not fit', () => {
    const budgets: AiBudgets = { ...BUDGETS, maxInputCharacters: 20 };
    const target = selection(BIG_DOCUMENT, 0, 5);
    const decision = decideAiLadder({
      documentText: BIG_DOCUMENT,
      target,
      budgets,
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.refusal.code).toBe('context_over_send_cap');
  });

  it('refuses a request that cannot fit the window', () => {
    const budgets: AiBudgets = {
      maxInputCharacters: 1_000,
      maxOutputTokens: 100,
      contextWindow: 100,
    };
    const target = selection(SMALL_DOCUMENT, 0, 100);
    const decision = decideAiLadder({
      documentText: SMALL_DOCUMENT,
      target,
      budgets,
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.refusal.code).toBe('send_over_window');
  });

  it('offers the paragraph around the caret when a target is refused', () => {
    const documentText = reply([
      'A first paragraph.',
      '',
      'The paragraph the caret is in.',
      '',
      'A last paragraph.',
    ]);
    const target = whole(documentText);
    const decision = decideAiLadder({
      documentText,
      target,
      budgets: { ...BUDGETS, maxOutputTokens: 4 },
      cursor: documentText.indexOf('caret'),
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.paragraphRange).toEqual({
      from: documentText.indexOf('The paragraph'),
      to:
        documentText.indexOf('The paragraph') +
        'The paragraph the caret is in.'.length,
    });
  });

  it('offers no paragraph when there is no caret', () => {
    const documentText = 'word '.repeat(60).trim();
    const decision = decideAiLadder({
      documentText,
      target: whole(documentText),
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(3);
    if (decision.tier !== 3) return;
    expect(decision.paragraphRange).toBeNull();
  });

  it('sends a Document exactly at the write cap', () => {
    // 200 characters of Latin text is exactly the 50-token write cap.
    const documentText = `# One\n\n${'x'.repeat(191)}`;
    expect(documentText).toHaveLength(198);
    expect(estimateAiSize(documentText).estimatedTokens).toBe(50);
    const decision = decideAiLadder({
      documentText,
      target: whole(documentText),
      budgets: BUDGETS,
    });
    expect(decision.tier).toBe(0);
  });
});

describe('checkAiSendSize', () => {
  it('accepts a request inside every budget', () => {
    expect(
      checkAiSendSize({
        instruction: 'Restructure this.',
        targetText: 'A short passage.',
        budgets: BUDGETS,
      }),
    ).toEqual({ ok: true });
  });

  it('refuses a target past the send cap', () => {
    const result = checkAiSendSize({
      instruction: '',
      targetText: 'x'.repeat(1_001),
      budgets: BUDGETS,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('target_over_send_cap');
    expect(result.refusal.message).toContain('1,001');
    expect(result.refusal.message).toContain('1,000');
  });

  it('refuses a target past the write cap', () => {
    const result = checkAiSendSize({
      instruction: '',
      targetText: 'x'.repeat(600),
      budgets: BUDGETS,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('target_over_write_cap');
  });

  it('refuses content past the send cap even when the target fits', () => {
    const result = checkAiSendSize({
      instruction: '',
      targetText: 'A short passage.',
      context: 'x'.repeat(1_000),
      budgets: BUDGETS,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('context_over_send_cap');
  });

  it('counts the plan brief toward the window, not the send cap', () => {
    // The brief is overhead the user did not choose: a step whose section fits
    // is not refused because the plan it belongs to is long.
    const fits = checkAiSendSize({
      instruction: '',
      targetText: 'A short passage.',
      brief: 'x'.repeat(1_000),
      budgets: BUDGETS,
    });
    expect(fits).toEqual({ ok: true });

    const tooBig = checkAiSendSize({
      instruction: '',
      targetText: 'A short passage.',
      brief: 'x'.repeat(1_000),
      budgets: { ...BUDGETS, contextWindow: 200 },
    });
    expect(tooBig.ok).toBe(false);
    if (tooBig.ok) return;
    expect(tooBig.refusal.code).toBe('send_over_window');
  });

  it('refuses a request that cannot fit the window', () => {
    const result = checkAiSendSize({
      instruction: 'Restructure this.',
      targetText: 'x'.repeat(600),
      budgets: { ...BUDGETS, maxOutputTokens: 8_000, contextWindow: 2_000 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('send_over_window');
  });
});

describe('resolveParagraphRange', () => {
  const documentText = reply([
    'A first paragraph.',
    'Its second line.',
    '',
    'The paragraph the caret is in.',
    'And its second line.',
    '',
    'A last paragraph.',
  ]);

  it('resolves the paragraph around the caret', () => {
    const at = documentText.indexOf('caret');
    expect(resolveParagraphRange(documentText, at)).toEqual({
      from: documentText.indexOf('The paragraph'),
      to:
        documentText.indexOf('The paragraph') +
        'The paragraph the caret is in.\nAnd its second line.'.length,
    });
  });

  it('resolves the first paragraph at the document start', () => {
    expect(resolveParagraphRange(documentText, 0)).toEqual({
      from: 0,
      to: 'A first paragraph.\nIts second line.'.length,
    });
  });

  it('takes the next paragraph when the caret is on a blank line', () => {
    expect(resolveParagraphRange(documentText, 37)).toEqual({
      from: documentText.indexOf('The paragraph'),
      to:
        documentText.indexOf('The paragraph') +
        'The paragraph the caret is in.\nAnd its second line.'.length,
    });
  });

  it('takes the previous paragraph when the caret is past the last one', () => {
    const at = documentText.length;
    expect(resolveParagraphRange(documentText, at)).toEqual({
      from: documentText.indexOf('A last paragraph.'),
      to: documentText.length,
    });
  });

  it('returns null for an empty or blank Document', () => {
    expect(resolveParagraphRange('', 0)).toBeNull();
    expect(resolveParagraphRange('\n\n  \n', 2)).toBeNull();
  });

  it('returns null without a caret', () => {
    expect(resolveParagraphRange(documentText, null)).toBeNull();
    expect(resolveParagraphRange(documentText, undefined)).toBeNull();
  });

  it('reads CRLF line endings as line breaks', () => {
    const crlf = 'One.\r\nTwo.\r\n\r\nThree.';
    expect(resolveParagraphRange(crlf, crlf.indexOf('Two'))).toEqual({
      from: 0,
      to: 'One.\r\nTwo.'.length,
    });
  });
});

describe('parseAiPlan', () => {
  const labels = ['(no heading)', 'One', 'Two'];

  it('parses one step per line, in order', () => {
    expect(
      parseAiPlan(
        reply([
          '- One: add a summary at the top',
          '- Two: convert the list into a table',
        ]),
        labels,
      ),
    ).toEqual({
      ok: true,
      steps: [
        { sectionIndex: 1, heading: 'One', change: 'add a summary at the top' },
        {
          sectionIndex: 2,
          heading: 'Two',
          change: 'convert the list into a table',
        },
      ],
    });
  });

  it('accepts numbered, bolded, and dash-separated steps', () => {
    const parsed = parseAiPlan(
      reply(['1. **One** — tighten the prose', '2) `Two`: add a table']),
      labels,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.steps).toEqual([
      { sectionIndex: 1, heading: 'One', change: 'tighten the prose' },
      { sectionIndex: 2, heading: 'Two', change: 'add a table' },
    ]);
  });

  it('maps the no-heading label to a null heading', () => {
    const parsed = parseAiPlan('- (no heading): move this after One', labels);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.steps[0]).toEqual({
      sectionIndex: 0,
      heading: null,
      change: 'move this after One',
    });
  });

  it('maps a numbered heading-less label to a null heading', () => {
    const parsed = parseAiPlan('- (no heading 2): move this after One', [
      '(no heading 1)',
      'One',
      '(no heading 2)',
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.steps[0]).toEqual({
      sectionIndex: 2,
      heading: null,
      change: 'move this after One',
    });
  });

  it('skips prose that names no section', () => {
    const parsed = parseAiPlan(
      reply(['Here is the plan:', '', '- One: tighten the prose', 'Done.']),
      labels,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.steps).toHaveLength(1);
  });

  it('refuses a step naming a section nobody has', () => {
    expect(parseAiPlan('- Three: tighten the prose', labels)).toEqual({
      ok: false,
      code: 'unknown_section',
      line: '- Three: tighten the prose',
    });
  });

  it('refuses a step with no change', () => {
    expect(parseAiPlan('- One:', labels)).toEqual({
      ok: false,
      code: 'malformed_step',
      line: '- One:',
    });
  });

  it('refuses a reply with no steps', () => {
    expect(parseAiPlan('Nothing to change.', labels)).toEqual({
      ok: false,
      code: 'no_steps',
      line: '',
    });
  });

  it('refuses more steps than a plan may have', () => {
    const many = Array.from({ length: 21 }, () => '- One: tighten the prose');
    const parsed = parseAiPlan(reply(many), labels);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('too_many_steps');
  });

  it('takes the longest label when one is a prefix of another', () => {
    const parsed = parseAiPlan('- Introduction: tighten it', [
      'Intro',
      'Introduction',
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.steps[0]!.sectionIndex).toBe(1);
  });

  it('does not match a label that runs into a longer word', () => {
    const parsed = parseAiPlan('- Introductions: tighten it', ['Introduction']);
    expect(parsed).toEqual({
      ok: false,
      code: 'unknown_section',
      line: '- Introductions: tighten it',
    });
  });

  it('reads CRLF replies', () => {
    const parsed = parseAiPlan('- One: tighten\r\n- Two: add a table', labels);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.steps).toHaveLength(2);
  });
});

describe('findPlanStepSection', () => {
  it('resolves a step by heading after the Document has moved', () => {
    const before = extractSections(
      reply(['# One', '', 'Body.', '', '## Two', '', 'Body.']),
    );
    const after = extractSections(
      reply([
        '# Preamble added later',
        '',
        'Body.',
        '',
        '# One',
        '',
        'Body.',
        '',
        '## Two',
        '',
        'Body.',
      ]),
    );
    const step = { sectionIndex: 1, heading: 'Two', change: 'add a table' };
    expect(findPlanStepSection(before, step)?.heading).toBe('Two');
    expect(findPlanStepSection(after, step)?.heading).toBe('Two');
    expect(findPlanStepSection(after, step)?.text).toContain('## Two');
  });

  it('resolves the no-heading section by the plan index', () => {
    const sections = extractSections(
      reply(['Loose notes.', '', '# One', '', 'Body.']),
    );
    const step = { sectionIndex: 0, heading: null, change: 'move this' };
    expect(findPlanStepSection(sections, step)?.text).toBe('Loose notes.');
  });

  it('returns null when the section is gone', () => {
    const sections = extractSections('# One\n\nBody.');
    expect(
      findPlanStepSection(sections, {
        sectionIndex: 3,
        heading: 'Deleted',
        change: 'x',
      }),
    ).toBeNull();
  });
});

describe('sectionLabel', () => {
  it('names a section with no heading, or an empty one', () => {
    expect(sectionLabel({ heading: null })).toBe('(no heading)');
    expect(sectionLabel({ heading: '' })).toBe('(no heading)');
    expect(sectionLabel({ heading: 'One' })).toBe('One');
  });
});

describe('sectionLabels', () => {
  it('names each section by its heading', () => {
    const sections = extractSections(
      reply(['# One', '', 'Body.', '', '## Two', '', 'Body.']),
    );
    expect(sectionLabels(sections)).toEqual(['One', 'Two']);
  });

  it('leaves a lone heading-less section unnumbered', () => {
    const sections = extractSections(
      reply(['# One', '', 'Body.', '', '///', '', 'Loose notes.']),
    );
    expect(sectionLabels(sections)).toEqual(['One', '(no heading)']);
  });

  it('numbers heading-less sections when there is more than one', () => {
    const sections = extractSections(
      reply([
        'Loose notes.',
        '',
        '///',
        '',
        'More notes.',
        '',
        '///',
        '',
        'Last.',
      ]),
    );
    expect(sectionLabels(sections)).toEqual([
      '(no heading 1)',
      '(no heading 2)',
      '(no heading 3)',
    ]);
  });

  it('resolves a numbered step to its own section, not the first one', () => {
    const sections = extractSections(
      reply(['First.', '', '///', '', 'Second.', '', '///', '', 'Third.']),
    );
    const step = { sectionIndex: 2, heading: null, change: 'move this' };
    expect(findPlanStepSection(sections, step)?.text).toBe('Third.');
  });
});
