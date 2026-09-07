// ─────────────────────────────────────────────────────────────────────────────
// Markdown render pipeline.
//
// Everything involved in turning a document's raw markdown text into clean,
// paginator-ready HTML. Ported from the plugin's markdown.ts, with Obsidian's
// MarkdownRenderer replaced by a markdown-it pipeline: GFM tables /
// strikethrough / task lists, footnotes, GFM Alerts, frontmatter, KaTeX math,
// Shiki highlighting, and mermaid via an injected render hook.
//
// Requires a DOM environment (browser, jsdom, or Playwright's Chromium): math
// typesetting and post-processing walk a parsed DOM tree. The paginator is
// DOM-bound anyway, so this package is browser-only by design.
// ─────────────────────────────────────────────────────────────────────────────

import renderMathInElement from 'katex/contrib/auto-render';
import MarkdownIt, { type MarkdownIt as MarkdownItParser } from 'markdown-it';
import githubAlerts from 'markdown-it-github-alerts';
import footnote from 'markdown-it-footnote';
import frontMatter from 'markdown-it-front-matter';
import taskLists from 'markdown-it-task-lists';
import { bundledThemes, codeToHtml } from 'shiki';
import { parse as parseYaml } from 'yaml';

import { escapeHTML } from './css-builder.js';
import { DEFAULT_SETTINGS, type DocumentSettings } from './settings.js';

// markdown-it-front-matter's bundled typings target the retired
// 'markdown-it/lib' entry point and pull in the legacy @types Token shape;
// retype the plugin against the markdown-it version actually in use.
const frontMatterPlugin = frontMatter as unknown as (
  md: MarkdownItParser,
  callback: (raw: string) => void,
) => void;

// ─── Markdown text helpers ─────────────────────────────────────────────────────

/** Normalises line endings to LF so the rest of the pipeline never sees CRLF or CR. */
export function normalizeMarkdown(raw: string): string {
  return raw.replace(/\r\n|\r/g, '\n');
}

/** Splits on `///` manual page-break markers, trimming and dropping empty sections. */
export function splitMarkdownSections(md: string): string[] {
  return md
    .split(/^\/\/\/\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when RTL script chars (Arabic, Hebrew, etc.) exceed 10 % of all
 *  alpha chars — ratio-based so mixed-script notes lean toward the majority. */
const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
const TOTAL_ALPHA = /[A-Za-z\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
export function isRTLContent(text: string): boolean {
  const rtl = (text.match(RTL_CHARS) ?? []).length;
  const total = (text.match(TOTAL_ALPHA) ?? []).length;
  return total > 0 && rtl / total > 0.1;
}

// ─── Rendered-HTML cleanup ──────────────────────────────────────────────────────

// Pre-compiled once. String.replace() and String.matchAll() both reset a
// regex's lastIndex to 0 on each call, so module-level g-flagged constants are safe.
const SLUG_STRIP = /[^\p{L}\p{N}\s-]/gu;
const SLUG_SPACE = /\s+/g;
const SLUG_DASH = /-+/g;

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(SLUG_STRIP, '')
    .trim()
    .replace(SLUG_SPACE, '-')
    .replace(SLUG_DASH, '-');
}

/** Strips renderer artefacts from rendered HTML so the output is clean for
 *  pagination and export: assigns stable, deduplicated heading IDs for anchor
 *  links, rewrites fragment anchors to those slugs, removes copy-code buttons,
 *  and drops top-level <style>/<script> nodes while preserving styles embedded
 *  inside SVGs (mermaid stores its theme CSS there). */
export function postProcessRenderedHTML(root: ParentNode): void {
  // Stable, deduplicated IDs so in-page anchor links work across shadow DOMs.
  const seen = new Map<string, number>();
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
    const text = el.textContent || '';
    const base = slugifyHeading(text);
    if (!base) return;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    el.id = count === 0 ? base : `${base}-${count}`;
  });

  // Rewrite anchor hrefs to match the slugified IDs assigned above,
  // covering both wikilink data-href and standard markdown anchors.
  root.querySelectorAll('a').forEach((a) => {
    const target = a.getAttribute('data-href') ?? a.getAttribute('href');
    if (target?.startsWith('#')) {
      a.setAttribute('href', '#' + slugifyHeading(target.slice(1)));
    }
  });

  root.querySelectorAll('.copy-code-button').forEach((el) => el.remove());

  // Drop injected top-level <style>/<script> nodes — they can break the export
  // <head> if they contain `</style>`, and are not needed in the PDF.
  // Styles inside <svg> are kept: mermaid embeds its theme CSS directly there.
  root.querySelectorAll('style, script').forEach((el) => {
    if (!el.closest('svg')) el.remove();
  });
}

// ─── Frontmatter ────────────────────────────────────────────────────────────────

function parseFrontmatter(
  raw: string | undefined,
): Record<string, unknown> | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = parseYaml(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid YAML: frontmatter stays stripped from the output but is not exposed.
  }
  return null;
}

/** Renders exposed frontmatter as a simple key/value properties table — the
 *  standalone-pipeline equivalent of Obsidian's properties view. Values are
 *  pre-escaped text, so this must not run through math/post-processing. */
function frontmatterTable(fm: Record<string, unknown>): string {
  const rows = Object.entries(fm)
    .map(([key, value]) => {
      const text = Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);
      return `<tr><td>${escapeHTML(key)}</td><td>${escapeHTML(text)}</td></tr>`;
    })
    .join('\n');
  return `<table>\n<tbody>\n${rows}\n</tbody>\n</table>`;
}

// ─── Code fences: Shiki highlighting + mermaid ─────────────────────────────────

/** Fallback for the copy of every code theme the old plugin catalogued that
 *  Shiki renamed upstream. */
const CODE_THEME_ALIASES: Record<string, string> = {
  'atom-one-light': 'one-light',
  'atom-one-dark': 'one-dark-pro',
};

const FALLBACK_CODE_THEME = 'github-light';

/** The Shiki theme ids the highlighting pass can resolve, exported for hosts'
 *  code-theme pickers (the Inspector's dropdown renders this catalog; shiki
 *  itself is a core dependency, so hosts don't import it directly). */
export const CODE_THEMES: readonly string[] = [
  'none',
  ...Object.keys(bundledThemes).sort((a, b) => a.localeCompare(b)),
];

/** A fence with no theme/lang match renders as markdown-it's default plain
 *  block, escaped, with no highlighting spans. */
function plainCodeBlock(code: string, lang: string): string {
  const cls = lang ? ` class="language-${escapeHTML(lang)}"` : '';
  return `<pre><code${cls}>${escapeHTML(code)}</code></pre>`;
}

async function highlightCode(
  code: string,
  lang: string,
  theme: string,
): Promise<string> {
  const aliased = CODE_THEME_ALIASES[theme] ?? theme;
  const resolved = aliased in bundledThemes ? aliased : FALLBACK_CODE_THEME;
  try {
    return await codeToHtml(code, { lang, theme: resolved });
  } catch {
    return plainCodeBlock(code, lang);
  }
}

/** Client-supplied mermaid renderer: diagram source in, SVG markup out. */
export type RenderMermaidHook = (code: string) => Promise<string>;

function renderMermaidBlock(
  code: string,
  hook: RenderMermaidHook | undefined,
): Promise<string> {
  if (!hook) return Promise.resolve(plainCodeBlock(code, 'mermaid'));
  // A failed diagram falls back to its source as a plain code block, mirroring
  // the original pipeline's bounded-wait behaviour on unrenderable diagrams.
  return hook(code).catch(() => plainCodeBlock(code, 'mermaid'));
}

// ─── Render pipeline ────────────────────────────────────────────────────────────

export interface RenderMarkdownOptions {
  /** Only the render-affecting settings; callers pass their full
   *  DocumentSettings and the rest of the object is ignored. */
  settings?: Pick<DocumentSettings, 'codeTheme' | 'hideFrontmatter'>;
  /** Renders a ```mermaid fence's source to SVG markup. Omitted (or failing)
   *  hooks leave the diagram as a plain code block. */
  renderMermaid?: RenderMermaidHook;
}

export interface RenderMarkdownResult {
  /** Clean, paginator-ready HTML. */
  html: string;
  /** Parsed YAML frontmatter object, or null when absent/invalid. Exposed
   *  regardless of the hideFrontmatter setting. */
  frontmatter: Record<string, unknown> | null;
}

/** Renders a markdown string to clean HTML: markdown-it (linkify, GFM tables /
 *  strikethrough / task lists, footnotes, GFM Alerts, typographer on, attrs
 *  off), KaTeX auto-render for `$…$` / `$$…$$`, Shiki highlighting with the
 *  settings' code theme, mermaid via the injected hook, and the ported
 *  post-processing pass (heading slugs, anchor rewrite, copy-button strip,
 *  style/script cleanup). */
export async function renderMarkdown(
  markdown: string,
  options: RenderMarkdownOptions = {},
): Promise<RenderMarkdownResult> {
  const codeTheme = options.settings?.codeTheme ?? DEFAULT_SETTINGS.codeTheme;
  const hideFrontmatter =
    options.settings?.hideFrontmatter ?? DEFAULT_SETTINGS.hideFrontmatter;

  const raw = normalizeMarkdown(markdown);

  let frontmatterRaw: string | undefined;
  let fenceSeq = 0;
  const pending = new Map<string, Promise<string>>();

  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  md.use(frontMatterPlugin, (fm: string) => {
    frontmatterRaw = fm;
  });
  md.use(footnote);
  md.use(taskLists, { enabled: false, label: false });
  md.use(githubAlerts);

  // markdown-it's renderer is synchronous, but Shiki is not — fences become
  // placeholder divs whose markup is swapped in after the DOM parse, where
  // they are safely out of math's and the post-processor's reach.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    if (!token) return '';
    const code = token.content;
    const lang = (token.info.trim().match(/^\S+/)?.[0] ?? '').toLowerCase();
    if (lang === 'mermaid' || (codeTheme !== 'none' && lang !== '')) {
      const id = `pm-render-${++fenceSeq}`;
      pending.set(
        id,
        lang === 'mermaid'
          ? renderMermaidBlock(code, options.renderMermaid)
          : highlightCode(code, lang, codeTheme),
      );
      return `<div data-pm-pending="${id}"></div>`;
    }
    return plainCodeBlock(code, lang);
  };

  const bodyHtml = md.render(raw);

  if (typeof DOMParser === 'undefined') {
    throw new Error(
      'renderMarkdown requires a DOM environment (browser, jsdom, or Playwright Chromium).',
    );
  }
  // The explicit doctype keeps the parsed document in standards mode — KaTeX
  // refuses to typeset into a quirks-mode document, which is what parsing a
  // bare fragment would produce.
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><body>${bodyHtml}</body>`,
    'text/html',
  );
  const root = parsed.body;

  const settled = await Promise.all(
    [...pending].map(async ([id, markup]) => ({ id, markup: await markup })),
  );
  for (const { id, markup } of settled) {
    // All matches, not the first: a literal data-pm-pending attribute in the
    // document's raw HTML must not shadow (and strand) a real fence slot.
    const slots = root.querySelectorAll(`[data-pm-pending="${id}"]`);
    if (slots.length === 0) continue;
    const template = parsed.createElement('template');
    template.innerHTML = markup;
    for (const slot of slots) {
      slot.replaceWith(template.content.cloneNode(true));
    }
  }

  renderMathInElement(root, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
    ],
    // The default ignore list plus 'svg' so KaTeX never touches text inside
    // mermaid diagrams (mermaid fences are plain text, but rendered SVGs can
    // contain labels with dollar signs).
    ignoredTags: [
      'script',
      'noscript',
      'style',
      'textarea',
      'pre',
      'code',
      'option',
      'svg',
    ],
    throwOnError: false,
    strict: false,
  });

  postProcessRenderedHTML(root);

  const frontmatter = parseFrontmatter(frontmatterRaw);
  if (!hideFrontmatter && frontmatter) {
    root.insertAdjacentHTML('afterbegin', frontmatterTable(frontmatter));
  }

  return { html: root.innerHTML, frontmatter };
}
