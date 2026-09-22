import { describe, expect, it } from 'vitest';
import {
  applyAnchoredEdits,
  buildOutlineDigest,
  estimateAiSize,
  extractSections,
  parseAnchoredEdits,
  resolveAiScope,
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
        '- (no heading) (3 words): A short preamble.',
        '- Title (h1, 3 words): Opening line.',
        '- (no heading) (2 words): Loose notes.',
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
