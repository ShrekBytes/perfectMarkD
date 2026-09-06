// ─────────────────────────────────────────────────────────────────────────────
// Image ingest: validation + normalization for local image assets.
//
// Images are local assets, never uploaded (privacy posture): they enter via
// clipboard paste, drag-drop, or the picker, get validated and normalized
// here, and land in the IndexedDB asset store as raw bytes plus media type
// (the AssetRecord shape). Clipboard items often arrive without a usable
// MIME type, so the file extension fills the gap. SVG is an image like any
// other.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard cap for a single asset; larger files are refused with a clear message. */
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export type AssetIngestError = 'too-large' | 'unsupported';

export interface PreparedAsset {
  /** Raw image bytes — the shape stored in IndexedDB (AssetRecord.bytes). */
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
  /** Markdown-safe alt text, derived from the file name. */
  alt: string;
}

export type PreparedAssetResult =
  { ok: true; asset: PreparedAsset } | { ok: false; error: AssetIngestError };

/** Anything ingest can read: a File from paste/drop/picker, or a bare Blob
 *  from a clipboard item with no name. */
export type AssetSource = Blob & { name?: string };

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

const EXTENSION_RE = /\.([a-z0-9]+)$/i;

function hasImageExtension(name: string): boolean {
  const match = EXTENSION_RE.exec(name);
  return match !== null && match[1]!.toLowerCase() in IMAGE_EXTENSIONS;
}

/** Cheap pre-filter for paste/drop events, before the store pays for full
 *  validation: anything the browser tags as an image, or that looks like one
 *  by extension. False positives are fine — prepareAsset has the final word. */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || hasImageExtension(file.name);
}

function resolveMediaType(file: AssetSource): string | null {
  if (file.type.startsWith('image/')) return file.type;
  const extension = EXTENSION_RE.exec(file.name ?? '')?.[1]?.toLowerCase();
  return (extension && IMAGE_EXTENSIONS[extension]) || null;
}

function altForFile(file: AssetSource): string {
  const stem = (file.name ?? '').replace(/\.[a-z0-9]+$/i, '');
  // Brackets would close the markdown alt text early; whitespace is collapsed
  // so multi-line clipboard names stay on one line.
  const safe = stem
    .replace(/[[\]\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'image';
}

/** Validates and normalizes one incoming file/blob into a storable asset.
 *  Oversized files are refused before the bytes are read — the size message
 *  is the one users hit with real photos, and no point buffering 25 MB to
 *  then throw it away. */
export async function prepareAsset(
  file: AssetSource,
): Promise<PreparedAssetResult> {
  if (file.size > MAX_ASSET_BYTES) return { ok: false, error: 'too-large' };

  const mediaType = resolveMediaType(file);
  if (!mediaType) return { ok: false, error: 'unsupported' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  return { ok: true, asset: { bytes, mediaType, alt: altForFile(file) } };
}

// ─── Asset refs ───────────────────────────────────────────────────────────────

const ASSET_SCHEME = 'asset://';

/** The markdown/DOM src form of an asset id: `asset://<id>`. */
export function assetRef(id: string): string {
  return `${ASSET_SCHEME}${id}`;
}

/** Extracts the id from an `asset://<id>` ref; null for any other URL form. */
export function parseAssetRef(ref: string): string | null {
  if (!ref.startsWith(ASSET_SCHEME)) return null;
  const id = ref.slice(ASSET_SCHEME.length);
  return id.length > 0 ? id : null;
}
