// ─────────────────────────────────────────────────────────────────────────────
// The AI context the app factory resolves once at boot: the deployment's key
// (environment only — ADR-0008) and the provider client. Routes read it from
// here, so the key never passes through settings or a request body, and tests
// inject one fake instead of touching a live API.
// ─────────────────────────────────────────────────────────────────────────────

import { createOpenAiCompatibleProvider, type AiProvider } from './provider.js';

export interface AiAppOptions {
  /** The deployment's provider key; absent means AI is not configured. */
  apiKey?: string | null;
  /** The provider seam; defaults to the real OpenAI-compatible client. */
  provider?: AiProvider;
}

export interface AiContext {
  /** Trimmed environment key, or null when the environment has none. */
  apiKey: string | null;
  provider: AiProvider;
}

export function resolveAiContext(options: AiAppOptions = {}): AiContext {
  const key = options.apiKey?.trim();
  return {
    apiKey: key ? key : null,
    provider: options.provider ?? createOpenAiCompatibleProvider(),
  };
}
