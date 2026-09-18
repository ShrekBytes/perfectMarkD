import { useEffect, useRef, useState } from 'react';
import { AccountMenuItems } from './AccountMenu';
import { BookIcon, MoonIcon, MoreIcon, SunIcon } from './icons';
import { useEscapeLayer, useMenuKeyboard } from './focus';
import type { Theme } from '../theme/theme';

interface ShellMenuProps {
  /** Opens the Library drawer (owned by the shell). */
  onOpenLibrary: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenUpgradeStatus: () => void;
  onOpenHistory: () => void;
}

const itemClasses =
  'touch-target flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover';

/**
 * The compact top bar's overflow menu. Below `SHELL_WIDE_MIN` the bar cannot
 * hold its full right cluster beside the document name, so the controls that
 * are not the primary action fold in here — Library, theme, and the account
 * entries (shared with the desktop AccountMenu so the two can never drift).
 *
 * The primary action, Export, deliberately stays out: it is the product's
 * job and never hides behind a menu.
 */
export function ShellMenu({
  onOpenLibrary,
  theme,
  onToggleTheme,
  onOpenUpgradeStatus,
  onOpenHistory,
}: ShellMenuProps) {
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

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div ref={containerRef} data-testid="shell-menu" className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More options"
        className="touch-target flex h-8 w-8 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
      >
        <MoreIcon />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More options"
          /* Viewport-anchored, not trigger-anchored: the trigger sits ~44px
             from the bar's right edge, so a 224px right-0 dropdown overhangs
             the viewport's left edge at 320px (menu at x=-48, half its labels
             off-screen). Fixed to the bar's right edge instead, below the
             48px top bar plus safe-area inset. */
          className="fixed right-2 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-50 w-56 max-w-[calc(100vw-1rem)] overflow-hidden rounded-pane border border-hairline bg-surface py-1 shadow-lg"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenLibrary();
            }}
            className={itemClasses}
          >
            <BookIcon className="text-ink-soft" />
            Library
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleTheme();
            }}
            className={itemClasses}
          >
            {theme === 'dark' ? (
              <SunIcon className="text-ink-soft" />
            ) : (
              <MoonIcon className="text-ink-soft" />
            )}
            Switch to {nextTheme} theme
          </button>
          <div
            role="separator"
            aria-hidden="true"
            className="my-1 h-px bg-hairline"
          />
          <AccountMenuItems
            onOpenUpgradeStatus={onOpenUpgradeStatus}
            onOpenHistory={onOpenHistory}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
