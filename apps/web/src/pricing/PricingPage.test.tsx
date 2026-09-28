// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stubSystemTheme } from '../testing/match-media';
import { jsonResponse } from '../testing/json-response';
import { PRICING_FAILURE, PRICING_RESPONSE } from '../testing/pricing-response';
import { GITHUB_URL, LICENSE_URL, PLUGIN_URL } from '../pages/site-links';
import { PricingPage } from './PricingPage';
import { resetPricingStoreForTests } from './store';

const PRICING = PRICING_RESPONSE;

beforeEach(() => {
  stubSystemTheme('light');
  resetPricingStoreForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, PRICING))),
  );
  window.history.pushState({}, '', '/pricing');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders the three-column comparison with the prices the endpoint returned', async () => {
  render(<PricingPage />);

  expect(
    screen.getByRole('heading', { name: 'Simple pricing' }),
  ).toBeInTheDocument();
  // Plan identity is on screen immediately, before the response lands.
  expect(screen.getByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('Priority render queue')).toBeInTheDocument();

  // And the numbers once it has — including the AI Allowance row, which no
  // pricing surface mentioned before this.
  expect(await screen.findByText('$9/mo')).toBeInTheDocument();
  expect(screen.getByText('$4.50/mo')).toBeInTheDocument();
  expect(screen.getByText('800/mo')).toBeInTheDocument();
  expect(
    screen.getByRole('rowheader', { name: /AI Allowance/i }),
  ).toBeInTheDocument();
});

it('carries the AGPL note, duration terms, and watermark promise', () => {
  render(<PricingPage />);

  expect(screen.getByText(/AGPL-3\.0\. The whole app/)).toBeInTheDocument();
  expect(
    screen.getByText(/longer terms are priced to save/),
  ).toBeInTheDocument();
  // PLAN.md §1's exact wording.
  expect(screen.getByText(/No watermarks anywhere/)).toBeInTheDocument();
});

it('links the license badge and GitHub in the footer', () => {
  render(<PricingPage />);

  expect(screen.getByRole('link', { name: 'AGPL-3.0' })).toHaveAttribute(
    'href',
    LICENSE_URL,
  );
  expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    GITHUB_URL,
  );
  expect(
    screen.getByRole('link', { name: /Advanced PDF Export plugin/ }),
  ).toHaveAttribute('href', PLUGIN_URL);
});

it('swaps to the editor when the wordmark is clicked', async () => {
  const user = userEvent.setup();
  render(<PricingPage />);

  await user.click(screen.getByRole('link', { name: 'PerfectMarkD home' }));

  expect(window.location.pathname).toBe('/');
});

it('opens the upgrade flow when a paid plan is chosen', async () => {
  const user = userEvent.setup();
  render(<PricingPage />);

  // Column order: Pro first, then Premium.
  const [proCta] = screen.getAllByRole('button', { name: 'Upgrade' });
  await user.click(proCta!);

  const dialog = await screen.findByRole('dialog', {
    name: /upgrade to pro/i,
  });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByTestId('upgrade-flow')).toBeInTheDocument();
  // The dialog quotes the same stored figures the page showed — the one
  // price the customer is held to.
  await waitFor(() =>
    expect(screen.getByTestId('upgrade-total')).toHaveTextContent('$4.50'),
  );
});

it('says the prices are unavailable when the endpoint cannot be read', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(500, PRICING_FAILURE))),
  );
  render(<PricingPage />);

  await waitFor(() =>
    expect(screen.getByTestId('price-pro')).toHaveTextContent('Unavailable'),
  );
  // The outage is named, not left to be read off a grid of dashes.
  expect(screen.getByTestId('pricing-unavailable')).toBeInTheDocument();
  expect(screen.getByTestId('price-premium')).toHaveTextContent('Unavailable');
  // The prose and the feature labels do not depend on the response.
  expect(screen.getByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('Priority render queue')).toBeInTheDocument();
  // And no number is shown that the customer could act on.
  expect(screen.queryByText(/\$[\d.]+/)).toBeNull();
});
