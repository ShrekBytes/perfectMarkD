// Image ingest: validation, normalization, and the asset:// ref format.
// Runs in node — Blob/File are globals there and nothing DOM is touched.
import { describe, expect, it } from 'vitest';
import {
  assetRef,
  MAX_ASSET_BYTES,
  parseAssetRef,
  prepareAsset,
} from './ingest';
import { pngFile } from '../testing/test-assets';

it('accepts an image under the size limit', async () => {
  const result = await prepareAsset(pngFile('sunrise.png'));

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.asset.mediaType).toBe('image/png');
    expect(result.asset.alt).toBe('sunrise');
    expect(result.asset.bytes).toEqual(new Uint8Array(8));
  }
});

it('infers the media type from the file extension when the blob has none', async () => {
  const result = await prepareAsset(
    new File([new Uint8Array(8)], 'diagram.svg'),
  );

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.asset.mediaType).toBe('image/svg+xml');
});

it('accepts a typeless blob with no usable name', async () => {
  const result = await prepareAsset(
    new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
  );

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.asset.mediaType).toBe('image/png');
    expect(result.asset.alt).toBe('image');
    expect(result.asset.bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
  }
});

it('refuses assets over 20 MB with a size error', async () => {
  const big = pngFile('big.png', MAX_ASSET_BYTES + 1);

  expect(await prepareAsset(big)).toEqual({ ok: false, error: 'too-large' });
});

it('accepts an asset at exactly the 20 MB limit', async () => {
  const exact = pngFile('exact.png', MAX_ASSET_BYTES);

  expect((await prepareAsset(exact)).ok).toBe(true);
});

it('refuses non-image files', async () => {
  const pdf = new File([new Uint8Array(8)], 'paper.pdf', {
    type: 'application/pdf',
  });

  expect(await prepareAsset(pdf)).toEqual({ ok: false, error: 'unsupported' });
});

it('refuses files whose type cannot be inferred', async () => {
  const mystery = new File([new Uint8Array(8)], 'mystery.bin');

  expect(await prepareAsset(mystery)).toEqual({
    ok: false,
    error: 'unsupported',
  });
});

it('keeps markdown-safe alt text', async () => {
  const result = await prepareAsset(pngFile('note [1]\n draft.png'));

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.asset.alt).toBe('note 1 draft');
    expect(result.asset.alt).not.toMatch(/[[\]\n]/);
  }
});

describe('asset refs', () => {
  it('round-trips an id through asset://', () => {
    expect(parseAssetRef(assetRef('abc-123'))).toBe('abc-123');
  });

  it('rejects other schemes and empty ids', () => {
    expect(parseAssetRef('https://example.com/x.png')).toBeNull();
    expect(parseAssetRef('data:image/png;base64,AAAA')).toBeNull();
    expect(parseAssetRef('asset://')).toBeNull();
    expect(parseAssetRef('')).toBeNull();
  });
});
