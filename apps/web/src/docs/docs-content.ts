// ─────────────────────────────────────────────────────────────────────────────
// The Docs page's content module (docs-page spec, ai-transforms/02).
//
// One markdown source — docs.md below, plus the styling-reference section the
// engine owns (buildStylingReferenceMarkdown) — rendered through the core
// package's markdown renderer into plain web HTML. No pagination, no shadow
// DOM: the paginator is not involved, so nothing paginates. The section nav
// is generated from the rendered h2 headings, so nav and content can never
// drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildStylingReferenceMarkdown,
  renderMarkdown,
} from '@perfectmarkd/core';
import { renderMermaid } from '../canvas/mermaid';
import source from './docs.md?raw';
import './docs.css';

/** One entry of the in-page section nav. */
export interface DocsSection {
  /** The rendered heading's anchor id. */
  id: string;
  /** The heading's text. */
  title: string;
}

export interface DocsContent {
  /** The rendered HTML for the page's article. */
  html: string;
  /** The h2 sections in document order — the nav's source. */
  sections: DocsSection[];
}

/**
 * Renders the Docs page's single markdown source through the engine's
 * markdown renderer (math typeset, code highlighted, diagrams via the app's
 * mermaid hook). The styling-reference section is appended by the engine, so
 * the page can never show a contract the builder stopped emitting.
 */
export async function loadDocsContent(): Promise<DocsContent> {
  const { html } = await renderMarkdown(
    `${source}\n\n${buildStylingReferenceMarkdown()}`,
    { renderMermaid },
  );
  return { html, sections: sectionNavFromHtml(html) };
}

/** The section nav: the rendered content's h2 headings in document order,
 *  with the ids the renderer's post-processing assigned. */
export function sectionNavFromHtml(html: string): DocsSection[] {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><body>${html}</body>`,
    'text/html',
  );
  return Array.from(parsed.body.querySelectorAll('h2'))
    .map((heading) => ({ id: heading.id, title: heading.textContent ?? '' }))
    .filter((section) => section.id !== '');
}
