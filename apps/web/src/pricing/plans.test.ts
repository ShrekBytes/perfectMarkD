import { describe, expect, it } from 'vitest';
import {
  CLIENT_EXPORT_NOTE,
  DURATION_NOTE,
  DURATIONS,
  FEATURE_ROWS,
  PAID_PLANS_PITCH,
  PLANS,
  priceForDuration,
  type PlanId,
} from './plans';

const valuesFor = (plan: PlanId) =>
  FEATURE_ROWS.map((row) => ({ label: row.label, value: row.values[plan] }));

describe('plan catalog (PLAN.md §1 tiers table)', () => {
  it('lists Free, Pro, and Premium with their monthly USDT prices', () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(['free', 'pro', 'premium']);
    expect(PLANS.map((plan) => plan.priceMonthlyUsdt)).toEqual([null, 3, 7]);
  });

  it('gives every feature row a value for every plan', () => {
    for (const row of FEATURE_ROWS) {
      for (const plan of PLANS) {
        expect(row.values[plan.id], `${row.label} × ${plan.id}`).toBeDefined();
      }
    }
  });

  it('keeps Client Export free on every plan', () => {
    const row = FEATURE_ROWS.find((r) => r.label.startsWith('Client Export'));
    expect(valuesFor('free')).toContainEqual({
      label: expect.stringMatching(/^Client Export/),
      value: true,
    });
    expect(row).toBeDefined();
    expect(row!.values).toEqual({ free: true, pro: true, premium: true });
  });

  it('caps Server Export at the table quotas and never on Free', () => {
    const row = FEATURE_ROWS.find((r) => r.label.startsWith('Server Export'));
    expect(row!.values).toEqual({
      free: 'never',
      pro: '300/mo',
      premium: '1000/mo',
    });
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
    expect(DURATION_NOTE).toMatch(/10×/);
    expect(DURATION_NOTE).toMatch(/auto-renew/i);
  });

  it('offers the four Order durations', () => {
    expect(DURATIONS).toEqual([1, 3, 6, 12]);
  });

  it('prices durations linearly, 12 months at 10× monthly', () => {
    expect(priceForDuration('pro', 1)).toBe(3);
    expect(priceForDuration('pro', 3)).toBe(9);
    expect(priceForDuration('pro', 6)).toBe(18);
    expect(priceForDuration('pro', 12)).toBe(30);
    expect(priceForDuration('premium', 12)).toBe(70);
  });
});
