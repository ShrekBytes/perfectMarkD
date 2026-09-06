// @vitest-environment jsdom
// jsdom for FileReader (data: mode) and URL. jsdom has no blob-URL registry,
// so createObjectURL/revokeObjectURL are stubbed with a fake scheme.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openDatabase, putAssets } from '../documents/db';
import { closeAfterSettle } from '../testing/test-assets';
import { stubIndexedDB } from '../testing/stub-idb';
import { assetRef } from './ingest';
import { createAssetResolver } from './resolver';

function stubObjectUrls() {
  let n = 0;
  const create = vi.fn(() => `blob:mock-${++n}`);
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  return { create, revoke };
}

let urls: ReturnType<typeof stubObjectUrls>;
let db: Awaited<ReturnType<typeof openDatabase>>;

beforeEach(async () => {
  stubIndexedDB();
  urls = stubObjectUrls();
  db = await openDatabase();
  await putAssets(db, [
    {
      id: 'a1',
      bytes: new Uint8Array([112, 110, 103, 45, 98, 121, 116, 101, 115]),
      mediaType: 'image/png',
      createdAt: 0,
    },
  ]);
});

afterEach(async () => {
  await closeAfterSettle(db);
  vi.unstubAllGlobals();
});

it('resolves an asset ref to a blob URL', async () => {
  const resolve = createAssetResolver(db, 'blob-url');
  await resolve.warmup([assetRef('a1')]);

  expect(resolve(assetRef('a1'))).toBe('blob:mock-1');
});

it('passes non-asset refs through untouched', () => {
  const resolve = createAssetResolver(db, 'blob-url');

  expect(resolve('https://example.com/x.png')).toBe(
    'https://example.com/x.png',
  );
  expect(urls.create).not.toHaveBeenCalled();
});

it('returns undefined for an asset that is not in the store', async () => {
  const resolve = createAssetResolver(db, 'blob-url');
  await resolve.warmup([assetRef('missing')]);

  expect(resolve(assetRef('missing'))).toBeUndefined();
});

it('caches per ref, so repeated lookups reuse one blob URL', async () => {
  const resolve = createAssetResolver(db, 'blob-url');
  await resolve.warmup([assetRef('a1')]);

  resolve(assetRef('a1'));
  resolve(assetRef('a1'));

  expect(urls.create).toHaveBeenCalledTimes(1);
});

it('keeps caches separate between resolver instances', async () => {
  const a = createAssetResolver(db, 'blob-url');
  const b = createAssetResolver(db, 'blob-url');
  await Promise.all([a.warmup([assetRef('a1')]), b.warmup([assetRef('a1')])]);

  expect(urls.create).toHaveBeenCalledTimes(2);
});

it('resolves to a data: URI in data-uri mode', async () => {
  const resolve = createAssetResolver(db, 'data-uri');
  await resolve.warmup([assetRef('a1')]);

  // base64('png-bytes') — a data URI survives serialization into export HTML.
  expect(resolve(assetRef('a1'))).toBe(
    `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array([112, 110, 103, 45, 98, 121, 116, 101, 115])))}`,
  );
  expect(urls.create).not.toHaveBeenCalled();
});

it('resolves lazily outside warmup, via the same cache', async () => {
  const resolve = createAssetResolver(db, 'blob-url');

  expect(resolve(assetRef('a1'))).toBeUndefined(); // not warmed yet
  await vi.waitFor(() => {
    expect(resolve(assetRef('a1'))).toBe('blob:mock-1');
  });
  expect(urls.create).toHaveBeenCalledTimes(1);
});

it('revokes blob URLs on dispose and leaves other URLs alone', async () => {
  const resolve = createAssetResolver(db, 'blob-url');
  await resolve.warmup([assetRef('a1'), 'https://example.com/x.png']);
  resolve.dispose();

  expect(urls.revoke).toHaveBeenCalledWith('blob:mock-1');
  expect(resolve(assetRef('a1'))).toBeUndefined();
});

it('dispose is a safe no-op in data-uri mode', async () => {
  const resolve = createAssetResolver(db, 'data-uri');
  await resolve.warmup([assetRef('a1')]);

  expect(() => resolve.dispose()).not.toThrow();
  expect(urls.revoke).not.toHaveBeenCalled();
});
