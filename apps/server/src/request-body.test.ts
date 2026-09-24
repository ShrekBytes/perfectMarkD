import { describe, expect, it } from 'vitest';
import { readJsonBody } from './request-body.js';

/** A Request whose body arrives in the given chunks — what the reader sees
 *  when a client streams an upload, including chunk boundaries that fall
 *  mid-character. */
function chunkedRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/export', {
    method: 'POST',
    headers,
    duplex: 'half',
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  } as RequestInit);
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('readJsonBody', () => {
  it('parses a body that arrives in one chunk', async () => {
    const result = await readJsonBody(
      chunkedRequest([encode('{"title":"Doc"}')]),
      1024,
    );
    expect(result).toEqual({ ok: true, value: { title: 'Doc' } });
  });

  it('parses a body split across many chunks', async () => {
    const result = await readJsonBody(
      chunkedRequest([
        encode('{"title":'),
        encode('"Doc",'),
        encode('"pageCount":3}'),
      ]),
      1024,
    );
    expect(result).toEqual({
      ok: true,
      value: { title: 'Doc', pageCount: 3 },
    });
  });

  it('decodes a multi-byte character split across a chunk boundary', async () => {
    // The body is full of user text, so a UTF-8 sequence straddling two
    // chunks is the normal case, not a corner one. "é" is 0xC3 0xA9.
    const body = encode(JSON.stringify({ title: 'café — naïve' }));
    const splitAt = body.indexOf(0xc3) + 1;
    const result = await readJsonBody(
      chunkedRequest([body.slice(0, splitAt), body.slice(splitAt)]),
      1024,
    );
    expect(result).toEqual({ ok: true, value: { title: 'café — naïve' } });
  });

  it('rejects a body past the cap even without a Content-Length', async () => {
    const result = await readJsonBody(
      chunkedRequest([encode('{"a":"'), encode('x'.repeat(64)), encode('"}')]),
      32,
    );
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('rejects on a declared Content-Length past the cap before reading', async () => {
    // A body that never produces a chunk: if the reader touched the stream,
    // this test would hang rather than pass.
    const request = new Request('http://localhost/api/export', {
      method: 'POST',
      headers: { 'content-length': '999999' },
      body: new ReadableStream({
        pull() {
          // Deliberately silent — reading here would block forever.
        },
      }),
      duplex: 'half',
    } as RequestInit);

    expect(await readJsonBody(request, 1024)).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('reports a malformed body rather than throwing', async () => {
    expect(
      await readJsonBody(chunkedRequest([encode('{not json')]), 1024),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reports an empty stream as malformed', async () => {
    expect(await readJsonBody(chunkedRequest([]), 1024)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('reports a request with no body at all as empty', async () => {
    // A POST with no body has no stream to read — distinct from a stream that
    // yields nothing, and the reason the route's 400 covers both.
    const request = new Request('http://localhost/api/export', {
      method: 'POST',
    });
    expect(await readJsonBody(request, 1024)).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('accepts a body exactly at the cap', async () => {
    const body = encode('{"a":1}');
    const result = await readJsonBody(chunkedRequest([body]), body.byteLength);
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });
});
