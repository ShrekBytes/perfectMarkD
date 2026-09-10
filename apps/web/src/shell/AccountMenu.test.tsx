// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';
import * as authApi from '../auth/api';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';

const onOpenUpgradeStatus = vi.fn();

beforeEach(() => {
  resetAccountStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('renders nothing until the session check resolves', () => {
  const { container } = render(
    <AccountMenu onOpenUpgradeStatus={onOpenUpgradeStatus} />,
  );

  expect(container).toBeEmptyDOMElement();
});

it('offers sign-in when signed out', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });

  render(<AccountMenu onOpenUpgradeStatus={onOpenUpgradeStatus} />);

  const link = screen.getByRole('link', { name: 'Sign in' });
  expect(link).toHaveAttribute('href', '/login');
});

it('signed in: opens a menu with upgrade status and sign-out', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });

  render(<AccountMenu onOpenUpgradeStatus={onOpenUpgradeStatus} />);

  await user.click(screen.getByRole('button', { name: 'Account menu' }));

  const menu = screen.getByRole('menu', { name: 'Account' });
  expect(menu).toHaveTextContent('reader@example.com');
  expect(
    screen.getByRole('menuitem', { name: 'Upgrade status' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: 'Sign out' }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: 'Upgrade status' }));
  expect(onOpenUpgradeStatus).toHaveBeenCalledTimes(1);
});

it('signs out from the menu — clearing the account', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);

  render(<AccountMenu onOpenUpgradeStatus={onOpenUpgradeStatus} />);
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  expect(useAccountStore.getState().user).toBeNull();
});
