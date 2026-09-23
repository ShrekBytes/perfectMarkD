// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiPlanDialog } from './AiPlanDialog';
import type { AiPlanState } from './plan';
import type { AiPlanStep } from './types';

afterEach(() => {
  cleanup();
});

const STEPS: AiPlanStep[] = [
  { sectionIndex: 0, heading: 'Introduction', change: 'cut it to two sentences' },
  { sectionIndex: 1, heading: 'Methods', change: 'turn the list into a table' },
  { sectionIndex: 2, heading: null, change: 'move the notes after Methods' },
];

function plan(overrides: Partial<AiPlanState> = {}): AiPlanState {
  return {
    docId: 'doc-1',
    instruction: 'Make it plainer',
    steps: STEPS,
    phase: 'approving',
    at: 0,
    accepted: 0,
    rejected: 0,
    note: null,
    nonce: 1,
    ...overrides,
  };
}

function show(
  options: {
    plan?: AiPlanState;
    remaining?: number;
    busy?: boolean;
  } = {},
) {
  const onApprove = vi.fn();
  const onDiscard = vi.fn();
  const onStop = vi.fn();
  const onClose = vi.fn();
  render(
    <AiPlanDialog
      plan={options.plan ?? plan()}
      remaining={options.remaining ?? 100}
      busy={options.busy ?? false}
      onApprove={onApprove}
      onDiscard={onDiscard}
      onStop={onStop}
      onClose={onClose}
    />,
  );
  return { onApprove, onDiscard, onStop, onClose };
}

describe('the approval surface', () => {
  it('lists the plan section by section with what changes in each', () => {
    show();
    expect(
      screen.getByRole('dialog', { name: 'AI Plan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('cut it to two sentences')).toBeInTheDocument();
    expect(screen.getByText('Methods')).toBeInTheDocument();
    expect(screen.getByText('(no heading)')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
  });

  it('states the AI Actions the plan costs against the allowance left', () => {
    show({ remaining: 42 });
    expect(screen.getByTestId('ai-plan-cost')).toHaveTextContent(
      '3 steps · 3 AI Actions. You have 42 left.',
    );
  });

  it('says the plan will stop when it costs more than the allowance', () => {
    show({ remaining: 2 });
    expect(screen.getByTestId('ai-plan-cost')).toHaveTextContent(
      'You have 2 left, so the plan will stop when the allowance runs out.',
    );
  });

  it('runs only the steps the user kept checked', async () => {
    const user = userEvent.setup();
    const { onApprove } = show();
    await user.click(screen.getAllByRole('checkbox')[1]!);
    await user.click(screen.getByRole('button', { name: 'Run 2 of 3 steps' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect([...onApprove.mock.calls[0]![0] as Set<number>]).toEqual([0, 2]);
  });

  it('refuses to run with nothing checked', async () => {
    const user = userEvent.setup();
    const { onApprove } = show();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      await user.click(checkbox);
    }
    expect(screen.getByRole('button', { name: 'Run 0 of 3 steps' })).toBeDisabled();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('discards the plan without running anything', async () => {
    const user = userEvent.setup();
    const { onDiscard, onApprove } = show();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
  });
});

describe('the run', () => {
  it('shows which step is being worked on, and offers to stop', async () => {
    const user = userEvent.setup();
    const { onStop } = show({
      plan: plan({ phase: 'running', at: 1, accepted: 1 }),
      busy: true,
    });
    expect(screen.getByTestId('ai-plan-progress')).toHaveTextContent(
      'Step 2 of 3 · working…',
    );
    await user.click(screen.getByRole('button', { name: 'Stop the plan' }));
    expect(onStop).toHaveBeenCalled();
  });
});

describe('the summary', () => {
  it('says what was applied and what remains when a run stops', async () => {
    const user = userEvent.setup();
    const { onClose } = show({
      plan: plan({
        phase: 'stopped',
        at: 2,
        accepted: 1,
        rejected: 1,
        note: 'Stopped. 1 of 3 steps applied; 1 step remains.',
      }),
    });
    expect(screen.getByTestId('ai-plan-summary')).toHaveTextContent(
      'Stopped. 1 of 3 steps applied; 1 step remains.',
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says how many steps a finished run applied', () => {
    show({
      plan: plan({
        phase: 'finished',
        at: 3,
        accepted: 3,
        note: 'Plan finished. 3 of 3 steps applied.',
      }),
    });
    expect(screen.getByTestId('ai-plan-summary')).toHaveTextContent(
      'Plan finished. 3 of 3 steps applied.',
    );
  });
});
