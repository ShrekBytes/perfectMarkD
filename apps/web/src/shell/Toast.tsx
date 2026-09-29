import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

interface ToastProps {
  /** The toast's own name, so a test (and a reader) can point at this one. */
  testId: string;
  /** What the toast says. */
  message: ReactNode;
  /** `error` is the one thing that turns the message danger-coloured. */
  tone?: 'neutral' | 'error';
  onDismiss: () => void;
  /**
   * The toast's own control, between the message and the dismiss button — the
   * delete toast's Undo. A toast that offers one owns the whole flow it starts.
   */
  action?: ReactNode;
}

/**
 * The transient notice, shared by the export flows, the rejected drop and the
 * undoable delete (the first sweep extracted the clock, `useTransientToast`;
 * this is the chrome around it). One block so the three cannot drift in
 * position, pane, or dismissal: a toast that leaves on its own is a promise,
 * and the three promises read as one thing only while they look the same.
 *
 * It carries no timer — the caller owns the message and the clock, and this is
 * only how one is painted.
 */
export function Toast({
  testId,
  message,
  tone = 'neutral',
  onDismiss,
  action,
}: ToastProps) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="pointer-events-none fixed inset-x-0 bottom-16 z-[60] flex justify-center"
    >
      <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-pane border border-hairline-strong bg-surface px-4 py-2.5 shadow-lg">
        <p
          className={`text-sm ${tone === 'error' ? 'text-danger' : 'text-ink'}`}
        >
          {message}
        </p>
        {action}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
