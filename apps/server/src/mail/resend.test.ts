import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../fetch-with-timeout.js';
import { createResendMailer } from './resend.js';

const MAILER = createResendMailer({
  apiKey: 're_secret-key',
  from: 'PerfectMarkD <hello@perfectmarkd.00022000.xyz>',
});

const VERIFICATION = {
  to: 'ada@example.com',
  url: 'https://perfectmarkd.00022000.xyz/verify?token=01HX',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A send the provider accepted. */
function accepted(): Response {
  return jsonResponse(200, { id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' });
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The Resend client is an implementation detail behind the Mailer seam, so this
 * file pins one thing: the mapping from every failure to one UpstreamError code.
 * The request it makes is deliberately unpinned (spec §Testing Decisions) — the
 * seam's types are what keep a message to an address and a link, and nothing
 * outside this file should know the wire.
 */
describe('the Resend client', () => {
  it('sends when the provider accepts', async () => {
    stubFetch(() => Promise.resolve(accepted()));

    await expect(
      MAILER.sendVerification(VERIFICATION),
    ).resolves.toBeUndefined();
  });

  it('maps a transport failure to one mailer error', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    const failure = await MAILER.sendVerification(VERIFICATION).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(UpstreamError);
    expect(failure).toMatchObject({ code: 'transport', status: null });
    // No user-facing string names the provider, the way the AI routes' do not.
    expect((failure as UpstreamError).message).not.toMatch(/resend/i);
  });

  it('maps an aborted request to a timeout error', async () => {
    stubFetch(() => {
      const abort = new Error('This operation was aborted');
      abort.name = 'AbortError';
      return Promise.reject(abort);
    });

    await expect(MAILER.sendVerification(VERIFICATION)).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('times out when the body stalls after the headers arrive', async () => {
    vi.useFakeTimers();
    try {
      stubFetch((_url, init) =>
        Promise.resolve({
          ok: true,
          status: 200,
          // Headers arrived; the body never resolves until the abort fires.
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                const abort = new Error('This operation was aborted');
                abort.name = 'AbortError';
                reject(abort);
              });
            }),
        } as unknown as Response),
      );

      const failure = createResendMailer({
        apiKey: 're_secret-key',
        from: 'PerfectMarkD <hello@perfectmarkd.00022000.xyz>',
        timeoutMs: 50,
      })
        .sendVerification(VERIFICATION)
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(60);

      await expect(failure).resolves.toMatchObject({ code: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps an HTTP failure to the status and the upstream body', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('{"statusCode":422,"message":"Invalid `to` field"}', {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const failure = (await MAILER.sendVerification(VERIFICATION).catch(
      (error: unknown) => error,
    )) as UpstreamError;

    expect(failure).toBeInstanceOf(UpstreamError);
    expect(failure.code).toBe('http');
    expect(failure.status).toBe(422);
    expect(failure.message).toBe('The mail provider answered with HTTP 422.');
    expect(failure.detail).toContain('Invalid `to` field');
  });

  it('bounds the upstream body it carries back', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('x'.repeat(5_000), {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    const failure = (await MAILER.sendVerification(VERIFICATION).catch(
      (error: unknown) => error,
    )) as UpstreamError;

    expect(failure.detail).toHaveLength(2_000);
  });

  it('maps a malformed or idless acceptance to invalid_response', async () => {
    // A body that is not JSON is the shared reader's verdict, and this
    // client's own sentence for it.
    stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })));
    await expect(MAILER.sendVerification(VERIFICATION)).rejects.toThrow(
      'The mail provider returned a malformed reply.',
    );

    // Accepted but with nothing that identifies the message: not proof of a
    // send, so it must not be reported as one. That is this client's own
    // verdict, read off a well-formed body.
    stubFetch(() => Promise.resolve(jsonResponse(200, { queued: true })));
    await expect(MAILER.sendVerification(VERIFICATION)).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'The mail provider accepted the message without an id.',
    });
  });
});
