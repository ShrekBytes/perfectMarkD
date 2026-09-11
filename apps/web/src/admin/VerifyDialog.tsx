import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { DURATIONS } from '../pricing/plans';
import { verifyOrder, type AdminOrder } from './api';
import { previewExpiry } from './verification-display';

interface VerifyDialogProps {
  order: AdminOrder;
  /** Called after the grant landed; the queue refreshes and closes the dialog. */
  onVerified: () => void;
  onClose: () => void;
}

const PLAN_LABEL: Record<string, string> = { pro: 'Pro', premium: 'Premium' };

/**
 * The Verify decision (billing/02): grant a preset duration or an exact
 * custom expiry. The preview applies the same stacking rule the server does
 * — durations extend from the current expiry while it is still active — but
 * the server's grant stays the authority; this only shows the Admin the date
 * before they commit money-equivalent value.
 */
export function VerifyDialog({
  order,
  onVerified,
  onClose,
}: VerifyDialogProps) {
  const [duration, setDuration] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { entitlement } = order;
  const planLabel = PLAN_LABEL[order.plan] ?? order.plan;
  const preview = customDate
    ? customDate
    : duration
      ? previewExpiry(entitlement?.expiresAt ?? null, duration, new Date())
      : null;
  const previewNote = customDate
    ? 'set exactly'
    : duration
      ? stackingNote(entitlement?.expiresAt ?? null, duration)
      : '';

  const chooseDuration = (months: number) => {
    setDuration(months);
    setCustomDate('');
  };

  const onVerify = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyOrder(
        order.id,
        customDate ? { expiresAt: customDate } : { durationMonths: duration! },
      );
      onVerified();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      label="Verify order"
      testId="verify-dialog"
      backdropTestId="verify-backdrop"
      panelClassName="w-full max-w-md"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">
        <span className="font-mono text-sm font-semibold text-ink">
          {order.referenceCode}
        </span>{' '}
        — {order.userEmail}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {order.plan} · {order.durationMonths}{' '}
        {order.durationMonths === 1 ? 'month' : 'months'} ·{' '}
        {order.amountExpected} {order.coin}
      </p>
      <p className="mt-2 text-xs" data-testid="current-entitlement">
        {entitlement
          ? `Current: ${PLAN_LABEL[entitlement.plan] ?? entitlement.plan} until ${entitlement.expiresAt.slice(0, 10)}.`
          : 'The user has no active entitlement.'}
      </p>

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-soft">Grant duration</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DURATIONS.map((months) => (
            <button
              key={months}
              type="button"
              data-testid={`duration-${months}`}
              aria-pressed={duration === months && customDate === ''}
              onClick={() => chooseDuration(months)}
              className={`h-8 rounded-control border px-3 text-xs font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                duration === months && customDate === ''
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-hairline bg-canvas text-ink-soft hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {months} {months === 1 ? 'month' : 'months'}
            </button>
          ))}
        </div>
        <label className="mt-2.5 block text-xs font-medium text-ink-soft">
          or custom expiry date
          <input
            type="date"
            data-testid="custom-expiry"
            value={customDate}
            onChange={(event) => {
              setCustomDate(event.target.value);
              setDuration(null);
            }}
            className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          />
        </label>
      </div>

      {preview && (
        <p
          data-testid="grant-preview"
          className="mt-3 rounded-control border border-accent/40 bg-accent-soft px-2.5 py-2 text-xs text-accent"
        >
          {planLabel} until {preview} ({previewNote}).
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid="confirm-verify"
          disabled={(!duration && !customDate) || submitting}
          onClick={() => void onVerify()}
          className="h-9 flex-1 rounded-control bg-accent text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Granting…' : 'Verify & grant'}
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

/**
 * Whether the preview stacks onto the current expiry or starts from today —
 * compared as timestamps (same rule as previewExpiry), never as strings.
 */
function stackingNote(
  currentExpiresAt: string | null,
  durationMonths: number,
): string {
  const active =
    currentExpiresAt !== null &&
    new Date(currentExpiresAt).getTime() > Date.now();
  return `${durationMonths} months from ${
    active ? 'the current expiry' : 'today'
  }`;
}
