// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';
import { PlanEndedBanner } from './PlanEndedBanner';

afterEach(() => {
  cleanup();
  resetAccountStoreForTests();
});

describe('PlanEndedBanner', () => {
  it('renders nothing while the notice is not raised', () => {
    render(<PlanEndedBanner />);
    expect(screen.queryByTestId('plan-ended-banner')).toBeNull();
  });

  it('explains the re-lock, keeps the reassurance, and links to the plans', async () => {
    const user = userEvent.setup();
    useAccountStore.setState({ planEndedNotice: true });

    render(<PlanEndedBanner />);

    const banner = screen.getByTestId('plan-ended-banner');
    expect(banner).toHaveTextContent(/paid plan has ended/i);
    expect(banner).toHaveTextContent(/untouched/i);
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );

    // Dismissing is the only way it goes away — no false alarms later.
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useAccountStore.getState().planEndedNotice).toBe(false);
  });
});
