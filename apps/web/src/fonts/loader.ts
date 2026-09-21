// ─────────────────────────────────────────────────────────────────────────────
// Custom font registration (billing/05): the FontFace API half of the font
// library. Uploads persist in IndexedDB (store.ts); this module turns stored
// bytes into live faces the renderer can measure and paint:
//
// - registerCustomFont / unregisterCustomFont — one stored record ⇄ one face
//   in document.fonts. Faces register under the record's family name, which
//   is what the settings' customFontName carries.
// - ensureCustomFontsLoaded — loads every family the settings put to use
//   before a render paginates (pagination measures text, so a late font
//   would mean wrong page breaks). A family the store can't resolve (the
//   font was deleted) resolves to false and the render falls back — never
//   a failed render.
// - fontFacesForExport / fontFaceCSSForExport — the export half: the
//   settings' families as data-URI FontFaceSources for the payload and the
//   @font-face CSS (buildFontFaceCSS) for the standalone export document.
// - registerPayloadFonts — the /export page's side: payload fonts (data:
//   URIs) registered before that page's pipeline runs.
//
// jsdom and hardened browsers lack FontFace/document.fonts; every entry
// point degrades to a no-op there (fallback metrics), matching how the
// export paths already treat a missing Font Loading API.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildFontFaceCSS,
  customFontFamilies,
  type DocumentSettings,
  type FontFaceSource,
} from '@perfectmarkd/core';
import { listFonts, openDatabase } from '../documents/db';
import type { FontRecord } from '../documents/types';
import { fontFormatFor } from './ingest';

/** Families registered this session → the face to unregister with. */
const loadedFaces = new Map<string, FontFace>();
/** Faces registered by registerPayloadFonts (the /export page). */
const payloadFaces = new Map<string, FontFace>();
/** Family → in-flight registration, so concurrent renders share one load. */
const inflight = new Map<string, Promise<boolean>>();

/** True when the family has a live registered face this session. */
export function isFontFamilyLoaded(family: string): boolean {
  return loadedFaces.has(family) || payloadFaces.has(family);
}

function fontApiAvailable(): boolean {
  return (
    typeof FontFace !== 'undefined' &&
    typeof document !== 'undefined' &&
    !!document.fonts
  );
}

export type FontRegisterVerdict = 'loaded' | 'invalid' | 'unavailable';

/** Loads a stored font's bytes into a live face. `invalid` means the bytes
 *  would not parse (refuse the upload); `unavailable` means this environment
 *  has no Font Loading API (skip, don't fail). */
export async function registerCustomFont(
  record: Pick<FontRecord, 'family' | 'bytes'>,
): Promise<FontRegisterVerdict> {
  if (!fontApiAvailable()) return 'unavailable';
  const face = new FontFace(record.family, record.bytes);
  try {
    await face.load();
  } catch {
    return 'invalid';
  }
  document.fonts.add(face);
  loadedFaces.set(record.family, face);
  return 'loaded';
}

/** Drops a family's face (font removed from the library); renders fall back
 *  to the CSS stack on the next pass. Unknown families are a no-op. */
export function unregisterCustomFont(family: string): void {
  const face = loadedFaces.get(family);
  if (face) document.fonts.delete(face);
  loadedFaces.delete(family);
}

async function loadFamily(family: string): Promise<boolean> {
  if (loadedFaces.has(family)) return true;
  let pending = inflight.get(family);
  if (!pending) {
    pending = (async () => {
      const db = await openDatabase();
      const record = (await listFonts(db)).find((f) => f.family === family);
      return record ? (await registerCustomFont(record)) === 'loaded' : false;
    })().finally(() => inflight.delete(family));
    inflight.set(family, pending);
  }
  return pending;
}

/** Loads every custom family the settings put to use, so a render (or an
 *  export) paginates against the real metrics. Resolves even when faces are
 *  missing or unavailable — the caller proceeds with fallback metrics. */
export async function ensureCustomFontsLoaded(
  settings: DocumentSettings,
): Promise<void> {
  const families = customFontFamilies(settings);
  if (families.length === 0 || !fontApiAvailable()) return;
  await Promise.all(families.map((family) => loadFamily(family)));
}

/** Encodes stored font bytes as a data: URI — the self-contained form the
 *  export document and the Server Export payload carry. */
export function fontToDataUri(
  record: Pick<FontRecord, 'bytes' | 'mediaType'>,
): Promise<string> {
  const blob = new Blob([record.bytes], { type: record.mediaType });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('Failed to read font bytes.')),
    );
    reader.readAsDataURL(blob);
  });
}

/** The settings' custom families as data-URI faces for export embedding.
 *  Families the store can't resolve (deleted font) drop out — the export
 *  falls back, exactly like unresolvable image refs. */
export async function fontFacesForExport(
  settings: DocumentSettings,
): Promise<FontFaceSource[]> {
  const families = customFontFamilies(settings);
  if (families.length === 0) return [];
  const db = await openDatabase();
  const byFamily = new Map((await listFonts(db)).map((f) => [f.family, f]));
  const faces: FontFaceSource[] = [];
  for (const family of families) {
    const record = byFamily.get(family);
    if (record) {
      faces.push({
        family,
        url: await fontToDataUri(record),
        format: fontFormatFor(record.mediaType),
      });
    }
  }
  return faces;
}

/** The @font-face CSS for the export document's <head> (buildExportHTML's
 *  fontFaceCSS option); '' when no custom family resolves. */
export async function fontFaceCSSForExport(
  settings: DocumentSettings,
): Promise<string> {
  return buildFontFaceCSS(await fontFacesForExport(settings));
}

/**
 * The /export page's half: registers the payload's fonts (data: URIs) so
 * pagination measures the real metrics. Returns the families that actually
 * registered — the caller embeds only those (a corrupt font falls back to
 * the CSS stack, not a failed export). Each call replaces the previous
 * payload's faces — the page is fresh per job, but a stale same-named face
 * must never outlive its payload.
 */
export async function registerPayloadFonts(
  fonts: Record<string, string>,
): Promise<string[]> {
  for (const face of payloadFaces.values()) document.fonts?.delete(face);
  payloadFaces.clear();

  if (!fontApiAvailable()) return [];
  const registered: string[] = [];
  for (const [family, url] of Object.entries(fonts)) {
    // The FontFace string source is a CSS src form — url(...) — not a bare
    // URL; a raw data: URI string fails to parse and the face never loads.
    const face = new FontFace(family, `url("${url}")`);
    try {
      await face.load();
    } catch {
      continue; // A corrupt font falls back to the CSS stack, not a failed export.
    }
    document.fonts.add(face);
    payloadFaces.set(family, face);
    registered.push(family);
  }
  return registered;
}
