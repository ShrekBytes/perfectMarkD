import { BILLING_LIVE, FEATURE_ROWS, PLANS, formatPrice } from './plans';
import type { Plan } from './plans';
import { CheckIcon } from '../shell/icons';

interface PlanComparisonProps {
  /** Tighter type and spacing for the pricing modal; rows stay identical. */
  compact?: boolean;
  /** The free plan's CTA: on /pricing this navigates to the editor, in the
   *  modal it just closes the modal (the editor is already underneath). */
  onOpenEditor: () => void;
}

/**
 * The three-column plan comparison, rendered straight from the plans module so
 * the /pricing page and the pricing modal can never drift apart. Feature cells
 * keep visually hidden text so the table still reads as yes/no/quote for
 * screen readers.
 */
export function PlanComparison({ compact, onOpenEditor }: PlanComparisonProps) {
  const bodyText = compact ? 'text-xs' : 'text-sm';
  const cellPad = compact ? 'px-2 py-1.5' : 'px-3 py-2';

  return (
    <div className="overflow-x-auto">
      <table
        data-testid="plan-comparison"
        className={`w-full border-collapse ${bodyText}`}
      >
        <thead>
          <tr>
            <th scope="col" className="w-2/5 border-b border-hairline-strong" />
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className="border-b border-hairline-strong px-2 pb-3 pt-1 text-center align-bottom font-normal"
              >
                <span
                  className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-base'}`}
                >
                  {plan.name}
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {formatPrice(plan)}
                </span>
                {!compact && (
                  <span className="mt-1 block text-xs font-normal text-ink-faint">
                    {plan.blurb}
                  </span>
                )}
                <span className="mt-3 block">
                  <PlanCta
                    plan={plan}
                    onOpenEditor={onOpenEditor}
                    compact={compact}
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className={`border-b border-hairline text-left font-normal text-ink-soft ${cellPad} ${bodyText}`}
              >
                {row.label}
              </th>
              {PLANS.map((plan) => (
                <td
                  key={plan.id}
                  className={`border-b border-hairline text-center ${cellPad}`}
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
      <span className="inline-flex items-center text-accent">
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
  compact,
}: {
  plan: Plan;
  onOpenEditor: () => void;
  compact?: boolean;
}) {
  const size = compact ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm';
  const base = `inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${size}`;

  if (plan.id === 'free') {
    return (
      <button
        type="button"
        onClick={onOpenEditor}
        className={`${base} border border-accent/40 bg-accent-soft text-accent hover:bg-accent hover:text-accent-ink`}
      >
        Open the editor
      </button>
    );
  }

  // Phase 1 (editor-app/09): no accounts or payments exist, so the paid CTA is
  // an inert "Coming soon" — never a signup wall. BILLING_LIVE flips both this
  // button and the coming-soon notes; Phase 2's billing workstream then wires
  // the click to the real upgrade flow. The comparison layout stays as-is.
  return (
    <button
      type="button"
      disabled={!BILLING_LIVE}
      title={BILLING_LIVE ? undefined : 'Payments are launching soon'}
      className={`${base} border ${
        BILLING_LIVE
          ? 'border-accent bg-accent text-accent-ink hover:bg-accent-strong'
          : 'cursor-default border-hairline bg-surface text-ink-faint'
      }`}
    >
      {BILLING_LIVE ? 'Upgrade' : 'Coming soon'}
    </button>
  );
}
