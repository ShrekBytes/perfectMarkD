import { useCallback, useEffect, useState } from 'react';
import {
  getAdminUser,
  revokeEntitlement,
  type AdminUserDetail,
  type AiUsageView,
} from './api';
import { orderDate, STATUS_BADGE, STATUS_LABEL } from '../billing/payment';
import { planName } from '../pricing/plans';
import { Dialog } from '../shell/Dialog';
import { GrantEntitlementDialog } from './GrantEntitlementDialog';
import { CompQuotaDialog } from './CompQuotaDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import type { OrderStatus } from '../billing/api';

type DetailDialog = 'grant' | 'revoke' | 'comp' | 'reset' | 'delete' | null;

/** One line for the user's AI Action count, in their own counter (03). */
function aiUsageLine(ai: AiUsageView): string {
  if (ai.allowance > 0) {
    return `${ai.used} of ${ai.allowance} used (${ai.period}) — ${ai.remaining} remaining`;
  }
  if (ai.used > 0) {
    return `${ai.used} used (${ai.period}) — no AI allowance on this plan`;
  }
  return `None this period (${ai.period}).`;
}

/**
 * The admin's view of one user (billing/03): their Entitlement, this period's
 * quota usage, and their Order history, with the actions that need a human —
 * grant/extend/revoke the Entitlement, comp quota, manual password reset, and
 * account deletion. Every action re-reads the user: the server is the only
 * authority on state, the panel just shows it.
 */
export function UserDetail({
  userId,
  onBack,
  onChanged,
}: {
  userId: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DetailDialog>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setUser(await getAdminUser(userId));
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) {
    return (
      <div>
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Back to users
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <p className="py-6 text-center text-xs text-ink-faint">Loading user…</p>
    );
  }

  const { entitlement, usage } = user;
  const allowanceNote =
    usage.comps > 0 ? `includes ${usage.comps} comped` : 'no comps this period';

  return (
    <div>
      <button
        type="button"
        data-testid="user-back"
        onClick={onBack}
        className="text-xs text-ink-soft outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2"
      >
        ← All users
      </button>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-ink">
          {user.email}
        </h2>
        <p className="shrink-0 text-xs text-ink-faint">
          Joined {orderDate(user.createdAt)}
        </p>
      </div>

      <div className="mt-3 rounded-pane border border-hairline bg-surface p-3">
        <p className="text-xs font-medium text-ink-soft">Entitlement</p>
        <p data-testid="user-entitlement" className="mt-1 text-sm text-ink">
          {entitlement
            ? `${planName(entitlement.plan as 'pro' | 'premium')} until ${entitlement.expiresAt.slice(0, 10)}`
            : 'No active entitlement.'}
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            data-testid="user-grant"
            onClick={() => setDialog('grant')}
            className="h-8 rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
          >
            {entitlement ? 'Extend' : 'Grant entitlement'}
          </button>
          {entitlement && (
            <button
              type="button"
              data-testid="user-revoke"
              onClick={() => setDialog('revoke')}
              className="h-8 rounded-control border border-danger/30 px-3 text-xs font-medium text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-danger/10 focus-visible:outline-2"
            >
              Revoke
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 rounded-pane border border-hairline bg-surface p-3">
        <p className="text-xs font-medium text-ink-soft">Server exports</p>
        <p data-testid="user-usage" className="mt-1 text-sm text-ink">
          {usage.used} of {usage.allowance} used ({usage.period}) —{' '}
          {allowanceNote}
        </p>
        <div className="mt-2.5">
          <button
            type="button"
            data-testid="user-comp"
            onClick={() => setDialog('comp')}
            className="h-8 rounded-control border border-hairline px-3 text-xs font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Comp quota
          </button>
        </div>
      </div>

      <div className="mt-2 rounded-pane border border-hairline bg-surface p-3">
        <p className="text-xs font-medium text-ink-soft">AI Actions</p>
        <p data-testid="user-ai-usage" className="mt-1 text-sm text-ink">
          {aiUsageLine(user.aiUsage)}
        </p>
      </div>

      <div className="mt-2 rounded-pane border border-hairline bg-surface p-3">
        <p className="text-xs font-medium text-ink-soft">Orders</p>
        {user.orders.length === 0 ? (
          <p
            data-testid="user-orders-empty"
            className="mt-1 text-xs text-ink-soft"
          >
            No orders yet.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5" data-testid="user-orders">
            {user.orders.map((order) => (
              <li
                key={order.id}
                data-testid="user-order-row"
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0">
                  <span className="font-mono font-semibold text-ink">
                    {order.referenceCode}
                  </span>
                  <span className="text-ink-soft">
                    {' '}
                    {order.plan} · {order.durationMonths}{' '}
                    {order.durationMonths === 1 ? 'month' : 'months'} ·{' '}
                    {order.amountExpected} {order.coin}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-faint">
                    {orderDate(order.createdAt)}
                  </span>
                  <span
                    className={`rounded-control border px-1.5 py-0.5 font-medium ${STATUS_BADGE[order.status as OrderStatus]}`}
                  >
                    {STATUS_LABEL[order.status as OrderStatus]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 rounded-pane border border-hairline bg-surface p-3">
        <p className="text-xs font-medium text-ink-soft">Account</p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            data-testid="user-reset-password"
            onClick={() => setDialog('reset')}
            className="h-8 rounded-control border border-hairline px-3 text-xs font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Reset password
          </button>
          <button
            type="button"
            data-testid="user-delete"
            onClick={() => setDialog('delete')}
            className="h-8 rounded-control border border-danger/30 px-3 text-xs font-medium text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-danger/10 focus-visible:outline-2"
          >
            Delete account
          </button>
        </div>
      </div>

      {dialog === 'grant' && (
        <GrantEntitlementDialog
          user={user}
          onGranted={() => {
            setDialog(null);
            void refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'revoke' && entitlement && (
        <Dialog
          label="Revoke entitlement"
          testId="revoke-dialog"
          backdropTestId="revoke-backdrop"
          panelClassName="w-full max-w-sm"
          onClose={() => setDialog(null)}
        >
          <p className="text-xs text-ink-soft">
            {user.email} — {planName(entitlement.plan as 'pro' | 'premium')}{' '}
            until {entitlement.expiresAt.slice(0, 10)}.
          </p>
          <p className="mt-2 text-xs text-ink">
            Revoking locks the paid features and stops the quota immediately.
            The user&apos;s Orders stay.
          </p>
          <RevokeActions
            userId={user.id}
            onRevoked={() => {
              setDialog(null);
              void refresh();
            }}
            onClose={() => setDialog(null)}
          />
        </Dialog>
      )}
      {dialog === 'comp' && (
        <CompQuotaDialog
          user={user}
          onComp={() => {
            setDialog(null);
            void refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reset' && (
        <ResetPasswordDialog
          user={user}
          onDone={onChanged}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <DeleteAccountDialog
          user={user}
          onDeleted={() => {
            setDialog(null);
            onChanged();
            onBack();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function RevokeActions({
  userId,
  onRevoked,
  onClose,
}: {
  userId: number;
  onRevoked: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onRevoke = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await revokeEntitlement(userId);
      onRevoked();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

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
          data-testid="confirm-revoke"
          disabled={submitting}
          onClick={() => void onRevoke()}
          className="h-9 flex-1 rounded-control border border-danger/30 text-sm font-medium text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-danger/10 focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Revoking…' : 'Revoke entitlement'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Cancel
        </button>
      </div>
    </>
  );
}
