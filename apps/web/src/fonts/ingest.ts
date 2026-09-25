// ─────────────────────────────────────────────────────────────────────────────
// Font ingest: validation + naming for uploaded custom fonts (billing/05).
//
// Fonts follow the image ingest pattern (assets/ingest.ts): validate up
// front, store raw bytes + media type in IndexedDB, never upload anywhere
// (privacy posture). The extension is authoritative — browsers rarely tag
// font downloads with a usable MIME type. The CSS family name is ours to
// choose: the sanitized file stem, which is what the settings'
// customFontName carries and what the pickers display.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard cap for a single font file (billing/05: ≤ 10 MB each); larger files
 *  are refused before the bytes are read. */
export const MAX_FONT_BYTES = 10 * 1024 * 1024;

export type FontIngestError = 'too-large' | 'unsupported' | 'invalid';

/** The picker's accept filter — exactly the formats the ticket allows. */
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';

const FONT_EXTENSIONS: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/** Media type → CSS format() hint for @font-face src. */
const FONT_FORMATS: Record<string, string> = {
  'font/ttf': 'truetype',
  'font/otf': 'opentype',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
};

const EXTENSION_RE = /\.([a-z0-9]+)$/i;

/** Longest family a file name may produce; the pickers must stay readable. */
const MAX_FAMILY_LENGTH = 64;

/** Fallback family when a file name sanitizes to nothing. */
const FALLBACK_FAMILY = 'Custom font';

/** Maps a stored font media type to its CSS format hint; undefined for
 *  unknown types (@font-face then omits the clause and the browser sniffs). */
export function fontFormatFor(mediaType: string): string | undefined {
  return FONT_FORMATS[mediaType];
}

/** Derives the CSS font-family name from a font file's name: the stem with
 *  quotes/backslashes stripped (they only complicate CSS strings downstream),
 *  whitespace collapsed, and length capped. Never empty. */
export function familyForFile(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, '');
  const family = stem
    .replace(/["'\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FAMILY_LENGTH)
    .trim();
  return family || FALLBACK_FAMILY;
}

export interface PreparedFont {
  /** Raw font bytes — the shape stored in IndexedDB (FontRecord.bytes). */
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
  /** The CSS family name this font registers under. */
  family: string;
}

export type PreparedFontResult =
  { ok: true; font: PreparedFont } | { ok: false; error: FontIngestError };

/** Validates and normalizes one incoming font file into a storable record.
 *  Size is refused before the bytes are read; the format decision is the
 *  extension's (the File's MIME type is trusted only when it already says
 *  font/*). `invalid` never comes from here — it reports a FontFace load
 *  failure in the store, which tries the real parse before persisting. */
export async function prepareFont(file: {
  name?: string;
  size: number;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<PreparedFontResult> {
  if (file.size > MAX_FONT_BYTES) return { ok: false, error: 'too-large' };

  const extension = EXTENSION_RE.exec(file.name ?? '')?.[1]?.toLowerCase();
  const mediaType =
    (file.type?.startsWith('font/') && file.type) ||
    (extension && FONT_EXTENSIONS[extension]) ||
    undefined;
  if (!mediaType) return { ok: false, error: 'unsupported' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    ok: true,
    font: { bytes, mediaType, family: familyForFile(file.name ?? '') },
  };
}
