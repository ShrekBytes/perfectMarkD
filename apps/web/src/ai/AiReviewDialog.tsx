// ─────────────────────────────────────────────────────────────────────────────
// The AI Proposal review dialog (spec §The review surface). Every AI Action
// ends here — never a silent edit. The body is a graphite diff: monospace
// lines, `+`/`−` gutter marks, soft surface fills, three lines of context, a
// change count, and a "show all" control for a long diff. Each change is
// independently checkable and checked by default; Accept applies the checked
// changes as one undoable edit, Reject closes with the Document untouched.
//
// No red/green: chrome carries no accent hue, and `--danger` stays reserved
// for failures. Keyboard: Esc rejects, Enter accepts.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { AI_COMMANDS } from './trigger';
import { AiDiff } from './AiDiff';
import type { AiChange, AiChangeSet } from './proposal';
import type { AiCommand } from './types';

interface AiReviewDialogProps {
  command: AiCommand;
  changeSet: AiChangeSet;
  /**
   * Why Accept is unavailable, resolved by the controller (a stale target, an
   * exhausted allowance, or a failed Retry). Null when it is available.
   */
  disabledReason: string | null;
  /** A Retry is in flight. */
  busy: boolean;
  /**
   * Whether Retry and Edit prompt are unavailable. They stay available for a
   * stale proposal — retrying is the remedy — but not when the allowance is
   * spent, because a resubmission is a fresh AI Action.
   */
  retryBlocked: boolean;
  /** A Retry failed; shown inline, naming nothing about the provider. */
  error: string | null;
  onAccept: (checked: ReadonlySet<number>) => void;
  onReject: () => void;
  onRetry: () => void;
  onEditPrompt: () => void;
}

/** Show at most this many changes before the "show all" control appears. */
const COLLAPSE_AFTER = 5;

interface ChangeRowProps {
  change: AiChange;
  checked: boolean;
  onToggle: () => void;
}

function ChangeRow({ change, checked, onToggle }: ChangeRowProps) {
  return (
    <li className="border-t border-hairline py-2 first:border-t-0">
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-accent"
        />
        Change {change.id + 1}
      </label>
      <AiDiff change={change} />
    </li>
  );
}

export function AiReviewDialog({
  command,
  changeSet,
  disabledReason,
  busy,
  retryBlocked,
  error,
  onAccept,
  onReject,
  onRetry,
  onEditPrompt,
}: AiReviewDialogProps) {
  const allIds = changeSet.changes.map((change) => change.id);
  const [checked, setChecked] = useState<Set<number>>(new Set(allIds));
  const [expanded, setExpanded] = useState(
    changeSet.changes.length <= COLLAPSE_AFTER,
  );

  const toggle = (id: number) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The controller's reason wins — it knows about staleness and the allowance;
  // "nothing is checked" is this dialog's own business.
  const acceptDisabledReason =
    disabledReason ??
    (checked.size === 0 ? 'Check at least one change to accept.' : null);

  // Enter accepts from anywhere in the dialog. A listener on the document, not
  // a handler on the body: the modal panel takes focus on open, and a keydown
  // on an ancestor never reaches a descendant.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      onAccept(checked);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [acceptDisabledReason, busy, checked, onAccept]);

  const visible = expanded
    ? changeSet.changes
    : changeSet.changes.slice(0, COLLAPSE_AFTER);
  const hidden = changeSet.changes.length - visible.length;
  const noun = changeSet.changes.length === 1 ? 'change' : 'changes';

  return (
    <Dialog
      label="Review AI changes"
      testId="ai-review-dialog"
      panelClassName="w-full max-w-3xl"
      onClose={onReject}
    >
      <div>
        <p className="text-xs text-ink-soft">
          {AI_COMMANDS[command].label} ·{' '}
          <span data-testid="ai-change-count">
            {changeSet.changes.length} {noun}
          </span>
        </p>
        <p className="mt-1 text-[11px] leading-4 text-ink-faint">
          {command === 'stylesheet'
            ? 'Nothing is written to your stylesheet until you accept. The paper is showing this proposal in the meantime.'
            : 'Nothing is written to your Document until you accept, and an accepted proposal is one undo step.'}
        </p>

        <ul className="mt-3 max-h-[55vh] overflow-y-auto pr-1">
          {visible.map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              checked={checked.has(change.id)}
              onToggle={() => toggle(change.id)}
            />
          ))}
        </ul>

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="touch-target mt-2 inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            Show all {changeSet.changes.length} {noun}
          </button>
        )}

        {(disabledReason !== null || checked.size === 0) && (
          <p
            role="status"
            data-testid="ai-accept-reason"
            className={
              disabledReason !== null
                ? 'mt-3 text-[11px] leading-4 text-danger'
                : 'mt-3 text-[11px] leading-4 text-ink-faint'
            }
          >
            {acceptDisabledReason}
          </p>
        )}

        {error && (
          <p
            role="alert"
            data-testid="ai-review-error"
            className="mt-3 text-[11px] leading-4 text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAccept(checked)}
            disabled={acceptDisabledReason !== null || busy}
            className="touch-target inline-flex h-8 items-center rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Accept {checked.size > 0 ? `(${checked.size})` : ''}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="touch-target inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            Reject
          </button>
          <div className="ml-auto flex items-center gap-2">
            {busy && (
              <p className="text-[11px] leading-4 text-ink-faint">Working…</p>
            )}
            <button
              type="button"
              onClick={onRetry}
              disabled={retryBlocked || busy}
              className="touch-target inline-flex h-8 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onEditPrompt}
              disabled={retryBlocked || busy}
              className="touch-target inline-flex h-8 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Edit prompt
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
