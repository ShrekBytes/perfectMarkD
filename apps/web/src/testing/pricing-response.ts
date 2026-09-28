// The GET /api/pricing payload the pricing-surface tests stub (live-pricing/01).
//
// Deliberately unlike the seeded values (Pro 3 / Premium 7, 300 / 1000 limits) so
// a hardcoded price or limit reaching a client surface fails the suite instead
// of passing on the defaults. Pro's twelve months is 47 at a 4.5 monthly rate —
// a deliberate discount no client arithmetic could produce, and the check that
// the per-duration figures are read rather than derived.
//
// One payload for every suite, so the stubs cannot drift from each other (the
// same reason `json-response.ts` exists). Plain data and no `vi`: the Playwright
// specs build their route from it too, which is why nothing here imports vitest.

export const PRICING_RESPONSE = {
  prices: {
    pro: { monthly: 4.5, durations: { 1: 4.5, 3: 13, 6: 26, 12: 47 } },
    premium: { monthly: 9, durations: { 1: 9, 3: 27, 6: 53, 12: 90 } },
  },
  limits: {
    pro: { pageCap: 500, quotaMonthly: 450, aiActionsMonthly: 150 },
    premium: { pageCap: 2500, quotaMonthly: 2400, aiActionsMonthly: 800 },
  },
};

/** The body a failed pricing read answers with, for the unavailable state. */
export const PRICING_FAILURE = { error: 'Something went wrong.' };
