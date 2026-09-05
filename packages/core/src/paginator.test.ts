// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  splitInlineElement,
  splitListElement,
  splitPreElement,
  splitTableElement,
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

import { paginateEl } from './paginator';

/** Stands in for real layout: the paginator measures the height of the
 *  measure div, which holds clones of the candidate page content. Mocked
 *  height = sum of `data-h` attributes over the element and its descendants,
 *  so tests declare per-block heights instead of depending on a layout
 *  engine. (jsdom cannot produce real heights — golden layout tests run in
 *  real Chromium, engine-port/08.) */
function withMockedHeights<T>(fn: () => T): T {
  const proto = Element.prototype as unknown as {
    getBoundingClientRect: () => DOMRect;
  };
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function (this: Element) {
    let height = Number(this.getAttribute('data-h') ?? 0);
    for (const el of this.querySelectorAll('[data-h]')) {
      height += Number(el.getAttribute('data-h') ?? 0);
    }
    return { height } as DOMRect;
  };
  try {
    return fn();
  } finally {
    proto.getBoundingClientRect = original;
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
