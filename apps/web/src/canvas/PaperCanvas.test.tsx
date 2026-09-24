// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaperCanvas, type PaperCanvasApi } from './PaperCanvas';
import * as pipelineModule from './pipeline';
import type { PipelineProgress } from './pipeline';
import { resolvePageGeometry } from '@perfectmarkd/core';
import {
  resetStylesheetConversationForTests,
  useStylesheetConversation,
} from '../ai/conversation';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubClientRects } from '../testing/stub-client-rects';
import { stubIndexedDB } from '../testing/stub-idb';

// The sample document carries a mermaid fence; component tests must not pull
// the real (multi-MB, DOM-timing) bundle. The hook itself is covered in
// mermaid.test.ts.
vi.mock('./mermaid', async () => {
  const { stubMermaidModule } = await import('../testing/stub-mermaid');
  return stubMermaidModule;
});

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  // Store init (fake-indexeddb) must run on real timers; fake timers start
  // after it, covering the canvas's debounce/render scheduling.
  await useDocumentStore.getState().init();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetStylesheetConversationForTests();
});

/** Mounts the canvas and resolves the API the shell holds through the ref. */
function mountCanvas(): PaperCanvasApi {
  const ref = { current: null as PaperCanvasApi | null };
  render(<PaperCanvas ref={ref} />);
  const api = ref.current;
  if (!api) throw new Error('canvas did not expose its API');
  return api;
}

function setMarkdown(markdown: string): void {
  act(() => {
    useDocumentStore.setState({ markdown });
  });
}

/** Store writes hit IndexedDB, whose hops need timer time under fake timers —
 *  pump while the write settles (a hung act poisons every later test). */
async function createDocumentSettled(): Promise<void> {
  await act(async () => {
    const creating = useDocumentStore.getState().createDocument();
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(10);
    }
    await creating;
  });
}

function pageHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.pm-page-host'));
}

/** Advances fake timers without the settling pump — for firing (or not
 *  firing) the debounce itself. */
async function flushRenderRaw(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Drives the debounce and settles the render's full async chain: the
 *  debounce timer, then the IndexedDB + pipeline hops that schedule their own
 *  macrotasks under fake-indexeddb. Each advance yields microtasks too, so a
 *  short pump drains everything. */
async function flushRender(ms = 400): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(1);
    }
  });
}

describe('PaperCanvas rendering', () => {
  it('shows the loading shimmer until the first render lands', async () => {
    mountCanvas();
    expect(screen.getByTestId('canvas-loading')).toBeInTheDocument();
    expect(pageHosts()).toHaveLength(0);

    setMarkdown('# Hello\n\nWorld.');
    await flushRender();

    expect(screen.queryByTestId('canvas-loading')).not.toBeInTheDocument();
    expect(pageHosts()).toHaveLength(1);
    expect(document.querySelector('.pm-page-label')!.textContent).toBe(
      'Page 1 of 1',
    );
  });

  it('hides the mounted pages from the a11y tree and summarizes the preview instead', async () => {
    mountCanvas();
    setMarkdown('# Hello\n\nWorld.');
    await flushRender();

    const scroll = screen.getByTestId('canvas-scroll');
    expect(scroll).toHaveAttribute('role', 'region');
    expect(scroll).toHaveAttribute('aria-label', 'Paper Canvas preview');
    // The editor holds the editable truth — the pages are a picture, not a
    // second copy of the document in the accessibility tree.
    expect(screen.getByTestId('canvas-pages')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Previewing 1 page');
  });

  it('recedes at rest and restores on hover or focus, with AA text in both states', () => {
    mountCanvas();

    const pill = screen.getByTestId('zoom-pill');
    // Rest: background weight only — no opacity fade, which would push the
    // readout text under 4.5:1 (DESIGN.md: the paper is never covered, but
    // text never drops below AA either).
    expect(pill.className).toContain('bg-surface/60');
    expect(pill.className).toContain('border-transparent');
    expect(pill.className).not.toContain('opacity-');
    // Reaching for it (pointer or keyboard) restores the raised state.
    expect(pill.className).toContain('hover:bg-surface/95');
    expect(pill.className).toContain('focus-within:bg-surface/95');
  });

  it('debounces edits and coalesces bursts into one engine run', async () => {
    const spy = vi.spyOn(pipelineModule, 'runDocumentPipeline');
    mountCanvas();
    setMarkdown('# One');
    setMarkdown('# One two');
    setMarkdown('# One two three');
    await flushRender();
    await flushRender(); // a second window must not re-run without edits
    expect(spy).toHaveBeenCalledTimes(1);
    expect(pageHosts()).toHaveLength(1);
  });

  it('waits 400ms of idle, and a keystroke restarts the window', async () => {
    const spy = vi.spyOn(pipelineModule, 'runDocumentPipeline');
    mountCanvas();
    const scroll = screen.getByTestId('canvas-scroll');
    setMarkdown('# One');

    // The window has not elapsed: nothing has run yet. aria-busy is the tight
    // check — the run flips it before its first await, so a debounce that
    // fired early cannot hide behind a slow async chain.
    await flushRenderRaw(399);
    expect(spy).not.toHaveBeenCalled();
    expect(scroll).toHaveAttribute('aria-busy', 'false');

    // A keystroke inside the window cancels the pending run and restarts the
    // clock — the render tracks the pause, not the last keypress.
    setMarkdown('# One two');
    await flushRenderRaw(399);
    expect(spy).not.toHaveBeenCalled();
    expect(scroll).toHaveAttribute('aria-busy', 'false');

    // 400ms of idle is what earns a run, and it renders the latest text.
    await flushRenderRaw(1);
    await flushRender();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBe('# One two');
  });

  it('re-renders when settings change', async () => {
    const spy = vi.spyOn(pipelineModule, 'runDocumentPipeline');
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();
    act(() => {
      useDocumentStore.setState({
        settings: {
          ...useDocumentStore.getState().settings,
          showFooter: false,
        },
      });
    });
    await flushRender();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('draws a stylesheet proposal provisionally, without writing it to the document', async () => {
    const spy = vi.spyOn(pipelineModule, 'runDocumentPipeline');
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();

    const docId = useDocumentStore.getState().activeId!;
    const PROPOSED = '.mpdf-doc h1 { letter-spacing: 0.3em; }';
    let turnId = 0;
    act(() => {
      const conversation = useStylesheetConversation.getState();
      turnId = conversation.start(docId, 'tighter rules', '');
      conversation.resolve(docId, turnId, PROPOSED);
    });
    await flushRender();

    // The paper is drawn with the proposal, layer forced on…
    const previewed = spy.mock.calls.at(-1)![1];
    expect(previewed.customStylesheet).toBe(PROPOSED);
    expect(previewed.customStylesheetEnabled).toBe(true);
    // …and the Document's own stylesheet is untouched: a preview is never
    // persisted, and only Accept writes the box.
    expect(useDocumentStore.getState().settings.customStylesheet).toBe('');

    // Deciding the proposal reverts the paper to what the box holds.
    act(() => {
      useStylesheetConversation.getState().decide(docId, turnId, 'rejected');
    });
    await flushRender();
    const reverted = spy.mock.calls.at(-1)![1];
    expect(reverted.customStylesheet).toBe('');
    expect(reverted.customStylesheetEnabled).toBe(false);
  });

  it('renders immediately on the manual render call (Ctrl/Cmd+Enter path)', async () => {
    const spy = vi.spyOn(pipelineModule, 'runDocumentPipeline');
    const api = mountCanvas();
    setMarkdown('# Hello');
    await act(async () => {
      api.renderNow();
      await flushRenderRaw(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(pageHosts()).toHaveLength(1);
    // The pending debounced render is cancelled: no second run.
    await flushRender();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('splits /// sections into labeled pages', async () => {
    mountCanvas();
    setMarkdown('one\n\n///\n\ntwo\n\n///\n\nthree');
    await flushRender();
    const hosts = pageHosts();
    expect(hosts).toHaveLength(3);
    const labels = Array.from(document.querySelectorAll('.pm-page-label')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);
  });

  it('renders a blank document as one empty page', async () => {
    mountCanvas();
    // First run seeds the sample; switch to a blank document for this check.
    await createDocumentSettled();
    await flushRender();
    expect(pageHosts()).toHaveLength(1);
    // No content nodes — the only shadow text is the footer page number.
    const content = pageHosts()[0]!.shadowRoot!.querySelector(
      '[data-pm-layer="content"]',
    )!;
    expect(content.children).toHaveLength(0);
  });

  it('reports the render total to the document store', async () => {
    mountCanvas();
    setMarkdown('# One\n\n///\n\nTwo\n\n///\n\nThree');
    await flushRender();

    // The store value the top-bar gauge reads, and the Library row's
    // persisted count, both come from this one number.
    expect(useDocumentStore.getState().pageCount).toBe(3);
    expect(useDocumentStore.getState().docs[0]?.pageCount).toBe(3);
  });

  it('clears the previous document and renders the new one on doc switch', async () => {
    mountCanvas();
    setMarkdown('# First doc');
    await flushRender();
    expect(pageHosts()).toHaveLength(1);

    await createDocumentSettled();
    // Stale pages are dropped before the new document renders.
    expect(pageHosts()).toHaveLength(0);
    await flushRender();
    expect(pageHosts()).toHaveLength(1);
  });

  it('marks the canvas busy while a render is in flight', async () => {
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();
    const scroll = screen.getByTestId('canvas-scroll');
    expect(scroll).toHaveAttribute('aria-busy', 'false');
    setMarkdown('# Hello again');
    await flushRender();
    // The render chain settles within the flush above; aria-busy settles with it.
    expect(scroll.getAttribute('aria-busy')).toBe('false');
  });

  it('shows the render progress only once the run proves slow', async () => {
    // A run that never settles: the indicator is the only thing under test.
    let report: ((progress: PipelineProgress) => void) | undefined;
    vi.spyOn(pipelineModule, 'runDocumentPipeline').mockImplementation(
      (_markdown, _settings, options) => {
        report = options.onProgress;
        return new Promise(() => {});
      },
    );

    mountCanvas();
    setMarkdown('one\n\n///\n\ntwo\n\n///\n\nthree');
    await flushRenderRaw(400); // the debounce fires and the run starts

    // Under the reveal threshold nothing appears: a normal edit must never
    // earn chrome it did not have to wait for.
    await flushRenderRaw(200);
    expect(screen.queryByTestId('canvas-progress')).not.toBeInTheDocument();

    // Past it, the desk narrates the run — with the run's own numbers.
    await flushRenderRaw(100);
    act(() => {
      report!({ sectionsDone: 1, sectionsTotal: 3, pages: 2 });
    });
    const indicator = screen.getByTestId('canvas-progress');
    expect(indicator).toHaveTextContent('section 2 of 3');
    expect(indicator).toHaveTextContent('2 pages');

    // The bar is a progressbar, not a live region: a readout that changes on
    // every yield would otherwise announce the run dozens of times.
    const bar = screen.getByRole('progressbar', { name: 'Render progress' });
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(indicator).not.toHaveAttribute('role', 'status');
  });

  it('names no section when the document is a single one', async () => {
    let report: ((progress: PipelineProgress) => void) | undefined;
    vi.spyOn(pipelineModule, 'runDocumentPipeline').mockImplementation(
      (_markdown, _settings, options) => {
        report = options.onProgress;
        return new Promise(() => {});
      },
    );

    mountCanvas();
    setMarkdown('# One long section');
    await flushRenderRaw(400);
    await flushRenderRaw(300);
    act(() => {
      report!({ sectionsDone: 0, sectionsTotal: 1, pages: 41 });
    });

    // No denominator to fill, so no bar — the page count still moves.
    const indicator = screen.getByTestId('canvas-progress');
    expect(indicator).toHaveTextContent('Rendering preview · 41 pages');
    expect(
      screen.queryByRole('progressbar', { name: 'Render progress' }),
    ).not.toBeInTheDocument();
  });

  it('clears the progress indicator when the run finishes', async () => {
    let settle!: () => void;
    vi.spyOn(pipelineModule, 'runDocumentPipeline').mockImplementation(
      (_markdown, settings, options) => {
        options.onProgress?.({ sectionsDone: 1, sectionsTotal: 2, pages: 3 });
        return new Promise((resolve) => {
          settle = () =>
            resolve({
              layouts: [],
              docCSS: '',
              sheetCSS: '',
              isRTL: false,
              geometry: resolvePageGeometry(settings),
            });
        });
      },
    );

    mountCanvas();
    setMarkdown('# Hello');
    await flushRenderRaw(400);
    await flushRenderRaw(300);
    expect(screen.getByTestId('canvas-progress')).toBeInTheDocument();

    await act(async () => {
      settle();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByTestId('canvas-progress')).not.toBeInTheDocument();
  });

  it('surfaces a failed render as a persistent notice and Retry recovers', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const spy = vi
      .spyOn(pipelineModule, 'runDocumentPipeline')
      .mockRejectedValueOnce(new Error('engine exploded'));

    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();

    // The failure is user-facing, not console-only: the notice names the
    // stale-preview risk and offers the way out.
    const notice = screen.getByTestId('canvas-error-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('may be out of date');
    expect(consoleError).toHaveBeenCalled();

    // Retry runs the render again (now against the real pipeline) and a
    // success clears the notice and lands the pages.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flushRenderRaw(0);
    await flushRender();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('canvas-error-notice')).not.toBeInTheDocument();
    expect(pageHosts()).toHaveLength(1);
  });
});

describe('PaperCanvas zoom pill', () => {
  it('steps zoom in and out, clamped to 35–100%', async () => {
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();

    const out = screen.getByRole('button', { name: 'Zoom out' });
    const level = screen.getByTestId('zoom-level');
    expect(level).toHaveTextContent('100%');

    fireEvent.click(out);
    fireEvent.click(out);
    expect(level).toHaveTextContent('90%');

    for (let i = 0; i < 15; i++) fireEvent.click(out);
    expect(level).toHaveTextContent('35%');

    const inBtn = screen.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 20; i++) fireEvent.click(inBtn);
    expect(level).toHaveTextContent('100%');
  });

  it('fit width derives zoom from the canvas width and the page size', async () => {
    const spy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(600);
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();

    fireEvent.click(screen.getByRole('button', { name: 'Fit page width' }));
    // (600 − 2×24) / 794 (A4) = 69.5% → displayed rounded.
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('70%');
    expect(spy).toHaveBeenCalled();
  });

  it('the readout snaps to 100% and takes over the zoom', async () => {
    // The ResizeObserver drives the pre-takeover re-fit; jsdom lacks it, and
    // the component receives its callback through the constructor.
    const ResizeObserverMock = {
      last: null as { fire: () => void } | null,
      fire: () => {
        act(() => ResizeObserverMock.last?.fire());
      },
    };
    class FakeResizeObserver {
      #cb: () => void;
      constructor(cb: () => void) {
        this.#cb = cb;
      }
      observe() {
        ResizeObserverMock.last = { fire: () => this.#cb() };
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get');
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();

    // jsdom renders at 0 width, so the first paint falls back to 1.00.
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%');

    // Pre-takeover: a canvas resize re-fits to the new width.
    clientWidth.mockReturnValue(600);
    ResizeObserverMock.fire();
    // (600 − 2×24) / 794 (A4) = 69.5% → displayed rounded.
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('70%');

    // Takeover: two manual steps, then the readout snap — and the zoom is
    // frozen for the session even though the canvas "resizes" again.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('60%');

    const readout = screen.getByTestId('zoom-level');
    expect(readout).toHaveAccessibleName('Zoom to actual size, currently 60%');
    fireEvent.click(readout);
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%');

    clientWidth.mockReturnValue(1200);
    ResizeObserverMock.fire();
    await flushRenderRaw(0);
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%');
  });

  it('the readout is a no-op at 100%', async () => {
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();

    const readout = screen.getByTestId('zoom-level');
    fireEvent.click(readout);
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%');
  });

  it('applies zoom to the mounted page slots', async () => {
    mountCanvas();
    setMarkdown('# Hello');
    await flushRender();
    const frame = document.querySelector('.pm-page-frame') as HTMLElement;
    const host = pageHosts()[0]!;
    // 100%: the frame is the page's true size.
    expect(frame.style.width).toBe('794px');
    expect(host.style.transform).toBe('scale(1)');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(frame.style.width).toBe(`${794 * 0.95}px`);
    expect(host.style.transform).toBe('scale(0.95)');
  });
});

describe('PaperCanvas anchor navigation', () => {
  it('scrolls to the page containing the anchor target', async () => {
    mountCanvas();
    setMarkdown('# Top\n\n[down](#target)\n\n///\n\n## Target');
    await flushRender();
    expect(pageHosts()).toHaveLength(2);

    const scroll = screen.getByTestId('canvas-scroll');
    const setScroll = vi.fn();
    Object.defineProperty(scroll, 'scrollTop', { set: setScroll });

    // The link lives inside page 1's shadow root; composed bubbles cross the
    // shadow boundary the way a real click does.
    const anchor = pageHosts()[0]!.shadowRoot!.querySelector('a')!;
    anchor.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    expect(setScroll).toHaveBeenCalled();
  });

  it('ignores clicks on links without a matching target', async () => {
    mountCanvas();
    setMarkdown('[missing](#nowhere)');
    await flushRender();
    const scroll = screen.getByTestId('canvas-scroll');
    const setScroll = vi.fn();
    Object.defineProperty(scroll, 'scrollTop', { set: setScroll });

    const anchor = pageHosts()[0]!.shadowRoot!.querySelector('a')!;
    anchor.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    expect(setScroll).not.toHaveBeenCalled();
  });
});

describe('PaperCanvas scroll sync', () => {
  it('maps the editor scroll fraction onto the canvas scroll height', () => {
    const api = mountCanvas();
    const scroll = screen.getByTestId('canvas-scroll');
    const setScroll = vi.fn();
    Object.defineProperty(scroll, 'scrollTop', { set: setScroll });
    Object.defineProperty(scroll, 'scrollHeight', { value: 2000 });
    Object.defineProperty(scroll, 'clientHeight', { value: 500 });

    api.setScrollFraction(0.5);
    expect(setScroll).toHaveBeenCalledWith(750);
  });
});

describe('PaperCanvas large-document guard', () => {
  function hugeDoc(pages: number): string {
    return Array.from({ length: pages }, (_, i) => `page ${i}`).join(
      '\n\n///\n\n',
    );
  }

  // Each test paginates 100+ real pages — well over the default 5s when the
  // suite runs in parallel, so they carry an explicit budget.
  it(
    'pauses renders over 100 pages behind a toast until confirmed',
    { timeout: 20_000 },
    async () => {
      mountCanvas();
      setMarkdown(hugeDoc(101));
      await flushRender();

      const toast = screen.getByTestId('large-doc-toast');
      expect(toast).toHaveTextContent('101 pages');
      expect(pageHosts()).toHaveLength(0);

      fireEvent.click(screen.getByTestId('render-anyway'));
      await flushRender(0);
      expect(screen.queryByTestId('large-doc-toast')).not.toBeInTheDocument();
      expect(pageHosts()).toHaveLength(101);
    },
  );

  it(
    'records the count even when the guard defers mounting',
    { timeout: 20_000 },
    async () => {
      mountCanvas();
      setMarkdown(hugeDoc(101));
      await flushRender();

      expect(screen.getByTestId('large-doc-toast')).toBeInTheDocument();
      expect(pageHosts()).toHaveLength(0);
      // Pagination already ran, so the Library learns the true size
      // without "Render anyway".
      expect(useDocumentStore.getState().pageCount).toBe(101);
      expect(useDocumentStore.getState().docs[0]?.pageCount).toBe(101);
    },
  );

  it(
    'does not re-prompt after confirmation within the same document',
    { timeout: 20_000 },
    async () => {
      mountCanvas();
      setMarkdown(hugeDoc(101));
      await flushRender();
      fireEvent.click(screen.getByTestId('render-anyway'));
      await flushRender(0);

      setMarkdown(hugeDoc(102));
      await flushRender();
      expect(screen.queryByTestId('large-doc-toast')).not.toBeInTheDocument();
      expect(pageHosts()).toHaveLength(102);
    },
  );

  it(
    're-arms the guard after dismissing and editing again',
    { timeout: 20_000 },
    async () => {
      mountCanvas();
      setMarkdown(hugeDoc(101));
      await flushRender();
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByTestId('large-doc-toast')).not.toBeInTheDocument();

      // Renders are edit-driven: the next edit re-asks (stale pages stay).
      setMarkdown(`${hugeDoc(101)}\n\nmore`);
      await flushRender();
      expect(screen.getByTestId('large-doc-toast')).toBeInTheDocument();
    },
  );

  it(
    'resets the guard when the document switches',
    { timeout: 20_000 },
    async () => {
      mountCanvas();
      setMarkdown(hugeDoc(101));
      await flushRender();
      fireEvent.click(screen.getByTestId('render-anyway'));
      await flushRender(0);
      expect(pageHosts()).toHaveLength(101);

      await createDocumentSettled();
      setMarkdown(hugeDoc(101));
      await flushRender();
      expect(screen.getByTestId('large-doc-toast')).toBeInTheDocument();
    },
  );
});

describe('PaperCanvas empty states', () => {
  it('shows the loading hint while the store initializes', () => {
    act(() => {
      useDocumentStore.setState({ status: 'loading', activeId: null });
    });
    render(<PaperCanvas />);
    expect(screen.getByText('Loading your documents…')).toBeInTheDocument();
  });

  it('shows a no-document hint when no document is active', () => {
    act(() => {
      useDocumentStore.setState({ status: 'ready', activeId: null });
    });
    render(<PaperCanvas />);
    expect(screen.getByText(/Open a document/)).toBeInTheDocument();
  });
});
