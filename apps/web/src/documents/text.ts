// ─────────────────────────────────────────────────────────────────────────────
// Text helpers around document names: import/export file names, collision-free
// copies, and relative timestamps for the Library list.
// ─────────────────────────────────────────────────────────────────────────────

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
