import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate } from './format.js';

describe('formatBytes', () => {
  it('renders bytes below a kilobyte as-is', () => {
    expect(formatBytes(8)).toBe('8 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('renders kilobytes with a sensible precision', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(52_428)).toBe('51.2 KB');
    expect(formatBytes(3_145_728)).toBe('3 MB');
  });

  it('renders megabytes for the big exports', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(5_242_880 + 524_288)).toBe('5.5 MB');
  });
});

describe('formatDate', () => {
  it('shows the ISO date part, matching the order list', () => {
    expect(formatDate('2026-09-12T13:45:00.000Z')).toBe('2026-09-12');
  });
});
