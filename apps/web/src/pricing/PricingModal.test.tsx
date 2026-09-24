// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PricingModal } from './PricingModal';
import { trackEvent } from '../analytics/tracker';

vi.mock('../analytics/tracker', () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackEvent: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders the compact plan comparison', () => {
  render(<PricingModal onClose={vi.fn()} />);

  const dialog = screen.getByRole('dialog', { name: /plans and pricing/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('3 USDT/mo')).toBeInTheDocument();
  expect(screen.getByText('Priority render queue')).toBeInTheDocument();
  // Pitch and Client Export note render from the plans module.
  expect(screen.getByText(/unlock every paid feature/)).toBeInTheDocument();
  expect(screen.getByText(/Client Export keeps working/)).toBeInTheDocument();
});

it('swaps to the upgrade flow when a paid plan is chosen', async () => {
  const user = userEvent.setup();
  render(<PricingModal onClose={vi.fn()} />);

  const [proCta] = screen.getAllByRole('button', { name: 'Upgrade' });
  await user.click(proCta!);

  const dialog = screen.getByRole('dialog', { name: /upgrade to pro/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByTestId('upgrade-flow')).toBeInTheDocument();
  // Signed out, the flow starts from plan details (auth comes on Continue).
  expect(screen.getByTestId('upgrade-step-details')).toBeInTheDocument();
  expect(screen.getByText(/total/i)).toBeInTheDocument();
});

it('closes via the close button, Escape, and the backdrop', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  const { unmount } = render(<PricingModal onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();

  render(<PricingModal onClose={onClose} />);
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(2);
  cleanup();

  render(<PricingModal onClose={onClose} />);
  fireEvent.click(screen.getByTestId('pricing-modal-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(3);
});

it("the free plan's CTA closes the modal (the editor is already underneath)", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<PricingModal onClose={onClose} />);

  await user.click(screen.getByRole('button', { name: 'Open the editor' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('reports the paywall being reached, once per open', () => {
  // Every lock, the quota chip, and the Server Export gate open this same
  // modal, so the mount is the one signal (launch/01).
  const { unmount } = render(<PricingModal onClose={vi.fn()} />);

  expect(trackEvent).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith('upgrade-modal-open');
  unmount();

  render(<PricingModal onClose={vi.fn()} />);
  expect(trackEvent).toHaveBeenCalledTimes(2);
});
