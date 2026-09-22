import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiProviderError, createOpenAiCompatibleProvider } from './provider.js';

const PROVIDER = createOpenAiCompatibleProvider();

const REQUEST = {
  baseUrl: 'https://ai.example.com/v1',
  apiKey: 'sk-secret-provider-key',
  model: 'vendor/model',
  messages: [{ role: 'user' as const, content: 'Say ok.' }],
  maxOutputTokens: 64,
  reasoningEffort: 'medium' as const,
  timeoutMs: 5_000,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function completionPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    choices: [
      {
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
        ...overrides,
      },
    ],
  };
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the OpenAI-compatible client: complete', () => {
  it('returns the reply text and finish reason, with the key out of the body', async () => {
    const calls = stubFetch(() =>
      Promise.resolve(jsonResponse(200, completionPayload())),
    );

    const reply = await PROVIDER.complete(REQUEST);

    expect(reply).toEqual({ text: 'ok', finishReason: 'stop' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://ai.example.com/v1/chat/completions');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-secret-provider-key');
    expect(headers['x-title']).toBe('PerfectMarkD');
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      model: 'vendor/model',
      messages: [{ role: 'user', content: 'Say ok.' }],
      // Always explicit: a gateway default would truncate silently.
      max_tokens: 64,
      reasoning: { effort: 'medium' },
    });
    // The key belongs in the header only — never serialized into the call.
    expect(JSON.stringify(body)).not.toContain('sk-secret-provider-key');
  });

  it('omits the unified reasoning field when the effort is off', async () => {
    const calls = stubFetch(() =>
      Promise.resolve(jsonResponse(200, completionPayload())),
    );

    await PROVIDER.complete({ ...REQUEST, reasoningEffort: 'off' });

    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('reasoning');
  });

  it('maps a transport failure to one provider error', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    const failure = await PROVIDER.complete(REQUEST).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AiProviderError);
    expect(failure).toMatchObject({
      code: 'transport',
      status: null,
      detail: null,
    });
    expect((failure as AiProviderError).message).not.toContain('vendor/model');
  });

  it('maps an aborted request to a timeout error', async () => {
    stubFetch(() => {
      const abort = new Error('This operation was aborted');
      abort.name = 'AbortError';
      return Promise.reject(abort);
    });

    await expect(PROVIDER.complete(REQUEST)).rejects.toMatchObject({
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

      const failure = PROVIDER.complete({
        ...REQUEST,
        timeoutMs: 50,
      }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(60);

      await expect(failure).resolves.toMatchObject({ code: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps an HTTP failure to the status and the upstream body', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('{"error":{"message":"invalid api key"}}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const failure = (await PROVIDER.complete(REQUEST).catch(
      (error: unknown) => error,
    )) as AiProviderError;

    expect(failure).toBeInstanceOf(AiProviderError);
    expect(failure.code).toBe('http');
    expect(failure.status).toBe(401);
    expect(failure.message).toBe('The provider answered with HTTP 401.');
    expect(failure.detail).toContain('invalid api key');
  });

  it('maps a malformed body to invalid_response', async () => {
    stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })));

    await expect(PROVIDER.complete(REQUEST)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('maps a reply without usable text to invalid_response', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, { choices: [] })));
    await expect(PROVIDER.complete(REQUEST)).rejects.toMatchObject({
      code: 'invalid_response',
    });

    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, { choices: [{ message: { content: 42 } }] }),
      ),
    );
    await expect(PROVIDER.complete(REQUEST)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});

describe('the OpenAI-compatible client: modelInfo', () => {
  const payload = {
    data: [
      { id: 'other/model' },
      {
        id: 'vendor/model',
        context_length: 200_000,
        top_provider: { max_completion_tokens: 8_000 },
        pricing: { prompt: '0.00000015', completion: '0.0000006' },
      },
    ],
  };

  it("reads the model's published window, completion cap, and prices", async () => {
    const calls = stubFetch(() => Promise.resolve(jsonResponse(200, payload)));

    const info = await PROVIDER.modelInfo(REQUEST);

    expect(info).toEqual({
      contextLength: 200_000,
      maxOutputTokens: 8_000,
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.6,
    });
    expect(calls[0]?.url).toBe('https://ai.example.com/v1/models');
  });

  it('falls back to other published completion-cap field names', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          data: [
            {
              id: 'vendor/model',
              context_length: 32_000,
              max_output_tokens: 4_000,
            },
          ],
        }),
      ),
    );

    expect(await PROVIDER.modelInfo(REQUEST)).toEqual({
      contextLength: 32_000,
      maxOutputTokens: 4_000,
      inputPricePerMillion: null,
      outputPricePerMillion: null,
    });
  });

  it('returns null when the provider does not publish metadata', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(404, { error: 'nope' })));
    expect(await PROVIDER.modelInfo(REQUEST)).toBeNull();

    stubFetch(() => Promise.resolve(jsonResponse(200, { data: [] })));
    expect(await PROVIDER.modelInfo(REQUEST)).toBeNull();

    stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })));
    expect(await PROVIDER.modelInfo(REQUEST)).toBeNull();

    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    expect(await PROVIDER.modelInfo(REQUEST)).toBeNull();
  });
});
