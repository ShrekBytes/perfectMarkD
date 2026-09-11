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
}

/** Hard cap on the request body (spec §Security posture). */
export const MAX_EXPORT_BODY_BYTES = 50 * 1024 * 1024;

/** Upper bound on distinct asset refs in one payload. */
const MAX_ASSETS = 200;

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

  return {
    ok: true,
    payload: {
      title,
      markdown: record.markdown,
      settings,
      pageCount: record.pageCount,
      assets,
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
