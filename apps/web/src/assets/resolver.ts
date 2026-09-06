// ─────────────────────────────────────────────────────────────────────────────
// The host side of the engine's AssetResolver seam (packages/core/assets.ts):
// maps `asset://<id>` refs to URLs the current context can render.
//
// Two modes cover the two consumers:
// - 'blob-url'  → preview (Paper Canvas): cheap, revocable, same-session only.
// - 'data-uri'  → Client Export HTML: self-contained URIs that survive
//                 serialization into a standalone file.
//
// Resolution is async (IndexedDB read) while the core's AssetResolver is
// sync, so consumers `warmup()` the refs they need, then call synchronously —
// an unwarmed ref resolves to undefined until its read lands. Non-asset refs
// (https:, data:, …) pass through untouched, so callers can feed every image
// src through the resolver without pre-sorting.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetResolver } from '@perfectmarkd/core';
import type { IDBPDatabase } from 'idb';
import type { AssetRecord } from '../documents/types';
import { parseAssetRef } from './ingest';

export type AssetUrlMode = 'blob-url' | 'data-uri';

export interface AssetResolverCache extends AssetResolver {
  /** Resolves every ref up front so later sync calls hit the cache. */
  warmup(refs: readonly string[]): Promise<void>;
  /** Revokes created blob URLs (no-op for data: URIs and passthroughs). */
  dispose(): void;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('Failed to read asset blob.')),
    );
    reader.readAsDataURL(blob);
  });
}

/** Rebuilds a renderable Blob from the stored bytes + media type. */
function toBlob(record: AssetRecord): Blob {
  return new Blob([record.bytes], { type: record.mediaType });
}

export function createAssetResolver(
  db: IDBPDatabase | Promise<IDBPDatabase>,
  mode: AssetUrlMode,
): AssetResolverCache {
  const cache = new Map<string, string>();
  const inflight = new Map<string, Promise<string | undefined>>();
  const dbp: Promise<IDBPDatabase> = Promise.resolve(db);

  async function resolveOne(ref: string): Promise<string | undefined> {
    const id = parseAssetRef(ref);
    if (id === null) return ref; // already renderable in this context
    const record: AssetRecord | undefined = await dbp.then((d) =>
      d.get('assets', id),
    );
    if (!record) return undefined;
    return mode === 'blob-url'
      ? URL.createObjectURL(toBlob(record))
      : blobToDataURL(toBlob(record));
  }

  function resolveAsync(ref: string): Promise<string | undefined> {
    let pending = inflight.get(ref);
    if (!pending) {
      pending = resolveOne(ref)
        .then((url) => {
          if (url !== undefined) cache.set(ref, url);
          return url;
        })
        .finally(() => inflight.delete(ref));
      inflight.set(ref, pending);
    }
    return pending;
  }

  const resolver = ((ref: string): string | undefined => {
    if (parseAssetRef(ref) === null) return ref; // passthrough needs no IO
    const cached = cache.get(ref);
    if (cached !== undefined) return cached;
    void resolveAsync(ref);
    return undefined;
  }) as AssetResolverCache;

  resolver.warmup = (refs) =>
    Promise.all(refs.map(resolveAsync)).then(() => undefined);
  resolver.dispose = () => {
    for (const url of cache.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    cache.clear();
  };

  return resolver;
}
