// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiLadderDecision, AiScope } from '@perfectmarkd/core';
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
    ladder?: AiLadderDecision | null;
    anchorRef?: RefObject<HTMLElement | null>;
    onSubmit?: (instruction: string) => void;
    onPlan?: (instruction: string) => void;
    onUseParagraphRange?: () => void;
    onCancel?: () => void;
    onDismiss?: () => void;
    onOpenPricing?: () => void;
  } = {},
) {
  const onSubmit = options.onSubmit ?? vi.fn();
  const onPlan = options.onPlan ?? vi.fn();
  const onUseParagraphRange = options.onUseParagraphRange ?? vi.fn();
  const onCancel = options.onCancel ?? vi.fn();
  const onDismiss = options.onDismiss ?? vi.fn();
  const onOpenPricing = options.onOpenPricing ?? vi.fn();
  render(
    <AiPromptPopover
      command="markdown"
      scope={scope}
      ai={options.state ?? ai()}
      gate={options.gate ?? 'ready'}
      ladder={options.ladder ?? null}
      request={options.request ?? { status: 'idle' }}
      initialInstruction={options.initialInstruction}
      style={{}}
      anchorRef={options.anchorRef}
      onSubmit={onSubmit}
      onPlan={onPlan}
      onUseParagraphRange={onUseParagraphRange}
      onCancel={onCancel}
      onDismiss={onDismiss}
      onOpenPricing={onOpenPricing}
    />,
  );
  return {
    onSubmit,
    onPlan,
    onUseParagraphRange,
    onCancel,
    onDismiss,
    onOpenPricing,
  };
}

/** Fires a pointerdown on a target outside the rendered panel. */
function pressOutside(target: HTMLElement): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

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

  it('dismisses when a press lands outside the panel', () => {
    const { onDismiss } = show();
    pressOutside(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss a press inside the panel, including the field', () => {
    const { onDismiss } = show();
    pressOutside(screen.getByTestId('ai-prompt'));
    pressOutside(screen.getByTestId('ai-prompt-input'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not dismiss a press on the anchor (the button toggles)', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const anchorRef = { current: anchor };
    const { onDismiss } = show({ anchorRef });
    pressOutside(anchor);
    expect(onDismiss).not.toHaveBeenCalled();
    anchor.remove();
  });

  it('stays open while a request is running: the popup is the progress surface', () => {
    const { onDismiss } = show({ request: { status: 'working' } });
    pressOutside(document.body);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

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
        ladder={null}
        request={{ status: 'idle' }}
        style={{}}
        onSubmit={vi.fn()}
        onPlan={vi.fn()}
        onUseParagraphRange={vi.fn()}
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

describe('the size ladder', () => {
  const selectionScope: AiScope = { ...scope, kind: 'selection' };

  it('says the rest of the document is sent when everything fits', () => {
    show({
      ladder: { tier: 0, kind: 'all', characters: 11, context: 'the rest' },
    });
    expect(screen.getByTestId('ai-ladder')).toHaveTextContent(
      'The rest of the document is sent with it',
    );
  });

  it('says only part of the document is sent, and how much of it', () => {
    render(
      <AiPromptPopover
        command="markdown"
        scope={selectionScope}
        ai={ai()}
        gate="ready"
        ladder={{
          tier: 1,
          kind: 'partial',
          digest: '- Two (h2, 40 words): filler',
          otherSections: 4,
          characters: 11,
        }}
        request={{ status: 'idle' }}
        style={{}}
        onSubmit={vi.fn()}
        onPlan={vi.fn()}
        onUseParagraphRange={vi.fn()}
        onCancel={vi.fn()}
        onOpenPricing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ai-ladder')).toHaveTextContent(
      'this selection in full, plus an outline of the other 4 sections',
    );
  });

  it('does not claim an outline when the Document is one section', () => {
    render(
      <AiPromptPopover
        command="markdown"
        scope={selectionScope}
        ai={ai()}
        gate="ready"
        ladder={{
          tier: 1,
          kind: 'partial',
          digest: '',
          otherSections: 0,
          characters: 11,
        }}
        request={{ status: 'idle' }}
        style={{}}
        onSubmit={vi.fn()}
        onPlan={vi.fn()}
        onUseParagraphRange={vi.fn()}
        onCancel={vi.fn()}
        onOpenPricing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ai-ladder')).toHaveTextContent(
      'Only this selection is sent',
    );
    expect(screen.getByTestId('ai-ladder')).not.toHaveTextContent('outline');
  });

  it('does not claim an outline when the Document is one section', () => {
    render(
      <AiPromptPopover
        command="markdown"
        scope={selectionScope}
        ai={ai()}
        gate="ready"
        ladder={{
          tier: 1,
          kind: 'partial',
          digest: '',
          otherSections: 0,
          characters: 11,
        }}
        request={{ status: 'idle' }}
        style={{}}
        onSubmit={vi.fn()}
        onPlan={vi.fn()}
        onUseParagraphRange={vi.fn()}
        onCancel={vi.fn()}
        onOpenPricing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ai-ladder')).toHaveTextContent(
      'Only this selection is sent',
    );
    expect(screen.getByTestId('ai-ladder')).not.toHaveTextContent('outline');
  });

  it('offers an AI Plan for a document too large for one action', async () => {
    const user = userEvent.setup();
    const { onPlan, onSubmit } = show({
      ladder: {
        tier: 2,
        kind: 'plan',
        digest: '- One (h1, 40 words): x',
        sections: [],
        characters: 9_000,
      },
    });
    expect(screen.getByTestId('ai-ladder')).toHaveTextContent(
      'An AI Plan works through it one section at a time',
    );
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    await user.click(screen.getByTestId('ai-prompt-input'));
    await user.keyboard('  restructure it  ');
    await user.click(screen.getByRole('button', { name: 'Plan the changes' }));
    expect(onPlan).toHaveBeenCalledWith('restructure it');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a target that cannot be worked on, and offers the paragraph', async () => {
    const user = userEvent.setup();
    const { onUseParagraphRange, onSubmit } = show({
      ladder: {
        tier: 3,
        kind: 'refused',
        refusal: {
          code: 'unsplittable',
          message:
            'This document is about 40,000 characters — too large for one AI Action, and it has no headings or Page Breaks to split into sections.',
        },
        paragraphRange: { from: 0, to: 40 },
      },
    });
    const refusal = screen.getByTestId('ai-ladder-refusal');
    expect(refusal).toHaveTextContent('40,000 characters');
    expect(refusal).toHaveTextContent('no headings or Page Breaks');
    // Nothing can run, so there is no prompt field and no Send button.
    expect(screen.queryByTestId('ai-prompt-input')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: 'Work on the paragraph around your cursor',
      }),
    );
    expect(onUseParagraphRange).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('drops the paragraph offer once the target is that paragraph', () => {
    render(
      <AiPromptPopover
        command="markdown"
        scope={{
          ...scope,
          kind: 'selection',
          from: 0,
          to: 40,
          text: 'x'.repeat(40),
        }}
        ai={ai()}
        gate="ready"
        ladder={{
          tier: 3,
          kind: 'refused',
          refusal: {
            code: 'target_over_write_cap',
            message: 'That is about 20 tokens, past the 10-token limit.',
          },
          paragraphRange: { from: 0, to: 40 },
        }}
        request={{ status: 'idle' }}
        style={{}}
        onSubmit={vi.fn()}
        onPlan={vi.fn()}
        onUseParagraphRange={vi.fn()}
        onCancel={vi.fn()}
        onOpenPricing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ai-ladder-refusal')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Work on the paragraph around your cursor',
      }),
    ).toBeNull();
  });
});
