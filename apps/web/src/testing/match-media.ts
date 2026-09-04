import { vi } from 'vitest';

/** jsdom has no matchMedia; stub the system preference for theme tests. */
export function stubSystemTheme(theme: 'light' | 'dark') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: theme === 'dark',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}
