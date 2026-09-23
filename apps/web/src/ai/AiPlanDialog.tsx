// ─────────────────────────────────────────────────────────────────────────────
// The AI Plan's surface (ai-transforms/07, spec §Tier 2).
//
// A Document too large for one AI Action is planned instead of refused. This
// dialog is the approval gate: the steps the plan proposed, what running them
// costs against the allowance left, and one control that starts the run. A
// plan is never started without that approval, and each step then arrives as
// its own proposal in the review dialog.
//
// While a step is under review the review dialog is the only modal on screen
// (the pane renders this one only when nothing is under review), so this
// dialog covers the approving phase, the run's progress between steps, and the
// summary that says what was applied and what remains.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { NO_HEADING_LABEL } from '@perfectmarkd/core';
import { Dialog } from '../shell/Dialog';
import { planCost, stepNoun, stepsRemaining, type AiPlanState } from './plan';

interface AiPlanDialogProps {
  plan: AiPlanState;
  /** The AI Actions left, which the cost is stated against. */
  remaining: number;
  /** A step request is in flight. */
  busy: boolean;
  onApprove: (checked: ReadonlySet<number>) => void;
  onDiscard: () => void;
  onStop: () => void;
  onClose: () => void;
}

const BUTTON =
  'touch-target inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2';

export function AiPlanDialog({
  plan,
  remaining,
  busy,
  onApprove,
  onDiscard,
  onStop,
  onClose,
}: AiPlanDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(
    new Set(plan.steps.map((_, index) => index)),
  );
  const approving = plan.phase === 'approving';

  const toggle = (index: number) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const noun = stepNoun(plan.steps.length);
  const left = stepsRemaining(plan);

  return (
    <Dialog
      label="AI Plan"
      testId="ai-plan-dialog"
      panelClassName="w-full max-w-2xl"
      onClose={approving ? onDiscard : onClose}
    >
      {approving ? (
        <div>
          <p className="text-xs leading-5 text-ink-soft">
            This document is too large for one AI Action, so it is planned
            instead. Each step runs on its own section and arrives as its own
            proposal, which you accept or reject one at a time.
          </p>
          <p
            data-testid="ai-plan-cost"
            className="mt-2 text-[11px] leading-4 text-ink-faint"
          >
            {planCost(plan.steps.length, remaining)}
          </p>

          <ul className="mt-3 max-h-[50vh] overflow-y-auto pr-1">
            {plan.steps.map((step, index) => (
              <li
                key={`${step.sectionIndex}-${index}`}
                className="border-t border-hairline py-2 first:border-t-0"
              >
                <label className="flex items-start gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={checked.has(index)}
                    onChange={() => toggle(index)}
                    className="mt-0.5 h-3.5 w-3.5 accent-accent"
                  />
                  <span>
                    <span className="font-medium text-ink">
                      {step.heading ?? NO_HEADING_LABEL}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-ink-faint">
                      step {index + 1}
                    </span>
                    <span className="mt-0.5 block leading-5">
                      {step.change}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(checked)}
              disabled={checked.size === 0 || busy}
              className="touch-target inline-flex h-8 items-center rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {checked.size === plan.steps.length
                ? `Run ${checked.size} ${stepNoun(checked.size)}`
                : `Run ${checked.size} of ${plan.steps.length} ${noun}`}
            </button>
            <button type="button" onClick={onDiscard} className={BUTTON}>
              Discard
            </button>
            <p className="ml-auto text-[11px] leading-4 text-ink-faint">
              Nothing changes until you accept a step's proposal.
            </p>
          </div>
        </div>
      ) : plan.phase === 'running' ? (
        <div>
          <p
            className="text-xs leading-5 text-ink-soft"
            data-testid="ai-plan-progress"
          >
            Step {plan.at + 1} of {plan.steps.length}
            {busy ? ' · working…' : ''}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-ink-faint">
            {left} {stepNoun(left)} left in this plan. Each one is its own AI
            Action.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onStop} className={BUTTON}>
              Stop the plan
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p
            role="status"
            data-testid="ai-plan-summary"
            className="text-xs leading-5 text-ink-soft"
          >
            {plan.note}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onClose} className={BUTTON}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
