// @vitest-environment jsdom
// Acceptance for ticket 08: stored images ride Client Export HTML as data:
// URIs — the data-uri resolver + the engine's buildExportHTML together.
import {
  buildExportHTML,
  DEFAULT_SETTINGS,
  type PageLayout,
} from '@perfectmarkd/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openDatabase, putAssets } from '../documents/db';
import { closeAfterSettle } from '../testing/test-assets';
import { stubIndexedDB } from '../testing/stub-idb';
import { assetRef } from './ingest';
import { createAssetResolver } from './resolver';

let db: Awaited<ReturnType<typeof openDatabase>>;

beforeEach(async () => {
  stubIndexedDB();
  db = await openDatabase();
});

afterEach(async () => {
  await closeAfterSettle(db);
  vi.unstubAllGlobals();
});

it('embeds stored assets into Client Export HTML as data URIs', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  await putAssets(db, [
    { id: 'a1', bytes, mediaType: 'image/png', createdAt: 0 },
  ]);
  const resolve = createAssetResolver(db, 'data-uri');
  await resolve.warmup([assetRef('a1')]);

  // The host (Client Export, ticket 06) swaps asset refs for data: URIs on
  // the page nodes before export; the engine serializes them as-is.
  const img = document.createElement('img');
  img.src = resolve(assetRef('a1'))!;
  const layout: PageLayout = {
    pageNodes: [img],
    pageNum: 1,
    totalPages: 1,
    pageShowsHeader: false,
    pageShowsFooter: false,
    hasHeader: false,
    hasFooter: false,
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerRight: '',
    footerCenter: '',
  };

  const html = buildExportHTML([layout], { ...DEFAULT_SETTINGS }, resolve);

  expect(html).toContain('data:image/png;base64,iVBORw==');
  expect(html).not.toContain('asset://');
});

it('drops the image when the asset is missing from the store', async () => {
  const resolve = createAssetResolver(db, 'data-uri');
  await resolve.warmup([assetRef('ghost')]);
  expect(resolve(assetRef('ghost'))).toBeUndefined();
});
