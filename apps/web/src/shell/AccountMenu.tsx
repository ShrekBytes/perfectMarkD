import { useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { useAccountStore } from '../auth/account-store';

interface AccountMenuProps {
  /** Opens the Upgrade status dialog (owned by the shell). */
  onOpenUpgradeStatus: () => void;
  /** Opens the Export History dialog (server/05, owned by the shell). */
  onOpenHistory: () => void;
}

/**
 * The top bar's account control (billing/01): a sign-in link when signed out,
 * and when signed in a menu with the account email, the Upgrade status entry
 * point, Export History (Premium's re-downloadable exports), and sign-out.
 * Until the first session check resolves it renders nothing — flashing the
 * wrong state is worse than a beat of nothing.
 */
export function AccountMenu({
  onOpenUpgradeStatus,
  onOpenHistory,
}: AccountMenuProps) {
  const user = useAccountStore((state) => state.user);
  const status = useAccountStore((state) => state.status);
  const signOut = useAccountStore((state) => state.signOut);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dropdown dismissal: outside pointer press or Escape (same pattern as the
  // Export split button's dropdown).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (status !== 'ready') return null;

  if (!user) {
    return (
      <Link
        to="/login"
        className="flex h-8 items-center rounded-control px-2.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
      >
        Sign in
      </Link>
    );
  }

  const initial = user.email[0]?.toUpperCase() ?? '?';

  return (
    <div ref={containerRef} data-testid="account-menu" className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-xs font-semibold text-accent transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent hover:text-accent-ink focus-visible:outline-2"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-pane border border-hairline bg-surface py-1 shadow-lg"
        >
          <p className="truncate px-3 pb-1 pt-2 text-xs text-ink-faint">
            {user.email}
          </p>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenUpgradeStatus();
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover"
          >
            Upgrade status
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenHistory();
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover"
          >
            Export history
            <span className="ml-auto text-xs text-ink-faint">30 days</span>
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
