// ─────────────────────────────────────────────────────────────────────────────
// Test connection (spec §AI Provider Config): one minimal request tells the
// Admin whether the endpoint answered, what the model publishes about its
// window, output cap, and price, and whether the configured caps disagree
// with those numbers. Warnings are never hidden and never silently corrected.
//
// The report is Admin-only and may carry upstream detail for debugging; the
// user-facing AI errors never come through here. Nothing is persisted.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiProviderConfig } from '../db/schema.js';
import {
  AiProviderError,
  type AiModelInfo,
  type AiProvider,
} from './provider.js';

export interface AiConnectionModel extends AiModelInfo {
  /** The model id the metadata was read for. */
  id: string;
}

export interface AiConnectionReport {
  /** Whether the chat completion itself succeeded. */
  ok: boolean;
  /** Whether the deployment's environment carries a key at all. */
  keyPresent: boolean;
  /** Published metadata, when the provider exposes it. */
  model: AiConnectionModel | null;
  /** Configured caps that disagree with the published numbers. */
  warnings: string[];
  /** Admin-facing failure summary; null on success. */
  error: string | null;
  /** Upstream body excerpt for debugging; Admin-only. */
  detail: string | null;
}

const NO_KEY_MESSAGE =
  'No API key is set for this instance. Add AI_API_KEY to the environment and restart the API.';

const NO_MODEL_MESSAGE =
  'No model is configured. Set a model id and save before testing the connection.';

/**
 * The probe asks for one word, but reasoning tokens come out of the same
 * completion budget: a reasoning probe capped at a dozen tokens can spend
 * the whole budget thinking and come back with no reply text
 * (finish_reason length, content null). The reasoning cap stays small and
 * explicit, with room for the thinking and the word.
 */
const PROBE_CAP_FLAT = 16;
const PROBE_CAP_REASONING = 512;

/** One minimal chat completion with the configured effort and an explicit
 *  small cap, plus the metadata lookup when the provider serves one. */
export async function testAiConnection({
  config,
  apiKey,
  provider,
}: {
  config: AiProviderConfig;
  apiKey: string | null;
  provider: AiProvider;
}): Promise<AiConnectionReport> {
  if (apiKey === null) {
    return {
      ok: false,
      keyPresent: false,
      model: null,
      warnings: [],
      error: NO_KEY_MESSAGE,
      detail: null,
    };
  }
  if (config.model === '') {
    return {
      ok: false,
      keyPresent: true,
      model: null,
      warnings: [],
      error: NO_MODEL_MESSAGE,
      detail: null,
    };
  }

  const timeoutMs = config.timeoutSeconds * 1000;
  let ok = false;
  let error: string | null = null;
  let detail: string | null = null;
  try {
    await provider.complete({
      baseUrl: config.baseUrl,
      apiKey,
      model: config.model,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      maxOutputTokens: Math.min(
        config.maxOutputTokens,
        config.reasoningEffort === 'off' ? PROBE_CAP_FLAT : PROBE_CAP_REASONING,
      ),
      reasoningEffort: config.reasoningEffort,
      timeoutMs,
    });
    ok = true;
  } catch (cause) {
    if (cause instanceof AiProviderError) {
      error = cause.message;
      detail = cause.detail;
    } else {
      error = 'The connection test failed.';
    }
  }

  // Metadata is best-effort even when the completion failed: a model id the
  // endpoint doesn't know is exactly what the panel should show.
  const info = await provider
    .modelInfo({ baseUrl: config.baseUrl, apiKey, model: config.model, timeoutMs })
    .catch(() => null);
  return {
    ok,
    keyPresent: true,
    model: info ? { id: config.model, ...info } : null,
    warnings: connectionWarnings(config, info),
    error,
    detail,
  };
}

/** Configured caps that cannot fit the model's published window. */
export function connectionWarnings(
  config: AiProviderConfig,
  model: AiModelInfo | null,
): string[] {
  if (!model) return [];
  const warnings: string[] = [];
  if (
    model.contextLength !== null &&
    config.contextWindow > model.contextLength
  ) {
    warnings.push(
      `The configured context window (${config.contextWindow} tokens) is larger than the model's published window (${model.contextLength} tokens).`,
    );
  }
  if (
    model.maxOutputTokens !== null &&
    config.maxOutputTokens > model.maxOutputTokens
  ) {
    warnings.push(
      `The configured output cap (${config.maxOutputTokens} tokens) is larger than the model's published completion cap (${model.maxOutputTokens} tokens).`,
    );
  }
  return warnings;
}
