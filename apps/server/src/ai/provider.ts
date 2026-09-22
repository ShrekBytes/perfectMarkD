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
// Every transport and HTTP failure becomes one AiProviderError shape, so
// callers map failures without knowing the wire. The seam is injected into the
// app the way the export renderer is (createApp's `ai` option), so every test
// runs against a fake and no test touches a live API.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReasoningEffort } from '../db/schema.js';

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

export const AI_PROVIDER_ERROR_CODES = [
  'transport',
  'timeout',
  'http',
  'invalid_response',
] as const;
export type AiProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number];

/**
 * Every provider failure, in one shape. `message` is safe to surface (it
 * never names the provider or the model); `detail` carries the upstream body
 * excerpt for the Admin panel only.
 */
export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    message: string,
    /** HTTP status, when the failure was an HTTP one. */
    readonly status: number | null = null,
    /** Upstream body excerpt; Admin-facing debugging only. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
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
  /** USD per million tokens. */
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
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

/** Bound on what an upstream error body can hold (Admin panel display). */
const MAX_DETAIL_LENGTH = 2_000;

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
        (response) => readJson(response),
      );
      const choice = firstChoice(payload);
      const content =
        choice && isRecord(choice.message) ? choice.message.content : undefined;
      if (typeof content !== 'string') {
        throw new AiProviderError(
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
          (response) => readJson(response),
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
 * One request inside the timeout, handing the body to `read` before the
 * deadline is released: a provider that stalls mid-body times out exactly
 * like one that never answered.
 */
async function send<T>(
  options: SendOptions,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(options.url, {
      method: options.method ?? 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
        'x-title': ATTRIBUTION_TITLE,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AiProviderError(
        'http',
        `The provider answered with HTTP ${response.status}.`,
        response.status,
        await readDetail(response),
      );
    }
    return await read(response);
  } catch (error) {
    // An AiProviderError already carries the right shape (http/invalid).
    if (error instanceof AiProviderError) throw error;
    if (isAbortError(error)) {
      throw new AiProviderError(
        'timeout',
        'The provider did not answer in time.',
      );
    }
    throw new AiProviderError(
      'transport',
      'The provider could not be reached.',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    // An aborted body read is a timeout, not a malformed reply.
    if (isAbortError(error)) throw error;
    throw new AiProviderError(
      'invalid_response',
      'The provider returned a malformed reply.',
    );
  }
}

/** The upstream body, bounded and best-effort — it is debugging detail. */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, MAX_DETAIL_LENGTH) || null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
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
  const pricing = isRecord(entry.pricing) ? entry.pricing : null;
  return {
    contextLength: positiveNumberOrNull(entry.context_length),
    maxOutputTokens:
      positiveNumberOrNull(topProvider?.max_completion_tokens) ??
      positiveNumberOrNull(entry.max_completion_tokens) ??
      positiveNumberOrNull(entry.max_output_tokens),
    inputPricePerMillion: pricePerMillion(pricing?.prompt),
    outputPricePerMillion: pricePerMillion(pricing?.completion),
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

/** Providers publish per-token prices as decimal strings; the panel speaks
 *  per-million. */
function pricePerMillion(value: unknown): number | null {
  const raw =
    typeof value === 'string'
      ? Number(value)
      : typeof value === 'number'
        ? value
        : Number.NaN;
  return Number.isFinite(raw) && raw >= 0 ? raw * 1_000_000 : null;
}

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}
