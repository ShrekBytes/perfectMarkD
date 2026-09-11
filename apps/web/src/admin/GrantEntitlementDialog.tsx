import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { DURATIONS } from '../pricing/plans';
import { grantEntitlement, type AdminUserDetail } from './api';
import { previewExpiry } from './verification-display';

const PLAN_LABEL: Record<string, string> = { pro: 'Pro', premium: 'Premium' };

interface GrantEntitlementDialogProps {
  user: AdminUserDetail;
  /** Called after the grant landed; the detail refreshes and the dialog closes. */
  onGranted: () => void;
  onClose: () => void;
}

/**
 * The manual Entitlement grant (billing/03): the Admin picks a plan and a
 * duration (or an exact date) with no Order behind it — comping a plan,
 * fixing a wrong grant, or setting one up by hand. The preview applies the
 * same stacking rule the server does; the server's grant stays the authority.
 */
export function GrantEntitlementDialog({
  user,
  onGranted,
  onClose,
}: GrantEntitlementDialogProps) {
  const [plan, setPlan] = useState<'pro' | 'premium'>('pro');
  const [duration, setDuration] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const current = user.entitlement;
  const preview = customDate
    ? customDate
    : duration
      ? previewExpiry(current?.expiresAt ?? null, duration, new Date())
      : null;
  const previewNote = customDate
    ? 'set exactly'
    : duration
      ? stackingNote(current?.expiresAt ?? null, duration)
      : '';

  const chooseDuration = (months: number) => {
    setDuration(months);
    setCustomDate('');
  };

  const onGrant = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await grantEntitlement(
        user.id,
        customDate
          ? { plan, expiresAt: customDate }
          : { plan, durationMonths: duration! },
      );
      onGranted();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      label="Grant entitlement"
      testId="grant-dialog"
      backdropTestId="grant-backdrop"
      panelClassName="w-full max-w-md"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">{user.email}</p>
      <p className="mt-1 text-xs" data-testid="grant-current">
        {current
          ? `Current: ${PLAN_LABEL[current.plan] ?? current.plan} until ${current.expiresAt.slice(0, 10)}.`
          : 'The user has no active entitlement.'}
      </p>

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-soft">Plan</p>
        <div className="mt-1.5 flex gap-1.5">
          {(['pro', 'premium'] as const).map((planId) => (
            <button
              key={planId}
              type="button"
              data-testid={`grant-plan-${planId}`}
              aria-pressed={plan === planId}
              onClick={() => setPlan(planId)}
              className={`h-8 rounded-control border px-3 text-xs font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                plan === planId
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-hairline bg-canvas text-ink-soft hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {PLAN_LABEL[planId]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-soft">Grant duration</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DURATIONS.map((months) => (
            <button
              key={months}
              type="button"
              data-testid={`grant-duration-${months}`}
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
            data-testid="grant-custom-expiry"
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
          {PLAN_LABEL[plan]} until {preview} ({previewNote}).
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
          data-testid="confirm-grant"
          disabled={(!duration && !customDate) || submitting}
          onClick={() => void onGrant()}
          className="h-9 flex-1 rounded-control bg-accent text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Granting…' : 'Grant'}
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
 * compared as timestamps (the same rule the server applies), never strings.
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
