// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanComparison } from './PlanComparison';
import { trackEvent } from '../analytics/tracker';

vi.mock('../analytics/tracker', async () => {
  const { stubAnalyticsModule } = await import('../testing/stub-analytics');
  return stubAnalyticsModule;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const openEditor = vi.fn();
const openUpgrade = vi.fn();

function renderComparison(compact = false) {
  return render(
    <PlanComparison
      compact={compact}
      onOpenEditor={openEditor}
      onUpgrade={openUpgrade}
    />,
  );
}

describe('plan columns (from the plans module)', () => {
  it('shows all three plans with their USDT prices', () => {
    renderComparison();

    expect(
      screen.getByRole('columnheader', { name: /Free/ }),
    ).toHaveTextContent('Free');
    expect(screen.getByText('3 USDT/mo')).toBeInTheDocument();
    expect(screen.getByText('7 USDT/mo')).toBeInTheDocument();
  });

  it('renders the feature matrix with quotas and marks', () => {
    renderComparison();

    // Quota strings straight from the plan table…
    expect(screen.getByText('never')).toBeInTheDocument();
    expect(screen.getByText('300/mo')).toBeInTheDocument();
    expect(screen.getByText('1000/mo')).toBeInTheDocument();
    // …and every feature row label present, including Premium-only ones.
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(12);
    expect(screen.getByText('Priority render queue')).toBeInTheDocument();
    expect(screen.getByText('Export History (30 days)')).toBeInTheDocument();
  });
});

describe('calls to action', () => {
  it('gives the free plan a working "Open the editor" CTA', async () => {
    const user = userEvent.setup();
    renderComparison();

    expect(openEditor).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open the editor' }));
    expect(openEditor).toHaveBeenCalledTimes(1);
  });

  it('opens the upgrade flow from both paid CTAs, naming the plan', async () => {
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
  it('keeps every feature row but drops the plan blurbs', () => {
    renderComparison(true);

    expect(screen.getByText('Priority render queue')).toBeInTheDocument();
    // No blurb in compact mode: "everyday documents" only appears on /pricing.
    expect(screen.queryByText(/everyday documents/i)).not.toBeInTheDocument();
  });
});
