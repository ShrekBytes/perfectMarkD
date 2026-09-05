// ─────────────────────────────────────────────────────────────────────────────
// Pagination engine.
//
// Takes rendered HTML and distributes its block children into page-height
// buckets, splitting oversized elements by natural unit (line, row, list item,
// word/character). Ported from the plugin's paginator.ts; the page-layout
// builder and PDF outline injection live with the export path (engine-port/06).
//
// Measurement happens inside a hidden shadow-root sandbox so the scoped
// docCSS can't pollute the host document and host styles can't distort
// heights. The pipeline is fully asynchronous *before* pagination (KaTeX
// typesets synchronously into the parsed DOM, Shiki settles in
// renderMarkdown), so the plugin's MathJax stylesheet wait is gone from the
// callers' path entirely.
//
// Runs against the ambient DOM (browser, or a DOM-emulating test environment).
// ─────────────────────────────────────────────────────────────────────────────

import { createDiv, createEl, setCssStyles } from './dom.js';

// ─── Shared measurement helpers ─────────────────────────────────────────────────

const INLINE_SPLIT_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE', 'TD', 'TH']);

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'ASIDE',
  'NAV',
  'HEADER',
  'FOOTER',
  'UL',
  'OL',
  'LI',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TD',
  'TH',
  'PRE',
  'BLOCKQUOTE',
  'HR',
  'IMG',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

// PRE is absent — it gets its own line-based splitter.
const UNSPLITTABLE_TAGS = new Set([
  'CODE',
  'IMG',
  'HR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

// 2px guards against sub-pixel rendering differences between the light-DOM
// paginator sandbox and the shadow DOM preview context.
const HEIGHT_EPS = 2;

function measureNodesHeight(
  nodes: HTMLElement[],
  measureEl: HTMLElement,
): number {
  // Obsidian's `empty()` — remove all children before re-measuring.
  measureEl.replaceChildren();
  for (const node of nodes) measureEl.appendChild(node.cloneNode(true));
  return measureEl.getBoundingClientRect().height;
}

function makeFitFn(
  currentPage: HTMLElement[],
  measureEl: HTMLElement,
  contentHeightPx: number,
): (node: HTMLElement) => boolean {
  return (node: HTMLElement) =>
    measureNodesHeight([...currentPage, node], measureEl) <=
    contentHeightPx - HEIGHT_EPS;
}

// ── Inline (text) splitter ───────────────────────────────────────────────────

function trimLeadingWhitespace(el: HTMLElement): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const trimmed = (node.textContent ?? '').replace(/^\s+/, '');
    if (trimmed !== node.textContent) node.textContent = trimmed;
    if (trimmed.length > 0) break;
  }
}

function buildInlineSplitAt(
  el: HTMLElement,
  splitOffset: number,
  trimSecond = true,
): [HTMLElement, HTMLElement] | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let count = 0;
  let target: Text | null = null;
  let localOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length ?? 0;
    if (count + len >= splitOffset) {
      target = node;
      localOffset = splitOffset - count;
      break;
    }
    count += len;
  }

  if (!target) return null;

  const range1 = document.createRange();
  range1.selectNodeContents(el);
  range1.setEnd(target, localOffset);

  const range2 = document.createRange();
  range2.selectNodeContents(el);
  range2.setStart(target, localOffset);

  const first = el.cloneNode(false) as HTMLElement;
  first.appendChild(range1.cloneContents());

  const second = el.cloneNode(false) as HTMLElement;
  second.appendChild(range2.cloneContents());
  if (trimSecond) trimLeadingWhitespace(second);

  return [first, second];
}

function getWordBoundaryOffsets(text: string): number[] {
  const offsets: number[] = [];
  const re = /\s+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > 0 && match.index < text.length) offsets.push(match.index);
  }
  return offsets;
}

/** Splits a paragraph/quote/cell of plain inline content in two at the latest
 *  word boundary (falling back to character level) whose first half satisfies
 *  `fits`. Returns null when nothing fits — or, when `forceSplit` is set and
 *  even the first character can't be placed, when the content is unsplittable. */
export function splitInlineElement(
  el: HTMLElement,
  fits: (node: HTMLElement) => boolean,
  forceSplit: boolean,
): [HTMLElement, HTMLElement] | null {
  const text = el.textContent ?? '';
  if (text.length < 2) return null;

  // First attempt: binary-search for the latest word boundary that fits.
  const offsets = getWordBoundaryOffsets(text);
  if (offsets.length > 0) {
    let lo = 0,
      hi = offsets.length - 1,
      bestIdx = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const split = buildInlineSplitAt(el, offsets[mid]!);
      if (!split) {
        hi = mid - 1;
        continue;
      }
      if (fits(split[0])) {
        bestIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestIdx >= 0) return buildInlineSplitAt(el, offsets[bestIdx]!);
    if (!forceSplit) return null;
  }

  // Fallback: character-level binary search (oversized single word, or forced).
  let lo = 1,
    hi = text.length - 1,
    best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const split = buildInlineSplitAt(el, mid);
    if (!split) {
      hi = mid - 1;
      continue;
    }
    if (fits(split[0])) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best > 0 ? buildInlineSplitAt(el, best) : null;
}

// ── List splitter ────────────────────────────────────────────────────────────

function buildListWithItems(
  listEl: HTMLElement,
  items: HTMLElement[],
  startAt?: number,
): HTMLElement {
  const clone = listEl.cloneNode(false) as HTMLElement;
  // Preserve OL numbering across page breaks.
  if (listEl.tagName === 'OL' && startAt !== undefined && startAt > 1) {
    (clone as HTMLOListElement).start = startAt;
  }
  for (const item of items) clone.appendChild(item.cloneNode(true));
  return clone;
}

/** Splits a list after the last item that fits, cloning items into two
 *  fragments of the same tag. OL numbering continues: the second fragment
 *  carries a `start` attribute (respecting any `start` the input already
 *  had). Returns null when all/no items fit without a forced split. */
export function splitListElement(
  listEl: HTMLElement,
  fits: (node: HTMLElement) => boolean,
  forceSplit: boolean,
): [HTMLElement, HTMLElement] | null {
  const items = Array.from(listEl.children).filter(
    (c) => (c as HTMLElement).tagName === 'LI',
  ) as HTMLElement[];
  if (items.length === 0) return null;

  // Respect an existing start attribute on continuation fragments.
  const existingStart =
    listEl.tagName === 'OL' ? ((listEl as HTMLOListElement).start ?? 1) : 1;

  let fitCount = 0;
  for (let i = 0; i < items.length; i++) {
    if (fits(buildListWithItems(listEl, items.slice(0, i + 1), existingStart)))
      fitCount = i + 1;
    else break;
  }

  // When forced (alone on empty page), guarantee at least 1 item moves forward.
  if (fitCount <= 0) {
    if (!forceSplit || items.length < 2) return null;
    fitCount = 1;
  }
  if (fitCount >= items.length) return null;

  return [
    buildListWithItems(listEl, items.slice(0, fitCount), existingStart),
    // Second fragment starts at existingStart + fitCount so numbering is continuous.
    buildListWithItems(listEl, items.slice(fitCount), existingStart + fitCount),
  ];
}

// ── Table splitter ───────────────────────────────────────────────────────────

function buildTableWithRows(
  tableEl: HTMLTableElement,
  rows: HTMLTableRowElement[],
): HTMLTableElement {
  const clone = tableEl.cloneNode(false) as HTMLTableElement;
  const caption = tableEl.querySelector('caption');
  if (caption) clone.appendChild(caption.cloneNode(true));
  const colgroup = tableEl.querySelector('colgroup');
  if (colgroup) clone.appendChild(colgroup.cloneNode(true));
  if (tableEl.tHead) clone.appendChild(tableEl.tHead.cloneNode(true));
  const tbody = createEl('tbody');
  for (const row of rows) tbody.appendChild(row.cloneNode(true));
  clone.appendChild(tbody);
  return clone;
}

/** Splits a table after the last body row that fits. Both fragments replicate
 *  the caption, colgroup, and thead so the header repeats on the next page.
 *  Returns null when all/no rows fit without a forced split. */
export function splitTableElement(
  tableEl: HTMLTableElement,
  fits: (node: HTMLElement) => boolean,
  forceSplit: boolean,
): [HTMLElement, HTMLElement] | null {
  const body = tableEl.tBodies[0];
  const rows = body
    ? Array.from(body.rows)
    : Array.from(tableEl.rows).filter(
        (r) => r.parentElement?.tagName !== 'THEAD',
      );
  if (rows.length === 0) return null;

  let fitCount = 0;
  for (let i = 0; i < rows.length; i++) {
    if (fits(buildTableWithRows(tableEl, rows.slice(0, i + 1))))
      fitCount = i + 1;
    else break;
  }

  // When forced (alone on empty page), guarantee at least 1 row moves forward.
  if (fitCount <= 0) {
    if (!forceSplit || rows.length < 2) return null;
    fitCount = 1;
  }
  if (fitCount >= rows.length) return null;

  return [
    buildTableWithRows(tableEl, rows.slice(0, fitCount)),
    buildTableWithRows(tableEl, rows.slice(fitCount)),
  ];
}

// ── PRE splitter ─────────────────────────────────────────────────────────────
// Splits a code block by line. When a <code> child is present (true for all
// fenced code blocks), buildInlineSplitAt's Range-based split preserves the
// nested highlighting span structure across the break.

/** Character offsets (within the element's full text content) marking the
 *  start of the line *after* each line — i.e. valid split points. */
function getLineEndOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offset += line.length + 1; // +1 for the newline separating this line from the next
    offsets.push(offset);
  }
  return offsets;
}

/** Splits a code block after the last line that fits. With a <code> child the
 *  split goes through buildInlineSplitAt, preserving nested highlighting
 *  spans; without one, fragments are plain joined text. Returns null when
 *  all/no lines fit without a forced split. */
export function splitPreElement(
  preEl: HTMLElement,
  fits: (node: HTMLElement) => boolean,
  forceSplit: boolean,
): [HTMLElement, HTMLElement] | null {
  const codeEl = preEl.querySelector('code');
  const lines = (codeEl ?? preEl).textContent?.split('\n') ?? [];
  // Drop the trailing empty string that String.split() produces.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 2) return null;

  const lineEndOffsets = getLineEndOffsets(lines);

  // Splits at the boundary after the first `n` lines, preserving syntax
  // highlighting via Range.cloneContents() when a <code> child is present.
  const buildSplit = (n: number): [HTMLElement, HTMLElement] | null => {
    if (!codeEl) {
      const clone = (text: string) => {
        const el = preEl.cloneNode(false) as HTMLElement;
        el.textContent = text;
        return el;
      };
      return [
        clone(lines.slice(0, n).join('\n')),
        clone(lines.slice(n).join('\n')),
      ];
    }
    const split = buildInlineSplitAt(codeEl, lineEndOffsets[n - 1]!, false);
    if (!split) return null;
    const first = preEl.cloneNode(false) as HTMLElement;
    first.appendChild(split[0]);
    const second = preEl.cloneNode(false) as HTMLElement;
    second.appendChild(split[1]);
    return [first, second];
  };

  let best: [HTMLElement, HTMLElement] | null = null;
  let fitCount = 0;
  for (let i = 1; i <= lines.length; i++) {
    const candidate = buildSplit(i);
    if (!candidate || !fits(candidate[0])) break;
    best = candidate;
    fitCount = i;
  }

  if (fitCount <= 0) {
    if (!forceSplit) return null;
    best = buildSplit(1);
    fitCount = 1;
  }
  if (fitCount >= lines.length || !best) return null;

  return best;
}

// ── Element splitter dispatcher ──────────────────────────────────────────────

function isInlineSplitCandidate(el: HTMLElement): boolean {
  if (!INLINE_SPLIT_TAGS.has(el.tagName)) return false;
  for (const child of Array.from(el.childNodes)) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAGS.has((child as HTMLElement).tagName)
    )
      return false;
  }
  return true;
}

function splitElement(
  el: HTMLElement,
  fits: (node: HTMLElement) => boolean,
  forceSplit: boolean,
): [HTMLElement, HTMLElement] | null {
  if (UNSPLITTABLE_TAGS.has(el.tagName)) return null;
  if (el.tagName === 'PRE') return splitPreElement(el, fits, forceSplit);
  if (el.tagName === 'TABLE')
    return splitTableElement(el as HTMLTableElement, fits, forceSplit);
  if (el.tagName === 'UL' || el.tagName === 'OL')
    return splitListElement(el, fits, forceSplit);
  if (isInlineSplitCandidate(el))
    return splitInlineElement(el, fits, forceSplit);
  return null;
}

// ── Main pagination loop ─────────────────────────────────────────────────────

/** Distributes a rendered section's block children into page-height buckets,
 *  splitting oversized elements by natural unit (line, row, list item, word,
 *  or character) when they don't fit whole. Returns one HTMLElement[] per page. */
export function paginateEl(
  sourceEl: HTMLElement,
  contentWidthPx: number,
  contentHeightPx: number,
  docCSS: string,
): HTMLElement[][] {
  // Hidden shadow-root sandbox: scoped CSS prevents host-document pollution.
  const sandboxHost = createDiv();
  setCssStyles(sandboxHost, {
    position: 'fixed',
    top: '0',
    left: '-99999px',
    width: `${contentWidthPx}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });

  const sandboxShadow = sandboxHost.attachShadow({ mode: 'open' });

  const sandboxSheet = new CSSStyleSheet();
  sandboxSheet.replaceSync(docCSS);
  sandboxShadow.adoptedStyleSheets = [sandboxSheet];

  const inner = createDiv();
  // `.mpdf-doc` is the scope selector buildDocCSS emits (see css-builder.ts) —
  // the class name must match for sandboxed measurement to see real styles.
  inner.className = 'mpdf-doc';
  for (const child of Array.from(sourceEl.children)) {
    inner.appendChild(child.cloneNode(true));
  }
  sandboxShadow.appendChild(inner);

  // Measurement div: same width, always empty before each measurement.
  const measure = createDiv();
  measure.className = 'mpdf-doc';
  setCssStyles(measure, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: `${contentWidthPx}px`,
    visibility: 'hidden',
  });
  sandboxShadow.appendChild(measure);

  document.body.appendChild(sandboxHost);

  const pages: HTMLElement[][] = [];
  try {
    let currentPage: HTMLElement[] = [];
    const children = Array.from(inner.children) as HTMLElement[];
    let idx = 0;

    while (idx < children.length) {
      const child = children[idx]!;
      const fits = makeFitFn(currentPage, measure, contentHeightPx);

      if (fits(child)) {
        currentPage.push(child.cloneNode(true) as HTMLElement);
        idx++;
        continue;
      }

      // Element doesn't fit. Try to split it across the page boundary.
      const forceSplit = currentPage.length === 0;
      const split = splitElement(child, fits, forceSplit);
      if (split) {
        currentPage.push(split[0]);
        pages.push(currentPage);
        currentPage = [];
        // Replace current child with the remainder for re-processing.
        const remainder = split[1];
        if (remainder.textContent?.trim() || remainder.children.length > 0) {
          children[idx] = remainder;
        } else {
          idx++;
        }
        continue;
      }

      // Can't split. If there's content on this page, flush it and retry the
      // same element on a fresh full-height page.
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        continue;
      }

      // Element is alone on an empty page and truly unsplittable (e.g. a giant
      // image). Force it onto its own page and advance so we never stall.
      currentPage.push(child.cloneNode(true) as HTMLElement);
      pages.push(currentPage);
      currentPage = [];
      idx++;
    }

    if (currentPage.length > 0) pages.push(currentPage);
  } finally {
    document.body.removeChild(sandboxHost);
  }
  return pages.length > 0 ? pages : [[]];
}
