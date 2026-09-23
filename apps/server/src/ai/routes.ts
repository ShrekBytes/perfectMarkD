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
  aiBudgets,
  applyAnchoredEdits,
  checkAiSendSize,
  parseAiPlan,
  parseAnchoredEdits,
  planBriefText,
  MAX_AI_PLAN_STEPS,
  type AiPlanStep,
  type AiSizeRefusal,
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
import {
  buildMarkdownMessages,
  buildPlanMessages,
  buildStylesheetMessages,
  replayHistory,
  type AiPlanBrief,
  type StylesheetHistoryTurn,
} from './prompts.js';

export interface AiRoutesOptions {
  /** The environment key and the provider seam. */
  ai: AiContext;
  now: Clock;
  /** Server-side log line for provider failures; defaults to silence. */
  log?: LogSink;
}

/** One AI Proposal as the route returns it. Anchored edits target a whole
 *  Document; `replace` is a selection, an empty-Document generation, or a
 *  whole stylesheet; `plan` is the approved work list a large Document is
 *  broken into before any of it runs (spec §Tier 2). */
export type AiProposalResult =
  | { kind: 'anchored'; edits: AnchoredEdit[] }
  | { kind: 'replace'; text: string }
  | { kind: 'plan'; steps: AiPlanStep[] };

/** How long a user instruction may be; it is advisory text, not data. */
const MAX_INSTRUCTION_CHARACTERS = 4_000;

/** How many sections a plan request may name; a plan is a work list, not a
 *  transcription of the Document. */
const MAX_PLAN_SECTIONS = 500;

const PROVIDER_UNAVAILABLE =
  'The AI is unavailable right now. Try again in a moment.';
const TRUNCATED_MESSAGE =
  'The reply was cut off before it finished. Try again, or work on a smaller selection.';
const UNUSABLE_MESSAGE =
  'The AI did not return a usable result. Try again, or work on a smaller selection.';
const PLAN_UNUSABLE_MESSAGE =
  'The AI did not return a usable plan. Try again, or work on a smaller range.';

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
  mode: 'edit';
  instruction: string;
  targetKind: 'document' | 'selection';
  targetText: string;
  context: string | null;
  /** The approved plan, when this is one step of an AI Plan run. */
  plan: AiPlanBrief | null;
}

/**
 * A plan request (spec §Tier 2): the instruction and the outline digest, and
 * nothing else. The Document is never sent to build a plan; the section labels
 * ride along so the reply can be refused when it names a section nobody has,
 * rather than offering a plan with steps that cannot run.
 */
interface PlanRequest {
  mode: 'plan';
  instruction: string;
  outline: string;
  sections: string[];
}

type MarkdownBody = MarkdownRequest | PlanRequest;

interface StylesheetRequest {
  instruction: string;
  css: string;
  /** The earlier turns the client replayed, oldest first. */
  history: StylesheetHistoryTurn[];
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

    const budgets = aiBudgets(gate.config);
    const request = parsed.value;

    if (request.mode === 'plan') {
      const sized = checkAiSendSize({
        instruction: request.instruction,
        targetText: '',
        context: request.outline,
        budgets,
      });
      if (!sized.ok) return tooLong(c, sized.refusal);

      if (!acquireBurst(bursts, gate.userId, gate.config.burstPerMinute, now)) {
        return burstResponse(c);
      }

      const reply = await callProvider(ai, log, {
        baseUrl: gate.config.baseUrl,
        model: gate.config.model,
        messages: buildPlanMessages({
          instruction: request.instruction,
          outline: request.outline,
        }),
        maxOutputTokens: gate.config.maxOutputTokens,
        reasoningEffort: gate.config.reasoningEffort,
        timeoutMs: gate.config.timeoutSeconds * 1000,
      });
      if (!reply.ok) return reply.response;

      const plan = planProposal(reply.value, request.sections);
      if (!plan.ok) {
        return c.json({ error: plan.error, code: plan.code }, 502);
      }
      return finish(c, gate, plan.value, now);
    }

    const brief = request.plan === null ? null : planBriefText(request.plan);
    const sized = checkAiSendSize({
      instruction: request.instruction,
      targetText: request.targetText,
      context: request.context,
      brief,
      budgets,
    });
    if (!sized.ok) return tooLong(c, sized.refusal);

    if (!acquireBurst(bursts, gate.userId, gate.config.burstPerMinute, now)) {
      return burstResponse(c);
    }

    const reply = await callProvider(ai, log, {
      baseUrl: gate.config.baseUrl,
      model: gate.config.model,
      messages: buildMarkdownMessages({
        instruction: request.instruction,
        targetKind: request.targetKind,
        targetText: request.targetText,
        context: request.context,
        plan: request.plan,
      }),
      maxOutputTokens: gate.config.maxOutputTokens,
      reasoningEffort: gate.config.reasoningEffort,
      timeoutMs: gate.config.timeoutSeconds * 1000,
    });
    if (!reply.ok) return reply.response;

    const proposal = markdownProposal(request, reply.value);
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

    const sized = checkAiSendSize({
      instruction: parsed.value.instruction,
      targetText: parsed.value.css,
      context: historyText(parsed.value.history),
      budgets: aiBudgets(gate.config),
    });
    if (!sized.ok) return tooLong(c, sized.refusal);

    if (!acquireBurst(bursts, gate.userId, gate.config.burstPerMinute, now)) {
      return burstResponse(c);
    }

    // A stylesheet edit is short, so the Admin may point it at a cheaper model.
    const model = gate.config.stylesheetModel ?? gate.config.model;
    const reply = await callProvider(ai, log, {
      baseUrl: gate.config.baseUrl,
      model,
      messages: buildStylesheetMessages({
        instruction: parsed.value.instruction,
        css: parsed.value.css,
        history: parsed.value.history,
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

function parseMarkdownRequest(body: unknown): Parsed<MarkdownBody> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: 'Send an instruction and a target.' };
  const instruction = instructionOrNull(record.instruction);
  if (instruction === null) {
    return { ok: false, error: 'Describe what you want changed.' };
  }
  if (record.mode === 'plan') {
    if (typeof record.outline !== 'string' || record.outline.trim() === '') {
      return { ok: false, error: 'The outline is missing.' };
    }
    const sections = parseSectionLabels(record.sections);
    if (!sections.ok) return { ok: false, error: sections.error };
    return {
      ok: true,
      value: {
        mode: 'plan',
        instruction,
        outline: record.outline,
        sections: sections.value,
      },
    };
  }
  if (record.mode !== undefined && record.mode !== 'edit') {
    return { ok: false, error: 'The mode must be an edit or a plan.' };
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
  const plan = parsePlanBrief(record.plan);
  if (!plan.ok) return { ok: false, error: plan.error };
  return {
    ok: true,
    value: {
      mode: 'edit',
      instruction,
      targetKind: kind,
      targetText: target.text,
      context,
      plan: plan.value,
    },
  };
}

/**
 * The section labels a plan reply is validated against: the headings the
 * client's own section list carries, in order. The server never sees the
 * Document, so the labels are the only thing that can tell it whether a step
 * names a section that exists.
 */
function parseSectionLabels(value: unknown): Parsed<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'The plan must list the document’s sections.' };
  }
  if (value.length === 0 || value.length > MAX_PLAN_SECTIONS) {
    return { ok: false, error: 'The plan must list the document’s sections.' };
  }
  const labels: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length > 500) {
      return { ok: false, error: 'The section list is malformed.' };
    }
    labels.push(entry);
  }
  return { ok: true, value: labels };
}

/**
 * The approved plan a step request carries. It rides into the prompt as the
 * shared brief that keeps a long run consistent (spec §Tier 2), so a malformed
 * one is refused rather than ignored.
 */
function parsePlanBrief(value: unknown): Parsed<AiPlanBrief | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  const record = asRecord(value);
  const malformed = { ok: false as const, error: 'The plan is malformed.' };
  if (!record || !Number.isInteger(record.index)) return malformed;
  const index = record.index as number;
  if (!Array.isArray(record.steps)) return malformed;
  if (record.steps.length === 0 || record.steps.length > MAX_AI_PLAN_STEPS) {
    return malformed;
  }
  if (index < 0 || index >= record.steps.length) return malformed;
  const steps: AiPlanBrief['steps'] = [];
  for (const entry of record.steps) {
    const step = asRecord(entry);
    if (!step || typeof step.change !== 'string') return malformed;
    if (step.heading !== null && typeof step.heading !== 'string') {
      return malformed;
    }
    steps.push({
      heading: (step.heading as string | null) ?? null,
      change: step.change,
    });
  }
  return { ok: true, value: { index, steps } };
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
  const history = parseStylesheetHistory(record.history);
  if (!history.ok) return { ok: false, error: history.error };
  return {
    ok: true,
    value: { instruction, css: record.css, history: history.value },
  };
}

/**
 * The conversation the client replayed (spec §Where the stylesheet lives). More
 * turns than are replayed are accepted and trimmed by `replayHistory`, the one
 * place the rule lives; a turn that is not an instruction plus a reply is a
 * malformed request.
 */
function parseStylesheetHistory(
  value: unknown,
): Parsed<StylesheetHistoryTurn[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: 'The conversation history must be a list.' };
  }
  const malformed = {
    ok: false as const,
    error: 'The conversation history is malformed.',
  };
  const turns: StylesheetHistoryTurn[] = [];
  for (const entry of value) {
    const turn = asRecord(entry);
    if (turn === null) return malformed;
    const instruction = instructionOrNull(turn.instruction);
    if (instruction === null || typeof turn.reply !== 'string') {
      return malformed;
    }
    turns.push({ instruction, reply: turn.reply });
  }
  return { ok: true, value: turns };
}

/** The history as the size estimator sees it: instruction plus reply. */
function historyText(history: StylesheetHistoryTurn[]): string | null {
  const replayed = replayHistory(history);
  if (replayed.length === 0) return null;
  return replayed.map((turn) => `${turn.instruction}${turn.reply}`).join('');
}

function instructionOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_INSTRUCTION_CHARACTERS)
    return null;
  return trimmed;
}

// ─── The size ladder, re-derived ────────────────────────────────────────────

/**
 * The refusal a request that does not fit gets: the shared ladder's own
 * message, stating the size, the cap, and the path forward. The server
 * re-derives it from the payload it received, so a client that under-reports a
 * size is refused rather than believed (spec §The AI route module).
 */
function tooLong(c: Context<AppEnv>, refusal: AiSizeRefusal): Response {
  return c.json(
    {
      error: refusal.message,
      code: AI_ERROR_CODES.inputTooLong,
      refusal: refusal.code,
    },
    413,
  );
}

function burstResponse(c: Context<AppEnv>): Response {
  return c.json(
    {
      error: 'Too many at once — try again shortly.',
      code: AI_ERROR_CODES.burst,
    },
    429,
  );
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
 * Turns a plan reply into the steps the user approves. The reply is validated
 * against the section labels the client sent, so a plan that names a section
 * nobody has is refused whole — a plan with a step that cannot run is not
 * offered, and a refused reply consumes no allowance.
 */
function planProposal(
  reply: { text: string; finishReason: string },
  labels: readonly string[],
): MarkdownProposalResult {
  if (isTruncatedFinishReason(reply.finishReason)) {
    return {
      ok: false,
      code: AI_ERROR_CODES.truncated,
      error: TRUNCATED_MESSAGE,
    };
  }
  const parsed = parseAiPlan(reply.text, labels);
  if (!parsed.ok) {
    return {
      ok: false,
      code: AI_ERROR_CODES.invalidResponse,
      error: PLAN_UNUSABLE_MESSAGE,
    };
  }
  return { ok: true, value: { kind: 'plan', steps: parsed.steps } };
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
