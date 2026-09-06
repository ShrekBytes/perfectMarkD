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
// Runs against the ambient DOM (browser, or jsdom in tests — jsdom's
// zero-height measurement means each section yields exactly one page, which
// keeps structural tests deterministic; real page-count behavior is
// engine-port/08's Playwright suite).
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildDocCSS,
  buildPageLayouts,
  isRTLContent,
  paginateEl,
  renderMarkdown,
  resolvePageGeometry,
  splitMarkdownSections,
  type PageGeometry,
  type PageLayout,
  type DocumentSettings,
  type RenderMermaidHook,
} from '@perfectmarkd/core';

/** Everything a page renderer needs to draw the paginated document. */
export interface PipelineResult {
  layouts: PageLayout[];
  /** The scoped `.mpdf-doc` stylesheet pagination measured against
   *  (buildDocCSS with the pipeline's isRTL decision baked in). */
  docCSS: string;
  isRTL: boolean;
  geometry: PageGeometry;
}

export interface PipelineOptions {
  /** Document title; backs the {{title}} placeholder in page numbers. */
  title: string;
  /** Mermaid fence renderer; omitted (or failing) leaves diagrams as code
   *  blocks. See renderMarkdown's hook contract. */
  renderMermaid?: RenderMermaidHook;
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
  const docCSS = buildDocCSS(settings, isRTL);
  const geometry = resolvePageGeometry(settings);

  const prepared = applyAutoBreaks(markdown, settings);
  const sections = splitMarkdownSections(prepared);

  const allPages: HTMLElement[][] = [];
  for (const section of sections) {
    const { html } = await renderMarkdown(section, {
      settings: {
        codeTheme: settings.codeTheme,
        hideFrontmatter: settings.hideFrontmatter,
      },
      renderMermaid: options.renderMermaid,
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    allPages.push(
      ...paginateEl(container, geometry.contentW, geometry.contentH, docCSS),
    );
  }

  // A blank document paginates to one empty page — the canvas and the export
  // both expect at least one page to draw.
  if (allPages.length === 0) allPages.push([]);

  const layouts = buildPageLayouts(allPages, settings, options.title);
  return { layouts, docCSS, isRTL, geometry };
}
