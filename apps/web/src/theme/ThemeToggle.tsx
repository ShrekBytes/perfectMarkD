import type { Theme } from './theme';
import { MoonIcon, SunIcon } from '../shell/icons';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/** Top-bar control; the icon previews where the switch lands. */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="flex h-8 w-8 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
