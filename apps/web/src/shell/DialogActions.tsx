/**
 * The confirm button's three treatments. The tone is a parameter rather than a
 * hand-written variant at each call site, so one edit here reaches every
 * dialog that uses it.
 *
 * - `primary` — the graphite fill with Accent Ink text, which is DESIGN.md's
 *   Primary without its `shadow-sm`. The eight callers render it that way
 *   today; the shadow is a conformance question, not a deduplication, and is
 *   left for whoever reconciles the treatments.
 * - `danger-ghost` — the hairline with `--danger` text, the danger ghost
 *   DESIGN.md names for the Banner Strip's "copy warns of loss" buttons. The
 *   destructive confirm.
 * - `danger` — the solid `--danger` fill, which is what Reject order renders
 *   today and is the one treatment DESIGN.md's Buttons section does not name.
 *   Reconciling it with the ghost above is a design decision, not a
 *   deduplication, so it is kept as it renders rather than decided here.
 */
type ConfirmTone = 'primary' | 'danger' | 'danger-ghost';

const CONFIRM_TONE: Record<ConfirmTone, string> = {
  primary: 'bg-accent-strong text-accent-ink hover:bg-accent-deep',
  danger: 'bg-danger text-white',
  'danger-ghost': 'border border-danger/30 text-danger hover:bg-danger/10',
};

const CONFIRM_CLASS =
  'h-9 flex-1 rounded-control text-sm font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 disabled:opacity-60';

const CANCEL_CLASS =
  'h-9 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';

interface DialogActionsProps {
  /**
   * The request's failure, shown above the row. Every caller has the state for
   * it, so it is required rather than optional: a row that can silently lose
   * its failure line is the drift this component exists to stop.
   */
  error: string | null;
  /** The confirm button's resting label. */
  confirmLabel: string;
  /** The confirm button's label while the request is in flight. */
  busyLabel: string;
  /** A request is in flight: the confirm is disabled and reads `busyLabel`. */
  submitting: boolean;
  /**
   * Whatever else makes the confirm unavailable — an empty field, a mismatched
   * one. The busy state is added to it, so a caller states its own reason and
   * nothing more.
   */
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Defaults to `primary`; the destructive confirms ask for their own. */
  tone?: ConfirmTone;
  /**
   * The confirm button's own name, so a test can point at this dialog's. Each
   * dialog names its own, which is also what keeps the eight surfaces
   * addressable when they are all on screen.
   */
  confirmTestId: string;
}

/**
 * The action row the decision dialogs share, beside `Dialog` because it is the
 * other half of one: the failure line, the confirm, and the cancel, in the
 * order and the geometry these eight callers already agree on — the confirm
 * takes the width, Cancel keeps its own, and the failure sits above both where
 * the eye returns to after a refusal.
 *
 * One implementation because these are the dialogs an Admin is most likely to
 * be wrong in, and the next change to their focus rings, their busy labels or
 * their confirm's treatment should not be eight edits.
 *
 * It covers the dialogs that make a decision with a confirm and a cancel. The
 * compact pairs (the rename dialog, the print hint) and the payment form's row
 * are a different shape — right-aligned rather than full-width, cancel first,
 * a submit inside a form — and stay as they are rather than become a second
 * mode of this one.
 *
 * It is not a conformance fix, and does not claim to be one: these confirms are
 * 36px with no `touch-target`, so they do not reach the 44px coarse-pointer
 * floor the compact pairs above do. That is inherited from the eight callers,
 * not introduced here, and correcting it is a pixel change this refactor does
 * not make.
 */
export function DialogActions({
  error,
  confirmLabel,
  busyLabel,
  submitting,
  disabled = false,
  onConfirm,
  onCancel,
  tone = 'primary',
  confirmTestId,
}: DialogActionsProps) {
  return (
    <>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid={confirmTestId}
          disabled={disabled || submitting}
          onClick={onConfirm}
          className={`${CONFIRM_CLASS} ${CONFIRM_TONE[tone]}`}
        >
          {submitting ? busyLabel : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className={CANCEL_CLASS}>
          Cancel
        </button>
      </div>
    </>
  );
}
