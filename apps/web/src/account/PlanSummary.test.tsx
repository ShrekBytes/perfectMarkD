// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { lastPlanPeriod, PlanSummary } from './PlanSummary';
import type { Order } from '../billing/api';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    referenceCode: 'PM-7F3K2',
    plan: 'pro',
    durationMonths: 3,
    coin: 'USDT',
    network: 'TRC20',
    amountExpected: '9',
    ltcRateUsdt: null,
    status: 'verified',
    txid: null,
    amountClaimed: null,
    note: null,
    rejectReason: null,
    createdAt: '2026-06-10T00:00:00.000Z',
    decidedAt: '2026-06-11T00:00:00.000Z',
    walletAddress: 'TTronWalletForTheTest',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

it('shows the active plan with its expiry and quota', () => {
  render(
    <PlanSummary
      entitlement={{ plan: 'premium', expiresAt: '2026-10-15T00:00:00.000Z' }}
      quota={{ used: 2, limit: 40 }}
      orders={[]}
      ordersError={null}
    />,
  );

  expect(screen.getByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('Expires 2026-10-15')).toBeInTheDocument();
  expect(screen.getByTestId('account-quota')).toHaveTextContent(
    '2 of 40 used this period',
  );
  // An active plan needs no upgrade CTA.
  expect(
    screen.queryByRole('link', { name: 'View plans' }),
  ).not.toBeInTheDocument();
});

it('shows the Free plan with the upgrade CTA and no quota readout', () => {
  render(
    <PlanSummary
      entitlement={null}
      quota={{ used: 0, limit: 0 }}
      orders={[]}
      ordersError={null}
    />,
  );

  expect(screen.getByText('Free')).toBeInTheDocument();
  expect(
    screen.getByText('No paid plan — upgrades start from the plans.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
    'href',
    '/pricing',
  );
  // A plain Free user has no allowance — the readout only describes one.
  expect(screen.queryByTestId('account-quota')).not.toBeInTheDocument();
});

it('shows a comped user’s real allowance', () => {
  // A comp granted without a plan (billing/03): entitlement null, the quota
  // carries the comp the Admin granted.
  render(
    <PlanSummary
      entitlement={null}
      quota={{ used: 1, limit: 3 }}
      orders={[]}
      ordersError={null}
    />,
  );

  expect(screen.getByTestId('account-quota')).toHaveTextContent(
    '1 of 3 used this period',
  );
});

it('shows the expired state derived from the Order history', () => {
  render(
    <PlanSummary
      entitlement={null}
      quota={{ used: 1, limit: 5 }}
      orders={[
        order({
          status: 'verified',
          decidedAt: '2020-06-11T00:00:00.000Z',
          durationMonths: 3,
        }),
      ]}
      ordersError={null}
    />,
  );

  // 3 months from 2020-06-11 → 2020-09-11, long past.
  expect(screen.getByTestId('plan-expired')).toHaveTextContent('Expired');
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(screen.getByText(/Ended 2020-09-11/)).toBeInTheDocument();
  expect(screen.getByText(/nothing auto-renews/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
    'href',
    '/pricing',
  );
});

it('names an ended plan without a date claim while the window has not lapsed', () => {
  // An admin revoke: the granted period's date is still ahead, so "Ended"
  // would claim a future date.
  render(
    <PlanSummary
      entitlement={null}
      quota={{ used: 0, limit: 0 }}
      orders={[
        order({
          status: 'verified',
          decidedAt: '2099-06-11T00:00:00.000Z',
          durationMonths: 3,
        }),
      ]}
      ordersError={null}
    />,
  );

  expect(screen.queryByTestId('plan-expired')).not.toBeInTheDocument();
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(
    screen.getByText('No longer active — nothing auto-renews.'),
  ).toBeInTheDocument();
});

it('renders a loading line while the Orders are still loading', () => {
  render(
    <PlanSummary
      entitlement={null}
      quota={{ used: 0, limit: 0 }}
      orders={null}
      ordersError={null}
    />,
  );

  // No wrong state flash: the plan row waits for its data, but the section
  // is never empty. The CTA is correct in every no-entitlement state.
  expect(screen.getByText('Loading your plan…')).toBeInTheDocument();
  expect(screen.queryByText('Free')).not.toBeInTheDocument();
  expect(screen.queryByTestId('plan-expired')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View plans' })).toBeInTheDocument();
});

it('shows Free without waiting for the Orders list when the request failed', () => {
  // /api/me already settled the plan; the ended plan's derivation is the
  // only thing that needs the Order history.
  render(
    <PlanSummary
      entitlement={null}
      quota={{ used: 0, limit: 0 }}
      orders={null}
      ordersError="Couldn't reach the server. Check your connection and try again."
    />,
  );

  expect(screen.getByText('Free')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View plans' })).toBeInTheDocument();
});

describe('lastPlanPeriod', () => {
  it('picks the newest verified order and adds its duration', () => {
    const period = lastPlanPeriod([
      order({
        id: 1,
        plan: 'pro',
        durationMonths: 3,
        decidedAt: '2020-01-01T00:00:00.000Z',
      }),
      order({
        id: 2,
        plan: 'premium',
        durationMonths: 1,
        decidedAt: '2020-06-01T00:00:00.000Z',
      }),
      order({
        id: 3,
        plan: 'premium',
        durationMonths: 12,
        status: 'pending',
        decidedAt: null,
        createdAt: '2020-07-01T00:00:00.000Z',
      }),
    ]);
    expect(period?.plan).toBe('premium');
    expect(period?.endedAt.toISOString().slice(0, 10)).toBe('2020-07-01');
  });

  it('stacks a duration on the current expiry while it is still active', () => {
    // The server stacks grants (admin/entitlement.ts): a renewal decided
    // before the current expiry runs out extends it, so "Ended" claims the
    // true lapse, not the renewal's decision plus its duration.
    const period = lastPlanPeriod([
      order({
        id: 1,
        plan: 'pro',
        durationMonths: 1,
        decidedAt: '2020-01-01T00:00:00.000Z',
      }),
      order({
        id: 2,
        plan: 'premium',
        durationMonths: 3,
        decidedAt: '2020-01-15T00:00:00.000Z',
      }),
    ]);
    // 1 month from Jan 1 → Feb 1, still active on Jan 15; +3 → May 1.
    expect(period?.plan).toBe('premium');
    expect(period?.endedAt.toISOString().slice(0, 10)).toBe('2020-05-01');
  });

  it('clamps day-of-month overflow like the server does', () => {
    const period = lastPlanPeriod([
      order({
        status: 'verified',
        durationMonths: 1,
        decidedAt: '2020-01-31T00:00:00.000Z',
      }),
    ]);
    // Jan 31 + 1 month → Feb 29 (2020 is a leap year), not Mar 2.
    expect(period?.endedAt.toISOString().slice(0, 10)).toBe('2020-02-29');
  });

  it('is null without a verified order', () => {
    expect(lastPlanPeriod([order({ status: 'pending' })])).toBeNull();
    expect(lastPlanPeriod([])).toBeNull();
  });
});
