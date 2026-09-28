import { describe, expect, it } from 'vitest';
import {
  CLIENT_EXPORT_NOTE,
  DURATION_NOTE,
  DURATIONS,
  FEATURE_ROWS,
  PAID_PLANS_PITCH,
  PLANS,
  durationPriceLabel,
  featureCellText,
  formatPrice,
  planPriceLabel,
  type PlanId,
} from './plans';
import type { PlanLimits, PlanPrices } from './api';

const PRICES: PlanPrices = {
  pro: { monthly: 3, durations: { 1: 3, 3: 9, 6: 18, 12: 30 } },
  premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
};

const LIMITS: PlanLimits = {
  pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
  premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
};

const valuesFor = (plan: PlanId) =>
  FEATURE_ROWS.map((row) => ({
    label: row.label,
    value: featureCellText(row.values[plan], plan, LIMITS),
  }));

describe('plan catalog (PLAN.md §1 tiers table)', () => {
  it('lists Free, Pro, and Premium, and holds no prices', () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(['free', 'pro', 'premium']);
    // The catalog is the display layer only: a price or limit here would be a
    // second place to change one (live-pricing/01).
    for (const plan of PLANS) {
      expect(plan).not.toHaveProperty('priceMonthlyUsdt');
    }
  });

  it('gives every feature row a value for every plan', () => {
    for (const row of FEATURE_ROWS) {
      for (const plan of PLANS) {
        expect(row.values[plan.id], `${row.label} × ${plan.id}`).toBeDefined();
        // Every cell resolves to something renderable once the numbers land.
        expect(
          featureCellText(row.values[plan.id], plan.id, LIMITS),
          `${row.label} × ${plan.id}`,
        ).not.toBeNull();
      }
    }
  });

  it('keeps Client Export free on every plan', () => {
    const row = FEATURE_ROWS.find((r) => r.label.startsWith('Client Export'));
    expect(row).toBeDefined();
    expect(row!.values).toEqual({ free: true, pro: true, premium: true });
  });

  it('labels the AI Allowance row with the glossary term, not a restatement of it', () => {
    // CONTEXT.md: the term is "AI Allowance"; the parenthetical restatement the
    // table used to invite is the glossary's own definition, which the term
    // already carries.
    const row = FEATURE_ROWS.find((r) => r.label === 'AI Allowance');
    expect(row).toBeDefined();
    expect(row!.label).toBe('AI Allowance');
  });

  it('caps Server Export at the response Quotas and never on Free', () => {
    const row = FEATURE_ROWS.find((r) => r.label.startsWith('Server Export'));
    expect(valuesFor('free')).toContainEqual({
      label: expect.stringMatching(/^Server Export/),
      value: 'never',
    });
    expect(featureCellText(row!.values.pro, 'pro', LIMITS)).toBe('300/mo');
    expect(featureCellText(row!.values.premium, 'premium', LIMITS)).toBe(
      '1000/mo',
    );
  });

  it('takes the page cap and the AI Allowance from the response too', () => {
    const cap = FEATURE_ROWS.find((r) => r.label.startsWith('Pages per'));
    const ai = FEATURE_ROWS.find((r) => r.label === 'AI Allowance');
    expect(ai).toBeDefined();
    expect(featureCellText(cap!.values.pro, 'pro', LIMITS)).toBe('300');
    expect(featureCellText(ai!.values.pro, 'pro', LIMITS)).toBe('100/mo');
    expect(featureCellText(ai!.values.premium, 'premium', LIMITS)).toBe(
      '300/mo',
    );
    // A changed limit reaches the table with nothing else edited.
    const raised: PlanLimits = {
      pro: { pageCap: 500, quotaMonthly: 450, aiActionsMonthly: 150 },
      premium: { pageCap: 2500, quotaMonthly: 2400, aiActionsMonthly: 800 },
    };
    expect(featureCellText(cap!.values.pro, 'pro', raised)).toBe('500');
    expect(featureCellText(ai!.values.premium, 'premium', raised)).toBe(
      '800/mo',
    );
  });

  it('reads a zero AI Allowance as not included, since zero disables AI', () => {
    const ai = FEATURE_ROWS.find((r) => r.label === 'AI Allowance')!;
    const none: PlanLimits = {
      pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 0 },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    };
    expect(featureCellText(ai.values.pro, 'pro', none)).toBe(false);
  });

  it('renders no number for a limit cell before the response has landed', () => {
    const cap = FEATURE_ROWS.find((r) => r.label.startsWith('Pages per'))!;
    expect(featureCellText(cap.values.pro, 'pro', null)).toBeNull();
    // The static cells are unaffected: a name paints on first paint.
    const account = FEATURE_ROWS.find((r) => r.label === 'Account')!;
    expect(featureCellText(account.values.pro, 'pro', null)).toBe('Required');
  });

  it('marks the gated styling features as Pro and above', () => {
    const gated = [
      'Custom page size',
      'Custom stylesheet',
      'Header/footer banner images',
      'Background image',
      'Custom fonts (load/upload)',
    ];
    for (const label of gated) {
      const row = FEATURE_ROWS.find((r) => r.label === label);
      expect(row, label).toBeDefined();
      expect(row!.values).toEqual({ free: false, pro: true, premium: true });
    }
  });

  it('reserves queue priority and Export History for Premium', () => {
    for (const label of ['Priority render queue', 'Export History (30 days)']) {
      const row = FEATURE_ROWS.find((r) => r.label === label);
      expect(row, label).toBeDefined();
      expect(row!.values).toEqual({ free: false, pro: false, premium: true });
    }
  });

  it('marks the gated-styling and Premium-only blocks as group starts', () => {
    const groupStarts = FEATURE_ROWS.filter((r) => r.groupStart);
    expect(groupStarts.map((r) => r.label)).toEqual([
      'Custom page size',
      'Priority render queue',
    ]);
  });
});

describe('plan-facts copy (kept beside the matrix)', () => {
  it('names the gated features and all four Pro/Premium differences', () => {
    // CONTEXT.md: Pro and Premium differ in quota, page caps, queue
    // priority, and Export History — the pitch must not flatten that.
    expect(PAID_PLANS_PITCH).toMatch(/unlock every paid feature/);
    expect(PAID_PLANS_PITCH).toMatch(/page sizes, stylesheets, fonts/);
    expect(PAID_PLANS_PITCH).toMatch(/quota/);
    expect(PAID_PLANS_PITCH).toMatch(/page cap/);
    expect(PAID_PLANS_PITCH).toMatch(/priority render queue/i);
    expect(PAID_PLANS_PITCH).toMatch(/Export History/);
  });

  it('keeps the Client Export reassurance', () => {
    expect(CLIENT_EXPORT_NOTE).toMatch(/Client Export keeps working/);
  });
});

describe('billing (ADR-0005 manual crypto)', () => {
  it('documents the manual crypto duration options', () => {
    expect(DURATION_NOTE).toMatch(/1.*3.*6.*12 months/);
    expect(DURATION_NOTE).toMatch(/auto-renew/i);
    // No multiple is promised: the twelve-month price is a stored figure, so
    // copy asserting 10× would contradict a deliberate discount the moment an
    // Admin sets one.
    expect(DURATION_NOTE).not.toMatch(/10×|ten times|10 times/i);
  });

  it('offers the four Order durations', () => {
    expect(DURATIONS).toEqual([1, 3, 6, 12]);
  });
});

describe('the money formatter', () => {
  it('leaves a whole amount without decimals and gives anything else two', () => {
    expect(formatPrice(3)).toBe('$3');
    expect(formatPrice(30)).toBe('$30');
    expect(formatPrice(3.5)).toBe('$3.50');
    expect(formatPrice(4.25)).toBe('$4.25');
  });

  it('formats a plan header price, and Free for the free plan', () => {
    expect(planPriceLabel('pro', PRICES)).toBe('$3/mo');
    expect(planPriceLabel('premium', PRICES)).toBe('$7/mo');
    expect(planPriceLabel('free', null)).toBe('Free');
    // No price before the response lands: nothing is painted rather than a
    // figure that is about to change.
    expect(planPriceLabel('pro', null)).toBeNull();
  });
});

describe('duration prices are read, never computed', () => {
  it('renders the stored per-duration figures verbatim', () => {
    expect(durationPriceLabel('pro', 1, PRICES)).toBe('$3');
    expect(durationPriceLabel('pro', 12, PRICES)).toBe('$30');
    expect(durationPriceLabel('premium', 12, PRICES)).toBe('$70');
  });

  it('passes a deliberate twelve-month discount through unchanged', () => {
    const discounted: PlanPrices = {
      pro: { monthly: 3, durations: { 1: 3, 3: 9, 6: 18, 12: 27 } },
      premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 63 } },
    };
    // Nine times monthly, not ten: the client has no opinion about it.
    expect(durationPriceLabel('pro', 12, discounted)).toBe('$27');
    expect(durationPriceLabel('premium', 12, discounted)).toBe('$63');
  });

  it('reads no price at all before the response lands', () => {
    expect(durationPriceLabel('pro', 1, null)).toBeNull();
  });
});
