import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { DocumentSettings, PageGeometry } from '@perfectmarkd/core';
import {
  createAssetResolver,
  type AssetResolverCache,
} from '../assets/resolver';
import { ensureCustomFontsLoaded } from '../fonts/loader';
import { openDatabase } from '../documents/db';
import { useDocumentStore } from '../documents/store';
import { EmptyState } from '../shell/EmptyState';
import {
  CloseIcon,
  ExpandIcon,
  MinusIcon,
  PagesIcon,
  PlusIcon,
} from '../shell/icons';
import { KATEX_LAYOUT_CSS } from './katex-css';
import { renderMermaid } from './mermaid';
import { buildPage, createPageSheets } from './pageBuilder';
import {
  collectAssetRefs,
  runDocumentPipeline,
  type PipelineResult,
} from './pipeline';

/** Coalesces typing bursts into one engine run (spec: 400ms auto-render). */
const RENDER_DEBOUNCE_MS = 400;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1;
const ZOOM_STEP = 0.05;
/** Horizontal breathing room on both sides (fit-width math, anchor offset). */
const FIT_GUTTER_PX = 24;
/** Above this page count, the first render pauses for explicit confirmation. */
const LARGE_DOC_PAGES = 100;

/** What the shell can drive from outside: the manual render (Ctrl/Cmd+Enter
 *  path) and editor→canvas scroll sync. Exposed via the canvas ref. */
export interface PaperCanvasApi {
  renderNow(): void;
  setScrollFraction(fraction: number): void;
}

interface PaperCanvasProps {
  ref?: React.Ref<PaperCanvasApi>;
}

const clampZoom = (value: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/** Zoom that fits the page width between 24px gutters; falls back to the
 *  current zoom when the canvas has no measurable width yet (first paint,
 *  jsdom). */
function fitZoomFor(pageWidth: number, clientWidth: number, fallback: number) {
  const available = clientWidth - FIT_GUTTER_PX * 2;
  if (available <= 0) return fallback;
  return clampZoom(available / pageWidth);
}

/** Applies zoom to one mounted page slot: the frame wrapper takes the scaled
 *  box (and keeps layout flowing), the host inside scales from its top-left
 *  corner (set in buildPage) to stay aligned with the frame. */
function applyZoomToSlot(
  slot: Element,
  geometry: PageGeometry,
  zoom: number,
): void {
  const frame = slot.firstElementChild as HTMLElement;
  const host = frame.firstElementChild as HTMLElement;
  frame.style.width = `${geometry.pw * zoom}px`;
  frame.style.height = `${geometry.ph * zoom}px`;
  host.style.transform = `scale(${zoom})`;
}

/**
 * Replaces the pages area with one shadow-DOM page per layout (pageBuilder)
 * and returns the heading-id → page index map the canvas resolves anchor
 * clicks against. Applies the current zoom to the slots as it goes.
 */
function mountPageSlots(
  pagesEl: HTMLDivElement,
  result: PipelineResult,
  settings: DocumentSettings,
  assets: AssetResolverCache,
  zoom: number,
): Map<string, number> {
  const headingIndex = new Map<string, number>();
  const sheets = createPageSheets(result.docCSS, KATEX_LAYOUT_CSS);
  const fragment = document.createDocumentFragment();

  result.layouts.forEach((layout, index) => {
    const slot = document.createElement('div');
    slot.className = 'pm-page-slot';

    // The frame wrapper carries the zoom-scaled box and the ambient page
    // shadow; the shadow host inside stays at true page pixels and scales.
    // Corner crop marks (the light-table signature) sit outside the sheet's
    // own box, drawn by the frame's ::before/::after pseudo-elements — see
    // global.css (.pm-page-frame).
    const frame = document.createElement('div');
    frame.className =
      'pm-page-frame shadow-[0_1px_2px_rgb(0_0_0/0.10),0_12px_32px_rgb(0_0_0/0.16)] pm-crop-marks';

    const { host, contentRoot } = buildPage({
      layout,
      settings,
      geometry: result.geometry,
      sheets,
      assets,
      isRTL: result.isRTL,
    });
    frame.appendChild(host);

    contentRoot.querySelectorAll('[id]').forEach((el) => {
      headingIndex.set(el.id, index);
    });
    // The pages container is aria-hidden: any focusable element inside —
    // heading anchors — must leave the tab order too, or keyboard users
    // land in content their screen reader cannot see (ARIA 4.1.2). The
    // canvas click handler still resolves them (scroll-to-heading).
    contentRoot
      .querySelectorAll('a[href]')
      .forEach((el) => el.setAttribute('tabindex', '-1'));

    const label = document.createElement('p');
    label.className =
      'pm-page-label pt-2 pb-0.5 text-center text-xs text-ink-faint select-none';
    label.textContent = `Page ${layout.pageNum} of ${layout.totalPages}`;

    slot.appendChild(frame);
    slot.appendChild(label);
    applyZoomToSlot(slot, result.geometry, zoom);
    fragment.appendChild(slot);
  });

  pagesEl.replaceChildren(fragment);
  return headingIndex;
}

/**
 * The Paper Canvas: live paginated preview. Runs the engine pipeline
 * (debounced, plus manual renders) and mounts the result as one shadow-DOM
 * page per layout. Pages are imperative DOM — the engine hands over finished
 * subtrees, which React doesn't reconcile — while the zoom pill, labels,
 * shimmer, and floating notices are React-rendered chrome around them.
 */
export function PaperCanvas({ ref }: PaperCanvasProps) {
  const status = useDocumentStore((state) => state.status);
  const activeId = useDocumentStore((state) => state.activeId);
  const markdown = useDocumentStore((state) => state.markdown);
  const settings = useDocumentStore((state) => state.settings);
  const docCount = useDocumentStore((state) => state.docs.length);
  const createDocument = useDocumentStore((state) => state.createDocument);

  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [largeDocCount, setLargeDocCount] = useState<number | null>(null);
  /** The last engine run threw: the preview may be stale until one succeeds. */
  const [renderFailed, setRenderFailed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  /** Bumped per run: async steps abandon their work when the token moves on. */
  const tokenRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolverRef = useRef<{
    docId: string;
    resolver: AssetResolverCache;
  } | null>(null);
  /** "Render anyway" acknowledged for the current document. */
  const ackRef = useRef(false);
  const geometryRef = useRef<PageGeometry | null>(null);
  const headingIndexRef = useRef(new Map<string, number>());
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  /** The user has taken over the zoom (pill buttons); auto-fit stands down
   *  for the rest of the session once they have. */
  const userZoomedRef = useRef(false);

  const runRenderRef = useRef<() => Promise<void>>(async () => {});
  runRenderRef.current = async () => {
    const store = useDocumentStore.getState();
    if (store.status !== 'ready' || !store.activeId) return;
    const token = ++tokenRef.current;
    const {
      activeId: docId,
      markdown: md,
      settings: docSettings,
      name,
    } = store;
    setRendering(true);
    try {
      // One resolver per document: its blob URLs die with the doc switch.
      if (resolverRef.current?.docId !== docId) {
        resolverRef.current?.resolver.dispose();
        resolverRef.current = {
          docId,
          resolver: createAssetResolver(await openDatabase(), 'blob-url'),
        };
      }
      const resolver = resolverRef.current.resolver;
      await resolver.warmup(collectAssetRefs(md, docSettings));
      if (token !== tokenRef.current) return;

      // Custom fonts (billing/05) must be live before the pipeline runs:
      // pagination measures text, so a late font means wrong page breaks.
      await ensureCustomFontsLoaded(docSettings);
      if (token !== tokenRef.current) return;

      const result = await runDocumentPipeline(md, docSettings, {
        title: name,
        renderMermaid,
      });
      if (token !== tokenRef.current) return;

      // Large documents: pause instead of hammering the main thread uninvited.
      if (result.layouts.length > LARGE_DOC_PAGES && !ackRef.current) {
        setLargeDocCount(result.layouts.length);
        // Pagination has already run, so the count escapes the guard: the
        // Library knows the true size without "Render anyway".
        useDocumentStore.getState().recordPageCount(result.layouts.length);
        return;
      }
      setLargeDocCount(null);

      const pagesEl = pagesRef.current;
      const scrollEl = scrollRef.current;
      if (!pagesEl || !scrollEl) return;
      // "The preview is the contract": until the user takes over the zoom,
      // every render lands at a width that keeps the whole page on the desk —
      // first paint included, so the contract is never shown torn.
      const zoom = userZoomedRef.current
        ? zoomRef.current
        : fitZoomFor(result.geometry.pw, scrollEl.clientWidth, zoomRef.current);
      if (zoom !== zoomRef.current) setZoom(zoom);
      const prevScroll = scrollEl.scrollTop;
      headingIndexRef.current = mountPageSlots(
        pagesEl,
        result,
        docSettings,
        resolver,
        zoom,
      );
      geometryRef.current = result.geometry;
      // Keep the reader's place across re-renders (same doc, similar height).
      scrollEl.scrollTop = Math.min(prevScroll, scrollEl.scrollHeight);
      setPageCount(result.layouts.length);
      // Every successful render reports its total so the record (and the
      // top-bar gauge) carries the same number the page labels show.
      useDocumentStore.getState().recordPageCount(result.layouts.length);
      setRenderFailed(false);
    } catch (error) {
      // A failed render keeps the previous pages on screen — and now says so:
      // the notice below is the user-facing half, the console the debugging
      // half. Editing continues; the next successful render clears the notice.
      console.error('Paper Canvas render failed:', error);
      setRenderFailed(true);
    } finally {
      if (token === tokenRef.current) setRendering(false);
    }
  };

  // Debounced auto-render on any input that affects the pages.
  useEffect(() => {
    if (status !== 'ready') return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void runRenderRef.current();
    }, RENDER_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [markdown, settings, activeId, status]);

  // Document switch (and unmount): drop stale pages immediately — never show
  // another document's pages — cancel in-flight work, release the document's
  // blob URLs, and re-arm the guard.
  useEffect(() => {
    pagesRef.current?.replaceChildren();
    headingIndexRef.current = new Map();
    geometryRef.current = null;
    ackRef.current = false;
    setPageCount(0);
    setLargeDocCount(null);
    setRenderFailed(false);
    return () => {
      tokenRef.current += 1;
      resolverRef.current?.resolver.dispose();
      resolverRef.current = null;
    };
  }, [activeId]);

  // The shell drives manual renders and scroll sync through the ref.
  useImperativeHandle(
    ref,
    () => ({
      renderNow: () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        void runRenderRef.current();
      },
      setScrollFraction: (fraction) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
      },
    }),
    [],
  );

  // Zoom changes re-scale the mounted slots (pages area is imperative DOM).
  useEffect(() => {
    const geometry = geometryRef.current;
    const pages = pagesRef.current;
    if (!geometry || !pages) return;
    for (const slot of Array.from(pages.children)) {
      applyZoomToSlot(slot, geometry, zoom);
    }
  }, [zoom]);

  /** In-page anchor link → scroll to the page containing its target. */
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    // Clicks inside the page shadow roots retarget to the host; the real
    // anchor is at the head of the native event's composed path.
    const native = event.nativeEvent as Event & {
      composedPath?: () => EventTarget[];
    };
    const target = (
      native.composedPath ? native.composedPath()[0] : event.target
    ) as HTMLElement | undefined;
    const anchor = target?.closest?.(
      'a[href^="#"]',
    ) as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href?.startsWith('#')) return;
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // Malformed escape: match the raw text instead.
    }
    const pageIndex = headingIndexRef.current.get(id);
    if (pageIndex === undefined) return;
    event.preventDefault();
    const slot = pagesRef.current?.children[pageIndex] as
      HTMLElement | undefined;
    const scrollEl = scrollRef.current;
    if (!slot || !scrollEl) return;
    // The scroll container is position:relative, so offsetTop is scroll space.
    scrollEl.scrollTop = Math.max(0, slot.offsetTop - FIT_GUTTER_PX);
  }, []);

  const zoomBy = useCallback((delta: number) => {
    userZoomedRef.current = true;
    setZoom((current) => clampZoom(current + delta));
  }, []);

  /** The readout is the "true pixels" action: snap to 1.00 and take over.
   *  A no-op when already there — no state change, no pill rhythm shift. */
  const zoomToActual = useCallback(() => {
    if (zoomRef.current === 1) return;
    userZoomedRef.current = true;
    setZoom(1);
  }, []);

  const fitToWidth = useCallback(() => {
    const geometry = geometryRef.current;
    const el = scrollRef.current;
    if (!geometry || !el) return;
    userZoomedRef.current = true;
    setZoom(fitZoomFor(geometry.pw, el.clientWidth, zoomRef.current));
  }, []);

  // Until the user takes over the zoom, canvas resizes (pane drags, collapse,
  // window resize) re-fit so the page never slips off the desk. The observer
  // also fires on observe; fitting to the same value is a no-op.
  const canvasReady = status === 'ready' && activeId !== null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!canvasReady || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const geometry = geometryRef.current;
      if (!geometry || userZoomedRef.current) return;
      setZoom(fitZoomFor(geometry.pw, el.clientWidth, zoomRef.current));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasReady]);

  const ackLargeDoc = useCallback(() => {
    ackRef.current = true;
    setLargeDocCount(null);
    void runRenderRef.current();
  }, []);

  if (status !== 'ready' || !activeId) {
    const emptyLibrary = status === 'ready' && docCount === 0;
    return (
      <EmptyState
        icon={<PagesIcon />}
        title="Paper Canvas"
        hint={
          status === 'loading'
            ? 'Loading your documents…'
            : emptyLibrary
              ? 'Create a document to see its pages here.'
              : 'Open a document from the Library to see its pages.'
        }
        action={
          status !== 'loading' ? (
            <button
              type="button"
              data-testid="empty-canvas-new-doc"
              onClick={() => void createDocument()}
              className="touch-target flex h-8 items-center justify-center gap-1.5 rounded-control bg-accent-strong px-3 text-sm text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
            >
              <PlusIcon />
              New document
            </button>
          ) : undefined
        }
      />
    );
  }

  const pillButton =
    'touch-target flex h-7 w-7 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink';

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="canvas-scroll"
        role="region"
        aria-label="Paper Canvas preview"
        aria-busy={rendering}
        onClick={handleCanvasClick}
        className="absolute inset-0 overflow-auto bg-canvas"
      >
        {/* The editor holds the editable truth; the pages are a picture of
            the result. Hiding them keeps screen-reader heading navigation
            from walking the document twice (with the Inspector's section
            headings interleaved), while the summary below announces what
            the preview shows. */}
        <p role="status" className="sr-only">
          {pageCount === 0
            ? 'Rendering preview…'
            : `Previewing ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}
        </p>
        <div
          ref={pagesRef}
          data-testid="canvas-pages"
          aria-hidden="true"
          /* Bottom padding clears the floating zoom pill (see the touch
             targets block in global.css): the last page's label must be able
             to scroll clear of it instead of parking underneath. */
          className="pm-pages flex w-max min-w-full flex-col items-center gap-6 px-6 pb-14 pt-8"
        />
      </div>

      {pageCount === 0 && (
        <div
          data-testid="canvas-loading"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="w-56 max-w-[60%] animate-pulse space-y-2">
            <div className="aspect-[1/1.414] w-full rounded-pane border border-hairline bg-surface-hover" />
            <div className="mx-auto h-2.5 w-20 rounded bg-surface-hover" />
          </div>
        </div>
      )}

      {renderFailed && (
        <div
          role="status"
          data-testid="canvas-error-notice"
          className="absolute inset-x-0 top-3 z-10 flex justify-center px-4"
        >
          {/* The danger twin of the Tinted Notice: the preview is the
              contract, so a broken render is announced over the desk and
              stays until a render succeeds — the user must never edit
              against a stale preview they were not told about. */}
          <div className="flex animate-fade-in items-center gap-3 rounded-control border border-danger/40 bg-danger/10 px-3 py-2 shadow-xl">
            <p className="text-xs text-danger">
              The preview failed to render — the pages shown may be out of date.
            </p>
            <button
              type="button"
              onClick={() => void runRenderRef.current()}
              className="touch-target shrink-0 rounded-control border border-danger/30 px-2.5 py-1 text-xs font-medium text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-danger/20 focus-visible:outline-2"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {largeDocCount !== null && (
        <div
          role="status"
          data-testid="large-doc-toast"
          className="absolute inset-x-0 bottom-16 flex justify-center px-4"
        >
          <div className="flex animate-fade-in items-center gap-3 rounded-pane border border-hairline bg-surface px-4 py-2.5 shadow-xl">
            <p className="text-xs text-ink-soft">
              This document renders {largeDocCount} pages — previewing may slow
              your browser.
            </p>
            <button
              type="button"
              data-testid="render-anyway"
              onClick={ackLargeDoc}
              className="touch-target shrink-0 rounded-control bg-accent-strong px-2.5 py-1 text-xs font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-deep"
            >
              Render anyway
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setLargeDocCount(null)}
              className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div
          role="group"
          aria-label="Zoom"
          data-testid="zoom-pill"
          // At rest the pill recedes — transparent fill, no shadow, no
          // border — so it never sits at full weight on the sheet it
          // overlaps. Hover or keyboard focus restores the raised state.
          // The recede is background weight, not container opacity: the
          // readout text must hold AA in every state (a uniform opacity
          // fade would push it under 4.5:1).
          className="pointer-events-auto flex items-center gap-0.5 rounded-control border border-transparent bg-surface/60 py-1 pr-1.5 pl-1.5 transition-colors duration-150 hover:border-hairline hover:bg-surface/95 hover:shadow-lg focus-within:border-hairline focus-within:bg-surface/95 focus-within:shadow-lg"
        >
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomBy(-ZOOM_STEP)}
            className={pillButton}
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            data-testid="zoom-level"
            // The accessible name carries the current value so screen readers
            // can read the zoom, not only change it (the span it replaced
            // exposed the percentage as text).
            aria-label={`Zoom to actual size, currently ${Math.round(zoom * 100)}%`}
            title="Zoom to actual size"
            onClick={zoomToActual}
            className="touch-target w-11 rounded-control text-center text-xs text-ink-soft tabular-nums select-none transition-colors duration-150 hover:bg-surface-hover hover:text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomBy(ZOOM_STEP)}
            className={pillButton}
          >
            <PlusIcon />
          </button>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-hairline" />
          <button
            type="button"
            aria-label="Fit page width"
            title="Fit page width"
            onClick={fitToWidth}
            className={pillButton}
          >
            <ExpandIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
