// ─────────────────────────────────────────────────────────────────────────────
// The AI provider seam (ADR-0008).
//
// One OpenAI-compatible chat completion and one best-effort model-metadata
// lookup. Configuration, the API key, and the timeout are passed in per call:
// this module reads no settings and stores nothing — the key, the prompt, and
// the reply are never logged. Failures carry the upstream body back to the
// caller for the Admin's panel; where that body gets logged is the caller's
// decision, not this seam's.
//
// Every transport and HTTP failure becomes the shared UpstreamError, so
// callers map failures without knowing the wire. The seam is injected into the
// app the way the export renderer is (createApp's `ai` option), so every test
// runs against a fake and no test touches a live API.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReasoningEffort } from '../db/schema.js';
import {
  UpstreamError,
  fetchWithTimeout,
  readDetail,
  readJson,
} from '../fetch-with-timeout.js';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  /** API root, e.g. https://openrouter.ai/api/v1 (no trailing slash). */
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: AiMessage[];
  /**
   * Always sent: gateways commonly default to a few thousand tokens and
   * truncate silently, so the cap is explicit on every call (spec §The AI
   * route module).
   */
  maxOutputTokens: number;
  /** 'off' omits the unified reasoning field entirely. */
  reasoningEffort: ReasoningEffort;
  timeoutMs: number;
}

export interface AiCompletionReply {
  text: string;
  /** The provider's finish reason, verbatim (`stop`, `length`, …). */
  finishReason: string;
}

export interface AiModelInfoRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Published model metadata; null fields mean the provider didn't report them. */
export interface AiModelInfo {
  contextLength: number | null;
  maxOutputTokens: number | null;
}

export interface AiProvider {
  complete(request: AiCompletionRequest): Promise<AiCompletionReply>;
  /**
   * Published metadata for the model, or null when the provider does not
   * expose it. Best-effort by design: metadata is a convenience for Test
   * connection, never a precondition for an AI Action.
   */
  modelInfo(request: AiModelInfoRequest): Promise<AiModelInfo | null>;
}

/** The attribution header OpenRouter documents; optional, and harmless to
 *  any other OpenAI-compatible endpoint. */
const ATTRIBUTION_TITLE = 'PerfectMarkD';

/** The real client. Built once per app; network only happens per call. */
export function createOpenAiCompatibleProvider(): AiProvider {
  return {
    async complete(request) {
      const payload = await send(
        {
          url: `${request.baseUrl}/chat/completions`,
          apiKey: request.apiKey,
          timeoutMs: request.timeoutMs,
          body: {
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxOutputTokens,
            // The unified reasoning shape (spec §AI Provider Config); 'off'
            // means no reasoning field at all, which every gateway accepts.
            ...(request.reasoningEffort === 'off'
              ? {}
              : { reasoning: { effort: request.reasoningEffort } }),
          },
        },
        (response) => readProviderJson(response),
      );
      const choice = firstChoice(payload);
      const content =
        choice && isRecord(choice.message) ? choice.message.content : undefined;
      if (typeof content !== 'string') {
        throw new UpstreamError(
          'invalid_response',
          'The provider returned no reply text.',
        );
      }
      return {
        text: content,
        finishReason:
          typeof choice?.finish_reason === 'string'
            ? choice.finish_reason
            : 'unknown',
      };
    },

    async modelInfo(request) {
      // Metadata is optional: an endpoint that doesn't serve /models, or
      // serves it in another shape, still passes Test connection's real
      // check (the chat completion) — the panel just shows no numbers.
      try {
        const payload = await send(
          {
            url: `${request.baseUrl}/models`,
            apiKey: request.apiKey,
            timeoutMs: request.timeoutMs,
            method: 'GET',
          },
          (response) => readProviderJson(response),
        );
        return parseModelInfo(payload, request.model);
      } catch {
        return null;
      }
    },
  };
}

interface SendOptions {
  url: string;
  apiKey: string;
  timeoutMs: number;
  method?: 'GET' | 'POST';
  body?: unknown;
}

/**
 * One request inside the timeout, mapped onto the one error shape. The body
 * is read before the deadline is released: a provider that stalls mid-body
 * times out exactly like one that never answered.
 */
async function send<T>(
  options: SendOptions,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  return fetchWithTimeout({
    url: options.url,
    init: {
      method: options.method ?? 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
        'x-title': ATTRIBUTION_TITLE,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    timeoutMs: options.timeoutMs,
    read: async (response) => {
      if (!response.ok) {
        throw new UpstreamError(
          'http',
          `The provider answered with HTTP ${response.status}.`,
          response.status,
          await readDetail(response),
        );
      }
      return read(response);
    },
    errors: {
      timeout: () =>
        new UpstreamError('timeout', 'The provider did not answer in time.'),
      transport: () =>
        new UpstreamError('transport', 'The provider could not be reached.'),
    },
  });
}

/** This client's own sentence for a body the provider did not send as JSON. */
function readProviderJson(response: Response): Promise<unknown> {
  // Bound here, at the two call sites that want it, so the sentence stays this
  // client's own rather than becoming the reader's.
  return readJson(response, 'The provider returned a malformed reply.');
}

function firstChoice(
  payload: unknown,
): { message?: unknown; finish_reason?: unknown } | null {
  if (!isRecord(payload)) return null;
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  return isRecord(first)
    ? (first as { message?: unknown; finish_reason?: unknown })
    : null;
}

/**
 * OpenRouter-style `/models` payload: find the configured model and read the
 * published numbers. Fields the provider doesn't expose stay null.
 */
function parseModelInfo(payload: unknown, model: string): AiModelInfo | null {
  if (!isRecord(payload)) return null;
  const data = payload.data;
  if (!Array.isArray(data)) return null;
  const entry = data.find((item) => isRecord(item) && item.id === model);
  if (!isRecord(entry)) return null;
  const topProvider = isRecord(entry.top_provider) ? entry.top_provider : null;
  return {
    contextLength: positiveNumberOrNull(entry.context_length),
    maxOutputTokens:
      positiveNumberOrNull(topProvider?.max_completion_tokens) ??
      positiveNumberOrNull(entry.max_completion_tokens) ??
      positiveNumberOrNull(entry.max_output_tokens),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}
