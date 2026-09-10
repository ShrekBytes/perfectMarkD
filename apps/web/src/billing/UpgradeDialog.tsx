import { Dialog } from '../shell/Dialog';
import { planName } from '../pricing/plans';
import { UpgradeFlow } from './UpgradeFlow';

interface UpgradeDialogProps {
  plan: 'pro' | 'premium';
  onClose: () => void;
}

/**
 * The upgrade flow in its own dialog — how /pricing opens it when a paid
 * plan's CTA is clicked. (The pricing modal swaps the same UpgradeFlow into
 * its existing chrome instead of stacking a second dialog.)
 */
export function UpgradeDialog({ plan, onClose }: UpgradeDialogProps) {
  return (
    <Dialog
      label={`Upgrade to ${planName(plan)}`}
      testId="upgrade-dialog"
      backdropTestId="upgrade-dialog-backdrop"
      panelClassName="w-full max-w-md"
      onClose={onClose}
    >
      <UpgradeFlow plan={plan} onClose={onClose} />
    </Dialog>
  );
}
