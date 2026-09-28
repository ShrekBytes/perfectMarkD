import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateProviderError, createLtcRateProvider } from './provider.js';

const provider = createLtcRateProvider();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Kraken's public ticker, the one pair this provider asks about. */
function tickerPayload(price: unknown): unknown {
  return {
    error: [],
    result: {
      LTCUSDT: {
        a: ['69.793050', '13', '13.000'],
        b: ['69.717730', '20', '20.000'],
        // `c` is the last closed trade — the freshest single price.
        c: [String(price), '1.65000000'],
        v: ['8428.85461957', '13000.57886215'],
      },
    },
  };
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      return handler(String(input), init);
    }),
  );
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function failureOf(): Promise<RateProviderError> {
  const thrown = await provider.fetchRate().catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(RateProviderError);
  return thrown as RateProviderError;
}

describe('the rate feed', () => {
  it('reports the last traded USDT per LTC as a number', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, tickerPayload('69.82'))));

    await expect(provider.fetchRate()).resolves.toBe(69.82);
  });

  it('asks one public, keyless endpoint and sends no credentials', async () => {
    const urls = stubFetch(() =>
      Promise.resolve(jsonResponse(200, tickerPayload('70'))),
    );

    await provider.fetchRate();

    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https:\/\//);
    const init = (
      vi.mocked(fetch) as unknown as {
        mock: { calls: [RequestInfo | URL, RequestInit | undefined][] };
      }
    ).mock.calls[0]![1];
    // No key means no authorization header: the query is public, and nothing
    // of the instance's goes with it.
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
  });

  it('refuses a price that is missing, non-numeric, or not positive', async () => {
    for (const price of ['', 'n/a', '0', '-1']) {
      stubFetch(() => Promise.resolve(jsonResponse(200, tickerPayload(price))));
      expect((await failureOf()).code).toBe('invalid_response');
    }
  });

  it('refuses a reply with no price in it', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse(200, { error: [], result: {} })),
    );
    expect((await failureOf()).code).toBe('invalid_response');
  });

  it('refuses a malformed reply', async () => {
    stubFetch(() => Promise.resolve(new Response('not json')));
    expect((await failureOf()).code).toBe('invalid_response');
  });

  it('refuses an HTTP error', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(503, { error: ['busy'] })));
    const error = await failureOf();
    expect(error.code).toBe('http');
    expect(error.message).not.toMatch(/busy/);
  });

  it('refuses a provider that does not answer in time', async () => {
    const stalled = createLtcRateProvider({ timeoutMs: 5 });
    stubFetch(
      (url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );

    const thrown = await stalled.fetchRate().catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(RateProviderError);
    expect((thrown as RateProviderError).code).toBe('timeout');
  });

  it('refuses a provider that cannot be reached', async () => {
    stubFetch(() => Promise.reject(new TypeError('network down')));
    expect((await failureOf()).code).toBe('transport');
  });
});
