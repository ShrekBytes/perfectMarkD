import { useAccountStore } from '../auth/account-store';
import { BannerButton, BannerStrip } from './BannerStrip';

/**
 * Shell-level notice under the top bar (billing/04): a refresh re-locked the
 * user's Entitlement — the plan expired or was revoked. The re-lock itself is
 * graceful (gates close, quota chip hides), and this banner is the "clear
 * notice": it says what happened, that nothing was lost — the gated settings
 * persist, they are just gated again — and where to fix it. Dismissal is the
 * shared icon idiom; the secondary slot stays reserved for real actions.
 */
export function PlanEndedBanner() {
  const planEndedNotice = useAccountStore((state) => state.planEndedNotice);
  const dismissPlanEndedNotice = useAccountStore(
    (state) => state.dismissPlanEndedNotice,
  );

  if (!planEndedNotice) return null;

  return (
    <BannerStrip
      testid="plan-ended-banner"
      role="alert"
      copy="Your paid plan has ended — paid features are locked again. Your documents and settings are untouched."
      onDismiss={dismissPlanEndedNotice}
      dismissLabel="Dismiss plan-ended notice"
    >
      <BannerButton variant="primary" to="/pricing">
        See plans
      </BannerButton>
    </BannerStrip>
  );
}
