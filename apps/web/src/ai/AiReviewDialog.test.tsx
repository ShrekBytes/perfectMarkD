// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiReviewDialog } from './AiReviewDialog';
import { buildChangeSet } from './proposal';
import type { AiTarget } from './types';

afterEach(() => {
  cleanup();
});

const target: AiTarget = {
  kind: 'document',
  text: 'Alpha\nBeta\nGamma\nDelta\nEpsilon\nZeta\nEta\nTheta',
  from: 0,
  to: 40,
};

function anchoredChangeSet(searches: string[]) {
  return buildChangeSet(target, {
    kind: 'anchored',
    edits: searches.map((search) => ({
      search,
      replace: search.toUpperCase(),
    })),
  });
}

function show(
  options: {
    changeSet?: ReturnType<typeof anchoredChangeSet>;
    disabledReason?: string | null;
    busy?: boolean;
    retryBlocked?: boolean;
    error?: string | null;
    plan?: { at: number; total: number; onStop: () => void } | null;
  } = {},
) {
  const onAccept = vi.fn();
  const onReject = vi.fn();
  const onRetry = vi.fn();
  const onEditPrompt = vi.fn();
  render(
    <AiReviewDialog
      command="markdown"
      changeSet={options.changeSet ?? anchoredChangeSet(['Beta'])}
      disabledReason={options.disabledReason ?? null}
      busy={options.busy ?? false}
      retryBlocked={options.retryBlocked ?? false}
      error={options.error ?? null}
      plan={options.plan ?? null}
      onAccept={onAccept}
      onReject={onReject}
      onRetry={onRetry}
      onEditPrompt={onEditPrompt}
    />,
  );
  return { onAccept, onReject, onRetry, onEditPrompt };
}

describe('the diff', () => {
  it('shows a change count and the diff with +/− gutter marks and context', () => {
    show({ changeSet: anchoredChangeSet(['Beta']) });

    expect(screen.getByTestId('ai-change-count')).toHaveTextContent('1 change');
    // The three lines of context around the change, and its before/after.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('BETA')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('−')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('collapses a long diff behind a "show all" control', async () => {
    const user = userEvent.setup();
    show({
      changeSet: anchoredChangeSet([
        'Alpha',
        'Beta',
        'Gamma',
        'Delta',
        'Epsilon',
        'Zeta',
      ]),
    });

    expect(screen.getByTestId('ai-change-count')).toHaveTextContent(
      '6 changes',
    );
    expect(screen.queryByText('Change 6')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show all 6 changes' }),
    );
    expect(screen.getByText('Change 6')).toBeInTheDocument();
  });

  it('renders no red/green: changed lines carry the app palette only', () => {
    show({ changeSet: anchoredChangeSet(['Beta']) });
    const added = screen.getByText('BETA').closest('div')!;
    expect(added.className).toContain('bg-surface-hover');
    expect(added.className).not.toMatch(/green|red|success/);
  });
});

describe('accepting', () => {
  it('has every change checked by default and accepts them all', async () => {
    const user = userEvent.setup();
    const { onAccept } = show({
      changeSet: anchoredChangeSet(['Alpha', 'Beta', 'Gamma']),
    });

    expect(screen.getByRole('button', { name: 'Accept (3)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Accept (3)' }));
    expect(onAccept).toHaveBeenCalledWith(new Set([0, 1, 2]));
  });

  it('drops an unchecked change without dropping the rest', async () => {
    const user = userEvent.setup();
    const { onAccept } = show({
      changeSet: anchoredChangeSet(['Alpha', 'Beta', 'Gamma']),
    });

    await user.click(screen.getByRole('checkbox', { name: 'Change 2' }));
    expect(screen.getByRole('button', { name: 'Accept (2)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Accept (2)' }));
    expect(onAccept).toHaveBeenCalledWith(new Set([0, 2]));
  });

  it('refuses an empty selection and says why', async () => {
    const user = userEvent.setup();
    const { onAccept } = show({
      changeSet: anchoredChangeSet(['Alpha', 'Beta']),
    });

    await user.click(screen.getByRole('checkbox', { name: 'Change 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Change 2' }));
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByTestId('ai-accept-reason')).toHaveTextContent(
      'Check at least one change to accept.',
    );
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('ignores Enter while a Retry is running', async () => {
    const user = userEvent.setup();
    const { onAccept } = show({ busy: true });
    screen.getByTestId('ai-review-dialog').focus();
    await user.keyboard('{Enter}');
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('accepts with Enter', async () => {
    const user = userEvent.setup();
    const { onAccept } = show();
    // The modal panel takes focus on open; Enter reaches the dialog from there.
    screen.getByTestId('ai-review-dialog').focus();
    await user.keyboard('{Enter}');
    expect(onAccept).toHaveBeenCalledWith(new Set([0]));
  });
});

describe('rejecting', () => {
  it('closes without applying anything, on Reject and on Escape', async () => {
    const user = userEvent.setup();
    const first = show();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(first.onReject).toHaveBeenCalled();
    expect(first.onAccept).not.toHaveBeenCalled();

    cleanup();
    const second = show();
    await user.keyboard('{Escape}');
    expect(second.onReject).toHaveBeenCalled();
    expect(second.onAccept).not.toHaveBeenCalled();
  });
});

describe('why Accept is unavailable', () => {
  it('states a stale target and offers Retry as the remedy', () => {
    show({
      disabledReason:
        'The text this proposal targets has changed — Retry for a fresh proposal.',
    });
    expect(screen.getByTestId('ai-accept-reason')).toHaveTextContent(
      'has changed',
    );
    expect(screen.getByRole('button', { name: 'Accept (1)' })).toBeDisabled();
    // Retrying is the way out of a stale proposal, so it stays available.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('blocks Retry and Edit prompt when the allowance is spent, but not Accept', () => {
    // The Action was counted when the proposal was offered, so applying it
    // costs nothing: only the fresh Action a Retry would spend is blocked.
    const { onAccept } = show({ retryBlocked: true });
    expect(screen.queryByTestId('ai-accept-reason')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit prompt' })).toBeDisabled();

    const accept = screen.getByRole('button', { name: 'Accept (1)' });
    expect(accept).toBeEnabled();
    act(() => accept.click());
    expect(onAccept).toHaveBeenCalled();
  });

  it('shows a failed Retry inline and disables the controls while working', () => {
    const failed = show({
      error: 'The AI is unavailable right now. Try again in a moment.',
    });
    expect(screen.getByTestId('ai-review-error')).toHaveTextContent(
      'The AI is unavailable right now.',
    );
    expect(failed.onAccept).not.toHaveBeenCalled();

    cleanup();
    show({ busy: true });
    expect(screen.getByText('Working…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept (1)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    // Closing stays possible while a Retry is in flight.
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });
});

describe('retry and edit prompt', () => {
  it('offers both, and neither applies a change', async () => {
    const user = userEvent.setup();
    const { onRetry, onEditPrompt, onAccept } = show();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(screen.getByRole('button', { name: 'Edit prompt' }));
    expect(onRetry).toHaveBeenCalled();
    expect(onEditPrompt).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
  });
});
