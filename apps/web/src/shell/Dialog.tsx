import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from './icons';

interface DialogProps {
  /** The accessible dialog name — rendered as the panel heading. */
  label: string;
  /** Extra classes for the panel: width, max-height, stacking. */
  panelClassName?: string;
  /** Extra classes for the content wrapper under the heading row. */
  contentClassName?: string;
  testId?: string;
  backdropTestId?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The dialog chrome shared by the pricing modal, the upgrade flow, and
 * upgrade status (billing/01): fixed backdrop, centered panel, heading row
 * with a close button, Escape-to-close. One implementation so the dialogs
 * can never drift apart.
 */
export function Dialog({
  label,
  panelClassName = 'w-full max-w-xl',
  contentClassName = '',
  testId,
  backdropTestId,
  onClose,
  children,
}: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        data-testid={backdropTestId}
        onClick={onClose}
        className="animate-fade-in fixed inset-0 z-[60] bg-black/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center p-6"
      >
        <div
          className={`rounded-pane border border-hairline bg-surface p-5 shadow-xl ${panelClassName}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold">{label}</h2>
            <button
              type="button"
              autoFocus
              aria-label="Close"
              onClick={onClose}
              className="-m-1 rounded-control p-1 text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              <CloseIcon />
            </button>
          </div>
          <div className={`mt-3 ${contentClassName}`}>{children}</div>
        </div>
      </div>
    </>
  );
}
