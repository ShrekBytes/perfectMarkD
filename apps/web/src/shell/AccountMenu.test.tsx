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

beforeEach(() => {
  resetAccountStoreForTests();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('renders nothing until the session check resolves', () => {
  const { container } = render(<AccountMenu />);

  expect(container).toBeEmptyDOMElement();
});

it('offers sign-in when signed out', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });

  render(<AccountMenu />);

  const link = screen.getByRole('link', { name: 'Sign in' });
  expect(link).toHaveAttribute('href', '/login');
});

it('signed in: opens a menu with the Account page and sign-out', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });

  render(<AccountMenu />);

  await user.click(screen.getByRole('button', { name: 'Account menu' }));

  const menu = screen.getByRole('menu', { name: 'Account' });
  expect(menu).toHaveTextContent('reader@example.com');
  const account = screen.getByRole('menuitem', { name: 'Account' });
  expect(account).toHaveAttribute('href', '/account');
  // The dialogs are gone — everything account-owned lives on the Account page.
  expect(
    screen.queryByRole('menuitem', { name: /Upgrade status/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('menuitem', { name: /Export history/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: 'Sign out' }),
  ).toBeInTheDocument();
});

it('the Account item reaches the Account page in one click', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });

  render(<AccountMenu />);
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Account' }));

  expect(window.location.pathname).toBe('/account');
});

it('signs out from the menu — clearing the account and returning to the editor', async () => {
  const user = userEvent.setup();
  window.history.pushState({}, '', '/account');
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);

  render(<AccountMenu />);
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  expect(useAccountStore.getState().user).toBeNull();
  await waitFor(() => expect(window.location.pathname).toBe('/'));
});

it('signs out on the editor without adding a history entry', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);

  render(<AccountMenu />);
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

  await waitFor(() => expect(useAccountStore.getState().user).toBeNull());
  expect(window.location.pathname).toBe('/');
});
