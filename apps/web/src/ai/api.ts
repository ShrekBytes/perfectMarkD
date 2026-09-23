// ─────────────────────────────────────────────────────────────────────────────
// The AI Action client (ai-transforms/05): one POST per kind to the server
// route. The server owns every gate and the metering, so the client only has
// to send the instruction and the target, and match the typed `code` on a
// refusal (ApiError carries it). Nothing here holds AI state — the account
// store does (spec §Data model).
// ─────────────────────────────────────────────────────────────────────────────

import { errorFrom, postJson, ApiError } from '../api/client';
import type {
  AiMarkdownResult,
  AiPlanBrief,
  AiPlanResult,
  AiStylesheetResult,
  AiTarget,
} from './types';
import type { StylesheetExchange } from './conversation';

/** The client's name for the shared API error; its `code` names the gate. */
export { ApiError as AiActionError };

/** The route's typed refusal codes (spec §The AI route module). */
export type AiErrorCode =
  | 'ai_not_configured'
  | 'ai_not_entitled'
  | 'ai_access_off'
  | 'ai_allowance_exhausted'
  | 'ai_burst_limit'
  | 'ai_input_too_long'
  | 'ai_provider_error'
  | 'ai_truncated'
  | 'ai_invalid_response';

export interface MarkdownRequest {
  instruction: string;
  target: AiTarget;
  /** The rest of the Document: the outline digest when only part is sent, or
   *  the whole remainder when it fit (07). */
  context?: string | null;
  /** The approved plan, when this request is one step of an AI Plan run. */
  plan?: AiPlanBrief | null;
}

export async function requestMarkdown(
  request: MarkdownRequest,
  signal?: AbortSignal,
): Promise<AiMarkdownResult> {
  const res = await postJson(
    '/api/ai/markdown',
    {
      instruction: request.instruction,
      target: {
        kind: request.target.kind,
        text: request.target.text,
        from: request.target.from,
        to: request.target.to,
      },
      context: request.context ?? null,
      plan: request.plan ?? null,
    },
    signal,
  );
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as AiMarkdownResult;
}

export interface PlanRequest {
  instruction: string;
  /** The outline digest, built locally from the Document's sections. */
  outline: string;
  /** The section labels the plan's steps are validated against. */
  sections: string[];
}

/**
 * Asks for an AI Plan (spec §Tier 2): the instruction and the outline digest,
 * never the Document. The plan comes back for approval; nothing runs until the
 * user approves it.
 */
export async function requestPlan(
  request: PlanRequest,
  signal?: AbortSignal,
): Promise<AiPlanResult> {
  const res = await postJson(
    '/api/ai/markdown',
    {
      mode: 'plan',
      instruction: request.instruction,
      outline: request.outline,
      sections: request.sections,
    },
    signal,
  );
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as AiPlanResult;
}

export interface StylesheetRequest {
  instruction: string;
  /** The box's current text — the source of truth, never a stale transcript. */
  css: string;
  /** The earlier turns, oldest first (the last three are replayed). */
  history?: StylesheetExchange[];
}

export async function requestStylesheet(
  request: StylesheetRequest,
  signal?: AbortSignal,
): Promise<AiStylesheetResult> {
  const res = await postJson(
    '/api/ai/stylesheet',
    {
      instruction: request.instruction,
      css: request.css,
      history: request.history ?? [],
    },
    signal,
  );
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as AiStylesheetResult;
}
