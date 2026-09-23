// ─────────────────────────────────────────────────────────────────────────────
// The AI route module (spec §The AI route module and its contract).
//
// Two POST endpoints, one per kind — markdown and stylesheet — plus the AI
// Access switch. The provider is injected (ADR-0008): every gate, refusal, and
// metering rule is testable against a fake, and no test touches a live API.
//
// Gate precedence (spec §Gate precedence), resolved in one order so every
// surface agrees: not configured → not entitled → AI Access off → allowance
// spent → burst → input too large → the provider. A refusal is never counted
// against the allowance; only a usable proposal is (spec §AI is a paid
// capability). Nothing is stored: no prompt, no Document text, no result — the
// only persisted traces are the usage counter and the once-per-account
// disclosure flag.
//
// No user-facing string names the provider or the model. Upstream detail is
// logged server-side (through the app's log sink) and never returned.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import {
  applyAnchoredEdits,
  estimateAiSize,
  parseAnchoredEdits,
  type AnchoredEdit,
} from '@perfectmarkd/core';
import type { AppEnv } from '../index.js';
import type { Clock } from '../auth/sessions.js';
import type { LogSink } from '../request-logger.js';
import { asRecord, parseJson } from '../request-body.js';
import { users, type AiProviderConfig } from '../db/schema.js';
import { getAiProviderConfig, getPlanLimits } from '../db/settings.js';
import { findActiveEntitlement } from '../quota.js';
import { AiProviderError, type AiCompletionRequest } from './provider.js';
import type { AiContext } from './context.js';
import {
  aiAccountState,
  aiConfigured,
  aiUsageState,
  incrementAiUsage,
} from './state.js';
import { buildMarkdownMessages, buildStylesheetMessages } from './prompts.js';

export interface AiRoutesOptions {
  /** The environment key and the provider seam. */
  ai: AiContext;
  now: Clock;
  /** Server-side log line for provider failures; defaults to silence. */
  log?: LogSink;
}

/** One AI Proposal as the route returns it. Anchored edits target a whole
 *  Document; `replace` is a selection, an empty-Document generation, or a
 *  whole stylesheet. */
export type AiProposalResult =
  | { kind: 'anchored'; edits: AnchoredEdit[] }
  | { kind: 'replace'; text: string };

/** How long a user instruction may be; it is advisory text, not data. */
const MAX_INSTRUCTION_CHARACTERS = 4_000;

const PROVIDER_UNAVAILABLE =
  'The AI is unavailable right now. Try again in a moment.';
const TRUNCATED_MESSAGE =
  'The reply was cut off before it finished. Try again, or work on a smaller selection.';
const UNUSABLE_MESSAGE =
  'The AI did not return a usable result. Try again, or work on a smaller selection.';

/** Typed codes the client matches on (never the display string). */
const AI_ERROR_CODES = {
  notConfigured: 'ai_not_configured',
  notEntitled: 'ai_not_entitled',
  accessOff: 'ai_access_off',
  allowanceExhausted: 'ai_allowance_exhausted',
  burst: 'ai_burst_limit',
  inputTooLong: 'ai_input_too_long',
  provider: 'ai_provider_error',
  truncated: 'ai_truncated',
  invalidResponse: 'ai_invalid_response',
} as const;

interface MarkdownRequest {
  instruction: string;
  targetKind: 'document' | 'selection';
  targetText: string;
  context: string | null;
}

interface StylesheetRequest {
  instruction: string;
  css: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function aiRoutes({ ai, now, log }: AiRoutesOptions) {
  const app = new Hono<AppEnv>();
  // Rolling 60-second per-user burst window (the Admin sets the ceiling).
  const bursts = new Map<number, number[]>();

  app.post('/markdown', async (c) => {
    const gate = gateFor(c, ai, now);
    if ('response' in gate) return gate.response;

    const parsed = parseMarkdownRequest(parseJson(await c.req.text()));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const sized = sizeDecision(
      parsed.value.targetText,
      parsed.value.instruction,
      parsed.value.context,
      gate.config,
    );
    if (!sized.ok) {
      return c.json(
        { error: sized.error, code: AI_ERROR_CODES.inputTooLong },
        413,
      );
    }

    if (!acquireBurst(bursts, gate.userId, gate.config.burstPerMinute, now)) {
      return c.json(
        {
          error: 'Too many at once — try again shortly.',
          code: AI_ERROR_CODES.burst,
        },
        429,
      );
    }

    const reply = await callProvider(ai, log, {
      baseUrl: gate.config.baseUrl,
      model: gate.config.model,
      messages: buildMarkdownMessages({
        instruction: parsed.value.instruction,
        targetKind: parsed.value.targetKind,
        targetText: parsed.value.targetText,
        context: parsed.value.context,
      }),
      maxOutputTokens: gate.config.maxOutputTokens,
      reasoningEffort: gate.config.reasoningEffort,
      timeoutMs: gate.config.timeoutSeconds * 1000,
    });
    if (!reply.ok) return reply.response;

    const proposal = markdownProposal(parsed.value, reply.value);
    if (!proposal.ok) {
      return c.json({ error: proposal.error, code: proposal.code }, 502);
    }

    return finish(c, gate, proposal.value, now);
  });

  app.post('/stylesheet', async (c) => {
    const gate = gateFor(c, ai, now);
    if ('response' in gate) return gate.response;

    const parsed = parseStylesheetRequest(parseJson(await c.req.text()));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const sized = sizeDecision(
      parsed.value.css,
      parsed.value.instruction,
      null,
      gate.config,
    );
    if (!sized.ok) {
      return c.json(
        { error: sized.error, code: AI_ERROR_CODES.inputTooLong },
        413,
      );
    }

    if (!acquireBurst(bursts, gate.userId, gate.config.burstPerMinute, now)) {
      return c.json(
        {
          error: 'Too many at once — try again shortly.',
          code: AI_ERROR_CODES.burst,
        },
        429,
      );
    }

    // A stylesheet edit is short, so the Admin may point it at a cheaper model.
    const model = gate.config.stylesheetModel ?? gate.config.model;
    const reply = await callProvider(ai, log, {
      baseUrl: gate.config.baseUrl,
      model,
      messages: buildStylesheetMessages({
        instruction: parsed.value.instruction,
        css: parsed.value.css,
      }),
      maxOutputTokens: gate.config.maxOutputTokens,
      reasoningEffort: gate.config.reasoningEffort,
      timeoutMs: gate.config.timeoutSeconds * 1000,
    });
    if (!reply.ok) return reply.response;

    const text = stripCodeFence(reply.value.text).trim();
    if (text === '') {
      return c.json(
        { error: UNUSABLE_MESSAGE, code: AI_ERROR_CODES.invalidResponse },
        502,
      );
    }

    return finish(c, gate, { kind: 'replace', text }, now);
  });

  /**
   * The AI Access switch (spec §AI Access): the user's own on/off. Works
   * whether or not the instance is configured, so a user can always turn the
   * feature back on from the Account page.
   */
  app.put('/access', async (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    const body = asRecord(parseJson(await c.req.text()));
    if (typeof body?.access !== 'boolean') {
      return c.json({ error: 'The AI switch must be on or off.' }, 400);
    }
    const db = c.var.db;
    db.update(users)
      .set({ aiAccess: body.access })
      .where(eq(users.id, user.id))
      .run();
    const nowDate = now();
    return c.json({
      ai: aiAccountState({
        db,
        userId: user.id,
        apiKey: ai.apiKey,
        access: body.access,
        disclosureSeen: user.aiDisclosureSeen,
        entitlement: findActiveEntitlement(db, user.id, nowDate),
        limits: getPlanLimits(db),
        config: getAiProviderConfig(db),
        now: nowDate,
      }),
    });
  });

  return app;
}

// ─── The shared gate ────────────────────────────────────────────────────────

interface GatePass {
  userId: number;
  config: AiProviderConfig;
  limits: ReturnType<typeof getPlanLimits>;
  entitlement: ReturnType<typeof findActiveEntitlement>;
  disclosureSeen: boolean;
}

type GateResult = GatePass | { response: Response };

/**
 * Resolves the gates in the spec's order and returns the refusal response for
 * the first one that fails. Configured requires the kill switch, a chosen
 * model, and an environment key (spec §Gate precedence). A plan that does not
 * include AI (an allowance of zero) is the same refusal as no plan at all.
 */
function gateFor(c: Context<AppEnv>, ai: AiContext, now: Clock): GateResult {
  const user = c.var.user;
  if (!user) return { response: c.json({ error: 'Not signed in.' }, 401) };

  const db = c.var.db;
  const config = getAiProviderConfig(db);
  if (!aiConfigured(config, ai.apiKey)) {
    return {
      response: c.json(
        {
          error: 'AI Actions are not available on this instance.',
          code: AI_ERROR_CODES.notConfigured,
        },
        503,
      ),
    };
  }

  const nowDate = now();
  const entitlement = findActiveEntitlement(db, user.id, nowDate);
  const limits = getPlanLimits(db);
  const usage = aiUsageState(db, user.id, entitlement, limits, nowDate);
  if (!entitlement || usage.allowance === 0) {
    return {
      response: c.json(
        {
          error: 'AI Actions are part of Pro and Premium.',
          code: AI_ERROR_CODES.notEntitled,
        },
        403,
      ),
    };
  }

  if (!user.aiAccess) {
    return {
      response: c.json(
        {
          error: 'AI is turned off in your Account settings.',
          code: AI_ERROR_CODES.accessOff,
        },
        403,
      ),
    };
  }

  if (usage.remaining <= 0) {
    return {
      response: c.json(
        {
          error: `You have used all ${usage.allowance} AI Actions this period. They reset on ${aiPeriodResetDate(nowDate)}.`,
          code: AI_ERROR_CODES.allowanceExhausted,
        },
        402,
      ),
    };
  }

  return {
    userId: user.id,
    config,
    limits,
    entitlement,
    disclosureSeen: user.aiDisclosureSeen,
  };
}

function aiPeriodResetDate(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

function acquireBurst(
  bursts: Map<number, number[]>,
  userId: number,
  max: number,
  now: Clock,
): boolean {
  const at = now().getTime();
  const recent = (bursts.get(userId) ?? []).filter((t) => t > at - 60_000);
  if (recent.length === 0) bursts.delete(userId);
  if (recent.length >= max) return false;
  recent.push(at);
  bursts.set(userId, recent);
  return true;
}

// ─── Request validation ─────────────────────────────────────────────────────

function parseMarkdownRequest(body: unknown): Parsed<MarkdownRequest> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: 'Send an instruction and a target.' };
  const instruction = instructionOrNull(record.instruction);
  if (instruction === null) {
    return { ok: false, error: 'Describe what you want changed.' };
  }
  const target = asRecord(record.target);
  if (!target) return { ok: false, error: 'Send an instruction and a target.' };
  const kind = target.kind;
  if (kind !== 'document' && kind !== 'selection') {
    return {
      ok: false,
      error: 'The target must be a selection or the document.',
    };
  }
  if (typeof target.text !== 'string') {
    return { ok: false, error: 'The target text is missing.' };
  }
  let context: string | null;
  if (record.context === undefined || record.context === null) {
    context = null;
  } else if (typeof record.context === 'string') {
    context = record.context;
  } else {
    return { ok: false, error: 'The context must be text.' };
  }
  return {
    ok: true,
    value: { instruction, targetKind: kind, targetText: target.text, context },
  };
}

function parseStylesheetRequest(body: unknown): Parsed<StylesheetRequest> {
  const record = asRecord(body);
  if (!record) {
    return { ok: false, error: 'Send an instruction and the stylesheet.' };
  }
  const instruction = instructionOrNull(record.instruction);
  if (instruction === null) {
    return { ok: false, error: 'Describe what you want changed.' };
  }
  if (typeof record.css !== 'string') {
    return { ok: false, error: 'The stylesheet text is missing.' };
  }
  return { ok: true, value: { instruction, css: record.css } };
}

function instructionOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_INSTRUCTION_CHARACTERS)
    return null;
  return trimmed;
}

// ─── The size ladder's first rungs (the full ladder lands in 07) ────────────

type SizeResult = { ok: true } | { ok: false; error: string };

/**
 * Re-derives the size decision from the shared estimator rather than trusting
 * the client's numbers (spec §The AI route module). Two caps apply: the
 * configured input-character cap, and the write cap — a target may be at most
 * about half the output budget in estimated tokens, so a reply can never be
 * asked for more text than the configured output cap allows.
 */
function sizeDecision(
  targetText: string,
  instruction: string,
  context: string | null,
  config: AiProviderConfig,
): SizeResult {
  const size = estimateAiSize(targetText);
  if (size.characters > config.maxInputCharacters) {
    return {
      ok: false,
      error: `That is about ${size.characters.toLocaleString('en-US')} characters, past the ${config.maxInputCharacters.toLocaleString('en-US')}-character limit for one AI Action. Select a smaller range.`,
    };
  }
  const writeCap = Math.floor(config.maxOutputTokens / 2);
  if (size.estimatedTokens > writeCap) {
    return {
      ok: false,
      error: `That is about ${size.estimatedTokens.toLocaleString('en-US')} tokens, past the limit one AI Action can rewrite. Select a smaller range.`,
    };
  }
  const sendTokens = estimateAiSize(
    `${instruction}${targetText}${context ?? ''}`,
  ).estimatedTokens;
  if (sendTokens + config.maxOutputTokens > config.contextWindow) {
    return {
      ok: false,
      error:
        'That passage and its context do not fit the model’s window for one AI Action. Select a smaller range.',
    };
  }
  return { ok: true };
}

// ─── The provider call, truncation, and the output contract ─────────────────

type ProviderResult =
  | { ok: true; value: { text: string; finishReason: string } }
  | { ok: false; response: Response };

async function callProvider(
  ai: AiContext,
  log: LogSink | undefined,
  request: Omit<AiCompletionRequest, 'apiKey'>,
): Promise<ProviderResult> {
  if (ai.apiKey === null) {
    // gateFor already refused an unconfigured instance; this is defensive.
    throw new Error('AI provider called without a key');
  }
  try {
    const value = await ai.provider.complete({ ...request, apiKey: ai.apiKey });
    return { ok: true, value };
  } catch (cause) {
    if (cause instanceof AiProviderError) {
      // Server-side only: the upstream body and code, never the prompt.
      log?.(
        `ai provider failure: code=${cause.code} status=${cause.status ?? '-'} detail=${cause.detail ?? '-'}`,
      );
    } else {
      log?.('ai provider failure: unknown error');
    }
    return {
      ok: false,
      response: Response.json(
        { error: PROVIDER_UNAVAILABLE, code: AI_ERROR_CODES.provider },
        { status: 502 },
      ),
    };
  }
}

type MarkdownProposalResult =
  | { ok: true; value: AiProposalResult }
  | { ok: false; code: string; error: string };

function markdownProposal(
  request: MarkdownRequest,
  reply: { text: string; finishReason: string },
): MarkdownProposalResult {
  if (isTruncatedFinishReason(reply.finishReason)) {
    return {
      ok: false,
      code: AI_ERROR_CODES.truncated,
      error: TRUNCATED_MESSAGE,
    };
  }
  if (reply.text.trim() === '') {
    return {
      ok: false,
      code: AI_ERROR_CODES.invalidResponse,
      error: UNUSABLE_MESSAGE,
    };
  }

  const direct =
    request.targetKind === 'selection' || request.targetText.trim() === '';
  if (direct) {
    const text = stripCodeFence(reply.text).trim();
    if (text === '') {
      return {
        ok: false,
        code: AI_ERROR_CODES.invalidResponse,
        error: UNUSABLE_MESSAGE,
      };
    }
    return { ok: true, value: { kind: 'replace', text } };
  }

  const parsed = parseAnchoredEdits(reply.text);
  if (!parsed.ok) {
    return {
      ok: false,
      code: AI_ERROR_CODES.invalidResponse,
      error: UNUSABLE_MESSAGE,
    };
  }
  // A proposal that cannot be applied is never offered — every anchor must
  // match exactly once, and a single failure refuses the whole change set.
  const applied = applyAnchoredEdits(request.targetText, parsed.edits);
  if (!applied.ok) {
    return {
      ok: false,
      code: AI_ERROR_CODES.invalidResponse,
      error: UNUSABLE_MESSAGE,
    };
  }
  return { ok: true, value: { kind: 'anchored', edits: parsed.edits } };
}

/**
 * A reply whose finish reason says it ran into the output cap was truncated:
 * it is an error, never a proposal, and consumes no allowance (spec §What the
 * model returns). Providers disagree on the spelling; match the common ones.
 */
function isTruncatedFinishReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized === 'length' ||
    normalized === 'max_tokens' ||
    normalized === 'max_output_tokens' ||
    normalized === 'max_completion_tokens'
  );
}

/** Strips one wrapping code fence the model may have added despite the contract. */
function stripCodeFence(text: string): string {
  const match = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return match ? match[1]! : text;
}

// ─── Success: count the action, record the disclosure, reply ────────────────

function finish(
  c: Context<AppEnv>,
  gate: GatePass,
  proposal: AiProposalResult,
  now: Clock,
): Response {
  const db = c.var.db;
  const nowDate = now();
  incrementAiUsage(db, gate.userId, nowDate);
  if (!gate.disclosureSeen) {
    db.update(users)
      .set({ aiDisclosureSeen: true })
      .where(eq(users.id, gate.userId))
      .run();
  }
  const remaining = aiUsageState(
    db,
    gate.userId,
    gate.entitlement,
    gate.limits,
    nowDate,
  ).remaining;
  return c.json({ proposal, remaining }, 200);
}
