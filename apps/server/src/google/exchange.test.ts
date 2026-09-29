import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../fetch-with-timeout.js';
import {
  createGoogleIdentityExchange,
  type GoogleIdentity,
} from './exchange.js';

const exchange = createGoogleIdentityExchange({
  clientId: 'client-id.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-secret',
  redirectUri: 'https://perfectmarkd.00022000.xyz/auth/google/callback',
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// A Response body can only be read once, so each answer is built fresh.
const token = () =>
  jsonResponse(200, { access_token: 'ya29.token', token_type: 'Bearer' });

const USERINFO = { sub: '107346332299', email: 'ada@example.com' };

/** Google's two answers: a token, then the identity it stands for. */
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

function stubHappyPath(overrides: { userinfo?: () => Response } = {}): void {
  stubFetch((url) => {
    if (url.includes('/token')) return Promise.resolve(token());
    return Promise.resolve(
      overrides.userinfo?.() ??
        jsonResponse(200, { ...USERINFO, email_verified: true }),
    );
  });
}

async function failureOf(code: string): Promise<UpstreamError> {
  const error = await exchange('auth-code').catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(UpstreamError);
  expect((error as UpstreamError).code).toBe(code);
  return error as UpstreamError;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The Google client is an implementation detail behind the identity-exchange
 * seam, so this file pins one thing: the mapping from every failure to one
 * error code, plus the one shape the routes get back. The requests it makes are
 * deliberately unpinned (spec §Testing Decisions).
 */
describe('the Google client', () => {
  it('returns the identity behind an accepted code', async () => {
    stubHappyPath();

    await expect(exchange('auth-code')).resolves.toEqual({
      subject: '107346332299',
      email: 'ada@example.com',
    } satisfies GoogleIdentity);
  });

  it('maps a rejected code to an http error', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse(400, { error: 'invalid_grant' })),
    );

    await failureOf('http');
  });

  it('maps a token answer with no access token to invalid_response', async () => {
    stubFetch((url) =>
      Promise.resolve(url.includes('/token') ? jsonResponse(200, {}) : token()),
    );

    await failureOf('invalid_response');
  });

  it('refuses an identity whose email Google has not verified', async () => {
    stubHappyPath({
      userinfo: () => jsonResponse(200, { ...USERINFO, email_verified: false }),
    });

    await failureOf('invalid_response');
  });

  it('refuses an identity with no subject or no email', async () => {
    stubHappyPath({
      userinfo: () => jsonResponse(200, { sub: '', email: '' }),
    });

    await failureOf('invalid_response');
  });

  it('maps a network failure to one transport error', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    await failureOf('transport');
  });

  it('maps an unanswered request to a timeout', async () => {
    stubFetch(() => {
      const abort = new Error('This operation was aborted');
      abort.name = 'AbortError';
      return Promise.reject(abort);
    });

    await failureOf('timeout');
  });

  it('never puts the client secret in a message or a log line', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    const failure = await failureOf('transport');

    expect(failure.message).not.toMatch(/GOCSPX/);
    expect(JSON.stringify(failure)).not.toMatch(/GOCSPX/);
  });
});
