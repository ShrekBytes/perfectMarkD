import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { PlanComparison } from './PlanComparison';
import { CLIENT_EXPORT_NOTE, PAID_PLANS_PITCH, planName } from './plans';
import { UpgradeFlow } from '../billing/UpgradeFlow';

interface PricingModalProps {
  onClose: () => void;
}

/**
 * The pricing modal opened by the paid-feature controls (Inspector locks in
 * editor-app/05, the Export dropdown's Server Export item). Same comparison
 * as /pricing, compact. A paid plan's Upgrade CTA swaps the flow (billing/01)
 * into this same dialog rather than stacking a second one; Escape and the
 * backdrop close whichever view is showing.
 */
export function PricingModal({ onClose }: PricingModalProps) {
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'premium' | null>(
    null,
  );

  return (
    <Dialog
      label={
        upgradePlan
          ? `Upgrade to ${planName(upgradePlan)}`
          : 'Plans and pricing'
      }
      testId="pricing-modal"
      backdropTestId="pricing-modal-backdrop"
      onClose={onClose}
      panelClassName={upgradePlan ? undefined : 'w-full max-w-4xl'}
    >
      {upgradePlan ? (
        <UpgradeFlow plan={upgradePlan} onClose={onClose} />
      ) : (
        <>
          <p className="mb-6 max-w-prose text-sm text-ink-soft">
            {PAID_PLANS_PITCH}
          </p>
          <PlanComparison
            compact
            onOpenEditor={onClose}
            onUpgrade={setUpgradePlan}
          />
          <p className="mt-3 text-xs text-ink-soft">{CLIENT_EXPORT_NOTE}</p>
        </>
      )}
    </Dialog>
  );
}
