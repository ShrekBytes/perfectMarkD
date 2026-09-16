import { useId } from 'react';
import { FEATURE_ROWS, PLANS, formatPrice } from './plans';
import type { Plan } from './plans';
import { CheckIcon } from '../shell/icons';
import './pricing.css';

interface PlanComparisonProps {
  /** Tighter type and spacing for the pricing modal; rows stay identical. */
  compact?: boolean;
  /** The free plan's CTA: on /pricing this navigates to the editor, in the
   *  modal it just closes the modal (the editor is already underneath). */
  onOpenEditor: () => void;
  /** Starts the upgrade flow for a paid plan (billing/01). */
  onUpgrade: (plan: 'pro' | 'premium') => void;
}

/**
 * The three-column plan comparison, rendered straight from the plans module so
 * the /pricing page and the pricing modal can never drift apart. Feature cells
 * keep visually hidden text so the table still reads as yes/no/quote for
 * screen readers.
 */
export function PlanComparison({
  compact,
  onOpenEditor,
  onUpgrade,
}: PlanComparisonProps) {
  const comparisonId = useId();
  const bodyText = compact ? 'text-xs' : 'text-sm';
  const cellPad = compact ? 'px-2 py-1.5' : 'px-3 py-2';

  return (
    <div className="plan-comparison-container">
      <table
        role="table"
        aria-label="Compare plans"
        data-testid="plan-comparison"
        className={`plan-comparison w-full table-fixed border-collapse ${bodyText}`}
      >
        <thead role="rowgroup">
          <tr role="row">
            <th
              role="columnheader"
              scope="col"
              className="plan-feature-heading w-[34%] border-b border-hairline-strong"
            >
              <span className="sr-only">Features</span>
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                id={`${comparisonId}-${plan.id}`}
                role="columnheader"
                scope="col"
                className="plan-heading border-b border-hairline-strong px-3 pb-4 pt-1 text-center align-top font-normal"
              >
                <span
                  className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-base'}`}
                >
                  {plan.name}
                </span>
                <span className="mt-1 block font-mono text-xs tabular-nums text-ink-soft">
                  {formatPrice(plan)}
                </span>
                {!compact && (
                  <span className="plan-blurb mt-2 block text-xs font-normal text-ink-soft">
                    {plan.blurb}
                  </span>
                )}
                <span className="mt-3 block">
                  <PlanCta
                    plan={plan}
                    onOpenEditor={onOpenEditor}
                    onUpgrade={onUpgrade}
                    compact={compact}
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {FEATURE_ROWS.map((row, rowIndex) => (
            <tr
              role="row"
              key={row.label}
              className={row.groupStart ? 'plan-group-start' : undefined}
            >
              <th
                role="rowheader"
                id={`${comparisonId}-feature-${rowIndex}`}
                scope="row"
                className={`border-b border-hairline text-left font-normal text-ink-soft ${cellPad} ${bodyText}`}
              >
                {row.label}
              </th>
              {PLANS.map((plan) => (
                <td
                  key={plan.id}
                  role="cell"
                  headers={`${comparisonId}-feature-${rowIndex} ${comparisonId}-${plan.id}`}
                  className={`border-b border-hairline text-center tabular-nums ${cellPad}`}
                >
                  <CellValue value={row.values[plan.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center text-ink">
        <CheckIcon />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="text-ink-faint">
        —<span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className="text-ink">{value}</span>;
}

function PlanCta({
  plan,
  onOpenEditor,
  onUpgrade,
  compact,
}: {
  plan: Plan;
  onOpenEditor: () => void;
  onUpgrade: (plan: 'pro' | 'premium') => void;
  compact?: boolean;
}) {
  const size = compact ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm';
  const base = `touch-target inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${size}`;

  if (plan.id === 'free') {
    return (
      <button
        type="button"
        onClick={onOpenEditor}
        className={`${base} border border-hairline bg-canvas text-ink hover:bg-surface-hover`}
      >
        Open the editor
      </button>
    );
  }

  // Paid plans open the upgrade flow (billing/01): duration + payment method,
  // an account if needed, then the Order with its payment instructions.
  const paidPlanId = plan.id;
  return (
    <button
      type="button"
      onClick={() => onUpgrade(paidPlanId)}
      className={`${base} border border-accent bg-accent-strong text-accent-ink hover:bg-accent-deep`}
    >
      Upgrade
    </button>
  );
}
