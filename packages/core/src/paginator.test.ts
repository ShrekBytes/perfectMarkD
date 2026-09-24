// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
} from 'pdf-lib';

import { DEFAULT_SETTINGS, type DocumentSettings } from './settings';
import {
  buildPageLayouts,
  extractOutlineEntries,
  injectPDFOutline,
  splitInlineElement,
  splitListElement,
  splitPreElement,
  splitTableElement,
  type PageLayout,
} from './paginator';

/** A deterministic stand-in for the paginator's DOM measurement: an element
 *  "fits" when its text is no longer than `budget` characters. */
const textFits = (budget: number) => (el: HTMLElement) =>
  (el.textContent ?? '').length <= budget;

/** A `fits` predicate for list/table fragments: counts the fragment's items
 *  (li, or body rows only) against `budget`. */
const countFits =
  (budget: number, selector: 'li' | 'tbody tr') => (el: HTMLElement) =>
    el.querySelectorAll(selector).length <= budget;

describe('splitInlineElement', () => {
  it('splits at the latest word boundary whose first half fits', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello brave new world';
    const split = splitInlineElement(p, textFits(15), false);
    expect(split).not.toBeNull();
    expect(split![0].textContent).toBe('Hello brave new');
    expect(split![1].textContent).toBe('world');
  });

  it('trims leading whitespace off the second fragment', () => {
    const p = document.createElement('p');
    p.textContent = 'aaa bbb ccc';
    const split = splitInlineElement(p, textFits(4), false);
    expect(split![0].textContent).toBe('aaa');
    expect(split![1].textContent).toBe('bbb ccc');
  });

  it('returns null when no word boundary fits and not forced', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello brave new world';
    expect(splitInlineElement(p, textFits(3), false)).toBeNull();
  });

  it('falls back to a character split for an oversized single word', () => {
    const p = document.createElement('p');
    p.textContent = 'aaaaaaaaaa';
    const split = splitInlineElement(p, textFits(6), false);
    expect(split![0].textContent).toBe('aaaaaa');
    expect(split![1].textContent).toBe('aaaa');
  });

  it('forces a character split when forced and no word boundary fits', () => {
    const p = document.createElement('p');
    p.textContent = 'abc def';
    const split = splitInlineElement(p, textFits(2), true);
    expect(split![0].textContent).toBe('ab');
    expect(split![1].textContent).toBe('c def');
  });

  it('preserves inline markup across the split', () => {
    const p = document.createElement('p');
    p.innerHTML = 'alpha <b>bold words here</b> tail';
    const split = splitInlineElement(p, textFits(12), false);
    expect(split![0].textContent).toBe('alpha bold');
    expect(split![0].querySelector('b')?.textContent).toBe('bold');
    expect(split![1].querySelector('b')?.textContent).toBe('words here');
    expect(split![1].textContent).toBe('words here tail');
  });

  it('returns null for text shorter than two characters', () => {
    const p = document.createElement('p');
    p.textContent = 'a';
    expect(splitInlineElement(p, textFits(50), false)).toBeNull();
  });
});

describe('splitListElement', () => {
  const makeList = (tag: 'ol' | 'ul', items: string[], start?: number) => {
    const list = document.createElement(tag);
    if (start !== undefined) list.setAttribute('start', String(start));
    for (const text of items) {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    }
    return list;
  };

  it('splits after the last item that fits and continues numbering', () => {
    const ol = makeList('ol', ['one', 'two', 'three']);
    const split = splitListElement(ol, countFits(2, 'li'), false);
    expect(split).not.toBeNull();
    expect(split![0].tagName).toBe('OL');
    expect(split![0].children).toHaveLength(2);
    expect(split![0].querySelectorAll('li')[1]?.textContent).toBe('two');
    // No start attribute when numbering begins at 1.
    expect(split![0].hasAttribute('start')).toBe(false);
  });

  it('starts the second fragment at fitCount + 1 so OL numbering continues', () => {
    const ol = makeList('ol', ['one', 'two', 'three']);
    const split = splitListElement(ol, countFits(2, 'li'), false)!;
    expect(split[1].tagName).toBe('OL');
    expect((split[1] as HTMLOListElement).start).toBe(3);
    expect(split[1].textContent).toBe('three');
  });

  it('respects an existing start attribute on a continuation list', () => {
    const ol = makeList('ol', ['five', 'six', 'seven'], 5);
    const split = splitListElement(ol, countFits(1, 'li'), false)!;
    expect((split[0] as HTMLOListElement).start).toBe(5);
    expect((split[1] as HTMLOListElement).start).toBe(6);
  });

  it('never sets start on UL fragments', () => {
    const ul = makeList('ul', ['a', 'b', 'c']);
    const split = splitListElement(ul, countFits(1, 'li'), false)!;
    expect(split[0].tagName).toBe('UL');
    expect(split[0].hasAttribute('start')).toBe(false);
    expect(split[1].hasAttribute('start')).toBe(false);
  });

  it('returns null when every item fits', () => {
    const ol = makeList('ol', ['one', 'two']);
    expect(splitListElement(ol, countFits(5, 'li'), false)).toBeNull();
  });

  it('returns null when nothing fits and not forced', () => {
    const ol = makeList('ol', ['one', 'two']);
    expect(splitListElement(ol, countFits(0, 'li'), false)).toBeNull();
  });

  it('forces at least one item forward when forced and nothing fits', () => {
    const ol = makeList('ol', ['one', 'two', 'three']);
    const split = splitListElement(ol, countFits(0, 'li'), true)!;
    expect(split[0].children).toHaveLength(1);
    expect((split[1] as HTMLOListElement).start).toBe(2);
  });

  it('returns null for a list with no items', () => {
    const ol = document.createElement('ol');
    expect(splitListElement(ol, countFits(5, 'li'), true)).toBeNull();
  });
});

describe('splitTableElement', () => {
  const makeTable = (rows: string[], withHead = true) => {
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = 'Cap';
    table.appendChild(caption);
    const colgroup = document.createElement('colgroup');
    colgroup.appendChild(document.createElement('col'));
    table.appendChild(colgroup);
    if (withHead) {
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = 'H';
      headRow.appendChild(th);
      thead.appendChild(headRow);
      table.appendChild(thead);
    }
    const tbody = document.createElement('tbody');
    for (const text of rows) {
      const tr = document.createElement('tr');
      tr.textContent = text;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  };

  it('splits after the last row that fits', () => {
    const table = makeTable(['r1', 'r2', 'r3']);
    const split = splitTableElement(table, countFits(2, 'tbody tr'), false)!;
    expect(split[0].querySelectorAll('tbody tr')).toHaveLength(2);
    expect(split[1].querySelectorAll('tbody tr')).toHaveLength(1);
    expect(split[1].querySelector('tbody tr')?.textContent).toBe('r3');
  });

  it('replicates thead, caption, and colgroup into both fragments', () => {
    const table = makeTable(['r1', 'r2', 'r3']);
    const split = splitTableElement(table, countFits(1, 'tbody tr'), false)!;
    for (const fragment of split) {
      expect(fragment.querySelector('thead th')?.textContent).toBe('H');
      expect(fragment.querySelector('caption')?.textContent).toBe('Cap');
      expect(fragment.querySelector('colgroup col')).not.toBeNull();
    }
  });

  it('builds a thead-free table without inventing one', () => {
    const table = makeTable(['r1', 'r2', 'r3'], false);
    const split = splitTableElement(table, countFits(1, 'tbody tr'), false)!;
    expect(split[0].querySelector('thead')).toBeNull();
    expect(split[1].querySelector('thead')).toBeNull();
  });

  it('returns null when every row fits', () => {
    const table = makeTable(['r1', 'r2']);
    expect(
      splitTableElement(table, countFits(5, 'tbody tr'), false),
    ).toBeNull();
  });

  it('returns null when nothing fits and not forced', () => {
    const table = makeTable(['r1', 'r2']);
    expect(
      splitTableElement(table, countFits(0, 'tbody tr'), false),
    ).toBeNull();
  });

  it('forces at least one row forward when forced and nothing fits', () => {
    const table = makeTable(['r1', 'r2', 'r3']);
    const split = splitTableElement(table, countFits(0, 'tbody tr'), true)!;
    expect(split[0].querySelectorAll('tbody tr')).toHaveLength(1);
    expect(split[1].querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('returns null for a table with no body rows', () => {
    const table = makeTable([]);
    expect(splitTableElement(table, countFits(5, 'tbody tr'), true)).toBeNull();
  });
});

describe('splitPreElement', () => {
  /** A `fits` predicate for code fragments: the fragment may hold at most
   *  `budget` lines. A trailing "\n" terminates the last line rather than
   *  opening a new one (browsers don't render a block-final line break), so
   *  it doesn't count as an extra line — matching real layout. */
  const linesFits = (budget: number) => (el: HTMLElement) => {
    const parts = (el.textContent ?? '').split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    return parts.length <= budget;
  };

  it('splits after the last line that fits', () => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    // Renderer-realistic input: fenced code always ends with a newline.
    code.textContent = 'line1\nline2\nline3\n';
    pre.appendChild(code);
    const split = splitPreElement(pre, linesFits(2), false)!;
    // The split point sits after line 2's newline, so it stays in the first
    // fragment; the trailing newline of the whole block stays in the second.
    expect(split[0].textContent).toBe('line1\nline2\n');
    expect(split[1].textContent).toBe('line3\n');
  });

  it('preserves syntax-highlight spans across the break', () => {
    const pre = document.createElement('pre');
    pre.className = 'shiki';
    pre.innerHTML =
      '<code><span class="line">const a = <span style="color:#123">42</span>;</span>\n' +
      '<span class="line">let b;</span></code>';
    const split = splitPreElement(pre, linesFits(1), false)!;

    expect(split[0].tagName).toBe('PRE');
    expect(split[0].querySelector('code')).not.toBeNull();
    expect(split[0].textContent).toBe('const a = 42;\n');
    expect(split[0].querySelector('span.line span')?.textContent).toBe('42');

    expect(split[1].textContent).toBe('let b;');
    expect(split[1].querySelector('span.line')?.textContent).toBe('let b;');
  });

  it('splits a bare pre without a code child as plain text lines', () => {
    const pre = document.createElement('pre');
    pre.textContent = 'a\nb\nc';
    const split = splitPreElement(pre, linesFits(2), false)!;
    expect(split[0].textContent).toBe('a\nb');
    expect(split[1].textContent).toBe('c');
  });

  it('drops the trailing newline instead of splitting off an empty line', () => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'a\nb\n';
    pre.appendChild(code);
    const split = splitPreElement(pre, linesFits(1), false)!;
    expect(split[0].textContent).toBe('a\n');
    expect(split[1].textContent).toBe('b\n');
  });

  it('returns null for a single-line block', () => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'only';
    pre.appendChild(code);
    expect(splitPreElement(pre, linesFits(5), false)).toBeNull();
  });

  it('returns null when every line fits', () => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'a\nb\n';
    pre.appendChild(code);
    expect(splitPreElement(pre, linesFits(10), false)).toBeNull();
  });
});

// ─── paginateEl ───────────────────────────────────────────────────────────────

import { paginateEl, paginateElChunked } from './paginator';

/** Stands in for real layout: the paginator measures the height of the
 *  measure div, which holds clones of the candidate page content. Mocked
 *  height = sum of `data-h` attributes over the element and its descendants,
 *  so tests declare per-block heights instead of depending on a layout
 *  engine. (jsdom cannot produce real heights — golden layout tests run in
 *  real Chromium, engine-port/08.) */
function mockedHeightRect(this: Element): DOMRect {
  let height = Number(this.getAttribute('data-h') ?? 0);
  for (const el of this.querySelectorAll('[data-h]')) {
    height += Number(el.getAttribute('data-h') ?? 0);
  }
  return { height } as DOMRect;
}

/** Installs the mocked measurement and restores it in `finally`. The async
 *  twin below exists because the mock has to outlive an awaited run. */
function installMockedHeights(): () => void {
  const proto = Element.prototype as unknown as {
    getBoundingClientRect: () => DOMRect;
  };
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = mockedHeightRect;
  return () => {
    proto.getBoundingClientRect = original;
  };
}

function withMockedHeights<T>(fn: () => T): T {
  const restore = installMockedHeights();
  try {
    return fn();
  } finally {
    restore();
  }
}

async function withMockedHeightsAsync<T>(fn: () => Promise<T>): Promise<T> {
  const restore = installMockedHeights();
  try {
    return await fn();
  } finally {
    restore();
  }
}

describe('paginateEl', () => {
  const makeSource = (html: string) => {
    const source = document.createElement('div');
    source.innerHTML = html;
    return source;
  };

  it('puts everything on one page when it all fits', () => {
    const source = makeSource('<p>one</p><p>two</p><p>three</p>');
    const pages = paginateEl(source, 600, 1000, 'p { margin: 0; }');
    expect(pages).toHaveLength(1);
    expect(pages[0]!.map((n) => n.textContent)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('distributes blocks into page-height buckets', () => {
    const source = makeSource(
      '<p data-h="100">a</p><p data-h="100">b</p><p data-h="100">c</p>',
    );
    const pages = withMockedHeights(() => paginateEl(source, 600, 250, ''));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.map((n) => n.textContent)).toEqual(['a', 'b']);
    expect(pages[1]!.map((n) => n.textContent)).toEqual(['c']);
  });

  it('moves an unsplittable oversize element to its own page', () => {
    const source = makeSource(
      '<p data-h="100">a</p><img data-h="500" src="x.png" alt="">',
    );
    const pages = withMockedHeights(() => paginateEl(source, 600, 250, ''));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.map((n) => n.tagName)).toEqual(['P']);
    expect(pages[1]!.map((n) => n.tagName)).toEqual(['IMG']);
  });

  it('force-splits a list that alone exceeds a page, continuing numbering', () => {
    const source = makeSource(
      '<ol><li data-h="60">one</li><li data-h="60">two</li><li data-h="60">three</li></ol>',
    );
    const pages = withMockedHeights(() => paginateEl(source, 600, 100, ''));
    expect(pages).toHaveLength(3);
    const listPerPage = pages.map((page) => page[0] as HTMLOListElement);
    expect(listPerPage.map((l) => l.children.length)).toEqual([1, 1, 1]);
    expect(listPerPage[1]!.start).toBe(2);
    expect(listPerPage[2]!.start).toBe(3);
  });

  it('replicates the table head on every page a split table spans', () => {
    const source = makeSource(
      '<table><thead><tr><th>H</th></tr></thead><tbody>' +
        '<tr data-h="80">r1</tr><tr data-h="80">r2</tr><tr data-h="80">r3</tr>' +
        '</tbody></table>',
    );
    const pages = withMockedHeights(() => paginateEl(source, 600, 120, ''));
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const page of pages) {
      expect((page[0] as HTMLTableElement).tHead?.textContent).toBe('H');
    }
  });

  it('returns one empty page for an empty source', () => {
    const source = makeSource('');
    expect(paginateEl(source, 600, 1000, '')).toEqual([[]]);
  });

  it('does not mutate the source element', () => {
    const source = makeSource('<p data-h="100">a</p><p data-h="100">b</p>');
    const before = source.innerHTML;
    withMockedHeights(() => paginateEl(source, 600, 150, ''));
    expect(source.innerHTML).toBe(before);
  });

  it('removes the measurement sandbox from the document afterwards', () => {
    const source = makeSource('<p data-h="100">a</p>');
    const bodyChildren = document.body.children.length;
    withMockedHeights(() => paginateEl(source, 600, 150, ''));
    expect(document.body.children.length).toBe(bodyChildren);
  });
});

// ─── paginateElChunked ────────────────────────────────────────────────────────

describe('paginateElChunked', () => {
  const makeSource = (html: string) => {
    const source = document.createElement('div');
    source.innerHTML = html;
    return source;
  };

  /** A shape that exercises every branch of the loop: whole blocks, a
   *  force-split list, and an unsplittable oversize element. */
  const MIXED = [
    '<p data-h="100">a</p>',
    '<p data-h="100">b</p>',
    '<ol><li data-h="60">one</li><li data-h="60">two</li><li data-h="60">three</li></ol>',
    '<img data-h="500" src="x.png" alt="">',
    '<p data-h="100">c</p>',
    '<table><thead><tr><th>H</th></tr></thead><tbody>',
    '<tr data-h="80">r1</tr><tr data-h="80">r2</tr>',
    '</tbody></table>',
  ].join('');

  /** The bucket structure, in a form two runs can be compared by. */
  const digest = (pages: HTMLElement[][]) =>
    pages.map((page) =>
      page.map((node) => `${node.tagName}:${node.textContent ?? ''}`),
    );

  it('produces exactly the pages paginateEl does', async () => {
    const sync = withMockedHeights(() =>
      paginateEl(makeSource(MIXED), 600, 250, ''),
    );
    const chunked = await withMockedHeightsAsync(() =>
      paginateElChunked(makeSource(MIXED), 600, 250, '', { yieldEvery: 1 }),
    );
    expect(digest(chunked)).toEqual(digest(sync));
  });

  it('returns one empty page for an empty source', async () => {
    const pages = await withMockedHeightsAsync(() =>
      paginateElChunked(makeSource(''), 600, 1000, ''),
    );
    expect(pages).toEqual([[]]);
  });

  it('does not mutate the source element', async () => {
    const source = makeSource('<p data-h="100">a</p><p data-h="100">b</p>');
    const before = source.innerHTML;
    await withMockedHeightsAsync(() => paginateElChunked(source, 600, 150, ''));
    expect(source.innerHTML).toBe(before);
  });

  it('removes the measurement sandbox from the document afterwards', async () => {
    const bodyChildren = document.body.children.length;
    await withMockedHeightsAsync(() =>
      paginateElChunked(makeSource(MIXED), 600, 250, ''),
    );
    expect(document.body.children.length).toBe(bodyChildren);
  });

  it('lets other tasks run while it paginates', async () => {
    // The point of the chunked variant: the loop must not hold the thread
    // for its whole duration. A macrotask queued before the run has to get
    // its turn before the run finishes.
    const order: string[] = [];
    await withMockedHeightsAsync(async () => {
      const running = paginateElChunked(makeSource(MIXED), 600, 250, '', {
        yieldEvery: 1,
      });
      setTimeout(() => order.push('other task'), 0);
      const pages = await running;
      order.push('run finished');
      expect(pages.length).toBeGreaterThan(0);
    });
    expect(order).toEqual(['other task', 'run finished']);
  });

  it('reports a non-decreasing page count that lands on the final total', async () => {
    const seen: number[] = [];
    const pages = await withMockedHeightsAsync(() =>
      paginateElChunked(makeSource(MIXED), 600, 250, '', {
        yieldEvery: 1,
        onProgress: (count) => seen.push(count),
      }),
    );
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    // The last report is the pages completed before the final flush, so it
    // is the total or one short of it — never more.
    expect(pages.length - seen.at(-1)!).toBeLessThanOrEqual(1);
  });

  it('yields once per batch, not once per node', async () => {
    const source = makeSource(
      Array.from({ length: 8 }, (_, i) => `<p data-h="100">${i}</p>`).join(''),
    );
    const yieldsAt = async (yieldEvery: number): Promise<number> => {
      const reports: number[] = [];
      await withMockedHeightsAsync(() =>
        paginateElChunked(source, 600, 250, '', {
          yieldEvery,
          onProgress: () => reports.push(1),
        }),
      );
      return reports.length;
    };

    // yieldEvery 1 yields after every loop step, so it counts the steps.
    const perNode = await yieldsAt(1);
    const perBatch = await yieldsAt(3);
    expect(perNode).toBeGreaterThan(1);
    expect(perBatch).toBe(Math.floor(perNode / 3));
  });

  it('yields nothing when the whole section is one batch', async () => {
    const reports: number[] = [];
    const pages = await withMockedHeightsAsync(() =>
      paginateElChunked(makeSource('<p data-h="10">a</p>'), 600, 250, '', {
        yieldEvery: 50,
        onProgress: () => reports.push(1),
      }),
    );
    expect(reports).toHaveLength(0);
    expect(pages).toHaveLength(1);
  });
});

// ─── buildPageLayouts ─────────────────────────────────────────────────────────

const settings = (over: Partial<DocumentSettings> = {}): DocumentSettings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});

describe('buildPageLayouts', () => {
  const layouts = (
    pages: number,
    over: Partial<DocumentSettings> = {},
    title = 'Note',
  ): PageLayout[] =>
    buildPageLayouts(
      Array.from({ length: pages }, () => [document.createElement('div')]),
      settings(over),
      title,
    );

  it('resolves the default current/total template into the right-hand footer', () => {
    const [first, , third] = layouts(3);
    expect(first!.pageShowsFooter).toBe(true);
    expect(first!.footerRight).toBe('1 / 3');
    expect(third!.footerRight).toBe('3 / 3');
    expect(first!.footerLeft).toBe('');
    expect(first!.footerCenter).toBe('');
  });

  it('substitutes {{current}}, {{total}} and {{title}} in a custom format', () => {
    const [first] = layouts(3, {
      pageNumberFormat: '{{title}} — {{current}}/{{total}}',
    });
    expect(first!.footerRight).toBe('Note — 1/3');
  });

  it('substitutes {{title}} last so a title containing placeholders stays literal', () => {
    const [first] = layouts(
      2,
      { pageNumberFormat: '{{title}} {{current}}/{{total}}' },
      '{{current}} note',
    );
    expect(first!.footerRight).toBe('{{current}} note 1/2');
  });

  it('falls back to the default template for a blank format', () => {
    const [first] = layouts(2, { pageNumberFormat: '   ' });
    expect(first!.footerRight).toBe('1 / 2');
  });

  it('suppresses header and footer zones on the first page when asked', () => {
    const [first, second] = layouts(2, {
      showHeaderOnFirstPage: false,
      showFooterOnFirstPage: false,
      headerText: 'Header',
    });
    expect(first!.pageShowsHeader).toBe(false);
    expect(first!.pageShowsFooter).toBe(false);
    expect(first!.headerRight).toBe('');
    expect(first!.footerRight).toBe('');
    expect(first!.hasHeader).toBe(false);
    expect(first!.hasFooter).toBe(false);
    expect(second!.pageShowsHeader).toBe(true);
    expect(second!.pageShowsFooter).toBe(true);
    expect(second!.headerRight).toBe('Header');
  });

  it('shifts the displayed page numbers by one when the first-page footer is hidden', () => {
    const [, second, third] = layouts(3, { showFooterOnFirstPage: false });
    expect(second!.footerRight).toBe('1 / 2');
    expect(third!.footerRight).toBe('2 / 2');
  });

  it('offsets numbering by pageNumberStart', () => {
    const [first] = layouts(3, { pageNumberStart: 5 });
    expect(first!.footerRight).toBe('5 / 7');
  });

  it('routes footer text and page numbers by alignment/position', () => {
    const [left] = layouts(2, {
      footerText: 'Confidential',
      footerTextAlignment: 'left',
      pageNumberPosition: 'center',
    });
    expect(left!.footerLeft).toBe('Confidential');
    expect(left!.footerCenter).toBe('1 / 2');
    expect(left!.footerRight).toBe('');

    const [merged] = layouts(2, {
      footerText: 'Confidential',
      footerTextAlignment: 'right',
      pageNumberPosition: 'right',
    });
    expect(merged!.footerRight).toBe('Confidential — 1 / 2');
  });

  it('routes header text by headerAlignment', () => {
    const [first] = layouts(2, {
      headerText: 'My Note',
      headerAlignment: 'center',
    });
    expect(first!.headerCenter).toBe('My Note');
    expect(first!.headerLeft).toBe('');
    expect(first!.headerRight).toBe('');
  });

  it('flags hasHeader/hasFooter from show flags, zones and borders', () => {
    const [noHeader] = layouts(2);
    expect(noHeader!.hasHeader).toBe(false);
    expect(noHeader!.hasFooter).toBe(true);

    const [borderOnly] = layouts(2, { showHeaderBorder: true });
    expect(borderOnly!.hasHeader).toBe(true);

    const [disabled] = layouts(2, {
      headerText: 'Header',
      showHeader: false,
      showFooter: false,
    });
    expect(disabled!.hasHeader).toBe(false);
    expect(disabled!.hasFooter).toBe(false);
  });
});

// ─── extractOutlineEntries ────────────────────────────────────────────────────

describe('extractOutlineEntries', () => {
  const layoutsFrom = (pagesHtml: string[]): PageLayout[] =>
    buildPageLayouts(
      pagesHtml.map((html) => {
        // One page-node per page, matching paginateEl's output shape.
        const div = document.createElement('div');
        div.innerHTML = html;
        return [div];
      }),
      settings(),
      'T',
    );

  it('collects headings across pages in document order with 1-indexed pages', () => {
    const entries = extractOutlineEntries(
      layoutsFrom(['<h1>A</h1><p>…</p><h2>B</h2>', '<h1>C</h1>']),
    );
    expect(entries).toEqual([
      { title: 'A', level: 1, page: 1 },
      { title: 'B', level: 2, page: 1 },
      { title: 'C', level: 1, page: 2 },
    ]);
  });

  it('finds headings nested inside split-fragment containers and bare heading nodes', () => {
    const layouts = layoutsFrom(['<div><h3>Nested</h3><p>x</p></div>']);
    // A page node can also *be* the heading after pagination.
    const bare = document.createElement('h4');
    bare.textContent = 'Bare';
    layouts[0]!.pageNodes.unshift(bare);

    const entries = extractOutlineEntries(layouts);
    expect(entries).toEqual([
      { title: 'Bare', level: 4, page: 1 },
      { title: 'Nested', level: 3, page: 1 },
    ]);
  });

  it('skips headings with no text', () => {
    const entries = extractOutlineEntries(
      layoutsFrom(['<h1>Real</h1><h2>   </h2>']),
    );
    expect(entries).toEqual([{ title: 'Real', level: 1, page: 1 }]);
  });

  it('returns nothing for layouts without headings', () => {
    expect(extractOutlineEntries(layoutsFrom(['<p>only text</p>']))).toEqual(
      [],
    );
  });
});

// ─── injectPDFOutline ─────────────────────────────────────────────────────────

describe('injectPDFOutline', () => {
  const dummyPdf = async (pageCount: number): Promise<Uint8Array> => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) doc.addPage();
    return await doc.save();
  };

  const outlinesDict = (doc: PDFDocument): PDFDict =>
    doc.context.lookup(
      doc.catalog.get(PDFName.of('Outlines')) as PDFRef,
      PDFDict,
    );

  const dictAt = (doc: PDFDocument, dict: PDFDict, name: string): PDFDict =>
    doc.context.lookup(dict.get(PDFName.of(name)) as PDFRef, PDFDict);

  const titleOf = (dict: PDFDict): string =>
    (dict.get(PDFName.of('Title')) as PDFHexString).decodeText();

  const countOf = (dict: PDFDict): number =>
    (dict.get(PDFName.of('Count')) as PDFNumber).asNumber();

  /** Asserts an XYZ destination (null left/top, zoom 0) and returns the
   *  1-indexed page it points at. */
  const destPageOf = (doc: PDFDocument, dict: PDFDict): number => {
    const dest = doc.context.lookup(
      dict.get(PDFName.of('Dest')) as PDFRef,
      PDFArray,
    );
    expect(String(dest.get(1))).toBe('/XYZ');
    expect(String(dest.get(2))).toBe('null');
    expect(String(dest.get(3))).toBe('null');
    expect((dest.get(4) as PDFNumber).asNumber()).toBe(0);
    const target = dest.get(0) as PDFRef;
    const pages = doc.getPages();
    return (
      pages.findIndex((p) => p.ref.objectNumber === target.objectNumber) + 1
    );
  };

  it('injects a hierarchical outline with collapsed subtrees and UseOutlines', async () => {
    const doc = await PDFDocument.load(
      await injectPDFOutline(await dummyPdf(3), [
        { title: 'Chapter Ünï — 中文', level: 1, page: 1 },
        { title: 'Section A', level: 2, page: 1 },
        { title: 'Section B', level: 2, page: 2 },
        { title: 'Chapter Two', level: 1, page: 3 },
      ]),
    );

    expect(String(doc.catalog.get(PDFName.of('PageMode')))).toBe(
      '/UseOutlines',
    );

    const root = outlinesDict(doc);
    expect(String(root.get(PDFName.of('Type')))).toBe('/Outlines');
    expect(countOf(root)).toBe(2);

    const ch1 = dictAt(doc, root, 'First');
    const ch2 = dictAt(doc, root, 'Last');
    expect(titleOf(ch1)).toBe('Chapter Ünï — 中文');
    expect(titleOf(ch2)).toBe('Chapter Two');

    // Roots link to each other; their parents resolve back to the root dict.
    expect(dictAt(doc, ch1, 'Next')).toBe(ch2);
    expect(dictAt(doc, ch2, 'Prev')).toBe(ch1);
    expect(dictAt(doc, ch1, 'Parent')).toBe(root);
    expect(String(ch2.get(PDFName.of('Next')))).toBe('undefined');
    expect(String(ch1.get(PDFName.of('Prev')))).toBe('undefined');

    // Chapter One: two direct children, collapsed by default (negative /Count).
    expect(countOf(ch1)).toBe(-2);
    const secA = dictAt(doc, ch1, 'First');
    const secB = dictAt(doc, ch1, 'Last');
    expect(titleOf(secA)).toBe('Section A');
    expect(titleOf(secB)).toBe('Section B');
    expect(dictAt(doc, secA, 'Next')).toBe(secB);
    expect(dictAt(doc, secB, 'Prev')).toBe(secA);
    expect(dictAt(doc, secA, 'Parent')).toBe(ch1);
    expect(secA.get(PDFName.of('First'))).toBeUndefined();
    expect(secA.get(PDFName.of('Count'))).toBeUndefined();

    // Leaf chapters carry no child keys at all.
    expect(ch2.get(PDFName.of('First'))).toBeUndefined();
    expect(ch2.get(PDFName.of('Count'))).toBeUndefined();

    // XYZ destinations inherit scroll and zoom, and point at the right pages.
    expect(destPageOf(doc, ch1)).toBe(1);
    expect(destPageOf(doc, secB)).toBe(2);
    expect(destPageOf(doc, ch2)).toBe(3);
  });

  it('clamps an out-of-range page number to the last page', async () => {
    const doc = await PDFDocument.load(
      await injectPDFOutline(await dummyPdf(2), [
        { title: 'Far', level: 1, page: 99 },
      ]),
    );
    expect(destPageOf(doc, dictAt(doc, outlinesDict(doc), 'First'))).toBe(2);
  });

  it('returns the input bytes unchanged when there are no entries', async () => {
    const bytes = await dummyPdf(2);
    expect(await injectPDFOutline(bytes, [])).toBe(bytes);
  });

  it('treats a leading H2 (no H1) as a root-level item', async () => {
    const doc = await PDFDocument.load(
      await injectPDFOutline(await dummyPdf(2), [
        { title: 'Only H2', level: 2, page: 1 },
      ]),
    );
    const root = outlinesDict(doc);
    expect(countOf(root)).toBe(1);
    expect(destPageOf(doc, dictAt(doc, root, 'First'))).toBe(1);
  });
});
