// ─────────────────────────────────────────────────────────────────────────────
// The AI decision module: the pure, shared half of every AI Action.
//
// One module both sides of the wire import verbatim (spec §Testing decisions):
// the client resolves an AI Scope and turns a reply into the text it would
// apply, and the server re-derives the same sizes and applies the same edits
// rather than trusting the client's numbers. It has no DOM, no I/O, and no
// imports at all, so it runs unchanged in the editor, in Node tests, and in
// the API process.
// ─────────────────────────────────────────────────────────────────────────────

// ─── The conservative size estimate ─────────────────────────────────────────

/** Latin-script text runs at roughly four characters per token. */
const LATIN_CHARS_PER_TOKEN = 4;

/** The tighter ratio once the non-ASCII letter share is high: a Document in
 *  Arabic, Persian, Chinese, or Japanese costs roughly twice the tokens of the
 *  same character count in English (spec §AI Provider Config). */
const NON_ASCII_CHARS_PER_TOKEN = 2;

/** The non-ASCII letter share at which the tighter ratio takes over — low on
 *  purpose, because every estimate is meant to err toward refusing. */
const NON_ASCII_LETTER_SHARE = 0.25;

const IS_LETTER = /^\p{L}$/u;

/** What an AI Action's text is estimated to cost. */
export interface AiSizeEstimate {
  /** Code points, so an astral-plane character counts once — the same rule as
   *  the editor's character count. */
  characters: number;
  /** Whole tokens, rounded up: the estimate can only err toward refusing. */
  estimatedTokens: number;
}

/**
 * Estimates a text's size from its characters alone — no tokenizer, no
 * network. Deliberately conservative: Latin text at ~4 characters per token,
 * and script-aware so an Arabic, Persian, Chinese, or Japanese Document is
 * refused early rather than sent oversized.
 */
export function estimateAiSize(text: string): AiSizeEstimate {
  let characters = 0;
  let letters = 0;
  let nonAsciiLetters = 0;
  for (const character of text) {
    characters += 1;
    if (IS_LETTER.test(character)) {
      letters += 1;
      if (character.charCodeAt(0) > 0x7f) nonAsciiLetters += 1;
    }
  }
  const tight =
    letters > 0 && nonAsciiLetters / letters >= NON_ASCII_LETTER_SHARE;
  const charsPerToken = tight
    ? NON_ASCII_CHARS_PER_TOKEN
    : LATIN_CHARS_PER_TOKEN;
  return {
    characters,
    estimatedTokens: Math.ceil(characters / charsPerToken),
  };
}

// ─── AI Scope resolution ────────────────────────────────────────────────────

/** A selection in the editor, as UTF-16 code-unit offsets into the Document. */
export interface TextSelection {
  from: number;
  to: number;
}

/**
 * Which part of a Document an AI Action may change (CONTEXT.md): the selection
 * when there is one — `from === to` is a cursor — otherwise the whole
 * Document. The result carries the exact target text, its source offsets, and
 * its estimated size, so the popup and the request body read from one place.
 */
export interface AiScope {
  kind: 'document' | 'selection';
  /** The exact text the action targets: `documentText.slice(from, to)`. */
  text: string;
  from: number;
  to: number;
  size: AiSizeEstimate;
}

export function resolveAiScope(
  documentText: string,
  selection?: TextSelection | null,
): AiScope {
  if (selection && selection.to > selection.from) {
    const text = documentText.slice(selection.from, selection.to);
    return {
      kind: 'selection',
      text,
      from: selection.from,
      to: selection.to,
      size: estimateAiSize(text),
    };
  }
  return {
    kind: 'document',
    text: documentText,
    from: 0,
    to: documentText.length,
    size: estimateAiSize(documentText),
  };
}

// ─── Anchored edits ─────────────────────────────────────────────────────────

/**
 * One search/replace block from a reply, in the widely-seen shape:
 *
 * ```
 * <<<<<<< SEARCH
 * the exact existing text, quoted verbatim from the Document
 * =======
 * the replacement text
 * >>>>>>> REPLACE
 * ```
 */
export interface AnchoredEdit {
  /** Text quoted verbatim from the target; must match exactly once when the
   *  block is applied. */
  search: string;
  /** The replacement text; an empty string deletes the anchor. */
  replace: string;
}

/**
 * Why a reply could not become a change set. `no_blocks` is the empty or
 * contract-ignoring reply; `malformed_block` is a broken marker structure;
 * `empty_search` is an anchor that quotes nothing. Every one of them refuses
 * the whole reply — a proposal that cannot be applied is never offered.
 */
export type AnchoredEditParseFailure =
  'no_blocks' | 'malformed_block' | 'empty_search';

export type AnchoredEditParseResult =
  | { ok: true; edits: AnchoredEdit[] }
  | { ok: false; code: AnchoredEditParseFailure; blockIndex: number };

/**
 * Why a change set could not be applied to the text. The anchor either is not
 * there (`not_found`), is there more than once (`ambiguous`), or quotes
 * nothing (`empty_search`). The failure names the first offending block, so
 * the review surface can say which one it was.
 */
export type AnchoredEditApplyFailure =
  'empty_search' | 'not_found' | 'ambiguous';

export type AnchoredEditApplyResult =
  | { ok: true; text: string }
  | {
      ok: false;
      code: AnchoredEditApplyFailure;
      /** Zero-based index of the first offending block. */
      blockIndex: number;
      /** How many times the anchor matched the text as it stood. */
      occurrences: number;
    };

const SEARCH_MARKER = /^<{7}[ \t]*SEARCH[ \t]*$/i;
const BLOCK_DIVIDER = /^={7}[ \t]*$/;
const REPLACE_MARKER = /^>{7}[ \t]*REPLACE[ \t]*$/i;

/**
 * Extracts the anchored edits from a reply, in the order they appear. Prose
 * around the blocks is ignored, because models add a sentence of explanation
 * to a reply that is otherwise well-formed; everything inside the markers is
 * kept verbatim. A reply with no blocks at all is refused rather than treated
 * as an edit-free success.
 */
export function parseAnchoredEdits(reply: string): AnchoredEditParseResult {
  const lines = reply.replace(/\r\n?/g, '\n').split('\n');
  const edits: AnchoredEdit[] = [];
  let searchLines: string[] | null = null;
  let replaceLines: string[] | null = null;

  for (const line of lines) {
    if (searchLines === null) {
      // Outside a block: markers are prose, except a SEARCH marker opening one.
      if (SEARCH_MARKER.test(line)) {
        searchLines = [];
        replaceLines = null;
      }
      continue;
    }
    if (replaceLines === null) {
      if (BLOCK_DIVIDER.test(line)) {
        replaceLines = [];
        continue;
      }
      // A block that never reaches its divider — or opens a second one — is
      // broken, and a broken block refuses the whole reply.
      if (SEARCH_MARKER.test(line) || REPLACE_MARKER.test(line)) {
        return { ok: false, code: 'malformed_block', blockIndex: edits.length };
      }
      searchLines.push(line);
      continue;
    }
    if (REPLACE_MARKER.test(line)) {
      const search = searchLines.join('\n');
      if (search === '') {
        return { ok: false, code: 'empty_search', blockIndex: edits.length };
      }
      edits.push({ search, replace: replaceLines.join('\n') });
      searchLines = null;
      replaceLines = null;
      continue;
    }
    // A SEARCH marker inside a replacement is a broken structure; a divider is
    // just a line the replacement wants to keep.
    if (SEARCH_MARKER.test(line)) {
      return { ok: false, code: 'malformed_block', blockIndex: edits.length };
    }
    replaceLines.push(line);
  }

  // An unterminated block is a truncated or malformed reply: refuse it whole.
  if (searchLines !== null) {
    return { ok: false, code: 'malformed_block', blockIndex: edits.length };
  }
  if (edits.length === 0) {
    return { ok: false, code: 'no_blocks', blockIndex: 0 };
  }
  return { ok: true, edits };
}

/**
 * Applies the edits to the text, in the order given, re-reading the text as it
 * stands after each one. Every anchor must match exactly once; the first
 * missing or ambiguous anchor refuses the whole change set — a caller never
 * gets a partially applied result, and a subset the user unchecked is simply
 * not passed in.
 */
export function applyAnchoredEdits(
  text: string,
  edits: readonly AnchoredEdit[],
): AnchoredEditApplyResult {
  let current = text;
  for (const [blockIndex, edit] of edits.entries()) {
    if (edit.search === '') {
      return {
        ok: false,
        code: 'empty_search',
        blockIndex,
        occurrences: 0,
      };
    }
    const occurrences = countOccurrences(current, edit.search);
    if (occurrences === 0) {
      return { ok: false, code: 'not_found', blockIndex, occurrences };
    }
    if (occurrences > 1) {
      return { ok: false, code: 'ambiguous', blockIndex, occurrences };
    }
    const at = current.indexOf(edit.search);
    // Slicing rather than String.replace, so `$&` and friends in a replacement
    // are inserted literally.
    current =
      current.slice(0, at) +
      edit.replace +
      current.slice(at + edit.search.length);
  }
  return { ok: true, text: current };
}

/**
 * How many times an anchor can be read in the text. Overlaps count: `aa` in
 * `aaa` can be read in two places, so applying it would guess which one the
 * model meant — the estimate errs toward refusing.
 */
function countOccurrences(text: string, search: string): number {
  let count = 0;
  let index = text.indexOf(search);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(search, index + 1);
  }
  return count;
}

// ─── Sections and the outline digest ────────────────────────────────────────

/** One section of a Document: a heading and everything under it, or the
 *  content between Page Breaks, split exactly the way the ladder needs. */
export interface DocumentSection {
  /** 1–6 for an ATX heading; null for a section with no heading. */
  level: number | null;
  /** The heading text with its markers stripped; null when there is none. */
  heading: string | null;
  /** The exact source slice — `markdown.slice(from, to)`. */
  text: string;
  /** UTF-16 code-unit offsets into the Document. */
  from: number;
  to: number;
  /** Whitespace-separated words in the section, heading markers excluded. */
  words: number;
  /** First line of body content after the heading, trimmed and clipped for
   *  the digest; '' when the section has no body. */
  firstLine: string;
}

/** How much of a section's first line the digest carries. */
const MAX_FIRST_LINE = 120;

const PAGE_BREAK_LINE = /^\/\/\/[ \t]*$/;
const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

interface SourceLine {
  /** Offset of the line's first character. */
  start: number;
  /** Offset just past the line's last character, excluding any CR/LF. */
  end: number;
  text: string;
}

interface OpenFence {
  marker: string;
  length: number;
}

interface OpenSection {
  level: number | null;
  heading: string | null;
  /** Offset where the body begins: just past the heading line, or the
   *  section's own start when there is no heading. */
  bodyStart: number;
  from: number;
  /** Offset just past the last line with content. */
  lastContentEnd: number;
}

/**
 * Splits a Document into its sections, locally and deterministically: a new
 * section starts at every ATX heading and at every Page Break, and a section
 * with no heading is the content before the first heading or after a Page
 * Break. Headings inside fenced code blocks are not headings — setext and
 * blockquote headings are not section starts either, because the feature's
 * dialect is ATX headings; a Page Break splits wherever it appears, because
 * the renderer splits the raw markdown the same way. No model call, no
 * rendering.
 */
export function extractSections(markdown: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let open: OpenSection | null = null;
  let fence: OpenFence | null = null;

  const flush = (): void => {
    if (open === null) return;
    const to = open.lastContentEnd;
    const body = markdown.slice(open.bodyStart, to);
    sections.push({
      level: open.level,
      heading: open.heading,
      text: markdown.slice(open.from, to),
      from: open.from,
      to,
      words:
        countWhitespaceWords(open.heading ?? '') + countWhitespaceWords(body),
      firstLine: clipFirstLine(firstContentLine(body)),
    });
    open = null;
  };

  for (const line of scanLines(markdown)) {
    if (PAGE_BREAK_LINE.test(line.text)) {
      flush();
      fence = null;
      continue;
    }
    if (fence !== null) {
      if (isFenceClose(line.text, fence)) fence = null;
    } else {
      const heading = ATX_HEADING.exec(line.text);
      if (heading !== null) {
        flush();
        open = {
          level: heading[1]!.length,
          heading: stripHeadingMarkers(heading[2]!),
          bodyStart: line.end,
          from: line.start,
          lastContentEnd: line.end,
        };
        continue;
      }
      const fenceOpen = FENCE_OPEN.exec(line.text);
      if (fenceOpen !== null) {
        fence = { marker: fenceOpen[1]![0]!, length: fenceOpen[1]!.length };
      }
    }
    if (line.text.trim() !== '') {
      if (open === null) {
        open = {
          level: null,
          heading: null,
          bodyStart: line.start,
          from: line.start,
          lastContentEnd: line.end,
        };
      } else {
        open.lastContentEnd = line.end;
      }
    }
  }
  flush();
  return sections;
}

/**
 * The outline digest the ladder sends instead of the rest of a large
 * Document: one line per section — heading, level, word count, first line —
 * built locally from `extractSections` output, never from a model call.
 */
export function buildOutlineDigest(
  sections: readonly DocumentSection[],
): string {
  return sections
    .map((section) => {
      const label = section.heading ?? '(no heading)';
      const parts = [
        ...(section.level === null ? [] : [`h${section.level}`]),
        `${section.words} ${section.words === 1 ? 'word' : 'words'}`,
      ];
      const entry = `- ${label} (${parts.join(', ')})`;
      return section.firstLine === ''
        ? entry
        : `${entry}: ${section.firstLine}`;
    })
    .join('\n');
}

function scanLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (;;) {
    let newline = markdown.indexOf('\n', start);
    if (newline === -1) newline = markdown.length;
    // A CR before the LF belongs to the line ending, not the content.
    const end =
      newline > start && markdown.charCodeAt(newline - 1) === 13
        ? newline - 1
        : newline;
    lines.push({ start, end, text: markdown.slice(start, end) });
    if (newline === markdown.length) break;
    start = newline + 1;
  }
  return lines;
}

function isFenceClose(line: string, fence: OpenFence): boolean {
  const close = FENCE_CLOSE.exec(line);
  return (
    close !== null &&
    close[1]![0] === fence.marker &&
    close[1]!.length >= fence.length
  );
}

/** `## Title ##` → `Title`; the closing sequence needs its preceding space. */
function stripHeadingMarkers(raw: string): string {
  return raw.replace(/[ \t]+#+[ \t]*$/, '').trim();
}

function firstContentLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '') return trimmed;
  }
  return '';
}

function clipFirstLine(line: string): string {
  const characters = [...line];
  return characters.length <= MAX_FIRST_LINE
    ? line
    : `${characters.slice(0, MAX_FIRST_LINE).join('')}…`;
}

function countWhitespaceWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}
