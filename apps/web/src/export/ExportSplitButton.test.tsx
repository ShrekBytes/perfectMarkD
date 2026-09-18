// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pipelineModule from '../canvas/pipeline';
import { useAccountStore } from '../auth/account-store';
import * as api from '../auth/api';
import type { MePayload } from '../auth/api';
import { LOCKED_FLAGS, OPEN_FLAGS } from '../auth/flags';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { downloadBlob } from '../library/download';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';
import { stubPrintIframes } from '../testing/stub-print-iframe';
import {
  hasShownPrintHint,
  markPrintHintShown,
  setPrintLoadTimeoutForTests,
} from './clientExport';
import { ExportSplitButton } from './ExportSplitButton';
import { setBrowserNoticeDelayForTests } from './useClientExport';

vi.mock('../library/download', () => ({ downloadBlob: vi.fn() }));

const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

let printStub: ReturnType<typeof stubPrintIframes>;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  resetDocumentStoreForTests();
  await act(async () => {
    await useDocumentStore.getState().init();
  });
  // jsdom never parses srcdoc; without this every export waits the full 5 s.
  setPrintLoadTimeoutForTests(10);
  setBrowserNoticeDelayForTests(1);
  printStub = stubPrintIframes();
  vi.mocked(downloadBlob).mockClear();
});

afterEach(() => {
  cleanup();
  printStub.restore();
  setPrintLoadTimeoutForTests(5000);
  setBrowserNoticeDelayForTests(2000);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Types into the active document so exports have content. */
function typeMarkdown(markdown: string): void {
  act(() => {
    useDocumentStore.getState().updateActive({ markdown });
  });
}

// Anchored so the chevron ("More export options") never matches.
const exportButton = () =>
  screen.getByRole('button', { name: /^(Export|Exporting…)$/ });
const chevron = () =>
  screen.getByRole('button', { name: 'More export options' });

/** The stub hands out one fake window per export flow; total calls across
 *  flows is what "printed N times" means here. */
const totalPrints = () =>
  printStub.windows.reduce((n, w) => n + w.print.mock.calls.length, 0);

it('prints straight away when the session hint was already shown', async () => {
  markPrintHintShown();
  render(<ExportSplitButton />);
  typeMarkdown('# Hello');

  await userEvent.click(exportButton());

  await waitFor(() =>
    expect(printStub.windows[0]?.print).toHaveBeenCalledTimes(1),
  );
  // The print saw the real export document for this document.
  expect(printStub.iframesAtPrint[0]?.getAttribute('srcdoc')).toContain(
    'class="mpdf-export-page"',
  );
  expect(printStub.iframesAtPrint[0]?.getAttribute('srcdoc')).toContain(
    '<title>Welcome to PerfectMarkD</title>',
  );
  // No hint dialog got between click and print; the frame is cleaned up.
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(document.querySelector('iframe')).toBeNull());
  expect(exportButton()).toBeEnabled();
});

it('disables the split button with a busy label while building', async () => {
  markPrintHintShown();
  const real = pipelineModule.runDocumentPipeline;
  let capturedArgs!: Parameters<typeof real>;
  let resolveRender!: (value: pipelineModule.PipelineResult) => void;
  vi.spyOn(pipelineModule, 'runDocumentPipeline').mockImplementationOnce(((
    ...args: Parameters<typeof real>
  ) => {
    capturedArgs = args;
    return new Promise<pipelineModule.PipelineResult>((resolve) => {
      resolveRender = resolve;
    });
  }) as typeof real);
  render(<ExportSplitButton />);
  typeMarkdown('# Slow doc');

  await userEvent.click(exportButton());
  expect(await screen.findByText('Exporting…')).toBeInTheDocument();
  expect(exportButton()).toBeDisabled();
  expect(chevron()).toBeDisabled();

  // Finish the build; the flow continues to print.
  await act(async () => {
    resolveRender(await real(...capturedArgs));
  });
  await waitFor(() =>
    expect(printStub.windows[0]?.print).toHaveBeenCalledTimes(1),
  );
  expect(exportButton()).toBeEnabled();
  expect(screen.getByText('Export')).toBeInTheDocument();
});

it('keeps a plain disabled Export label while the hint awaits confirmation', async () => {
  render(<ExportSplitButton />);
  typeMarkdown('# Hint');

  await userEvent.click(exportButton());
  await screen.findByRole('dialog', {
    name: /export via the print dialog/i,
  });

  // Nothing is being exported yet — the dialog awaits the user's decision,
  // so no spinner and no "Exporting…" — but the button is locked so the
  // deliberation can't be double-clicked into a silent no-op.
  expect(screen.queryByText('Exporting…')).not.toBeInTheDocument();
  expect(exportButton()).toBeDisabled();
  expect(exportButton()).toHaveTextContent('Export');
  expect(screen.getByTestId('export-split')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

it('shows the one-time hint before the first print, then prints on confirm', async () => {
  render(<ExportSplitButton />);
  typeMarkdown('# First export');

  await userEvent.click(exportButton());

  const dialog = await screen.findByRole('dialog', {
    name: /export via the print dialog/i,
  });
  expect(dialog).toHaveTextContent(
    /Choose 'Save as PDF' — quality is identical to a downloaded PDF/,
  );
  // Nothing printed while the hint is up.
  expect(printStub.windows).toHaveLength(0);

  await userEvent.click(
    screen.getByRole('button', { name: /continue to print/i }),
  );
  await waitFor(() => expect(totalPrints()).toBe(1));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  // The hint stays shown for the rest of the session.
  expect(hasShownPrintHint()).toBe(true);

  // A second export in the same session skips the dialog entirely.
  await userEvent.click(exportButton());
  await waitFor(() => expect(totalPrints()).toBe(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('cancelling the hint prints nothing and keeps the hint armed', async () => {
  render(<ExportSplitButton />);
  typeMarkdown('# Cancelled');

  await userEvent.click(exportButton());
  await screen.findByRole('dialog', {
    name: /export via the print dialog/i,
  });
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(printStub.windows).toHaveLength(0);
  expect(hasShownPrintHint()).toBe(false);
  expect(exportButton()).toBeEnabled();
});

it('warns Firefox users about page sizing on repeat exports', async () => {
  markPrintHintShown();
  vi.stubGlobal('navigator', { userAgent: FIREFOX_UA } as unknown as Navigator);
  render(<ExportSplitButton />);
  typeMarkdown('# Firefox');

  await userEvent.click(exportButton());
  await waitFor(() =>
    expect(printStub.windows[0]?.print).toHaveBeenCalledTimes(1),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    /Chrome or Edge/i,
  );
});

it('includes the browser notice in the first-export hint dialog', async () => {
  vi.stubGlobal('navigator', { userAgent: FIREFOX_UA } as unknown as Navigator);
  render(<ExportSplitButton />);
  typeMarkdown('# Firefox first run');

  await userEvent.click(exportButton());
  await screen.findByRole('dialog', {
    name: /export via the print dialog/i,
  });
  expect(screen.getByTestId('print-hint-browser-notice')).toHaveTextContent(
    /Chrome or Edge/i,
  );
});

it('runs the same flow from the dropdown Client Export… item', async () => {
  markPrintHintShown();
  render(<ExportSplitButton />);
  typeMarkdown('# Via menu');

  await userEvent.click(chevron());
  expect(
    screen.getByRole('menu', { name: /export options/i }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Client Export…' }));

  // The menu closed and the flow ran without the hint (already shown).
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(printStub.windows[0]?.print).toHaveBeenCalledTimes(1),
  );
});

it('closes the dropdown with Escape without exporting', async () => {
  markPrintHintShown();
  render(<ExportSplitButton />);

  await userEvent.click(chevron());
  expect(screen.getByRole('menuitem', { name: 'Client Export…' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(printStub.windows).toHaveLength(0);
});

it('surfaces an export failure and recovers', async () => {
  markPrintHintShown();
  vi.spyOn(pipelineModule, 'runDocumentPipeline').mockRejectedValueOnce(
    new Error('boom'),
  );
  render(<ExportSplitButton />);
  typeMarkdown('# Doomed');

  await userEvent.click(exportButton());
  expect(await screen.findByText(/export failed/i)).toBeInTheDocument();
  expect(printStub.windows).toHaveLength(0);
  expect(exportButton()).toBeEnabled();
});

it('opens the pricing modal from the Server Export item without exporting', async () => {
  markPrintHintShown();
  render(<ExportSplitButton />);
  typeMarkdown('# Priced out');

  await userEvent.click(chevron());
  await userEvent.click(
    screen.getByRole('menuitem', { name: /server export/i }),
  );

  // The menu closed and the pricing modal took its place — no print ran.
  // Its paid CTAs now start the real upgrade flow (billing/01).
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  const dialog = screen.getByRole('dialog', { name: /plans and pricing/i });
  expect(dialog).toHaveTextContent('Premium');
  expect(dialog).toHaveTextContent(/client export keeps working/i);
  expect(printStub.windows).toHaveLength(0);

  // Escape closes the modal and the button is ready for a Client Export.
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(exportButton()).toBeEnabled();
});

// ─── Server Export (billing/04) ──────────────────────────────────────────────

function mePayload(overrides: Partial<MePayload> = {}): MePayload {
  return {
    email: 'a@b.co',
    isAdmin: false,
    plan: null,
    expiresAt: null,
    quota: { used: 0, limit: 0 },
    flags: LOCKED_FLAGS,
    ...overrides,
  };
}

/** Seeds the account store with the slices /api/me would have delivered. */
function seedAccount(payload: MePayload): void {
  useAccountStore.setState({
    user: { email: payload.email, isAdmin: payload.isAdmin },
    entitlement:
      payload.plan && payload.expiresAt
        ? { plan: payload.plan, expiresAt: payload.expiresAt }
        : null,
    quota: payload.quota,
    flags: payload.flags,
    status: 'ready',
  });
}

const jobBody = {
  job: {
    id: 'job-9',
    status: 'queued',
    plan: 'pro',
    pages: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-09-12T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** The happy-path wire: enqueue → poll (done) → PDF download. */
function stubHappyServerFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/export') return jsonResponse(jobBody, 202);
    if (path.endsWith('/pdf')) {
      return {
        ok: true,
        status: 200,
        blob: () =>
          Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
      } as unknown as Response;
    }
    return jsonResponse({
      job: { ...jobBody.job, status: 'done', pages: 1, finishedAt: 'x' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Server Export (billing/04)', () => {
  beforeEach(() => {
    markPrintHintShown();
  });

  it('shows the quota chip and the queue-priority note for an entitled user, then exports end to end', async () => {
    // The refreshed /api/me after the export: the spend is visible.
    const me = vi.spyOn(api, 'me').mockResolvedValue(
      mePayload({
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 4, limit: 300 },
        flags: OPEN_FLAGS,
      }),
    );
    seedAccount(
      mePayload({
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 3, limit: 300 },
        flags: OPEN_FLAGS,
      }),
    );
    const fetchMock = stubHappyServerFetch();
    render(<ExportSplitButton />);
    typeMarkdown('# Server export');

    await userEvent.click(chevron());
    const item = screen.getByRole('menuitem', { name: /server export/i });
    expect(item).toHaveTextContent('3/300');
    // Pro's note is the Premium upsell; Premium's own note asserts below.
    expect(item).toHaveTextContent('Premium renders first');

    await userEvent.click(item);
    await screen.findByText(/Server Export complete/i);

    // The enqueue carried the real payload; usage synced afterwards.
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/export');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.markdown).toContain('Server export');
    expect(body.pageCount).toBe(1);
    expect(vi.mocked(downloadBlob)).toHaveBeenCalledWith(
      'Welcome to PerfectMarkD.pdf',
      expect.any(Blob),
    );
    // The spend hit /api/me — the chip shows it without a reload.
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(1));
    await userEvent.click(chevron());
    expect(screen.getByTestId('server-export-quota')).toHaveTextContent(
      '4/300',
    );
  });

  it('shows the Premium queue note and the document name for a Premium user', async () => {
    seedAccount(
      mePayload({
        plan: 'premium',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 10, limit: 1000 },
        flags: OPEN_FLAGS,
      }),
    );
    stubHappyServerFetch();
    render(<ExportSplitButton />);
    typeMarkdown('# Premium doc');

    await userEvent.click(chevron());
    const item = screen.getByRole('menuitem', { name: /server export/i });
    expect(item).toHaveTextContent('10/1000');
    expect(item).toHaveTextContent('Priority render queue');

    await userEvent.click(item);
    await screen.findByText(/Server Export complete/i);
    expect(vi.mocked(downloadBlob)).toHaveBeenCalledWith(
      'Welcome to PerfectMarkD.pdf',
      expect.any(Blob),
    );
  });

  it('lets a comped user without a plan spend their allowance', async () => {
    // billing/03: comps grant exports without a plan — the item is live and
    // labelled as the admin-granted allowance, with no entitlement chip lie.
    seedAccount(mePayload({ quota: { used: 1, limit: 5 } }));
    stubHappyServerFetch();
    render(<ExportSplitButton />);
    typeMarkdown('# Comp export');

    await userEvent.click(chevron());
    const item = screen.getByRole('menuitem', { name: /server export/i });
    expect(item).toHaveTextContent('1/5');
    expect(item).toHaveTextContent('Comp exports — no plan needed');

    await userEvent.click(item);
    await screen.findByText(/Server Export complete/i);
  });

  it('an over-quota export shows the typed error and opens the upgrade prompt', async () => {
    seedAccount(
      mePayload({
        plan: 'pro',
        quota: { used: 300, limit: 300 },
        flags: OPEN_FLAGS,
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error:
              'You have used all of this period’s Server Exports — it resets next period, or upgrade for a larger quota.',
            code: 'quota_exceeded',
          },
          402,
        ),
      ),
    );
    render(<ExportSplitButton />);
    typeMarkdown('# One too many');

    await userEvent.click(chevron());
    await userEvent.click(
      screen.getByRole('menuitem', { name: /server export/i }),
    );

    expect(await screen.findByText(/used all of this period/i)).toHaveClass(
      'text-danger',
    );
    // The upgrade prompt: the pricing modal the flow opens for 402/403.
    expect(
      screen.getByRole('dialog', { name: /plans and pricing/i }),
    ).toBeInTheDocument();
    expect(vi.mocked(downloadBlob)).not.toHaveBeenCalled();
  });

  it('an expired-plan rejection re-locks the item via the refresh', async () => {
    // Stale gates: the store still holds an Entitlement, but /api/me now
    // reports it gone — the click gets 403 and the refresh reconciles.
    seedAccount(
      mePayload({
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 0, limit: 300 },
        flags: OPEN_FLAGS,
      }),
    );
    const me = vi.spyOn(api, 'me').mockResolvedValue(mePayload());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Server Export needs an active paid plan.',
            code: 'entitlement_required',
          },
          403,
        ),
      ),
    );
    render(<ExportSplitButton />);
    typeMarkdown('# Expired');

    await userEvent.click(chevron());
    await userEvent.click(
      screen.getByRole('menuitem', { name: /server export/i }),
    );

    expect(
      await screen.findByText(/needs an active paid plan/i),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(useAccountStore.getState().entitlement).toBeNull();
    });
    // The plan-ended notice rides the same refresh (expiry handling).
    expect(useAccountStore.getState().planEndedNotice).toBe(true);

    // Re-opened, the item is the Free one again — Paid, opens pricing.
    await userEvent.keyboard('{Escape}');
    await userEvent.click(chevron());
    const item = screen.getByRole('menuitem', { name: /server export/i });
    expect(item).toHaveTextContent('Paid');
    await userEvent.click(item);
    expect(
      screen.getByRole('dialog', { name: /plans and pricing/i }),
    ).toBeInTheDocument();
    expect(me).toHaveBeenCalled();
  });

  it('a burst-limited export surfaces the server message without a prompt', async () => {
    seedAccount(
      mePayload({
        plan: 'pro',
        quota: { used: 0, limit: 300 },
        flags: OPEN_FLAGS,
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Too many exports in a minute — try again shortly.',
            code: 'burst_limit',
          },
          429,
        ),
      ),
    );
    render(<ExportSplitButton />);
    typeMarkdown('# Bursty');

    await userEvent.click(chevron());
    await userEvent.click(
      screen.getByRole('menuitem', { name: /server export/i }),
    );

    expect(await screen.findByText(/too many exports/i)).toBeInTheDocument();
    // No upgrade prompt for a transient limit — no pricing modal.
    expect(
      screen.queryByRole('dialog', { name: /plans and pricing/i }),
    ).not.toBeInTheDocument();
  });

  it('a failed render surfaces the job message and leaves the button ready', async () => {
    seedAccount(
      mePayload({
        plan: 'pro',
        quota: { used: 0, limit: 300 },
        flags: OPEN_FLAGS,
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === '/api/export') return jsonResponse(jobBody, 202);
        return jsonResponse({
          job: {
            ...jobBody.job,
            status: 'failed',
            errorCode: 'render_timeout',
            errorMessage: 'The render took too long.',
          },
        });
      }),
    );
    render(<ExportSplitButton />);
    typeMarkdown('# Doomed server export');

    await userEvent.click(chevron());
    await userEvent.click(
      screen.getByRole('menuitem', { name: /server export/i }),
    );

    expect(
      await screen.findByText(/render took too long/i),
    ).toBeInTheDocument();
    expect(vi.mocked(downloadBlob)).not.toHaveBeenCalled();
    await waitFor(() => expect(exportButton()).toBeEnabled());
  });
});
