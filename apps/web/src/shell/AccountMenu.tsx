import { useEffect, useRef, useState } from 'react';
import { Link, navigate } from '../router';
import { useAccountStore } from '../auth/account-store';
import { useEscapeLayer, useMenuKeyboard } from './focus';

interface AccountMenuItemsProps {
  onClose: () => void;
}

/** Shared item styling for both menu renderings (account dropdown, overflow). */
const itemClasses =
  'touch-target flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover';

/**
 * The account entries, rendered as menu items so both the desktop account
 * dropdown and the compact overflow menu can host them without duplicating
 * the signed-in / signed-out logic. `onClose` fires before the item's own
 * action so the hosting menu is never left open behind a page swap.
 */
export function AccountMenuItems({ onClose }: AccountMenuItemsProps) {
  const user = useAccountStore((state) => state.user);
  const status = useAccountStore((state) => state.status);
  const signOut = useAccountStore((state) => state.signOut);

  // Until the first session check resolves, render nothing: flashing the wrong
  // state is worse than a beat of nothing.
  if (status !== 'ready') return null;

  if (!user) {
    return (
      <Link to="/login" role="menuitem" onClick={onClose} className={itemClasses}>
        Sign in
      </Link>
    );
  }

  return (
    <>
      <p className="truncate px-3 pb-1 pt-2 text-xs text-ink-faint">
        {user.email}
      </p>
      <Link
        to="/account"
        role="menuitem"
        onClick={onClose}
        className={itemClasses}
      >
        Account
      </Link>
      <button
        role="menuitem"
        type="button"
        onClick={() => {
          onClose();
          void signOut().then(() => {
            // After sign-out the user returns to the editor (the account
            // spec) — already there when the menu lives on the editor shell.
            if (window.location.pathname !== '/') navigate('/');
          });
        }}
        className={itemClasses}
      >
        Sign out
      </button>
    </>
  );
}

/**
 * The top bar's account control (billing/01): a sign-in link when signed out,
 * and when signed in a menu with the account email, the Account page (where
 * the plan's Orders, Export History, and the password form live), and
 * sign-out.
 */
export function AccountMenu() {
  const user = useAccountStore((state) => state.user);
  const status = useAccountStore((state) => state.status);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dropdown dismissal on outside pointer press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Escape resolves the topmost layer only and returns focus to the trigger;
  // the menu itself roves with the arrow keys (focus.ts).
  useEscapeLayer(open, () => {
    setOpen(false);
    triggerRef.current?.focus();
  });
  useMenuKeyboard(menuRef, open, () => setOpen(false));

  if (status !== 'ready') return null;

  if (!user) {
    return (
      <Link
        to="/login"
        className="touch-target flex h-8 items-center rounded-control px-2.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
      >
        Sign in
      </Link>
    );
  }

  const initial = user.email[0]?.toUpperCase() ?? '?';

  return (
    <div ref={containerRef} data-testid="account-menu" className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
        className="touch-target flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-canvas text-xs font-semibold text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
      >
        {initial}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-pane border border-hairline bg-surface py-1 shadow-lg"
        >
          <AccountMenuItems onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
