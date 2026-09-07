/**
 * The plan catalog — the single source of truth for plan features and prices
 * (PLAN.md §1 tiers table). Phase 2's billing workstream feeds the same shape
 * from admin settings instead of these constants; both the /pricing page and
 * the pricing modal render exclusively from this module, so the swap needs no
 * redesign. Values match the plan table verbatim: `true`/`false` render as
 * included/not-included marks, strings render as-is (quotas, "never").
 */

export type PlanId = 'free' | 'pro' | 'premium';

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USDT; null for the free plan. */
  priceMonthlyUsdt: number | null;
  /** One-line summary shown under the price. */
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthlyUsdt: null,
    blurb: 'Write, preview, and print perfect PDFs. No account.',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUsdt: 3,
    blurb: 'One-click Server Export for everyday documents.',
  },
  {
    id: 'premium',
    name: 'Premium',
    priceMonthlyUsdt: 7,
    blurb: 'High volume, priority rendering, and export history.',
  },
];

export interface FeatureRow {
  label: string;
  values: Record<PlanId, string | boolean>;
}

/** Display price for a plan column header. */
export function formatPrice(plan: Plan): string {
  return plan.priceMonthlyUsdt === null
    ? 'Free'
    : `${plan.priceMonthlyUsdt} USDT/mo`;
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
    values: { free: 'never', pro: '300/mo', premium: '1000/mo' },
  },
  {
    label: 'Pages per server export',
    values: { free: false, pro: '300', premium: '1000' },
  },
  {
    label: 'Custom page size',
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
    values: { free: false, pro: false, premium: true },
  },
  {
    label: 'Export History (30 days)',
    values: { free: false, pro: false, premium: true },
  },
];

/**
 * Manual crypto billing (ADR-0005): no card processor, no auto-renewal. Phase 2
 * renders the real Order flow from this; the copy already matches it.
 */
export const DURATION_NOTE =
  'Paid plans run 1, 3, 6, or 12 months — 12 months costs 10× (two months free). ' +
  'Payments are manual crypto (USDT or Litecoin), verified by hand. Nothing auto-renews.';

/**
 * Phase 1 has no accounts, so every paid CTA renders as an inert "coming
 * soon" — this flag drives both the CTA in PlanComparison and the coming-soon
 * notes on the page and modal. Phase 2's billing workstream flips it to true
 * and wires the upgrade flow into the same components.
 */
export const BILLING_LIVE = false;

/** Shared Phase-1 note (page + modal); hidden once BILLING_LIVE flips. */
export const COMING_SOON_NOTE =
  'Payments are launching soon — paid plans cannot be purchased yet.';
