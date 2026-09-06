import { describe, expect, it } from 'vitest';
import { countCharacters, countWords } from './word-count';

describe('countWords', () => {
  it('counts zero for empty and whitespace-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t \n')).toBe(0);
  });

  it('counts words separated by any whitespace run', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('one\n\n  two\tthree')).toBe(3);
  });

  it('counts markdown tokens as words, not syntax-aware', () => {
    expect(countWords('# Heading')).toBe(2);
    expect(countWords('**bold** and *it*')).toBe(3);
  });

  it('counts punctuation-glued words as one', () => {
    expect(countWords('hello, world!')).toBe(2);
  });
});

describe('countCharacters', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(countCharacters('')).toBe(0);
    expect(countCharacters('ab👍')).toBe(3);
  });
});
