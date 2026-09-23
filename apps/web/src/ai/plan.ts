// ─────────────────────────────────────────────────────────────────────────────
// The AI Plan's run state (ai-transforms/07, spec §Tier 2).
//
// A Document too large for one AI Action is planned instead: the plan is shown
// for approval with its cost against the allowance, and each approved step
// then runs as its own AI Action against its own section. This module holds
// the shape of that run and the plain words its summary uses, so the
// controller and the dialog agree about what "3 of 5 steps applied" means.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiPlanBrief, AiPlanStep } from './types';

/** Where a run is: approving the work list, working through it, or the summary
 *  that says what was applied and what remains. */
export type AiPlanPhase = 'approving' | 'running' | 'stopped' | 'finished';

export interface AiPlanState {
  /** The Document the plan belongs to; a run never crosses Documents. */
  docId: string;
  instruction: string;
  /** The steps, in order: everything the plan proposed while approving, and
   *  the approved subset once the run starts. */
  steps: AiPlanStep[];
  phase: AiPlanPhase;
  /** Index into `steps` of the step being proposed. */
  at: number;
  accepted: number;
  rejected: number;
  /** The plain-words summary shown when the run stopped or finished. */
  note: string | null;
  /** Bumped per plan, so the approval surface starts fresh for a new one. */
  nonce: number;
}

/**
 * The approved plan a step carries as its shared brief: every step of the run,
 * so the sections stay consistent with each other (spec §Tier 2).
 */
export function planBrief(
  steps: readonly AiPlanStep[],
  at: number,
): AiPlanBrief {
  return {
    index: at,
    steps: steps.map((step) => ({
      heading: step.heading,
      change: step.change,
    })),
  };
}

/** The steps the run has not decided yet, the one under review included. */
export function stepsRemaining(plan: AiPlanState): number {
  return Math.max(0, plan.steps.length - plan.at);
}

/** The word for a count of steps, so no two surfaces pluralize differently. */
export function stepNoun(count: number): string {
  return count === 1 ? 'step' : 'steps';
}

/**
 * What a stopped or finished run says: what was applied, and what remains.
 * Stopping early keeps every accepted step — the summary is how the user finds
 * out what is left (spec §Tier 2).
 */
export function planSummary(plan: AiPlanState, lead: string): string {
  const total = plan.steps.length;
  const applied = `${plan.accepted} of ${total} ${stepNoun(total)} applied`;
  const left = stepsRemaining(plan);
  if (left === 0) return `${lead} ${applied}.`;
  return left === 1
    ? `${lead} ${applied}; 1 step remains.`
    : `${lead} ${applied}; ${left} steps remain.`;
}

/** The plan's cost against the allowance, in the words the dialog shows. */
export function planCost(steps: number, remaining: number): string {
  const cost = `${steps} ${stepNoun(steps)} · ${steps} AI ${steps === 1 ? 'Action' : 'Actions'}`;
  return steps > remaining
    ? `${cost}. You have ${remaining} left, so the plan will stop when the allowance runs out.`
    : `${cost}. You have ${remaining} left.`;
}
