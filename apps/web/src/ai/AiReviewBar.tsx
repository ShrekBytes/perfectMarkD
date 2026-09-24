// ─────────────────────────────────────────────────────────────────────────────
// The inline review bar (spec §The review surface, as reshaped): the one
// control surface over the changes drawn in the editor. It sits at the top of
// the editor pane — not a modal, not over the paper — and carries the change
// count, the per-change check toggles ("Change N" switches the matching
// decoration between solid and dimmed), and the same actions the old dialog
// had: Accept what is checked, Reject everything, Retry, and Edit prompt.
//
// Esc rejects; Enter accepts. The stale/foreign/exhausted reasons render here
// exactly as the dialog rendered them, with Accept disabled.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { AI_COMMANDS } from './trigger';
import type { InlineHunk } from './inline';

interface AiReviewBarProps {
  command: 'markdown' | 'stylesheet';
  hunks: readonly InlineHunk[];
  checked: ReadonlySet<number>;
  onToggle: (id: number) => void;
  /**
   * Why Accept is unavailable, resolved by the controller (a stale target, a
   * foreign Document, or a failed Retry). Null when it is available.
   */
  disabledReason: string | null;
  busy: boolean;
  /** Whether Retry and Edit prompt are unavailable (see the controller). */
  retryBlocked: boolean;
  /** A Retry failed; shown inline, naming nothing about the provider. */
  error: string | null;
  /** Set when this proposal is one step of an approved AI Plan. */
  plan: { at: number; total: number; onStop: () => void } | null;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
  onEditPrompt: () => void;
}

/**
 * The bar. Anchored by the pane's own layout (`border-b` under the toolbar),
 * so it never covers the changes it reviews — the decorations are the diff.
 */
export function AiReviewBar({
  command,
  hunks,
  checked,
  onToggle,
  disabledReason,
  busy,
  retryBlocked,
  error,
  plan,
  onAccept,
  onReject,
  onRetry,
  onEditPrompt,
}: AiReviewBarProps) {
  const noun = hunks.length === 1 ? 'change' : 'changes';

  const acceptDisabledReason =
    disabledReason ??
    (checked.size === 0 ? 'Check at least one change to accept.' : null);

  // Enter accepts, Esc rejects — the same keyboard contract the dialog had,
  // minus the modal focus trap: the editor keeps its caret and its undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onReject();
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')
      ) {
        return;
      }
      if (acceptDisabledReason || busy) return;
      event.preventDefault();
      onAccept();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [acceptDisabledReason, busy, onAccept, onReject]);

  return (
    <div
      role="region"
      aria-label="Review AI changes"
      data-testid="ai-review-bar"
      className="shrink-0 border-b border-hairline bg-surface px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs text-ink-soft">
          {AI_COMMANDS[command].label} ·{' '}
          <span data-testid="ai-change-count">
            {hunks.length} {noun}
          </span>
          {plan !== null && (
            <span
              data-testid="ai-review-plan-step"
              className="ml-2 text-[11px] text-ink-faint"
            >
              Step {plan.at + 1} of {plan.total} of your plan
            </span>
          )}
        </p>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={acceptDisabledReason !== null || busy}
            className="touch-target inline-flex h-7 items-center rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Accept {checked.size > 0 ? `(${checked.size})` : ''}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="touch-target inline-flex h-7 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            Reject
          </button>
          {plan === null ? (
            <>
              <button
                type="button"
                onClick={onRetry}
                disabled={retryBlocked || busy}
                className="touch-target inline-flex h-7 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onEditPrompt}
                disabled={retryBlocked || busy}
                className="touch-target inline-flex h-7 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Edit prompt
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={plan.onStop}
              className="touch-target inline-flex h-7 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              Stop the plan
            </button>
          )}
        </div>
      </div>

      {hunks.length > 1 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {hunks.map((hunk, index) => (
            <label
              key={hunk.id}
              className="flex items-center gap-1.5 text-[11px] text-ink-soft"
            >
              <input
                type="checkbox"
                checked={checked.has(hunk.id)}
                onChange={() => onToggle(hunk.id)}
                className="h-3 w-3 accent-accent"
              />
              Change {index + 1}
            </label>
          ))}
        </div>
      )}

      {(disabledReason !== null || checked.size === 0) && (
        <p
          role="status"
          data-testid="ai-accept-reason"
          className={
            disabledReason !== null
              ? 'mt-1 text-[11px] leading-4 text-danger'
              : 'mt-1 text-[11px] leading-4 text-ink-faint'
          }
        >
          {acceptDisabledReason}
        </p>
      )}

      {error && (
        <p
          role="alert"
          data-testid="ai-review-error"
          className="mt-1 text-[11px] leading-4 text-danger"
        >
          {error}
        </p>
      )}
      {busy && (
        <p className="mt-1 text-[11px] leading-4 text-ink-faint">Working…</p>
      )}
    </div>
  );
}
