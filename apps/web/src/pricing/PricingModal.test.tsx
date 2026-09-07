// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PricingModal } from './PricingModal';

afterEach(() => {
  cleanup();
});

it('renders the compact plan comparison', () => {
  render(<PricingModal onClose={vi.fn()} />);

  const dialog = screen.getByRole('dialog', { name: /plans and pricing/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('3 USDT/mo')).toBeInTheDocument();
  expect(screen.getByText('Priority render queue')).toBeInTheDocument();
});

it('shows the Phase-1 coming-soon state instead of a signup wall', () => {
  render(<PricingModal onClose={vi.fn()} />);

  expect(screen.getByText(/payments are launching soon/i)).toBeInTheDocument();
  const paidCtas = screen.getAllByRole('button', { name: 'Coming soon' });
  expect(paidCtas).toHaveLength(2);
  for (const button of paidCtas) {
    expect(button).toBeDisabled();
  }
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
