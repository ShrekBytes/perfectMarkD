// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ShellMenu } from './ShellMenu';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';

const handlers = {
  onOpenLibrary: vi.fn(),
  onToggleTheme: vi.fn(),
};

function renderMenu(theme: 'light' | 'dark' = 'light') {
  return render(<ShellMenu {...handlers} theme={theme} />);
}

beforeEach(() => {
  resetAccountStoreForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('folds Library, theme, and the account entries into one menu', async () => {
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });
  renderMenu();

  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  const menu = screen.getByRole('menu', { name: 'More options' });

  expect(within(menu).getByRole('menuitem', { name: /Library/ })).toBeInTheDocument();
  expect(
    within(menu).getByRole('menuitem', { name: /Switch to dark theme/ }),
  ).toBeInTheDocument();
  expect(menu).toHaveTextContent('reader@example.com');
  expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
});

it('offers sign-in when signed out', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });
  renderMenu();

  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  expect(
    screen.getByRole('menuitem', { name: 'Sign in' }),
  ).toHaveAttribute('href', '/login');
});

it('runs the shell action the item names, closing first', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });
  renderMenu();

  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /Library/ }));

  expect(handlers.onOpenLibrary).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('names the theme item by where the switch lands', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });
  renderMenu('dark');

  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Switch to light theme' }),
  );
  expect(handlers.onToggleTheme).toHaveBeenCalledTimes(1);
});

it('closes on Escape and returns focus to its trigger', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });
  renderMenu();

  const trigger = screen.getByRole('button', { name: 'More options' });
  await userEvent.click(trigger);
  expect(screen.getByRole('menu')).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});