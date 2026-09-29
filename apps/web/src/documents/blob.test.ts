// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { blobToDataURL } from './db';

// `blobToDataURL` reads through FileReader, so it needs a DOM. It is jsdom-
// scoped in its own file rather than in db.test.ts, which runs under Node:
// jsdom's Uint8Array is a different realm, and the byte round-trip
// assertions there compare against Node's.

// The shared helper for both callers: the asset resolver (images) and the font
// loader (custom + payload fonts) turn stored bytes into the self-contained
// data: URIs the export document and the Server Export payload carry.
it('encodes the bytes as a self-contained data: URI of the blob’s own type', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  expect(await blobToDataURL(new Blob([bytes], { type: 'font/ttf' }))).toBe(
    'data:font/ttf;base64,AQID',
  );
  expect(await blobToDataURL(new Blob([bytes], { type: 'image/png' }))).toBe(
    'data:image/png;base64,AQID',
  );
});

it('encodes an empty blob rather than rejecting', async () => {
  expect(await blobToDataURL(new Blob([], { type: 'image/png' }))).toBe(
    'data:image/png;base64,',
  );
});
