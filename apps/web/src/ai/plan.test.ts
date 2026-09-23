import { describe, expect, it } from 'vitest';
import {
  planBrief,
  planCost,
  planSummary,
  stepsRemaining,
  type AiPlanState,
} from './plan';
import type { AiPlanStep } from './types';

const STEPS: AiPlanStep[] = [
  { sectionIndex: 0, heading: 'Introduction', change: 'cut it down' },
  { sectionIndex: 1, heading: null, change: 'move the notes' },
];

function plan(overrides: Partial<AiPlanState> = {}): AiPlanState {
  return {
    docId: 'doc-1',
    instruction: 'Make it plainer',
    steps: STEPS,
    phase: 'running',
    at: 0,
    accepted: 0,
    rejected: 0,
    note: null,
    nonce: 1,
    ...overrides,
  };
}

describe('planBrief', () => {
  it('carries every step and the one being run', () => {
    expect(planBrief(STEPS, 1)).toEqual({
      index: 1,
      steps: [
        { heading: 'Introduction', change: 'cut it down' },
        { heading: null, change: 'move the notes' },
      ],
    });
  });
});

describe('stepsRemaining', () => {
  it('counts the step under review as remaining', () => {
    expect(stepsRemaining(plan({ at: 0 }))).toBe(2);
    expect(stepsRemaining(plan({ at: 1 }))).toBe(1);
    expect(stepsRemaining(plan({ at: 2 }))).toBe(0);
  });
});

describe('planSummary', () => {
  it('says what was applied and what remains', () => {
    expect(
      planSummary(plan({ at: 1, accepted: 1 }), 'Stopped.'),
    ).toBe('Stopped. 1 of 2 steps applied; 1 step remains.');
  });

  it('drops the remainder when the run reached the end', () => {
    expect(
      planSummary(plan({ at: 2, accepted: 1, rejected: 1 }), 'Plan finished.'),
    ).toBe('Plan finished. 1 of 2 steps applied.');
  });

  it('speaks of one step in the singular', () => {
    expect(
      planSummary(plan({ steps: STEPS.slice(0, 1), at: 1, accepted: 1 }), 'Done.'),
    ).toBe('Done. 1 of 1 step applied.');
  });
});

describe('planCost', () => {
  it('states the steps, the AI Actions, and what is left', () => {
    expect(planCost(3, 42)).toBe('3 steps · 3 AI Actions. You have 42 left.');
    expect(planCost(1, 42)).toBe('1 step · 1 AI Action. You have 42 left.');
  });

  it('warns when the plan costs more than the allowance left', () => {
    expect(planCost(5, 2)).toBe(
      '5 steps · 5 AI Actions. You have 2 left, so the plan will stop when the allowance runs out.',
    );
  });
});
