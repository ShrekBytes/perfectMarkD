// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiReviewBar } from './AiReviewBar';
import type { InlineHunk } from './inline';

afterEach(cleanup);

const hunks: InlineHunk[] = [
  { id: 0, from: 0, to: 5, insert: 'ALPHA' },
  { id: 1, from: 12, to: 17, insert: 'Γ' },
  { id: 2, from: 30, to: 35, insert: '' },
];

function show(
  options: {
    hunks?: InlineHunk[];
    checked?: ReadonlySet<number>;
    disabledReason?: string | null;
    busy?: boolean;
    retryBlocked?: boolean;
    error?: string | null;
    plan?: { at: number; total: number; onStop: () => void } | null;
  } = {},
) {
  const handlers = {
    onToggle: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onRetry: vi.fn(),
    onEditPrompt: vi.fn(),
  };
  render(
    <AiReviewBar
      command="markdown"
      hunks={options.hunks ?? hunks}
      checked={options.checked ?? new Set([0, 1, 2])}
      disabledReason={options.disabledReason ?? null}
      busy={options.busy ?? false}
      retryBlocked={options.retryBlocked ?? false}
      error={options.error ?? null}
      plan={options.plan ?? null}
      {...handlers}
    />,
  );
  return handlers;
}

describe('the review bar', () => {
  it('names the command, counts the changes, and offers the actions', () => {
    show();
    expect(screen.getByTestId('ai-change-count')).toHaveTextContent(
      '3 changes',
    );
    expect(
      screen.getByRole('button', { name: 'Accept (3)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit prompt' }),
    ).toBeInTheDocument();
  });

  it('toggles a change through to the controller', async () => {
    const user = userEvent.setup();
    const { onToggle } = show();
    await user.click(screen.getByRole('checkbox', { name: 'Change 2' }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('hides the per-change row for a single-change proposal', () => {
    show({ hunks: [hunks[0]!] });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-change-count')).toHaveTextContent(
      '1 change',
    );
  });

  it('accepts with Enter and rejects with Escape', async () => {
    const user = userEvent.setup();
    const first = show();
    await user.keyboard('{Enter}');
    expect(first.onAccept).toHaveBeenCalledTimes(1);

    cleanup();
    const second = show();
    await user.keyboard('{Escape}');
    expect(second.onReject).toHaveBeenCalledTimes(1);
    expect(second.onAccept).not.toHaveBeenCalled();
  });

  it('refuses an empty check set and says why', () => {
    show({ checked: new Set<number>() });
    expect(
      screen.getByRole('button', { name: 'Accept' }),
    ).toBeDisabled();
    expect(screen.getByTestId('ai-accept-reason')).toHaveTextContent(
      'Check at least one change to accept.',
    );
  });

  it('shows a controller-supplied reason and disables Accept, keeping Retry', () => {
    show({
      disabledReason:
        'The text this proposal targets has changed — Retry for a fresh proposal.',
      retryBlocked: false,
    });
    expect(screen.getByTestId('ai-accept-reason')).toHaveTextContent(
      'has changed',
    );
    expect(screen.getByRole('button', { name: 'Accept (3)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('blocks Retry and Edit prompt when the allowance is spent', () => {
    show({ retryBlocked: true });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit prompt' })).toBeDisabled();
  });

  it('shows a failed Retry inline and disables the controls while working', () => {
    show({
      error: 'The AI is unavailable right now.',
      busy: true,
    });
    expect(screen.getByTestId('ai-review-error')).toHaveTextContent(
      'The AI is unavailable right now.',
    );
    expect(screen.getByText('Working…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept (3)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('swaps Retry and Edit prompt for Stop the plan on a plan step', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    show({ plan: { at: 1, total: 3, onStop } });
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Stop the plan' }),
    );
    expect(onStop).toHaveBeenCalled();
  });
});
