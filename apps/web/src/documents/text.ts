// ─────────────────────────────────────────────────────────────────────────────
// Text helpers around document facts: names, relative timestamps for the
// Library list, page-count phrasing, and the top-bar gauge's paper label.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentSettings } from '@perfectmarkd/core';

/** Returns `base`, or the first free `base copy`, `base copy 2`, … variant. */
export function uniqueName(existing: readonly string[], base: string): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${base} copy` : `${base} copy ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Document name for an imported file: the stem of "name.md" / "name.markdown". */
export function nameFromFile(fileName: string): string {
  const stem = fileName
    .trim()
    .replace(/\.(markdown|md)$/i, '')
    .trim();
  return stem || 'Imported document';
}

const UNSAFE_FILE_CHARS = /[/\\:*?"<>|\u0000-\u001f]/g;

/** A safe download file name for a document, always ending in ".md". */
export function exportFileName(name: string): string {
  const safe = name.replace(UNSAFE_FILE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  const stem = safe || 'document';
  return stem.toLowerCase().endsWith('.md') ? stem : `${stem}.md`;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const shortDateWithYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Compact recency label for the Library list: "just now", "5 min ago", … */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const age = Math.max(0, now - timestamp);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  if (age < WEEK) return `${Math.floor(age / DAY)} d ago`;
  const date = new Date(timestamp);
  const format =
    date.getFullYear() === new Date(now).getFullYear()
      ? shortDate
      : shortDateWithYear;
  return format.format(date);
}

/** Page-count phrasing shared by the Library meta line and the top-bar
 *  gauge: "12 pages", "1 page". */
export function formatPageCount(count: number): string {
  return `${count} page${count === 1 ? '' : 's'}`;
}

/** The gauge's text from the document's own settings and the canvas-reported
 *  count: "A4 · 12 pages", "A4 landscape", "Custom · 3 pages". Landscape
 *  appends when set; custom sizes read "Custom". A null count renders the
 *  paper size alone — the count joins once the Paper Canvas reports. */
export function proofGaugeLabel(
  settings: DocumentSettings,
  pageCount: number | null,
): string {
  const paper =
    settings.orientation === 'landscape'
      ? `${settings.pageSize} landscape`
      : settings.pageSize;
  return pageCount === null
    ? paper
    : `${paper} · ${formatPageCount(pageCount)}`;
}
