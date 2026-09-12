import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';
import {
  exportFileName,
  formatPageCount,
  formatRelativeTime,
  nameFromFile,
  proofGaugeLabel,
  uniqueName,
} from './text';

describe('uniqueName', () => {
  it('returns the base name when it is free', () => {
    expect(uniqueName(['Other'], 'Notes')).toBe('Notes');
  });

  it('returns the base name for an empty library', () => {
    expect(uniqueName([], 'Notes')).toBe('Notes');
  });

  it('appends "copy" when the base name is taken', () => {
    expect(uniqueName(['Notes'], 'Notes')).toBe('Notes copy');
  });

  it('keeps counting copies until the name is free', () => {
    expect(uniqueName(['Notes', 'Notes copy'], 'Notes')).toBe('Notes copy 2');
    expect(uniqueName(['Notes', 'Notes copy', 'Notes copy 2'], 'Notes')).toBe(
      'Notes copy 3',
    );
  });
});

describe('nameFromFile', () => {
  it('strips the .md extension', () => {
    expect(nameFromFile('chapter-1.md')).toBe('chapter-1');
  });

  it('strips the .markdown extension case-insensitively', () => {
    expect(nameFromFile('Notes.MD')).toBe('Notes');
    expect(nameFromFile('notes.Markdown')).toBe('notes');
  });

  it('falls back to a default when only the extension remains', () => {
    expect(nameFromFile('.md')).toBe('Imported document');
  });

  it('trims whitespace around the stem', () => {
    expect(nameFromFile('  essay .md ')).toBe('essay');
  });
});

describe('exportFileName', () => {
  it('appends the .md extension', () => {
    expect(exportFileName('Notes')).toBe('Notes.md');
  });

  it('keeps the .md extension when the name already ends with it', () => {
    expect(exportFileName('Notes.md')).toBe('Notes.md');
  });

  it('replaces filesystem-unsafe characters', () => {
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(
      'a b c d e f g h i j.md',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(exportFileName('  my   notes  ')).toBe('my notes.md');
  });

  it('falls back to "document" when nothing safe remains', () => {
    expect(exportFileName('???')).toBe('document.md');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 8, 4, 12, 0, 0); // 2026-09-04 12:00 UTC

  it('shows "just now" within a minute', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
  });

  it('shows minutes up to an hour', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelativeTime(now - 59 * 60_000, now)).toBe('59 min ago');
  });

  it('shows hours up to a day', () => {
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
  });

  it('shows days up to a week', () => {
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });

  it('shows a short date beyond a week', () => {
    expect(formatRelativeTime(now - 14 * 86_400_000, now)).toBe('Aug 21');
  });

  it('includes the year for dates in another year', () => {
    expect(formatRelativeTime(Date.UTC(2025, 0, 15), now)).toBe('Jan 15, 2025');
  });
});

describe('formatPageCount', () => {
  it('pluralizes beyond one page', () => {
    expect(formatPageCount(12)).toBe('12 pages');
  });

  it('keeps one page singular', () => {
    expect(formatPageCount(1)).toBe('1 page');
  });
});

describe('proofGaugeLabel', () => {
  const settingsWith = (over: Partial<DocumentSettings>): DocumentSettings => ({
    ...DEFAULT_SETTINGS,
    ...over,
  });

  it('labels paper size with the count', () => {
    expect(proofGaugeLabel(settingsWith({ pageSize: 'A4' }), 12)).toBe(
      'A4 · 12 pages',
    );
    expect(proofGaugeLabel(settingsWith({ pageSize: 'A4' }), 1)).toBe(
      'A4 · 1 page',
    );
  });

  it('appends landscape when set', () => {
    expect(
      proofGaugeLabel(
        settingsWith({ pageSize: 'A4', orientation: 'landscape' }),
        3,
      ),
    ).toBe('A4 landscape · 3 pages');
    expect(
      proofGaugeLabel(
        settingsWith({ pageSize: 'A4', orientation: 'landscape' }),
        null,
      ),
    ).toBe('A4 landscape');
  });

  it('reads custom sizes as "Custom"', () => {
    expect(proofGaugeLabel(settingsWith({ pageSize: 'Custom' }), 3)).toBe(
      'Custom · 3 pages',
    );
  });

  it('shows the paper size alone before the canvas has reported', () => {
    expect(proofGaugeLabel(settingsWith({ pageSize: 'Letter' }), null)).toBe(
      'Letter',
    );
  });
});
