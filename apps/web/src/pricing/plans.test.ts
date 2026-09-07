import { describe, expect, it } from 'vitest';
import {
  BILLING_LIVE,
  DURATION_NOTE,
  FEATURE_ROWS,
  PLANS,
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
});

describe('Phase-1 billing state', () => {
  it('ships with billing inert — Phase 2 flips the flag to swap CTAs', () => {
    expect(BILLING_LIVE).toBe(false);
  });

  it('documents the manual crypto duration options', () => {
    expect(DURATION_NOTE).toMatch(/1.*3.*6.*12 months/);
    expect(DURATION_NOTE).toMatch(/10×/);
    expect(DURATION_NOTE).toMatch(/auto-renew/i);
  });
});
