// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiScope } from '@perfectmarkd/core';
import { AiPromptPopover, type AiPromptGate } from './AiPromptPopover';
import { UNCONFIGURED_AI, type AiAccountState } from './types';

afterEach(() => {
  cleanup();
});

const scope: AiScope = {
  kind: 'document',
  text: 'Hello world',
  from: 0,
  to: 11,
  size: { characters: 11, estimatedTokens: 3 },
};

function ai(overrides: Partial<AiAccountState> = {}): AiAccountState {
  return {
    ...UNCONFIGURED_AI,
    configured: true,
    included: true,
    allowance: 100,
    remaining: 100,
    period: '2026-09',
    resetsAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function show(
  options: {
    gate?: AiPromptGate;
    state?: AiAccountState;
    request?:
      { status: 'idle' | 'working' } | { status: 'error'; message: string };
    initialInstruction?: string;
    onSubmit?: (instruction: string) => void;
    onCancel?: () => void;
    onOpenPricing?: () => void;
  } = {},
) {
  const onSubmit = options.onSubmit ?? vi.fn();
  const onCancel = options.onCancel ?? vi.fn();
  const onOpenPricing = options.onOpenPricing ?? vi.fn();
  render(
    <AiPromptPopover
      command="markdown"
      scope={scope}
      ai={options.state ?? ai()}
      gate={options.gate ?? 'ready'}
      request={options.request ?? { status: 'idle' }}
      initialInstruction={options.initialInstruction}
      style={{}}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onOpenPricing={onOpenPricing}
    />,
  );
  return { onSubmit, onCancel, onOpenPricing };
}

describe('the ready state', () => {
  it('names the command and states the resolved scope against the cap', () => {
    show();
    expect(
      screen.getByRole('dialog', { name: /Edit the markdown/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Whole document');
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent(
      '11 of 60,000 characters',
    );
  });

  it('says which part of the Document is targeted, and flags one past the cap', () => {
    render(
      <AiPromptPopover
        command="markdown"
        scope={{
          ...scope,
          kind: 'selection',
          size: { characters: 90_000, estimatedTokens: 22_500 },
        }}
        ai={ai()}
        gate="ready"
        request={{ status: 'idle' }}
        style={{}}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onOpenPricing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Selection');
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('too big');
  });

  it('submits the trimmed prompt on Enter and keeps Shift+Enter for a line', async () => {
    const user = userEvent.setup();
    const { onSubmit } = show();
    const field = screen.getByTestId('ai-prompt-input');

    await user.click(field);
    await user.keyboard('  tighten this  ');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('tighten this');
  });

  it('refuses to submit an empty prompt', async () => {
    const user = userEvent.setup();
    const { onSubmit } = show();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('states where the text is going on the first Action only', () => {
    show();
    expect(
      screen.getByText(/sent to an external AI provider for this action/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'How your data is handled' }),
    ).toHaveAttribute('href', '/privacy');

    cleanup();
    show({ state: ai({ disclosureSeen: true }) });
    expect(
      screen.queryByText(/sent to an external AI provider for this action/),
    ).not.toBeInTheDocument();
  });

  it('shows a failed request as a plain message with Retry, naming no provider', async () => {
    const user = userEvent.setup();
    const { onSubmit } = show({
      // A failure only ever follows a submission, so the prompt is still there.
      initialInstruction: 'tighten this',
      request: {
        status: 'error',
        message: 'The AI is unavailable right now. Try again in a moment.',
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The AI is unavailable right now.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      /openai|anthropic|claude|gpt|model/i,
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onSubmit).toHaveBeenCalledWith('tighten this');
  });

  it('keeps the prompt intact when it is reopened for editing', () => {
    show({ initialInstruction: 'make it plainer' });
    expect(screen.getByTestId('ai-prompt-input')).toHaveValue(
      'make it plainer',
    );
  });
});

describe('the not-entitled state', () => {
  it('says AI Actions are part of the paid plans and opens the plans', async () => {
    const user = userEvent.setup();
    const { onOpenPricing } = show({
      gate: 'not_entitled',
      state: ai({ included: false, remaining: 0 }),
    });

    expect(screen.getByTestId('ai-prompt')).toHaveTextContent(
      'AI Actions are part of Pro and Premium.',
    );
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent(
      'send the text you submit to an external AI provider',
    );
    // Never a signup wall: the control opens the pricing modal.
    await user.click(screen.getByRole('button', { name: 'See plans' }));
    expect(onOpenPricing).toHaveBeenCalled();
  });
});

describe('the exhausted state', () => {
  it('states the count, the period, and the reset date', () => {
    show({ gate: 'exhausted', state: ai({ remaining: 0 }) });
    const panel = screen.getByTestId('ai-prompt');
    expect(panel).toHaveTextContent(
      'used all 100 AI Actions for September 2026',
    );
    expect(panel).toHaveTextContent('reset on 2026-10-01');
  });
});

describe('the scope readout', () => {
  it('states what would be sent in every state, available or not', () => {
    show({
      gate: 'not_entitled',
      state: ai({ included: false, remaining: 0 }),
    });
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Whole document');
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent(
      '11 of 60,000 characters',
    );

    cleanup();
    show({ gate: 'exhausted', state: ai({ remaining: 0 }) });
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Whole document');
  });
});

describe('the working state', () => {
  it('disables the field and offers Cancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = show({ request: { status: 'working' } });
    expect(screen.getByTestId('ai-prompt-input')).toBeDisabled();
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Working…');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('dismissal', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onCancel } = show();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('closes with the Close control when nothing is running', async () => {
    const user = userEvent.setup();
    const { onCancel } = show();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
