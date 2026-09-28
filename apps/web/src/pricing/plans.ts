/**
 * The plan catalog — everything about a plan that is not a number: ids, names,
 * blurbs, the feature-row labels and their group boundaries, the plan-facts
 * prose, the duration options, and the display notes.
 *
 * No prices and no limits live here. Those are the Admin panel's, in admin
 * settings, and reach the surfaces through `GET /api/pricing` (live-pricing/01)
 * so a price changed in Settings is the price a customer reads and is charged.
 * The numbers are displayed through the helpers below and never computed here:
 * the endpoint returns the stored per-duration values verbatim, which is what
 * keeps a deliberate twelve-month discount expressible.
 *
 * A feature cell is one of three things: a string that is already the whole
 * answer, a boolean that renders as included/not-included, or a `LimitRef`
 * naming the stored limit the response fills it from.
 */

import type { DurationMonths, PlanLimits, PlanPrices } from './api';

export type { DurationMonths };

export type PlanId = 'free' | 'pro' | 'premium';
export type PaidPlanId = 'pro' | 'premium';

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    blurb: 'Write, preview, and print perfect PDFs. No account.',
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'One-click Server Export for everyday documents.',
  },
  {
    id: 'premium',
    name: 'Premium',
    blurb: 'High volume, priority rendering, and export history.',
  },
];

/** What a price or a limit figure reads as once the pricing read has failed.
 *  Every surface renders this same word, so no two of them describe one state
 *  differently and no surface can imply a number it does not have. */
export const PRICE_UNAVAILABLE = 'Unavailable';

/**
 * A feature cell whose number comes from the pricing response: which stored
 * limit fills it, and whether it reads as a monthly allowance. `zeroExcluded`
 * is for the AI Allowance, where zero is a legal setting meaning AI Actions are
 * off for the plan — so the cell reads as not-included rather than "0/mo".
 */
export interface LimitRef {
  limit: 'quotaMonthly' | 'pageCap' | 'aiActionsMonthly';
  perMonth?: boolean;
  zeroExcluded?: boolean;
}

export type FeatureValue = string | boolean | LimitRef;

export interface FeatureRow {
  label: string;
  values: Record<PlanId, FeatureValue>;
  /** Starts a visually separated group of rows in the comparison table. */
  groupStart?: boolean;
}

export const FEATURE_ROWS: FeatureRow[] = [
  {
    label: 'Account',
    values: { free: 'None', pro: 'Required', premium: 'Required' },
  },
  {
    label: 'Client Export (print dialog)',
    values: { free: true, pro: true, premium: true },
  },
  {
    label: 'Server Export (one-click PDF)',
    values: {
      free: 'never',
      pro: { limit: 'quotaMonthly', perMonth: true },
      premium: { limit: 'quotaMonthly', perMonth: true },
    },
  },
  {
    label: 'Pages per server export',
    values: {
      free: false,
      pro: { limit: 'pageCap' },
      premium: { limit: 'pageCap' },
    },
  },
  {
    label: 'AI Allowance',
    values: {
      free: false,
      pro: { limit: 'aiActionsMonthly', perMonth: true, zeroExcluded: true },
      premium: {
        limit: 'aiActionsMonthly',
        perMonth: true,
        zeroExcluded: true,
      },
    },
  },
  {
    label: 'Custom page size',
    groupStart: true,
    values: { free: false, pro: true, premium: true },
  },
  {
    label: 'Custom stylesheet',
    values: { free: false, pro: true, premium: true },
  },
  {
    label: 'Header/footer banner images',
    values: { free: false, pro: true, premium: true },
  },
  {
    label: 'Background image',
    values: { free: false, pro: true, premium: true },
  },
  {
    label: 'Custom fonts (load/upload)',
    values: { free: false, pro: true, premium: true },
  },
  {
    label: 'Priority render queue',
    groupStart: true,
    values: { free: false, pro: false, premium: true },
  },
  {
    label: 'Export History (30 days)',
    values: { free: false, pro: false, premium: true },
  },
];

/**
 * Plan-facts prose for the pricing modal, kept beside the matrix it must
 * match: the gated styling rows and the four ways Pro and Premium differ
 * (CONTEXT.md — quota, page caps, queue priority, Export History). Update
 * this with the table, not independently.
 */
export const PAID_PLANS_PITCH =
  'Pro and Premium both unlock every paid feature — custom page sizes, ' +
  'stylesheets, fonts, and images included. Premium raises the Server ' +
  'Export quota and page cap, and adds the priority render queue and ' +
  '30-day Export History.';

/** The free tier's untouched Client Export, promised under the modal's table. */
export const CLIENT_EXPORT_NOTE =
  'Client Export keeps working exactly as it does now.';

/**
 * Manual crypto billing (ADR-0005): no card processor, no auto-renewal —
 * payments in USDT or Litecoin, verified by hand. The instruments are named
 * because they are what the customer actually sends; the plan prices above are
 * shown in dollars as the same numeral.
 *
 * No multiple is promised here, deliberately. The twelve-month price is a
 * stored figure the Admin sets like any other, so the 10× (two months free) the
 * seed happens to use is a pricing decision, not a rule this text may assert.
 */
export const DURATION_NOTE =
  'Paid plans run 1, 3, 6, or 12 months — longer terms are priced to save. ' +
  'Payments are manual crypto (USDT or Litecoin), verified by hand. Nothing auto-renews.';

/** The Order duration options. Their prices are per-duration figures the
 *  Admin stores, not a multiple computed here. */
export const DURATIONS: readonly DurationMonths[] = [1, 3, 6, 12];

/** Display name for a plan id ("Free", "Pro", "Premium"). */
export function planName(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.name ?? planId;
}

/**
 * The one money formatter every catalog surface renders a plan price with: a
 * whole amount without decimals, anything else with two. No locale
 * formatting — the app has none today and this introduces none.
 */
export function formatPrice(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/**
 * The price line under a plan name in the comparison table: the stored monthly
 * price, or `Free`. Null until the response has landed, so no surface ever
 * paints a price it has not read.
 */
export function planPriceLabel(
  planId: PlanId,
  prices: PlanPrices | null,
): string | null {
  if (planId === 'free') return 'Free';
  if (!prices) return null;
  return `${formatPrice(prices[planId].monthly)}/mo`;
}

/** The stored total for a plan + duration, already formatted; null while
 *  unknown. The stored figure, not months × a monthly rate. */
export function durationPriceLabel(
  planId: PaidPlanId,
  months: DurationMonths,
  prices: PlanPrices | null,
): string | null {
  if (!prices) return null;
  return formatPrice(prices[planId].durations[months]);
}

/**
 * What a comparison cell shows: the row's own text, the boolean the renderer
 * turns into an included/not-included mark, or the stored limit read out of
 * the response. A limit cell is `null` while the numbers are in flight, which
 * is what keeps a stale figure from being painted — the caller renders `null`
 * as nothing at all, or as unavailable once the read has failed.
 */
export function featureCellText(
  value: FeatureValue,
  planId: PlanId,
  limits: PlanLimits | null,
): string | boolean | null {
  if (typeof value !== 'object') return value;
  // The Free Tier has no stored limit, so its cells are always the static text
  // the row carries; a paid plan's cell has nothing to read until the response
  // lands.
  if (planId === 'free' || limits === null) return null;
  const amount = limits[planId][value.limit];
  if (value.zeroExcluded && amount === 0) return false;
  return value.perMonth ? `${amount}/mo` : `${amount}`;
}
