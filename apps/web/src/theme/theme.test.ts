// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  applyTheme,
  resolveInitialTheme,
  setTheme,
  STORAGE_KEY,
  useTheme,
} from './theme';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('resolves to the system preference when nothing is stored', () => {
  stubSystemTheme('dark');
  expect(resolveInitialTheme()).toBe('dark');
});

it('resolves to the stored preference over the system one', () => {
  localStorage.setItem(STORAGE_KEY, 'light');
  stubSystemTheme('dark');
  expect(resolveInitialTheme()).toBe('light');
});

it('ignores stored values that are not a theme', () => {
  localStorage.setItem(STORAGE_KEY, 'midnight-blue');
  expect(resolveInitialTheme()).toBe('light');
});

it('applyTheme reflects the theme on the document element', () => {
  applyTheme('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  applyTheme('light');
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('setTheme persists and applies in one step', () => {
  setTheme('dark');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('useTheme exposes the resolved theme and toggling persists the choice', () => {
  stubSystemTheme('dark');
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('dark');

  act(() => result.current.toggle());
  expect(result.current.theme).toBe('light');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('useTheme follows system changes while no preference is stored', () => {
  const changeListeners: Array<(event: { matches: boolean }) => void> = [];
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      changeListeners.push(listener),
    removeEventListener: vi.fn(),
  }));

  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('light');

  act(() => changeListeners.forEach((listener) => listener({ matches: true })));
  expect(result.current.theme).toBe('dark');
  // System-driven changes are not a user preference and must not persist.
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it('useTheme ignores system changes once a preference is stored', () => {
  const changeListeners: Array<(event: { matches: boolean }) => void> = [];
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      changeListeners.push(listener),
    removeEventListener: vi.fn(),
  }));

  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme('light'));

  act(() => changeListeners.forEach((listener) => listener({ matches: true })));
  expect(result.current.theme).toBe('light');
});

it('toggleTheme flips a stored preference', () => {
  setTheme('dark');
  const { result } = renderHook(() => useTheme());
  act(() => result.current.toggle());
  expect(result.current.theme).toBe('light');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
});
