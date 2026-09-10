// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { stubSystemTheme } from '../testing/match-media';
import { GITHUB_URL, LICENSE_URL, PLUGIN_URL } from './PricingPage';
import { PricingPage } from './PricingPage';

beforeEach(() => {
  stubSystemTheme('light');
  window.history.pushState({}, '', '/pricing');
});

afterEach(() => {
  cleanup();
});

it('renders the three-column comparison from the shared plans module', () => {
  render(<PricingPage />);

  expect(
    screen.getByRole('heading', { name: 'Simple pricing' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('7 USDT/mo')).toBeInTheDocument();
  expect(screen.getByText('Priority render queue')).toBeInTheDocument();
});

it('carries the AGPL note and duration terms', () => {
  render(<PricingPage />);

  expect(screen.getByText(/AGPL-3\.0 — the whole app/)).toBeInTheDocument();
  expect(screen.getByText(/12 months costs 10×/)).toBeInTheDocument();
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
});
