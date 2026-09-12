import { Link } from '../router';
import { useAccountStore } from '../auth/account-store';

/**
 * Full-width notice under the top bar (billing/04): a refresh re-locked the
 * user's Entitlement — the plan expired or was revoked. The re-lock itself is
 * graceful (gates close, quota chip hides), and this banner is the "clear
 * notice": it says what happened, that nothing was lost — the gated settings
 * persist, they are just gated again — and where to fix it.
 */
export function PlanEndedBanner() {
  const planEndedNotice = useAccountStore((state) => state.planEndedNotice);
  const dismissPlanEndedNotice = useAccountStore(
    (state) => state.dismissPlanEndedNotice,
  );

  if (!planEndedNotice) return null;

  return (
    <div
      role="alert"
      data-testid="plan-ended-banner"
      className="flex h-10 shrink-0 items-center gap-3 border-b border-hairline bg-accent-soft px-3 text-sm text-ink"
    >
      <p className="min-w-0 truncate">
        Your paid plan has ended — paid features are locked again. Your
        documents and settings are untouched.
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Link
          to="/pricing"
          className="flex h-7 items-center rounded-control bg-accent-strong px-2.5 text-sm font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-deep"
        >
          See plans
        </Link>
        <button
          type="button"
          onClick={dismissPlanEndedNotice}
          aria-label="Dismiss plan-ended notice"
          className="flex h-7 items-center rounded-control border border-hairline px-2.5 text-sm text-ink-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
