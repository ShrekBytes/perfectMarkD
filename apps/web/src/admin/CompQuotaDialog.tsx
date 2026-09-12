import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { compQuota, type AdminUserDetail } from './api';

interface CompQuotaDialogProps {
  user: AdminUserDetail;
  /** Called after the comp landed; the detail refreshes and the dialog closes. */
  onComp: () => void;
  onClose: () => void;
}
/**
 * Comp quota (billing/03): grant extra Server Exports for the current period
 * — a support gesture or a fix for a failed export the user already paid
 * quota for. A negative amount retracts comps; the floor is zero.
 */
export function CompQuotaDialog({
  user,
  onComp,
  onClose,
}: CompQuotaDialogProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsed = Number(amount);
  const valid =
    amount.trim() !== '' && Number.isInteger(parsed) && parsed !== 0;

  const onSubmit = async () => {
    if (submitting || !valid) return;
    setError(null);
    setSubmitting(true);
    try {
      await compQuota(user.id, parsed);
      onComp();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      label="Comp quota"
      testId="comp-dialog"
      backdropTestId="comp-backdrop"
      panelClassName="w-full max-w-sm"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">{user.email}</p>
      <p className="mt-1 text-xs" data-testid="comp-current">
        {user.usage.used} of {user.usage.allowance} exports used (
        {user.usage.period}) · {user.usage.comps} comped.
      </p>

      <label className="mt-3 block text-xs font-medium text-ink-soft">
        Exports to add (negative retracts)
        <input
          type="number"
          data-testid="comp-amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="e.g. 50"
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>
      <p className="mt-1.5 text-xs text-ink-faint">
        Applies to the current period only ({user.usage.period}). Comps never go
        below zero.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid="confirm-comp"
          disabled={!valid || submitting}
          onClick={() => void onSubmit()}
          className="h-9 flex-1 rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Applying…' : 'Apply comp'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
