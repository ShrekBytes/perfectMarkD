// ─────────────────────────────────────────────────────────────────────────────
// The instance's and the caller's AI state (spec §Data model and the account
// endpoint). One module computes the AI block GET /api/me reports and the
// per-user count the Admin panel shows, so "included", "remaining", and the
// allowance can't drift between what the user sees and what support sees.
//
// Usage lives in `ai_usage` keyed by the UTC `YYYY-MM` period, mirroring the
// Server Export counter — and deliberately separate from it: one feature's
// bookkeeping never depends on the other's.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/database.js';
import {
  aiUsage,
  type AiProviderConfig,
  type Plan,
  type PlanLimits,
} from '../db/schema.js';
import {
  isEntitlementActive,
  usagePeriod,
  type EntitlementLike,
} from '../quota.js';

export interface AiUsageState {
  /** UTC `YYYY-MM`, the same period shape as Server Export usage. */
  period: string;
  /** AI Actions counted this period. */
  used: number;
  /** The plan's monthly AI Allowance while the Entitlement is active; 0 otherwise. */
  allowance: number;
  /** Allowance minus usage, floored at zero. */
  remaining: number;
}

export function aiUsageState(
  db: AppDatabase,
  userId: number,
  entitlement: EntitlementLike,
  limits: PlanLimits,
  now: Date,
): AiUsageState {
  const period = usagePeriod(now);
  const row = db
    .select({ count: aiUsage.count })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.period, period)))
    .get();
  const used = row?.count ?? 0;
  const activeEntitlement = isEntitlementActive(entitlement, now)
    ? entitlement
    : null;
  const allowance = activeEntitlement
    ? (limits[activeEntitlement.plan as Plan]?.aiActionsMonthly ?? 0)
    : 0;
  return { period, used, allowance, remaining: Math.max(0, allowance - used) };
}

/** The first instant of the next UTC month — when the period resets. */
export function aiPeriodResetAt(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Whether this instance can serve AI at all: the kill switch on, a model
 * chosen, and a key in the environment. Either missing means the commands do
 * not exist for anyone — and no upsell appears (spec §Gate precedence).
 */
export function aiConfigured(
  config: AiProviderConfig,
  apiKey: string | null,
): boolean {
  return config.enabled && config.model !== '' && apiKey !== null;
}

/** The `ai` block of GET /api/me: the client's only source of AI state. */
export interface AiAccountState {
  /** The instance is configured and the kill switch is on. */
  configured: boolean;
  /** The caller's active plan includes AI Actions (`aiActionsMonthly > 0`). */
  included: boolean;
  /** The caller's AI Access switch (CONTEXT.md); true by default. */
  access: boolean;
  /** Whether the once-per-account first-use disclosure has been shown. */
  disclosureSeen: boolean;
  /** The character cap one AI Action may send (spec §scope and size). */
  maxInputCharacters: number;
  /** The AI Allowance this period's plan grants; zero without a plan. */
  allowance: number;
  remaining: number;
  period: string;
  /** ISO instant the period resets. */
  resetsAt: string;
}

export function aiAccountState({
  db,
  userId,
  apiKey,
  access,
  disclosureSeen,
  entitlement,
  limits,
  config,
  now,
}: {
  db: AppDatabase;
  userId: number;
  apiKey: string | null;
  access: boolean;
  disclosureSeen: boolean;
  entitlement: EntitlementLike;
  limits: PlanLimits;
  config: AiProviderConfig;
  now: Date;
}): AiAccountState {
  const usage = aiUsageState(db, userId, entitlement, limits, now);
  return {
    configured: aiConfigured(config, apiKey),
    included: usage.allowance > 0,
    access,
    disclosureSeen,
    maxInputCharacters: config.maxInputCharacters,
    allowance: usage.allowance,
    remaining: usage.remaining,
    period: usage.period,
    resetsAt: aiPeriodResetAt(now).toISOString(),
  };
}

/**
 * Counts one AI Action against the caller's current period. Called by the
 * route only when a usable proposal is produced (spec §AI is a paid
 * capability): refusals, provider failures, truncation, and unusable replies
 * never reach this, so a user is charged only for results they received.
 */
export function incrementAiUsage(
  db: AppDatabase,
  userId: number,
  now: Date,
): void {
  const period = usagePeriod(now);
  db.insert(aiUsage)
    .values({ userId, period, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.period],
      set: { count: sql`${aiUsage.count} + 1` },
    })
    .run();
}
