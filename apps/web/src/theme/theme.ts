import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const STORAGE_KEY = 'perfectmarkd:theme';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The user's stored choice, or null when they follow the system. */
export function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Stored preference wins; otherwise follow the operating system. */
export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (e.g. hardened privacy mode); the choice still applies for this session.
  }
}

export function toggleTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * Theme state for React components. The initial theme is resolved from storage/system
 * (matching what the no-FOUC inline script in index.html already applied), user choices
 * persist, and the OS preference is followed until the user picks a side.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme()) return;
      setThemeState(event.matches ? 'dark' : 'light');
      applyTheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const update = useCallback((next: Theme) => {
    setThemeState(next);
    setTheme(next);
  }, []);

  const toggle = useCallback(() => {
    const next = toggleTheme(theme);
    setThemeState(next);
    setTheme(next);
  }, [theme]);

  return { theme, setTheme: update, toggle };
}
