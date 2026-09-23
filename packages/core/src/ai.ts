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

/** How a section with no heading is named in a digest, a plan, or a request. */
export const NO_HEADING_LABEL = '(no heading)';

/** The name a section is known by on its own. An empty heading (`## `) is a
 *  heading nobody can quote, so it reads as no heading at all. */
export function sectionLabel(section: { heading: string | null }): string {
  return headingOf(section) ?? NO_HEADING_LABEL;
}

/**
 * The names the sections of one Document are known by, in order. A heading is
 * its own name; sections with no heading are numbered when there is more than
 * one of them, because a plan has to be able to say *which* one a step means —
 * a Document split only by Page Breaks has no headings at all.
 */
export function sectionLabels(sections: readonly DocumentSection[]): string[] {
  const bare = sections.filter((section) => headingOf(section) === null).length;
  let seen = 0;
  return sections.map((section) => {
    const heading = headingOf(section);
    if (heading !== null) return heading;
    seen += 1;
    return bare === 1 ? NO_HEADING_LABEL : `(no heading ${seen})`;
  });
}

function headingOf(section: { heading: string | null }): string | null {
  return section.heading === null || section.heading === ''
    ? null
    : section.heading;
}

/** Whether a label names a section that has no heading — plain or numbered. */
export function isBareSectionLabel(label: string): boolean {
  return label === NO_HEADING_LABEL || /^\(no heading \d+\)$/.test(label);
}

/**
 * The outline digest the ladder sends instead of the rest of a large
 * Document: one line per section — heading, level, word count, first line —
 * built locally from `extractSections` output, never from a model call.
 */
export function buildOutlineDigest(
  sections: readonly DocumentSection[],
): string {
  const labels = sectionLabels(sections);
  return sections
    .map((section, index) => {
      const label = labels[index]!;
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

// ─── The size ladder ────────────────────────────────────────────────────────
//
// One pure decision over the Document, the target, and the configured budgets
// (spec §Scope, the size ladder). The client resolves a scope and asks this
// module what can be done with it; the server re-derives the same numbers from
// the payload it received through `checkAiSendSize` and never trusts the
// client's arithmetic. Nothing here truncates: a tier that cannot be worked on
// is refused with its size, the cap it ran into, and the way forward.

/**
 * The budgets one AI Action is measured against, straight from the AI Provider
 * Config. The write cap is derived from the output budget rather than
 * configured separately, so a single number cannot contradict itself.
 */
export interface AiBudgets {
  /** Characters of content one AI Action may send. */
  maxInputCharacters: number;
  /** The explicit output cap sent with every request. */
  maxOutputTokens: number;
  /** The model's window: everything sent plus the output reserve fits here. */
  contextWindow: number;
}

/**
 * The budgets the ladder measures against, from whatever carries the three
 * configured numbers — the Admin's AI Provider Config on the server, the
 * account block on the client — so neither side maps them its own way.
 */
export function aiBudgets(source: {
  maxInputCharacters: number;
  maxOutputTokens: number;
  contextWindow: number;
}): AiBudgets {
  return {
    maxInputCharacters: source.maxInputCharacters,
    maxOutputTokens: source.maxOutputTokens,
    contextWindow: source.contextWindow,
  };
}

/** A target may be at most about half the output budget in estimated tokens,
 *  so a reply can never be asked for more text than the output cap allows. */
export function aiWriteCapTokens(budgets: AiBudgets): number {
  return Math.floor(budgets.maxOutputTokens / 2);
}

/** Why a request could not be made to fit. Every code names the cap that was
 *  hit so the message can state the size, the cap, and the path forward. */
export type AiSizeRefusalCode =
  | 'target_over_send_cap'
  | 'target_over_write_cap'
  | 'context_over_send_cap'
  | 'send_over_window'
  | 'unsplittable';

export interface AiSizeRefusal {
  code: AiSizeRefusalCode;
  /** The plain-words message the popup and the route both show. */
  message: string;
}

export type AiSizeCheck = { ok: true } | { ok: false; refusal: AiSizeRefusal };

export interface AiSendSizeInput {
  instruction: string;
  /** The target text; '' for a plan request, which sends the outline alone. */
  targetText: string;
  /** The rest of the Document: an outline digest, or the whole remainder. */
  context?: string | null;
  /** The approved plan a step carries as its brief. */
  brief?: string | null;
  budgets: AiBudgets;
}

/**
 * Whether this request fits the configured budgets, derived from the shared
 * estimator. The server runs exactly this on every request, so a client that
 * under-reports a size is refused rather than believed.
 */
export function checkAiSendSize(input: AiSendSizeInput): AiSizeCheck {
  const { budgets } = input;
  const target = estimateAiSize(input.targetText);
  // The send cap governs the content being handed over; the plan brief and the
  // instruction are overhead the user does not choose, so they count toward
  // the window only.
  const content = `${input.targetText}${input.context ?? ''}`;
  const contentCharacters = estimateAiSize(content).characters;
  const writeCap = aiWriteCapTokens(budgets);

  if (target.characters > budgets.maxInputCharacters) {
    return refuse(
      'target_over_send_cap',
      `That is about ${count(target.characters)} characters, past the ${count(budgets.maxInputCharacters)}-character limit for one AI Action. Select a smaller range.`,
    );
  }
  if (target.estimatedTokens > writeCap) {
    return refuse(
      'target_over_write_cap',
      `That is about ${count(target.estimatedTokens)} tokens, past the ${count(writeCap)}-token limit one AI Action can rewrite. Select a smaller range.`,
    );
  }
  if (contentCharacters > budgets.maxInputCharacters) {
    return refuse(
      'context_over_send_cap',
      `That passage and the context it needs are about ${count(contentCharacters)} characters, past the ${count(budgets.maxInputCharacters)}-character limit for one AI Action. Select a smaller range.`,
    );
  }
  const sendTokens = estimateAiSize(
    `${input.instruction}${content}${input.brief ?? ''}`,
  ).estimatedTokens;
  const reserved = sendTokens + budgets.maxOutputTokens;
  if (reserved > budgets.contextWindow) {
    return refuse(
      'send_over_window',
      `That is about ${count(sendTokens)} tokens of text and ${count(budgets.maxOutputTokens)} tokens of reply, past the ${count(budgets.contextWindow)}-token window one AI Action has. Select a smaller range.`,
    );
  }
  return { ok: true };
}

/** The ladder's four rungs, as one decision the popup renders verbatim. */
export type AiLadderDecision =
  /** Everything fits: the target and its context are both sent in full. The
   *  context is the rest of the Document for a selection, and nothing at all
   *  when the target is the whole Document. */
  | { tier: 0; kind: 'all'; characters: number; context: string | null }
  /** The target in full plus a locally built outline of the rest. */
  | {
      tier: 1;
      kind: 'partial';
      digest: string;
      otherSections: number;
      characters: number;
    }
  /** A whole-Document intent past the caps: an AI Plan is offered instead. */
  | {
      tier: 2;
      kind: 'plan';
      digest: string;
      sections: DocumentSection[];
      characters: number;
    }
  /** Not workable even scoped: refused, with the paragraph around the caret
   *  offered as the way forward when there is one. */
  | {
      tier: 3;
      kind: 'refused';
      refusal: AiSizeRefusal;
      paragraphRange: TextSelection | null;
    };

export interface AiLadderInput {
  /** The whole Document, as the editor has it. */
  documentText: string;
  target: { kind: 'document' | 'selection'; text: string; from: number; to: number };
  /** The instruction, which counts toward the window with everything sent. */
  instruction?: string;
  budgets: AiBudgets;
  /** The caret, for the Tier 3 offer of the paragraph around it. */
  cursor?: number | null;
}

/**
 * The one size decision over a Document, a target, and the budgets. A whole
 * Document that does not fit becomes an AI Plan when it can be split at all,
 * and is refused when it cannot; a selection that does not fit is refused with
 * the paragraph around the caret offered instead. Nothing here is ever
 * truncated: every rung either sends something whole or refuses.
 */
export function decideAiLadder(input: AiLadderInput): AiLadderDecision {
  const { budgets, documentText, target } = input;
  const instruction = input.instruction ?? '';
  const paragraphRange = resolveParagraphRange(documentText, input.cursor);
  const targetCharacters = estimateAiSize(target.text).characters;
  const refused = (
    code: AiSizeRefusalCode,
    message: string,
  ): AiLadderDecision => ({
    tier: 3,
    kind: 'refused',
    refusal: { code, message },
    paragraphRange,
  });

  if (target.kind === 'document') {
    const check = checkAiSendSize({
      instruction,
      targetText: target.text,
      budgets,
    });
    if (check.ok) {
      return {
        tier: 0,
        kind: 'all',
        characters: targetCharacters,
        context: null,
      };
    }
    // A whole-Document intent past the caps is the AI Plan's case — but only
    // when there are sections to plan against (spec §Tier 2 and §Tier 3).
    const sections = extractSections(documentText);
    if (sections.length < 2) {
      return refused(
        'unsplittable',
        unsplittableMessage(check.refusal, targetCharacters, budgets),
      );
    }
    return {
      tier: 2,
      kind: 'plan',
      digest: buildOutlineDigest(sections),
      sections,
      characters: targetCharacters,
    };
  }

  // A selection has to be rewritable on its own: a range is not something a
  // plan can split, so a selection past the caps is refused outright.
  const targetCheck = checkAiSendSize({
    instruction,
    targetText: target.text,
    budgets,
  });
  if (!targetCheck.ok) {
    return {
      tier: 3,
      kind: 'refused',
      refusal: targetCheck.refusal,
      paragraphRange,
    };
  }

  // The target fits. Everything is sent when the whole Document fits with it;
  // otherwise the target goes in full and the sections it does not touch go as
  // an outline digest (spec §Tier 0 and §Tier 1).
  const rest = restOfDocument(documentText, target);
  const whole = checkAiSendSize({
    instruction,
    targetText: target.text,
    context: rest,
    budgets,
  });
  if (whole.ok) {
    return { tier: 0, kind: 'all', characters: targetCharacters, context: rest };
  }

  const others = extractSections(documentText).filter(
    (section) => section.to <= target.from || section.from >= target.to,
  );
  const digest = buildOutlineDigest(others);
  const partial = checkAiSendSize({
    instruction,
    targetText: target.text,
    context: digest,
    budgets,
  });
  if (!partial.ok) {
    return {
      tier: 3,
      kind: 'refused',
      refusal: partial.refusal,
      paragraphRange,
    };
  }
  return {
    tier: 1,
    kind: 'partial',
    digest,
    otherSections: others.length,
    characters: targetCharacters,
  };
}

/** Everything in the Document outside the target, in Document order. */
function restOfDocument(
  documentText: string,
  target: { from: number; to: number },
): string {
  return documentText.slice(0, target.from) + documentText.slice(target.to);
}

/**
 * The refusal for a Document too large to work on that has no sections to plan
 * against: the size, the cap it ran into, and the two ways forward — a range,
 * or the paragraph the caret is in.
 */
function unsplittableMessage(
  refusal: AiSizeRefusal,
  characters: number,
  budgets: AiBudgets,
): string {
  const cap =
    refusal.code === 'target_over_write_cap'
      ? `past the ${count(aiWriteCapTokens(budgets))}-token limit one AI Action can rewrite`
      : refusal.code === 'target_over_send_cap'
        ? `past the ${count(budgets.maxInputCharacters)}-character limit for one AI Action`
        : 'too large for the model’s window in one AI Action';
  return `This document is about ${count(characters)} characters — ${cap}, and it has no headings or Page Breaks to split into sections. Select a range to work on, or start from the paragraph you are in.`;
}

/**
 * The paragraph around a caret: the run of consecutive non-blank lines it sits
 * in, offered as the way forward when nothing larger can be worked on. Null
 * when there is no paragraph to offer (an empty Document, or blank lines only).
 */
export function resolveParagraphRange(
  documentText: string,
  cursor: number | null | undefined,
): TextSelection | null {
  if (cursor === null || cursor === undefined) return null;
  const lines = scanLines(documentText);
  if (lines.length === 0) return null;

  const at = Math.max(0, Math.min(cursor, documentText.length));
  let index = lines.findIndex((line) => at >= line.start && at <= line.end);
  if (index === -1) index = lines.length - 1;

  // A caret on blank space belongs to the paragraph it is nearest: the next
  // one when there is one, otherwise the previous one.
  if (lines[index]!.text.trim() === '') {
    let forward = -1;
    for (let i = index + 1; i < lines.length; i += 1) {
      if (lines[i]!.text.trim() !== '') {
        forward = i;
        break;
      }
    }
    if (forward !== -1) {
      index = forward;
    } else {
      let backward = -1;
      for (let i = index - 1; i >= 0; i -= 1) {
        if (lines[i]!.text.trim() !== '') {
          backward = i;
          break;
        }
      }
      if (backward === -1) return null;
      index = backward;
    }
  }

  let first = index;
  while (first > 0 && lines[first - 1]!.text.trim() !== '') first -= 1;
  let last = index;
  while (last + 1 < lines.length && lines[last + 1]!.text.trim() !== '') {
    last += 1;
  }
  return { from: lines[first]!.start, to: lines[last]!.end };
}

// ─── The AI Plan ────────────────────────────────────────────────────────────
//
// A Document too large for one action is planned instead: one cheap action
// against the outline digest returns the steps, the user approves them, and
// each approved step then runs as its own AI Action against its own section
// (spec §Tier 2). The plan is parsed here so the server can refuse a reply
// that names a section nobody has, and the client resolves the same steps to
// the ranges it will send.

/** One approved step of an AI Plan: a section, and what changes in it. */
export interface AiPlanStep {
  /** Index into the section list the plan was produced against. */
  sectionIndex: number;
  /** The section's heading, or null for the section that has none. */
  heading: string | null;
  /** One line: what this step changes in that section. */
  change: string;
}

/** The approved plan a step carries as its shared brief (spec §Tier 2): every
 *  step sees the whole plan, so the sections stay consistent with each other. */
export interface AiPlanBrief {
  /** Zero-based index of this step in the approved plan. */
  index: number;
  steps: { heading: string | null; change: string }[];
}

/** The brief as it is sent, and as it is counted toward the model's window. */
export function planBriefText(brief: AiPlanBrief): string {
  const lines = brief.steps.map(
    (step, index) =>
      `${index + 1}. ${step.heading ?? NO_HEADING_LABEL}: ${step.change}`,
  );
  const current = brief.steps[brief.index]!;
  return [
    `This edit is step ${brief.index + 1} of ${brief.steps.length} of a plan the user approved for this document. The plan, in order:`,
    ...lines,
    `Carry out step ${brief.index + 1} only ("${current.change}"), and keep the result consistent in tone and terminology with the rest of the plan.`,
  ].join('\n');
}

/** A plan longer than this is a runaway reply, not a plan. */
export const MAX_AI_PLAN_STEPS = 20;

export type AiPlanParseFailure =
  'no_steps' | 'unknown_section' | 'malformed_step' | 'too_many_steps';

export type AiPlanParseResult =
  | { ok: true; steps: AiPlanStep[] }
  | { ok: false; code: AiPlanParseFailure; line: string };

/** `- Heading: what changes` — the plan's one-line-per-step contract. */
const PLAN_LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;
const LABEL_DECORATION = /^[*_`]+/;
/** What may follow a heading in a step line: a separator, or the space before
 *  the description. */
const AFTER_LABEL = /[\s:–—*_`-]/;

/**
 * Reads a plan reply against the sections it was planned from. Each step names
 * a section by its exact heading (or `(no heading)`); a step that names a
 * section nobody has cannot run, so it refuses the whole plan rather than
 * offering a plan with holes in it. Prose that names no section is skipped.
 */
export function parseAiPlan(
  reply: string,
  labels: readonly string[],
): AiPlanParseResult {
  const steps: AiPlanStep[] = [];
  for (const raw of reply.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const marker = PLAN_LIST_MARKER.exec(line);
    const body = marker === null ? line : line.slice(marker[0].length).trim();
    const decoration = LABEL_DECORATION.exec(body);
    const offset = decoration === null ? 0 : decoration[0].length;
    const match = matchSectionLabel(body.slice(offset), labels);
    if (match === null) {
      if (marker !== null) {
        return { ok: false, code: 'unknown_section', line };
      }
      continue;
    }
    const change = body
      .slice(offset + match.length)
      .replace(/^[\s*_`]*[:–—-]?[\s*_`]*/, '')
      .trim();
    if (change === '') return { ok: false, code: 'malformed_step', line };
    if (steps.length >= MAX_AI_PLAN_STEPS) {
      return { ok: false, code: 'too_many_steps', line };
    }
    const label = labels[match.index]!;
    steps.push({
      sectionIndex: match.index,
      heading: isBareSectionLabel(label) ? null : label,
      change,
    });
  }
  if (steps.length === 0) return { ok: false, code: 'no_steps', line: '' };
  return { ok: true, steps };
}

/** The longest section label a step line starts with, or null. */
function matchSectionLabel(
  body: string,
  labels: readonly string[],
): { index: number; length: number } | null {
  const lower = body.toLowerCase();
  let best: { index: number; length: number } | null = null;
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index]!;
    if (label === '') continue;
    if (!lower.startsWith(label.toLowerCase())) continue;
    const after = body.charAt(label.length);
    if (after !== '' && !AFTER_LABEL.test(after)) continue;
    if (best === null || label.length > best.length) {
      best = { index, length: label.length };
    }
  }
  return best;
}

/**
 * The section a plan step targets, resolved against the Document as it stands
 * now: by heading, because headings survive the edits a run makes, and by the
 * plan's own index for the section that has no heading. Null when the section
 * is gone — a step that cannot be resolved is never run.
 */
export function findPlanStepSection(
  sections: readonly DocumentSection[],
  step: AiPlanStep,
): DocumentSection | null {
  const labels = sectionLabels(sections);
  if (step.heading !== null) {
    const index = labels.indexOf(step.heading);
    return index === -1 ? null : sections[index]!;
  }
  // A heading-less section is identified by the plan's own index when that
  // index still points at one, and by being the only candidate otherwise.
  const at = sections[step.sectionIndex];
  if (at !== undefined && isBareSectionLabel(labels[step.sectionIndex] ?? '')) {
    return at;
  }
  const index = labels.findIndex(isBareSectionLabel);
  return index === -1 ? null : sections[index]!;
}

function refuse(code: AiSizeRefusalCode, message: string): AiSizeCheck {
  return { ok: false, refusal: { code, message } };
}

function count(value: number): string {
  return value.toLocaleString('en-US');
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
