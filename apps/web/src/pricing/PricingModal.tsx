import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { PlanComparison } from './PlanComparison';
import { planName } from './plans';
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
    >
      {upgradePlan ? (
        <UpgradeFlow plan={upgradePlan} onClose={onClose} />
      ) : (
        <>
          <PlanComparison
            compact
            onOpenEditor={onClose}
            onUpgrade={setUpgradePlan}
          />
          <p className="mt-3 text-xs text-ink-soft">
            Paid plans only add one-click Server Export and convenience
            features. Client Export keeps working exactly as it does now.
          </p>
        </>
      )}
    </Dialog>
  );
}
