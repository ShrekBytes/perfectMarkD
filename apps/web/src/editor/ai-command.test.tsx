// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorPane } from './EditorPane';
import { UNCONFIGURED_AI, type AiAccountState } from '../ai/types';
import { useAccountStore } from '../auth/account-store';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubClientRects } from '../testing/stub-client-rects';
import { stubIndexedDB } from '../testing/stub-idb';

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();
  await useDocumentStore.getState().createDocument();
});

afterEach(() => {
  cleanup();
  resetDocumentStoreForTests();
});

function editorView(): EditorView {
  const el = document.querySelector('.cm-editor');
  if (!el) throw new Error('editor not mounted');
  return EditorView.findFromDOM(el as HTMLElement)!;
}

/** Seeds the account store with the AI state /api/me would have delivered. */
function seedAi(overrides: Partial<AiAccountState> = {}): void {
  useAccountStore.setState({
    status: 'ready',
    ai: {
      ...UNCONFIGURED_AI,
      configured: true,
      included: true,
      allowance: 100,
      remaining: 100,
      period: '2026-09',
      resetsAt: '2026-10-01T00:00:00.000Z',
      ...overrides,
    },
  });
}

/**
 * Focuses the editor once and types from the keyboard. `user.type` re-clicks
 * its target on every call, which moves the caret and makes multi-step typing
 * meaningless; the keyboard path keeps the caret where the typing left it.
 */
async function focusAndType(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  await user.click(editorView().contentDOM);
  await user.keyboard(text);
}

describe('the hint', () => {
  it('appears for /a and /s only, and never for a bare slash', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, '/');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();

    await user.keyboard('a');
    expect(screen.getByTestId('ai-hint')).toHaveTextContent('/ai');
    expect(screen.getByTestId('ai-hint')).toHaveTextContent(
      'Edit the markdown',
    );

    await user.keyboard('{Backspace}{Backspace}/s');
    expect(screen.getByTestId('ai-hint')).toHaveTextContent('/ss');
    expect(screen.getByTestId('ai-hint')).toHaveTextContent(
      'Edit the Custom stylesheet',
    );
  });

  it('disappears the moment the text stops matching', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, '/ai');
    expect(screen.getByTestId('ai-hint')).toBeInTheDocument();

    await user.keyboard('x');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();
  });

  it('never appears mid-word', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, 'https://example.com/ai');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();
  });

  it('never appears inside a fenced code block, and works again once it closes', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    // Writing documentation about the command must not invoke it.
    await focusAndType(user, '```{Enter}/ai');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();

    await user.keyboard('{Enter}```{Enter}/ai');
    expect(screen.getByTestId('ai-hint')).toBeInTheDocument();
  });

  it('never appears when AI Access is off, and consumes nothing', async () => {
    seedAi({ access: false });
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, '/ai');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();

    // The commands do not exist, so the trigger is ordinary prose: the space
    // is inserted and `/ai` stays in the Document.
    await user.keyboard(' ');
    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe('/ai ');
  });

  it('never appears on an instance with no provider configured, and consumes nothing', async () => {
    seedAi({ configured: false, included: false, remaining: 0 });
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, '/ai');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();

    await user.keyboard(' ');
    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe('/ai ');
  });
});

describe('the popup', () => {
  it('opens on the completing space, with the trigger removed from the Document', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, 'Draft text\n/ai');
    expect(useDocumentStore.getState().markdown).toBe('Draft text\n/ai');

    await user.keyboard(' ');
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();
    // The trigger never pollutes the Document — not even the space.
    expect(useDocumentStore.getState().markdown).toBe('Draft text\n');
  });

  it('opens from the hint on Tab, and the Document loses only the trigger', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, '/a');
    await user.keyboard('{Tab}');

    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe('');
  });

  it('opens from the hint on a click', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, '/ai');
    await user.click(screen.getByRole('button', { name: /Edit the markdown/ }));

    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe('');
  });

  it('restores the trigger byte-for-byte on Escape', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, 'Hello\n/ai');
    const before = useDocumentStore.getState().markdown;
    await user.keyboard(' ');
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe(before);
    expect(useDocumentStore.getState().markdown).toBe('Hello\n/ai');
  });

  it('states the scope and the size against the cap', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, 'one two three\n/ai');
    await user.keyboard(' ');

    const panel = screen.getByTestId('ai-prompt');
    expect(panel).toHaveTextContent('Whole document');
    expect(panel).toHaveTextContent('of 60,000 characters');
  });

  it('shows the upsell for a Free Tier visitor instead of the prompt', async () => {
    seedAi({ included: false, remaining: 0 });
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, '/ai');
    await user.keyboard(' ');

    const panel = screen.getByTestId('ai-prompt');
    expect(panel).toHaveTextContent('AI Actions are part of Pro and Premium.');
    expect(panel).toHaveTextContent('external AI provider');
    expect(
      screen.getByRole('button', { name: 'See plans' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('ai-prompt-input')).not.toBeInTheDocument();
  });

  it('states the exhausted allowance with the reset date', async () => {
    seedAi({ remaining: 0 });
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, '/ai');
    await user.keyboard(' ');

    const panel = screen.getByTestId('ai-prompt');
    expect(panel).toHaveTextContent(
      'used all 100 AI Actions for September 2026',
    );
    expect(panel).toHaveTextContent('2026-10-01');
  });
});

describe('a programmatic edit', () => {
  it('triggers nothing, so a document switch or import cannot pop dialogs', async () => {
    seedAi();
    render(<EditorPane />);

    // Adopted markdown (doc switch, import, remote adoption) is not typed
    // input, so it can never open a menu.
    await act(async () => {
      useDocumentStore.setState({ markdown: '/ai' });
    });

    expect(editorView().state.doc.toString()).toBe('/ai');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();
  });
});

describe('a paste', () => {
  it('triggers nothing, so importing a Document cannot pop dialogs', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();
    const editor = editorView();

    await user.click(editor.contentDOM);
    await act(async () => {
      await user.paste('/ai ');
    });

    expect(useDocumentStore.getState().markdown).toContain('/ai');
    expect(screen.queryByTestId('ai-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
  });
});
