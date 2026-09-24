// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';
import { ApiError } from '../api/client';
import * as api from '../auth/api';
import type { MePayload } from '../auth/api';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';
import { OPEN_FLAGS } from '../auth/flags';
import { UNCONFIGURED_AI, type AiAccountState } from '../ai/types';
import * as aiApi from '../ai/api';
import { resetStylesheetConversationForTests } from '../ai/conversation';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';

const CSS = '.mpdf-doc h1 { letter-spacing: 0.3em; }';
const PROPOSED = '.mpdf-doc h1 { letter-spacing: 0.05em; }';

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  resetDocumentStoreForTests();
  resetStylesheetConversationForTests();
  await useDocumentStore.getState().init();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetAccountStoreForTests();
});

/** The `ai` block /api/me reports for a Pro account on a configured instance. */
function aiBlock(overrides: Partial<AiAccountState> = {}): AiAccountState {
  return {
    ...UNCONFIGURED_AI,
    configured: true,
    included: true,
    allowance: 100,
    remaining: 93,
    period: '2026-09',
    resetsAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function mePayload(ai: AiAccountState): MePayload {
  return {
    email: 'a@b.co',
    isAdmin: false,
    plan: 'pro',
    expiresAt: '2030-01-01T00:00:00.000Z',
    quota: { used: 0, limit: 300 },
    flags: OPEN_FLAGS,
    ai,
  };
}

/** Signs in and answers the post-Action refresh. */
function seed(ai: AiAccountState): void {
  useAccountStore.setState({
    user: { email: 'a@b.co', isAdmin: false },
    entitlement: { plan: 'pro', expiresAt: '2030-01-01T00:00:00.000Z' },
    quota: { used: 0, limit: 300 },
    flags: OPEN_FLAGS,
    ai,
    status: 'ready',
  });
  vi.spyOn(api, 'me').mockResolvedValue(mePayload(ai));
}

/** A stylesheet route that answers with a rewritten stylesheet. */
function routeStylesheet(reply: string = PROPOSED) {
  const mock = vi.fn(async () => ({
    proposal: { kind: 'replace', text: reply },
    remaining: 99,
  }));
  vi.spyOn(aiApi, 'requestStylesheet').mockImplementation(
    mock as unknown as typeof aiApi.requestStylesheet,
  );
  return mock;
}

/** A stylesheet route that never answers until it is aborted, as fetch behaves. */
function routeStylesheetPending() {
  vi.spyOn(aiApi, 'requestStylesheet').mockImplementation(
    ((_request: unknown, signal?: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      })) as unknown as typeof aiApi.requestStylesheet,
  );
}

/** A stylesheet route that refuses, as a provider failure does. */
function routeStylesheetFailure(message: string) {
  const mock = vi.fn(async () => {
    // The server answers with a plain message and a typed code; the block
    // shows the message and never names the provider.
    throw new ApiError(message, 502, 'ai_provider_error');
  });
  vi.spyOn(aiApi, 'requestStylesheet').mockImplementation(
    mock as unknown as typeof aiApi.requestStylesheet,
  );
  return mock;
}

/** The request a mocked route answered last. */
function lastRequest(mock: ReturnType<typeof vi.fn>): {
  instruction: string;
  css: string;
  history: { instruction: string; reply: string }[];
} {
  return mock.mock.calls.at(-1)![0] as never;
}

/** Opens the Inspector on the Stylesheet tab, with CSS already in the box. */
function openTab(css: string = CSS): void {
  act(() => {
    useDocumentStore
      .getState()
      .updateActive({ settings: { customStylesheet: css } });
  });
  render(<Inspector />);
  fireEvent.click(screen.getByRole('tab', { name: 'Custom stylesheet' }));
}

/** Types an instruction and sends it. */
async function send(instruction: string): Promise<void> {
  const user = userEvent.setup();
  fireEvent.change(screen.getByTestId('stylesheet-ai-input'), {
    target: { value: instruction },
  });
  await user.click(screen.getByTestId('stylesheet-ai-send'));
}

const activeCSS = () => useDocumentStore.getState().settings.customStylesheet;

describe('the AI block of the Stylesheet tab — its own states', () => {
  it('renders nothing on an instance with no provider configured', () => {
    seed(aiBlock({ configured: false, included: false, remaining: 0 }));
    openTab();
    expect(screen.queryByTestId('stylesheet-ai')).not.toBeInTheDocument();
    // The box is unaffected: the CSS editing is a separate paid feature.
    expect(screen.getByTestId('stylesheet-box')).toBeInTheDocument();
  });

  it('locks when the plan does not include AI Actions, opening the pricing modal', async () => {
    seed(aiBlock({ included: false, remaining: 0 }));
    openTab();

    const block = screen.getByTestId('stylesheet-ai-locked');
    expect(block).toHaveTextContent('part of Pro and Premium');
    expect(block).toHaveTextContent('external AI provider');
    expect(screen.queryByTestId('stylesheet-ai-input')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(block).getByRole('button', { name: 'See plans' }));
    expect(
      screen.getByRole('dialog', { name: /plans and pricing/i }),
    ).toBeInTheDocument();
  });

  it('shows the off state with a way back when AI Access is off', async () => {
    seed(aiBlock({ access: false }));
    const on = aiBlock();
    const setAccess = vi
      .spyOn(api, 'setAiAccess')
      .mockImplementation(async () => {
        useAccountStore.setState({ ai: on });
        return on;
      });
    openTab();

    const block = screen.getByTestId('stylesheet-ai-off');
    expect(block).toHaveTextContent('turned off in your Account settings');
    const user = userEvent.setup();
    await user.click(within(block).getByRole('button', { name: 'Turn on' }));

    expect(setAccess).toHaveBeenCalledWith(true);
    // Back in business: the block is ready to take an instruction.
    expect(
      await screen.findByTestId('stylesheet-ai-input'),
    ).toBeInTheDocument();
  });

  it('states the count, the period, and the reset date when the allowance is spent', () => {
    seed(aiBlock({ remaining: 0 }));
    openTab();

    const block = screen.getByTestId('stylesheet-ai-exhausted');
    expect(block).toHaveTextContent(
      'You have used all 100 AI Actions for September 2026. They reset on 2026-10-01.',
    );
    expect(screen.queryByTestId('stylesheet-ai-input')).not.toBeInTheDocument();
    // The box still works — a user with no AI Actions left edits CSS by hand.
    expect(screen.getByTestId('stylesheet-box')).toBeInTheDocument();
  });
});

describe('the AI block — a turn and its proposal card', () => {
  it('sends the box, swaps the box to the diff view, and writes the box only on Accept', async () => {
    seed(aiBlock());
    const route = routeStylesheet();
    openTab();

    await send('tighter spacing');

    // The box swapped to the proposed-diff view, which carries both sides:
    // what the box held, and what is proposed.
    const diff = await screen.findByTestId('stylesheet-box-diff');
    expect(diff).toHaveTextContent(CSS);
    expect(diff).toHaveTextContent(PROPOSED);
    expect(
      screen.queryByTestId('stylesheet-box'),
    ).not.toBeInTheDocument();
    // Nothing is written until Accept.
    expect(activeCSS()).toBe(CSS);
    expect(lastRequest(route)).toMatchObject({
      instruction: 'tighter spacing',
      css: CSS,
      history: [],
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('stylesheet-ai-accept'));
    expect(activeCSS()).toBe(PROPOSED);
    // The proposal was drawn on the paper while under review, so accepting
    // keeps that look: the layer is on.
    expect(useDocumentStore.getState().settings.customStylesheetEnabled).toBe(
      true,
    );
    // The box is back, holding the accepted stylesheet, and the turn stays in
    // the log so the next instruction can refer to it.
    expect(screen.getByTestId('stylesheet-box')).toHaveValue(PROPOSED);
    expect(screen.getByTestId('stylesheet-ai-decision')).toHaveTextContent(
      'Accepted',
    );
  });

  it('leaves the box exactly as it was on Reject, keeping the turn in the log', async () => {
    seed(aiBlock());
    routeStylesheet();
    openTab();

    await send('tighter spacing');
    await screen.findByTestId('stylesheet-box-diff');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('stylesheet-ai-reject'));

    // The plain box is back, byte-identical, and the decided turn is readable
    // in the log with no Accept left behind.
    expect(activeCSS()).toBe(CSS);
    expect(screen.getByTestId('stylesheet-box')).toHaveValue(CSS);
    expect(screen.getByTestId('stylesheet-ai-decision')).toHaveTextContent(
      'Rejected',
    );
    expect(
      screen.queryByTestId('stylesheet-ai-accept'),
    ).not.toBeInTheDocument();
  });

  it('refuses a stale proposal: a hand edit under it replaces Accept with the stale reason', async () => {
    seed(aiBlock());
    routeStylesheet();
    openTab();

    await send('tighter spacing');
    await screen.findByTestId('stylesheet-box-diff');

    // The diff view is read-only; the stale path is simulated by editing the
    // settings underneath (a hand edit to the textarea is impossible while
    // the diff view holds its place).
    act(() => {
      useDocumentStore
        .getState()
        .updateActive({ settings: { customStylesheet: '.mpdf-doc h2 { color: teal; }' } });
    });

    expect(screen.getByTestId('stylesheet-ai-stale')).toHaveTextContent(
      'changed since this was proposed',
    );
    expect(
      screen.queryByTestId('stylesheet-ai-accept'),
    ).not.toBeInTheDocument();
  });

  it('shows a plain message with Retry when the request fails, naming nothing', async () => {
    seed(aiBlock());
    routeStylesheetFailure('The AI is unavailable right now.');
    openTab();

    await send('tighter spacing');

    const error = await screen.findByTestId('stylesheet-ai-error');
    expect(error).toHaveTextContent('The AI is unavailable right now.');
    expect(
      screen.queryByTestId('stylesheet-ai-proposal'),
    ).not.toBeInTheDocument();

    // Retry is a fresh AI Action with the same instruction.
    const retried = routeStylesheet();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByTestId('stylesheet-ai-proposal');
    expect(lastRequest(retried)).toMatchObject({
      instruction: 'tighter spacing',
    });
  });

  it('sends the box as it stands plus the last three exchanges', async () => {
    seed(aiBlock());
    const route = routeStylesheet();
    openTab();

    for (const [index, instruction] of [
      'one',
      'two',
      'three',
      'four',
    ].entries()) {
      await send(instruction);
      await waitFor(() =>
        expect(screen.getAllByTestId('stylesheet-ai-proposal')).toHaveLength(
          index + 1,
        ),
      );
    }

    const last = lastRequest(route);
    expect(last.history.map((turn) => turn.instruction)).toEqual([
      'one',
      'two',
      'three',
    ]);
    expect(last.history[0]?.reply).toBe(PROPOSED);
  });

  it('sends the box as it stands for a second ask rather than a stale transcript', async () => {
    seed(aiBlock());
    const route = routeStylesheet();
    openTab();

    await send('tighter spacing');
    await screen.findByTestId('stylesheet-box-diff');
    // Decide the pending proposal by hand (Reject), then hand-edit the box.
    await userEvent
      .setup()
      .click(screen.getByTestId('stylesheet-ai-reject'));
    fireEvent.change(screen.getByTestId('stylesheet-box'), {
      target: { value: '.mpdf-doc h3 { color: navy; }' },
    });
    await send('now the accent');

    expect(lastRequest(route).css).toBe('.mpdf-doc h3 { color: navy; }');
  });

  it('cancels a request in flight, leaving no trace and writing nothing', async () => {
    seed(aiBlock());
    routeStylesheetPending();
    openTab();

    await send('tighter spacing');
    const log = await screen.findByTestId('stylesheet-ai-log');
    await waitFor(() => expect(log).toHaveTextContent('Working…'));

    const user = userEvent.setup();
    await user.click(screen.getByTestId('stylesheet-ai-cancel'));

    // A cancelled request produced nothing and cost nothing: the turn is gone.
    await waitFor(() =>
      expect(screen.getByTestId('stylesheet-ai-log')).toBeEmptyDOMElement(),
    );
    expect(activeCSS()).toBe(CSS);
  });

  it('carries the first-use disclosure once, before the first Action', async () => {
    seed(aiBlock({ disclosureSeen: false }));
    routeStylesheet();
    openTab();

    expect(screen.getByTestId('stylesheet-ai')).toHaveTextContent(
      'sent to an external AI provider',
    );
    expect(
      screen.getByRole('link', { name: 'How your data is handled' }),
    ).toHaveAttribute('href', '/privacy');

    // Once the account has recorded it, the notice is gone.
    seed(aiBlock({ disclosureSeen: true }));
    cleanup();
    openTab();
    expect(screen.getByTestId('stylesheet-ai')).not.toHaveTextContent(
      'sent to an external AI provider',
    );
  });
});

describe('the AI block in the tab', () => {
  it('sits below the box and above the styling reference link', () => {
    seed(aiBlock());
    openTab();

    const box = screen.getByTestId('stylesheet-box');
    const block = screen.getByTestId('stylesheet-ai');
    const link = screen.getByRole('link', { name: 'Styling reference' });

    expect(box.compareDocumentPosition(block)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(block.compareDocumentPosition(link)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('keeps each Document’s conversation to itself', async () => {
    seed(aiBlock());
    routeStylesheet();
    openTab();
    await send('for this one');
    await screen.findByTestId('stylesheet-ai-proposal');

    // A second document starts from an empty log.
    await act(async () => {
      await useDocumentStore.getState().createDocument();
    });
    await waitFor(() =>
      expect(
        screen.queryByTestId('stylesheet-ai-proposal'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('for this one')).not.toBeInTheDocument();
  });
});
