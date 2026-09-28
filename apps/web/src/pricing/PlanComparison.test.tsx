// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanComparison } from './PlanComparison';
import { resetPricingStoreForTests } from './store';
import { jsonResponse } from '../testing/json-response';
import { PRICING_FAILURE, PRICING_RESPONSE } from '../testing/pricing-response';
import { trackEvent } from '../analytics/tracker';

vi.mock('../analytics/tracker', async () => {
  const { stubAnalyticsModule } = await import('../testing/stub-analytics');
  return stubAnalyticsModule;
});

const openEditor = vi.fn();
const openUpgrade = vi.fn();

const PRICING = PRICING_RESPONSE;

function stubPricing(body: unknown = PRICING, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(status, body))),
  );
}

/** A response that never settles, so the first paint is what is asserted. */
function stubPendingPricing() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
}

function renderComparison(compact = false) {
  return render(
    <PlanComparison
      compact={compact}
      onOpenEditor={openEditor}
      onUpgrade={openUpgrade}
    />,
  );
}

/** The AI Allowance row, whose cells are the numbers the response supplies. */
function aiAllowanceRow() {
  return screen
    .getByRole('rowheader', { name: /AI Allowance/i })
    .closest('tr')!;
}

beforeEach(() => {
  resetPricingStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('plan identity, painted before any response', () => {
  it('shows the plan names, blurbs, and feature labels with the prices still in flight', () => {
    stubPendingPricing();
    renderComparison();

    expect(screen.getByRole('columnheader', { name: /Free/ })).toBeVisible();
    expect(
      screen.getByText('One-click Server Export for everyday documents.'),
    ).toBeVisible();
    expect(screen.getByText('Priority render queue')).toBeVisible();
    expect(screen.getByText('Export History (30 days)')).toBeVisible();
    // No number is painted before the response lands — a stale figure read as
    // current is the failure this removes.
    expect(screen.getByTestId('price-pro')).toHaveTextContent('');
    expect(screen.getByTestId('price-premium')).toHaveTextContent('');
    expect(screen.getByTestId('price-free')).toHaveTextContent('Free');
  });
});

describe('plan columns (from the response)', () => {
  it('shows all three plans with the prices the endpoint returned', async () => {
    stubPricing();
    renderComparison();

    expect(await screen.findByText('$4.50/mo')).toBeInTheDocument();
    expect(screen.getByText('$9/mo')).toBeInTheDocument();
    // Free is not a price, so it needs no response.
    expect(screen.getByTestId('price-free')).toHaveTextContent('Free');
  });

  it('fills the Quota, page-cap, and AI Allowance cells from the response', async () => {
    stubPricing();
    renderComparison();

    const serverExport = await screen.findByRole('rowheader', {
      name: /Server Export/,
    });
    await waitFor(() =>
      expect(
        within(serverExport.closest('tr')!).getByText('450/mo'),
      ).toBeVisible(),
    );
    const pageCap = screen.getByRole('rowheader', { name: /Pages per/ });
    expect(within(pageCap.closest('tr')!).getByText('500')).toBeVisible();
    // Free is the static cell: no Server Export, no cap, no AI Actions.
    expect(within(pageCap.closest('tr')!).getByText('—')).toBeVisible();

    const row = aiAllowanceRow();
    expect(within(row).getByText('150/mo')).toBeVisible();
    expect(within(row).getByText('800/mo')).toBeVisible();
  });

  it('states the AI Allowance as a real per-plan number, under the glossary term', async () => {
    stubPricing();
    renderComparison();

    // Labelled with the CONTEXT.md term rather than a restatement of it, and
    // carrying the plan's stored allowance — a number no pricing surface
    // mentioned before this.
    expect(
      screen.getByRole('rowheader', { name: 'AI Allowance' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(aiAllowanceRow()).getByText('150/mo')).toBeVisible(),
    );
  });

  it('renders the feature matrix with the included marks', async () => {
    stubPricing();
    renderComparison();

    await screen.findByText('$4.50/mo');
    expect(screen.getByText('never')).toBeInTheDocument();
    expect(screen.getByText('Priority render queue')).toBeInTheDocument();
    expect(screen.getByText('Export History (30 days)')).toBeInTheDocument();
  });
});

describe('a read that fails', () => {
  it('says the prices are unavailable and shows no number', async () => {
    stubPricing(PRICING_FAILURE, 500);
    renderComparison();

    // The one place the outage is said out loud, so a grid of dashes is not
    // read as a plan that includes nothing (DESIGN.md → Do: error copy names
    // the problem and the recovery).
    expect(await screen.findByTestId('pricing-unavailable')).toHaveTextContent(
      /could not be loaded/,
    );
    expect(screen.getByTestId('pricing-unavailable')).toHaveTextContent(
      /missing rather than free or zero/,
    );
    await waitFor(() =>
      expect(screen.getByTestId('price-pro')).toHaveTextContent('Unavailable'),
    );
    expect(screen.getByTestId('price-premium')).toHaveTextContent(
      'Unavailable',
    );
    // The limit cells read as unavailable too, and no number appears.
    expect(within(aiAllowanceRow()).queryByText(/\d/)).toBeNull();
    // The rest of the table is intact: this is a missing number, not a broken
    // page, and never a fallback to the seeded default.
    expect(screen.getByText('Priority render queue')).toBeVisible();
    expect(screen.queryByText('$4.50/mo')).toBeNull();
  });
});

describe('calls to action', () => {
  it('gives the free plan a working "Open the editor" CTA', async () => {
    stubPricing();
    const user = userEvent.setup();
    renderComparison();

    expect(openEditor).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open the editor' }));
    expect(openEditor).toHaveBeenCalledTimes(1);
  });

  it('opens the upgrade flow from both paid CTAs, naming the plan', async () => {
    stubPricing();
    const user = userEvent.setup();
    renderComparison();

    const upgradeButtons = screen.getAllByRole('button', {
      name: 'Upgrade',
    });
    expect(upgradeButtons).toHaveLength(2);
    for (const button of upgradeButtons) {
      expect(button).toBeEnabled();
    }

    // Column order: Pro then Premium.
    await user.click(upgradeButtons[0]!);
    expect(openUpgrade).toHaveBeenLastCalledWith('pro');
    await user.click(upgradeButtons[1]!);
    expect(openUpgrade).toHaveBeenLastCalledWith('premium');
  });

  it('reports which plan was chosen, and reports nothing for the free CTA', async () => {
    stubPricing();
    const user = userEvent.setup();
    renderComparison();

    const [pro, premium] = screen.getAllByRole('button', { name: 'Upgrade' });
    await user.click(pro!);
    expect(trackEvent).toHaveBeenLastCalledWith('plan-select', { plan: 'pro' });
    await user.click(premium!);
    expect(trackEvent).toHaveBeenLastCalledWith('plan-select', {
      plan: 'premium',
    });

    // Free is not a plan choice — it is the way out of the comparison.
    await user.click(screen.getByRole('button', { name: 'Open the editor' }));
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });
});

describe('compact mode (modal)', () => {
  it('keeps every feature row but drops the plan blurbs', async () => {
    stubPricing();
    renderComparison(true);

    await screen.findByText('$4.50/mo');
    expect(screen.getByText('Priority render queue')).toBeInTheDocument();
    // No blurb in compact mode: "everyday documents" only appears on /pricing.
    expect(screen.queryByText(/everyday documents/i)).not.toBeInTheDocument();
  });
});
