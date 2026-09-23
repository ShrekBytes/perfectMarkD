// ─────────────────────────────────────────────────────────────────────────────
// The `/ai` and `/ss` trigger rules (spec §The two commands and their trigger
// rules). Pure and DOM-free, so every rule is unit-testable and the editor
// extension only has to feed it text and a caret.
//
// The two characters after a `/` decide; hints exist for `/a` and `/s` only,
// and a bare `/` shows nothing. Matching is case-insensitive and only at a line
// start or after whitespace, so `/ai` in a URL path can never trigger. A
// trigger inside inline or fenced code never counts.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiCommand } from './types';

export interface AiCommandInfo {
  trigger: string;
  /** The hint's one-line description. */
  label: string;
}

/** The only two commands (CONTEXT.md: AI Action). */
export const AI_COMMANDS: Record<AiCommand, AiCommandInfo> = {
  markdown: { trigger: '/ai', label: 'Edit the markdown' },
  stylesheet: { trigger: '/ss', label: 'Edit the Custom stylesheet' },
};

/** A command being typed at the caret. */
export interface AiTrigger {
  command: AiCommand;
  /** Offset of the `/`. */
  from: number;
  /** Offset just past the command letters, before any completing space. */
  commandEnd: number;
  /**
   * True when the completing space or tab already sits after the letters.
   * A trigger is only "complete" (fires) once the space arrives.
   */
  complete: boolean;
}

const LETTER_PREFIXES = new Set(['a', 'ai', 's', 'ss']);

/**
 * Finds the command at the caret, or null. `caret` is the editor's selection
 * head; the completing space may already be in the text (so `/ai ` fires) or
 * about to be typed (the space key intercepts it).
 */
export function findAiTrigger(text: string, caret: number): AiTrigger | null {
  if (caret < 0 || caret > text.length) return null;

  // Allow the completing whitespace to already be inserted.
  let end = caret;
  if (end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')) end -= 1;

  let start = end;
  while (start > 0 && isAsciiLetter(text[start - 1]!)) start -= 1;
  if (text[start - 1] !== '/') return null;
  const slash = start - 1;

  // Only a line start or whitespace may precede the slash — never a URL path
  // or a word (`https://example.com/ai`, `and/or`).
  if (slash > 0 && !isWhitespace(text[slash - 1]!)) return null;
  if (isInsideCode(text, slash)) return null;

  const letters = text.slice(start, end).toLowerCase();
  if (!LETTER_PREFIXES.has(letters)) return null;
  // A whitespace after a non-command prefix means the user moved on: `/a `
  // is not a command, and the hint must disappear.
  if (end < caret && !(letters === 'ai' || letters === 'ss')) return null;

  const command: AiCommand = letters.startsWith('a')
    ? 'markdown'
    : 'stylesheet';
  const complete =
    (letters === 'ai' || letters === 'ss') &&
    end < caret &&
    (text[end] === ' ' || text[end] === '\t');

  return { command, from: slash, commandEnd: end, complete };
}

/**
 * The range to remove when the command fires. A command confirmed by its
 * trailing space removes that space too; a hint accepted with Tab/Enter/click
 * removes only the letters (no space was typed).
 */
export function triggerRemovalRange(
  trigger: AiTrigger,
  viaSpaceAlreadyTyped: boolean,
): { from: number; to: number } {
  const to =
    trigger.complete && viaSpaceAlreadyTyped
      ? trigger.commandEnd + 1
      : trigger.commandEnd;
  return { from: trigger.from, to };
}

function isAsciiLetter(character: string): boolean {
  return (
    (character >= 'a' && character <= 'z') ||
    (character >= 'A' && character <= 'Z')
  );
}

function isWhitespace(character: string): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\n' ||
    character === '\r'
  );
}

/**
 * Whether an offset sits inside inline or fenced code. A deliberately simple
 * lexical scan: fenced blocks are tracked line by line, inline spans by
 * matching backtick runs on the line. It needs no syntax tree, so the rule is
 * testable in isolation and cheap on every keystroke.
 */
export function isInsideCode(text: string, index: number): boolean {
  let inFence = false;
  let fenceMarker = '';
  let pos = 0;
  for (;;) {
    const newline = text.indexOf('\n', pos);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(pos, lineEnd);

    if (index >= pos && index <= lineEnd) {
      if (inFence) return true;
      return insideInlineCode(line, index - pos);
    }

    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1]![0]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
    }

    if (newline === -1) return false;
    pos = newline + 1;
  }
}

/** Whether a column is strictly between a matching pair of backtick runs. */
function insideInlineCode(line: string, column: number): boolean {
  let i = 0;
  let openStart = -1;
  let openLength = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] === '`') j += 1;
    const length = j - i;
    if (openStart === -1) {
      openStart = i;
      openLength = length;
    } else if (length === openLength) {
      // The closing run starts at i; anything between the runs is code.
      if (column > openStart && column < i) return true;
      openStart = -1;
    }
    i = j;
  }
  // An unmatched opening run extends to the end of the line.
  return openStart !== -1 && column > openStart;
}
