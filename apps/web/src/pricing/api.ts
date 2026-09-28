// ─────────────────────────────────────────────────────────────────────────────
// The public catalog read (live-pricing/01): GET /api/pricing, the stored plan
// prices and plan limits the Admin panel's Settings holds. Same shape as
// billing/api.ts — a same-origin fetch, errors crossing this boundary as
// ApiError — and the one API client in the app that needs no session, because
// the pricing page is readable by someone who has never signed in.
//
// The stored per-duration figures arrive verbatim. The client does no price
// arithmetic, so a deliberate twelve-month discount is the Admin's to set and
// this module has no opinion about it.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, errorFrom, FALLBACK_CODE } from '../api/client';

export { ApiError };

export type PaidPlan = 'pro' | 'premium';
export type DurationMonths = 1 | 3 | 6 | 12;

export interface PlanPrice {
  monthly: number;
  /** Total per duration option, stored by the Admin. */
  durations: Record<DurationMonths, number>;
}
export type PlanPrices = Record<PaidPlan, PlanPrice>;

export interface PlanLimit {
  pageCap: number;
  quotaMonthly: number;
  /** Monthly AI Actions; zero disables AI Actions for the plan. */
  aiActionsMonthly: number;
}
export type PlanLimits = Record<PaidPlan, PlanLimit>;

/**
 * The endpoint's numbers, validated against the shape the pricing surfaces
 * render. A 200 carrying something else — a portal or proxy answering HTML, a
 * truncated body — becomes an ApiError the surfaces can show as unavailable,
 * rather than a `undefined` reaching a `.toFixed`.
 */
export async function getPricing(): Promise<{
  prices: PlanPrices;
  limits: PlanLimits;
}> {
  const res = await fetch('/api/pricing');
  if (!res.ok) throw await errorFrom(res);
  const body: unknown = await res.json().catch(() => null);
  const fields =
    typeof body === 'object' && body !== null
      ? (body as { prices?: unknown; limits?: unknown })
      : null;
  if (!isPrices(fields?.prices) || !isLimits(fields?.limits)) {
    throw new ApiError(
      'The prices came back in a shape this page can’t read.',
      res.status,
      FALLBACK_CODE,
    );
  }
  return { prices: fields.prices, limits: fields.limits };
}

/** A price or a positive limit: finite, and above zero. */
function isPositiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** A plan limit, or a price: a whole number. A price may be a decimal, so this
 *  is the limits side of the check only. */
function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/** The AI Allowance, where zero is legal — it disables AI for the plan. */
function isAllowance(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPrices(value: unknown): value is PlanPrices {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (['pro', 'premium'] as const).every((plan) => {
    const price = record[plan];
    if (typeof price !== 'object' || price === null) return false;
    const { monthly, durations } = price as Record<string, unknown>;
    if (!isPositiveAmount(monthly)) return false;
    if (typeof durations !== 'object' || durations === null) return false;
    const byDuration = durations as Record<string, unknown>;
    return ([1, 3, 6, 12] as const).every((months) =>
      isPositiveAmount(byDuration[String(months)]),
    );
  });
}

function isLimits(value: unknown): value is PlanLimits {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (['pro', 'premium'] as const).every((plan) => {
    const limit = record[plan];
    if (typeof limit !== 'object' || limit === null) return false;
    const { pageCap, quotaMonthly, aiActionsMonthly } = limit as Record<
      string,
      unknown
    >;
    return (
      isCount(pageCap) && isCount(quotaMonthly) && isAllowance(aiActionsMonthly)
    );
  });
}
