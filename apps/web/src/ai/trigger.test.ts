import { describe, expect, it } from 'vitest';
import { findAiTrigger, isInsideCode, triggerRemovalRange } from './trigger';

describe('findAiTrigger', () => {
  it('finds a partial /a and /s at the caret', () => {
    expect(findAiTrigger('/a', 2)).toMatchObject({
      command: 'markdown',
      from: 0,
      complete: false,
    });
    expect(findAiTrigger('/s', 2)).toMatchObject({
      command: 'stylesheet',
      from: 0,
      complete: false,
    });
  });

  it('shows nothing for a bare slash', () => {
    expect(findAiTrigger('/', 1)).toBeNull();
  });

  it('stops matching when a non-command prefix is followed by a space', () => {
    expect(findAiTrigger('/a ', 3)).toBeNull();
    expect(findAiTrigger('/s ', 3)).toBeNull();
  });

  it('fires only once the completing space arrives', () => {
    expect(findAiTrigger('/ai', 3)?.complete).toBe(false);
    expect(findAiTrigger('/ai ', 4)).toMatchObject({
      command: 'markdown',
      complete: true,
    });
    expect(findAiTrigger('/ss\t', 4)).toMatchObject({
      command: 'stylesheet',
      complete: true,
    });
  });

  it('is case-insensitive', () => {
    expect(findAiTrigger('/AI ', 4)?.command).toBe('markdown');
    expect(findAiTrigger('/Ss ', 4)?.command).toBe('stylesheet');
  });

  it('never triggers a longer word', () => {
    expect(findAiTrigger('/aix', 4)).toBeNull();
    expect(findAiTrigger('/aisle', 6)).toBeNull();
    expect(findAiTrigger('/sso', 4)).toBeNull();
  });

  it('only matches at a line start or after whitespace', () => {
    expect(findAiTrigger('write /ai', 9)).toMatchObject({ from: 6 });
    expect(findAiTrigger('foo\n/ai', 7)).toMatchObject({ from: 4 });
    // A URL path and a word slash never trigger.
    expect(findAiTrigger('https://example.com/ai', 22)).toBeNull();
    expect(findAiTrigger('and/or', 7)).toBeNull();
    expect(findAiTrigger('(/ai', 4)).toBeNull();
  });

  it('never triggers inside a fenced code block', () => {
    expect(findAiTrigger('```\n/ai\n```', 7)).toBeNull();
    // After the fence closes, the command works again.
    expect(findAiTrigger('```\nx\n```\n/ai', 13)).toMatchObject({
      command: 'markdown',
    });
  });

  it('never triggers inside inline code', () => {
    expect(findAiTrigger('`/ai`', 3)).toBeNull();
    expect(findAiTrigger('see `/ai` then /ai', 18)).toMatchObject({
      from: 15,
    });
  });

  it('reports the removal range for the space and hint paths', () => {
    const spaced = findAiTrigger('/ai ', 4)!;
    expect(triggerRemovalRange(spaced, true)).toEqual({ from: 0, to: 4 });
    // A command confirmed by the space key (the space not yet inserted).
    expect(triggerRemovalRange(spaced, false)).toEqual({ from: 0, to: 3 });
    const hint = findAiTrigger('/a', 2)!;
    expect(triggerRemovalRange(hint, false)).toEqual({ from: 0, to: 2 });
  });
});

describe('isInsideCode', () => {
  it('tracks fences and inline spans', () => {
    expect(isInsideCode('```\n/ai\n```', 5)).toBe(true);
    expect(isInsideCode('x `/ai` y', 4)).toBe(true);
    expect(isInsideCode('plain /ai', 6)).toBe(false);
    expect(isInsideCode('`` `/ai` `` /s', 6)).toBe(true);
  });
});
