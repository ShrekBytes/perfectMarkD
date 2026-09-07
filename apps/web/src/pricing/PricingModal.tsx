import { useEffect } from 'react';
import { CloseIcon } from '../shell/icons';
import { PlanComparison } from './PlanComparison';
import { BILLING_LIVE, COMING_SOON_NOTE } from './plans';

interface PricingModalProps {
  onClose: () => void;
}

/**
 * The pricing modal opened by the inert paid-feature controls (Inspector locks
 * in editor-app/05, the Export dropdown's Server Export item). Same comparison
 * as /pricing, compact, with the Phase-1 "coming soon" state — never a signup
 * wall. Phase 2 swaps the CTA inside PlanComparison; this wrapper stays.
 */
export function PricingModal({ onClose }: PricingModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="pricing-modal-backdrop"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 z-[60] bg-black/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plans and pricing"
        data-testid="pricing-modal"
        className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center p-6"
      >
        <div className="w-full max-w-xl rounded-pane border border-hairline bg-surface p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold">Plans and pricing</h2>
            <button
              type="button"
              autoFocus
              aria-label="Close"
              onClick={onClose}
              className="-m-1 rounded-control p-1 text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-3">
            <PlanComparison compact onOpenEditor={onClose} />
          </div>

          {!BILLING_LIVE && (
            <p className="mt-3 text-xs text-ink-soft">
              {COMING_SOON_NOTE} Client Export keeps working exactly as it does
              now.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
