// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPane } from './EditorPane';
import * as aiApi from '../ai/api';
import * as authApi from '../auth/api';
import {
  resetStylesheetConversationForTests,
  useStylesheetConversation,
} from '../ai/conversation';
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

/** A markdown route that never answers until its request is aborted. */
function routeMarkdownPending() {
  return vi.spyOn(aiApi, 'requestMarkdown').mockImplementation(
    ((_request, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      })) as typeof aiApi.requestMarkdown,
  );
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

  it('the toolbar button is a toggle: pressed again with the popup open, it closes', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();
    const button = () => screen.getByRole('button', { name: 'Ask AI' });

    await user.click(button());
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();
    expect(button()).toHaveAttribute('aria-expanded', 'true');

    // Nothing was removed from the Document, so closing must not disturb it.
    const before = useDocumentStore.getState().markdown;
    await user.click(button());
    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(useDocumentStore.getState().markdown).toBe(before);
  });

  it('an outside click closes a toolbar popup without changing the Document', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();

    // A press on the canvas area (outside the panel and the anchor button).
    await user.click(screen.getByTestId('editor-stats'));
    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    // The Document was never touched: no trigger to restore.
    expect(useDocumentStore.getState().markdown).toBe('');
  });

  it('an outside click restores a fired trigger without stealing focus', async () => {
    seedAi();
    render(
      <>
        <EditorPane />
        <button type="button">Outside target</button>
      </>,
    );
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, 'Hello\n/ai');
    await user.keyboard(' ');
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();

    const outside = screen.getByRole('button', { name: 'Outside target' });
    await user.click(outside);

    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe('Hello\n/ai');
    expect(outside).toHaveFocus();
  });

  it('a click outside does not close a working /ai popup, and Esc still restores the trigger', async () => {
    seedAi();
    const request = routeMarkdownPending();
    render(<EditorPane />);
    const user = userEvent.setup();

    await user.type(editorView().contentDOM, 'Hello\n/ai');
    await user.keyboard(' ');
    await user.type(screen.getByTestId('ai-prompt-input'), 'tighten this');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Working…');

    await user.click(screen.getByTestId('editor-stats'));
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('ai-prompt')).not.toBeInTheDocument();
    expect(useDocumentStore.getState().markdown).toBe('Hello\n/ai');
    request.mockRestore();
  });

  it('keeps a working popup open when its toolbar button is pressed again', async () => {
    seedAi();
    const request = routeMarkdownPending();
    render(<EditorPane />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Ask AI' });

    await user.click(button);
    await user.type(screen.getByTestId('ai-prompt-input'), 'tighten this');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Working…');

    await user.click(button);
    expect(screen.getByTestId('ai-prompt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    request.mockRestore();
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

describe('/ss — the Custom Stylesheet (ai-transforms/06)', () => {
  const CSS = '.mpdf-doc h1 { letter-spacing: 0.3em; }';
  const PROPOSED = '.mpdf-doc h1 { letter-spacing: 0.05em; }';

  /** A route that answers with a rewritten stylesheet, recording requests. */
  function routeStylesheet(text: string = PROPOSED) {
    const requests: aiApi.StylesheetRequest[] = [];
    vi.spyOn(aiApi, 'requestStylesheet').mockImplementation((async (
      request: aiApi.StylesheetRequest,
    ) => {
      requests.push(request);
      return { proposal: { kind: 'replace' as const, text }, remaining: 99 };
    }) as unknown as typeof aiApi.requestStylesheet);
    return requests;
  }

  /** A route that never answers until it is aborted, as fetch behaves. */
  function routeStylesheetPending() {
    vi.spyOn(aiApi, 'requestStylesheet').mockImplementation(
      ((request: aiApi.StylesheetRequest, signal?: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        })) as unknown as typeof aiApi.requestStylesheet,
    );
  }

  beforeEach(() => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new Error('offline'));
    act(() => {
      useDocumentStore
        .getState()
        .updateActive({ settings: { customStylesheet: CSS } });
    });
  });

  afterEach(() => {
    resetStylesheetConversationForTests();
    vi.restoreAllMocks();
  });

  /** The active Document's turns. */
  const turns = () => {
    const docId = useDocumentStore.getState().activeId!;
    return useStylesheetConversation.getState().turns[docId] ?? [];
  };

  async function askForStylesheet(
    user: ReturnType<typeof userEvent.setup>,
    instruction: string,
  ): Promise<void> {
    await focusAndType(user, '/ss');
    expect(screen.getByTestId('ai-hint')).toHaveTextContent(
      'Edit the Custom stylesheet',
    );
    await user.keyboard(' ');
    await user.type(screen.getByTestId('ai-prompt-input'), instruction);
    await user.keyboard('{Enter}');
  }

  it('names the stylesheet as the target, not the Document', async () => {
    seedAi();
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, '/ss');
    await user.keyboard(' ');

    const panel = screen.getByTestId('ai-prompt');
    expect(panel).toHaveTextContent('Custom stylesheet');
    expect(panel).not.toHaveTextContent('Whole document');
  });

  it('joins the Document’s conversation: the box is sent, and the proposal reviews in the stylesheet box', async () => {
    seedAi();
    const route = routeStylesheet();
    render(<EditorPane />);
    const user = userEvent.setup();

    await askForStylesheet(user, 'tighter spacing');

    // The proposal reviews in the stylesheet box (StylesheetBoxDiff), not in
    // a dialog: the conversation holds the turn while the box shows the diff.
    expect(route).toEqual([
      { instruction: 'tighter spacing', css: CSS, history: [] },
    ]);
    // The turn is in the log while it is still under review, and nothing has
    // been written to the box yet.
    expect(turns()).toHaveLength(1);
    expect(turns()[0]).toMatchObject({
      instruction: 'tighter spacing',
      against: CSS,
      status: 'proposal',
      reply: PROPOSED,
      decision: null,
    });
    expect(useDocumentStore.getState().settings.customStylesheet).toBe(CSS);

    // The Inspector's Stylesheet tab is where the diff lives; from the editor
    // pane alone the turn is pending and undecided.
    expect(turns()[0]!.status).toBe('proposal');
  });

  it('Reject decides the turn and leaves the box exactly as it was', async () => {
    seedAi();
    routeStylesheet();
    render(<EditorPane />);
    const user = userEvent.setup();

    await askForStylesheet(user, 'tighter spacing');
    // The popup closes when the reply lands; the turn becomes a pending
    // proposal in the log for the stylesheet box to review.
    await waitFor(() =>
      expect(turns()[0]).toMatchObject({ status: 'proposal', decision: null }),
    );
    expect(useDocumentStore.getState().settings.customStylesheet).toBe(CSS);
  });

  it('replays the last three exchanges of this Document’s conversation', async () => {
    seedAi();
    const route = routeStylesheet();
    render(<EditorPane />);
    const user = userEvent.setup();

    for (const instruction of ['one', 'two', 'three', 'four']) {
      await askForStylesheet(user, instruction);
      // Each reply lands as a pending turn; the next ask needs no decision —
      // the conversation replays settled exchanges and the newest pending one
      // simply waits (the box view decides it, one at a time).
      await waitFor(() =>
        expect(turns().at(-1)).toMatchObject({
          instruction,
          status: 'proposal',
        }),
      );
    }

    const last = route.at(-1)!;
    expect(last.history?.map((turn) => turn.instruction)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('leaves no trace of a cancelled request: nothing produced, nothing counted', async () => {
    seedAi();
    routeStylesheetPending();
    render(<EditorPane />);
    const user = userEvent.setup();

    await focusAndType(user, '/ss');
    await user.keyboard(' ');
    await user.type(screen.getByTestId('ai-prompt-input'), 'tighter spacing');
    await user.keyboard('{Enter}');
    expect(turns()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(turns()).toHaveLength(0);
    expect(useDocumentStore.getState().settings.customStylesheet).toBe(CSS);
  });

  it('leaves the pending turn behind when the user switches Documents', async () => {
    seedAi();
    routeStylesheet();
    render(<EditorPane />);
    const user = userEvent.setup();

    await askForStylesheet(user, 'a warmer accent');
    await waitFor(() => expect(turns()).toHaveLength(1));
    const firstDocTurns = turns();
    expect(firstDocTurns).toHaveLength(1);

    // The turn belongs to the Document it was asked in; the new Document has
    // an empty log, and the old turn stays pending there for the user to
    // decide when they return.
    await act(async () => {
      await useDocumentStore.getState().createDocument();
    });

    expect(turns()).toHaveLength(0);
    expect(useDocumentStore.getState().settings.customStylesheet).toBe('');
  });

  it('hands the review to the stylesheet conversation, not a modal', async () => {
    seedAi();
    routeStylesheet();
    render(<EditorPane />);
    const user = userEvent.setup();

    await askForStylesheet(user, 'a warmer accent');

    // No review dialog for /ss: the diff lives in the stylesheet box, the
    // provisional paper on the canvas, and the turn in the conversation.
    await waitFor(() =>
      expect(turns()[0]).toMatchObject({ status: 'proposal' }),
    );
    expect(screen.queryByTestId('ai-review-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-review-bar')).not.toBeInTheDocument();
    expect(turns()[0]).toMatchObject({ status: 'proposal', decision: null });
  });

  it('never touches the Inspector: no tab is switched, no pane moved', async () => {
    seedAi();
    routeStylesheet();
    render(<EditorPane />);
    const user = userEvent.setup();

    // The editor surface has no Inspector at all; the Stylesheet tab's block
    // reads the same conversation. Nothing here can move the Inspector's tab.
    await askForStylesheet(user, 'tighter spacing');
    await waitFor(() => expect(turns()).toHaveLength(1));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(turns()).toHaveLength(1);
  });
});
