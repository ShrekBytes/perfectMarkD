// ─────────────────────────────────────────────────────────────────────────────
// Request-body parsing shared by the route modules (auth, orders, admin, AI)
// and the streaming reader the export route needs (launch/05).
//
// Most bodies here are a few hundred bytes and `parseJson(await
// c.req.text())` is exactly right for them. The Server Export payload is not:
// it carries the document, its assets, and its fonts, and can legally reach
// 50 MB. `text()` buffers every chunk, concatenates them into one buffer, and
// decodes that — so the whole body is held as bytes and as a string at the
// same time before the parse even starts. readJsonBody reads the stream
// instead, decoding each chunk as it arrives and letting the bytes go as they
// are consumed, so the byte copy is never retained.
//
// What it does not do is parse incrementally: JSON.parse still needs the whole
// string, so the string and the parsed object coexist exactly as they did
// before. The saving is the byte buffer, not a second copy of the document.
//
// The cap is enforced here as well as by the route's bodyLimit middleware, and
// for a different reason: the middleware trusts a Content-Length the client
// declared, while this counts what actually arrives. A chunked upload cannot
// slip past it.
// ─────────────────────────────────────────────────────────────────────────────

export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** The request body as a plain object, or null when it isn't one. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'malformed' | 'empty' };

/**
 * Reads and parses a JSON request body in a single pass over its stream.
 *
 * `maxBytes` is enforced here as well as by the route's bodyLimit middleware:
 * the middleware can only trust a Content-Length the client declared, while
 * this counts what actually arrives, so a chunked upload cannot slip past the
 * cap. Both exist on purpose — the middleware answers early with a 413, this
 * one is the backstop that is always true.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const stream = request.body;
  if (!stream) return { ok: false, reason: 'empty' };

  // Content-Length is a cheap early exit, not the check: a chunked request has
  // none, and a lying one is caught by the running count below.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      // `stream: true` holds back a trailing partial character, so a UTF-8
      // sequence split across two chunks still decodes — which matters here
      // because the body is full of user text.
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
