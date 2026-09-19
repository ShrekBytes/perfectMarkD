import { Link } from '../router';
import { useTheme } from '../theme/theme';
import { ThemeToggle } from '../theme/ThemeToggle';

/**
 * The minimal header the static pages share (launch-chrome spec): the
 * wordmark linking to the editor and the theme toggle — the auth pages'
 * pattern, borrowed verbatim so the static surfaces never drift from it.
 */
export function PageHeader() {
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
      <Link
        to="/"
        aria-label="PerfectMarkD home"
        className="touch-target inline-flex shrink-0 select-none items-center rounded-control px-1 text-sm font-semibold tracking-tight outline-offset-2 outline-accent focus-visible:outline-2"
      >
        Perfect<span className="font-mono">Mark</span>D
      </Link>
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle theme={theme} onToggle={toggle} />
      </div>
    </header>
  );
}
