// ─────────────────────────────────────────────────────────────────────────────
// The Server Export payload — what POST /api/export accepts and what the
// worker hands to the app's /export page (server/03, ADR-0003).
//
// This module is the server's authoritative side of the wire contract; the
// page's side lives in apps/web/src/export/protocol.ts. The two only share
// field names, so the end-to-end render test (render.e2e.test.ts) drives both
// together — that is what guards against drift.
//
// Validation is deliberately structural: the server never renders markdown
// itself, so it checks shape and sanity here, and the engine's own validate()
// repairs the settings numerics the same way the editor does before persist.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_SETTINGS,
  validate,
  type DocumentSettings,
  type FontFaceSource,
} from '@perfectmarkd/core';

/** What a Server Export carries: the document plus everything the /export
 *  page needs to rebuild exactly what the Paper Canvas showed. */
export interface ExportPayload {
  /** Backs the {{title}} placeholder and the PDF filename. */
  title: string;
  markdown: string;
  settings: DocumentSettings;
  /**
   * The page count the client's canvas laid out. Declared up front so the
   * plan's page cap is enforced before any Chromium time is spent; the worker
   * re-checks it against the actual rendered count (they can disagree only if
   * client and server pipelines diverge — which is itself a bug).
   */
  pageCount: number;
  /**
   * Asset refs (asset://…) resolved to data: URIs by the client, so the
   * export document is self-contained and no user file ever touches disk.
   */
  assets: Record<string, string>;
  /**
   * The document's custom fonts (billing/05), as the same FontFaceSource[]
   * shape core's buildFontFaceCSS consumes — the /export page registers them
   * as FontFaces before paginating and embeds the identical @font-face rules
   * the Client Export embeds. Part of the same request body, so the 50 MB
   * body cap bounds fonts and assets together.
   */
  fonts: FontFaceSource[];
}

/** Hard cap on the request body (spec §Security posture). */
export const MAX_EXPORT_BODY_BYTES = 50 * 1024 * 1024;

/** Upper bound on distinct asset refs in one payload. */
const MAX_ASSETS = 200;

/** Upper bound on custom font faces in one payload (billing/05). */
const MAX_FONTS = 50;

const MAX_TITLE_LENGTH = 200;

export type ParsedExportPayload =
  { ok: true; payload: ExportPayload } | { ok: false; error: string };

/**
 * Validates and normalizes an /api/export request body. `pageCap` is the
 * exporting user's plan cap; a document above it is rejected before enqueue.
 */
export function parseExportPayload(
  body: unknown,
  pageCap: number,
): ParsedExportPayload {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Expected a JSON object.' };
  }
  const record = body as Record<string, unknown>;

  let title = 'Untitled';
  if (record.title !== undefined) {
    if (typeof record.title !== 'string') {
      return { ok: false, error: 'The title must be text.' };
    }
    title = record.title.trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled';
  }

  if (typeof record.markdown !== 'string' || record.markdown.trim() === '') {
    return { ok: false, error: 'The document markdown is required.' };
  }

  const settings = parseSettings(record.settings);
  if (!settings) {
    return { ok: false, error: 'The document settings must be an object.' };
  }

  if (
    typeof record.pageCount !== 'number' ||
    !Number.isInteger(record.pageCount) ||
    record.pageCount < 1
  ) {
    return { ok: false, error: 'The page count must be a positive integer.' };
  }
  if (record.pageCount > pageCap) {
    return {
      ok: false,
      error: `This document has ${record.pageCount} pages — your plan allows up to ${pageCap}.`,
    };
  }

  const assets = parseAssets(record.assets);
  if (!assets) {
    return {
      ok: false,
      error: `Assets must map refs to data: URIs (at most ${MAX_ASSETS}).`,
    };
  }

  const fonts = parseFonts(record.fonts);
  if (!fonts) {
    return {
      ok: false,
      error: `Fonts must be family/url faces with data: font URIs (at most ${MAX_FONTS}).`,
    };
  }

  return {
    ok: true,
    payload: {
      title,
      markdown: record.markdown,
      settings,
      pageCount: record.pageCount,
      assets,
      fonts,
    },
  };
}

/** Fill any absent settings field from the defaults, then repair the
 *  numerics exactly as the editor does before persist (same function). A
 *  missing settings object is the defaults — the client always sends one,
 *  but the engine is happy with defaults. */
function parseSettings(value: unknown): DocumentSettings | null {
  if (value === undefined || value === null) {
    return validate({ ...DEFAULT_SETTINGS });
  }
  if (typeof value !== 'object') return null;
  return validate({
    ...DEFAULT_SETTINGS,
    ...(value as Partial<DocumentSettings>),
  });
}

function parseAssets(value: unknown): Record<string, string> | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length > MAX_ASSETS) return null;
  const out: Record<string, string> = {};
  for (const [ref, uri] of entries) {
    if (typeof uri !== 'string' || !uri.startsWith('data:')) return null;
    out[ref] = uri;
  }
  return out;
}

/** One face per family, urls restricted to data: font URIs — anything else
 *  (https:, data:text/html) is refused, not rewritten (billing/05). */
function parseFonts(value: unknown): FontFaceSource[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_FONTS) return null;
  const faces: FontFaceSource[] = [];
  const seen = new Set<string>();
  for (const face of value) {
    if (typeof face !== 'object' || face === null) return null;
    const { family, url, format } = face as Record<string, unknown>;
    if (typeof family !== 'string' || family.trim() === '') return null;
    if (seen.has(family)) return null;
    seen.add(family);
    if (typeof url !== 'string' || !url.startsWith('data:font/')) return null;
    if (format !== undefined && typeof format !== 'string') return null;
    faces.push(format ? { family, url, format } : { family, url });
  }
  return faces;
}
