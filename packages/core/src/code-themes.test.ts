import { describe, expect, it } from 'vitest';
import { CODE_THEMES, DEFAULT_SETTINGS } from '@perfectmarkd/core';

describe('CODE_THEMES catalog', () => {
  it('contains the default, none, and the Shiki theme ids', () => {
    expect(CODE_THEMES).toContain('none');
    expect(CODE_THEMES).toContain(DEFAULT_SETTINGS.codeTheme);
    expect(CODE_THEMES).toContain('github-dark');
    expect(CODE_THEMES).toContain('dracula');
    expect(CODE_THEMES).toContain('tokyo-night');
  });

  it('is sorted with none first and holds no duplicates', () => {
    expect(CODE_THEMES[0]).toBe('none');
    const rest = CODE_THEMES.slice(1);
    expect([...rest].sort((a, b) => a.localeCompare(b))).toEqual(rest);
    expect(new Set(CODE_THEMES).size).toBe(CODE_THEMES.length);
  });
});
