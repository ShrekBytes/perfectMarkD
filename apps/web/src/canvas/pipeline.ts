// ─────────────────────────────────────────────────────────────────────────────
// The engine run: markdown → render → paginate → page layouts.
//
// Composes the @perfectmarkd/core pieces the way the plugin's preview did:
// the raw markdown is normalized, optional auto-breaks are injected before
// H1/H2 headings, the text splits on `///` Page Break markers, each section
// renders independently (renderMarkdown settles math, highlighting, and
// post-processing before pagination), and the section pages concatenate into
// buildPageLayouts.
//
// This one result feeds every consumer of the laid-out pages — the Paper
// Canvas preview, Client Export (buildExportHTML takes the same layouts), and
// the /export route the server loads (ADR-0003) — so isRTL and docCSS are
// computed once here and the caller passes them onward: the doc CSS that
// pagination measured against must be the doc CSS the preview adopts and the
// export embeds, or content shifts between the three.
//
// The run is chunked (launch/05): pagination hands the main thread back every
// few dozen nodes and the sections are separated by their own yield, so a
// document big enough to be seconds of work — a few hundred pages is
// thousands of layout flushes — leaves the tab able to paint and answer
// keystrokes while it finishes. Callers that want to show that progress pass
// onProgress; the result is unchanged either way.
//
// Runs against the ambient DOM (browser, or jsdom in tests — jsdom's
// zero-height measurement means each section yields exactly one page, which
// keeps structural tests deterministic; real page-count behavior is
// engine-port/08's Playwright suite).
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildDocCSS,
  buildPageLayouts,
  isRTLContent,
  paginateElChunked,
  renderMarkdown,
  resolvePageGeometry,
  splitMarkdownSections,
  yieldToBrowser,
  type PageGeometry,
  type PageLayout,
  type DocumentSettings,
  type RenderMermaidHook,
} from '@perfectmarkd/core';

/** Everything a page renderer needs to draw the paginated document. */
export interface PipelineResult {
  layouts: PageLayout[];
  /** The scoped `.mpdf-doc` stylesheet pagination measured against —
   *  content rules only (no page chrome). */
  docCSS: string;
  /** The full sheet for rendering: the content rules plus the page-chrome
   *  rules (.mpdf-page) the preview's page boxes and buildExportHTML both
   *  adopt — one string, so a Custom Stylesheet overrides both identically. */
  sheetCSS: string;
  isRTL: boolean;
  geometry: PageGeometry;
}

/** How far a run has got. A running tally, not a plan: the page total is not
 *  knowable until the run ends, so `pages` only ever grows. */
export interface PipelineProgress {
  /** Sections fully rendered and paginated. */
  sectionsDone: number;
  /** How many sections the document splits into — known before the first
   *  render, so it is the honest denominator for a progress bar. */
  sectionsTotal: number;
  /** Pages laid out so far. */
  pages: number;
}

export interface PipelineOptions {
  /** Document title; backs the {{title}} placeholder in page numbers. */
  title: string;
  /** Mermaid fence renderer; omitted (or failing) leaves diagrams as code
   *  blocks. See renderMarkdown's hook contract. */
  renderMermaid?: RenderMermaidHook;
  /**
   * Called as the run advances — after each yield, so several times per
   * section on a long one. The Paper Canvas paints it as a progress
   * indicator; the export paths ignore it. Omitted: the run reports nothing
   * and behaves identically.
   */
  onProgress?: (progress: PipelineProgress) => void;
}

/**
 * Injects `///` Page Breaks before H1/H2 headings per the auto-break
 * settings, the plugin's preprocessing approach: the standard section
 * splitter then does the breaking. Heading-shaped lines inside fenced code
 * blocks (backtick or tilde) and indented code blocks are left alone, a
 * marker already on the previous line wins, and a heading that opens the
 * document is never broken (it starts page 1 anyway). Input is normalized
 * to LF, matching renderMarkdown.
 */
export function applyAutoBreaks(
  markdown: string,
  settings: DocumentSettings,
): string {
  if (!settings.autoBreakH1 && !settings.autoBreakH2) return markdown;

  const lines = markdown.replace(/\r\n|\r/g, '\n').split('\n');
  const out: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const fenceOpen = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      // Only the matching closing fence ends the block.
      if (fenceOpen && fenceOpen[1]!.startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    if (fenceOpen) {
      fence = fenceOpen[1]!;
      out.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,2})\s/);
    const breaks =
      (heading?.[1]!.length === 1 && settings.autoBreakH1) ||
      (heading?.[1]!.length === 2 && settings.autoBreakH2);
    if (breaks && out.length > 0 && out[out.length - 1] !== '///') {
      out.push('///');
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Collects every `asset://` ref a render will need: image refs in the
 *  markdown plus the banner/background settings refs. Over-collecting is
 *  harmless (warmup is one IndexedDB read per ref); under-collecting leaves
 *  images unresolved for the first render. */
export function collectAssetRefs(
  markdown: string,
  settings: DocumentSettings,
): string[] {
  const refs = new Set<string>();
  for (const match of markdown.matchAll(/asset:\/\/[^\s)"'\]]+/g)) {
    refs.add(match[0]);
  }
  for (const ref of [
    settings.headerImageRef,
    settings.footerImageRef,
    settings.backgroundImageRef,
  ]) {
    if (ref) refs.add(ref);
  }
  return [...refs];
}

/**
 * Runs the full engine pipeline over a document.
 * Returns the page layouts plus the shared doc CSS / RTL decision / page
 * geometry every renderer of those layouts must reuse.
 */
export async function runDocumentPipeline(
  markdown: string,
  settings: DocumentSettings,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const isRTL = isRTLContent(markdown);
  const geometry = resolvePageGeometry(settings);
  // Two builds of one builder: pagination measures against the content rules
  // only (page chrome cannot affect content flow), while every renderer of the
  // laid-out pages adopts the full sheet — chrome rules included — so a Custom
  // Stylesheet overrides preview and both export paths identically.
  const docCSS = buildDocCSS(settings, isRTL);
  const sheetCSS = buildDocCSS(settings, isRTL, geometry);

  const prepared = applyAutoBreaks(markdown, settings);
  const sections = splitMarkdownSections(prepared);

  const allPages: HTMLElement[][] = [];
  let sectionsDone = 0;
  // Pages already bucketed plus the pages the section in flight has closed —
  // pagination reports its own running count, so the readout moves during a
  // section, not only between them.
  let pagesLaidOut = 0;
  const report = (): void => {
    options.onProgress?.({
      sectionsDone,
      sectionsTotal: sections.length,
      pages: pagesLaidOut,
    });
  };

  for (const [index, section] of sections.entries()) {
    const { html } = await renderMarkdown(section, {
      settings: {
        codeTheme: settings.codeTheme,
        hideFrontmatter: settings.hideFrontmatter,
      },
      renderMermaid: options.renderMermaid,
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    const sectionPages = await paginateElChunked(
      container,
      geometry.contentW,
      geometry.contentH,
      docCSS,
      {
        onProgress: (pages) => {
          pagesLaidOut = allPages.length + pages;
          report();
        },
      },
    );
    allPages.push(...sectionPages);
    pagesLaidOut = allPages.length;
    sectionsDone += 1;
    report();
    // A section boundary is where the run can safely pause: everything the
    // section needed is already measured. Awaiting renderMarkdown alone is
    // not enough — for a section with no math or fences it never leaves the
    // current task, so the yields between sections have to be explicit.
    if (index < sections.length - 1) await yieldToBrowser();
  }

  // A blank document paginates to one empty page — the canvas and the export
  // both expect at least one page to draw.
  if (allPages.length === 0) allPages.push([]);

  const layouts = buildPageLayouts(allPages, settings, options.title);
  return { layouts, docCSS, sheetCSS, isRTL, geometry };
}
