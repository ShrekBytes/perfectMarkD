// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { QuotaChip } from './QuotaChip';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';

afterEach(() => {
  cleanup();
  resetAccountStoreForTests();
});

describe('QuotaChip', () => {
  it('renders nothing while signed out', () => {
    render(<QuotaChip />);
    expect(screen.queryByTestId('quota-chip')).toBeNull();
  });

  it('renders nothing for a signed-in free user', () => {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: null,
      quota: { used: 0, limit: 0 },
      status: 'ready',
    });

    render(<QuotaChip />);
    expect(screen.queryByTestId('quota-chip')).toBeNull();
  });

  it('shows the used/allowance for a paid user', () => {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: { plan: 'pro', expiresAt: '2026-10-01T00:00:00.000Z' },
      quota: { used: 27, limit: 300 },
      status: 'ready',
    });

    render(<QuotaChip />);
    const chip = screen.getByTestId('quota-chip');
    expect(chip).toHaveTextContent('27/300');
    // A live allowance is a readout, not a control.
    expect(chip.tagName).toBe('SPAN');
    // The allowance (quota + comps) is explained on hover; the number alone
    // should not force users to guess what it counts.
    expect(chip).toHaveAccessibleDescription(
      expect.stringContaining('Server Export'),
    );
  });

  it('flags the chip when the allowance is used up', () => {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: { plan: 'pro', expiresAt: '2026-10-01T00:00:00.000Z' },
      quota: { used: 300, limit: 300 },
      status: 'ready',
    });

    render(<QuotaChip />);
    const chip = screen.getByTestId('quota-chip');
    expect(chip).toHaveAttribute('data-exhausted', 'true');
    // Exhaustion turns the dead readout into the recovery path: a button
    // whose name says what happened and where to go.
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAccessibleName(expect.stringContaining('open plans'));
  });

  it('opens the pricing modal from the exhausted chip', async () => {
    const user = userEvent.setup();
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: { plan: 'pro', expiresAt: '2026-10-01T00:00:00.000Z' },
      quota: { used: 300, limit: 300 },
      status: 'ready',
    });

    render(<QuotaChip />);
    await user.click(screen.getByTestId('quota-chip'));
    expect(screen.getByTestId('pricing-modal')).toBeInTheDocument();
  });
});
