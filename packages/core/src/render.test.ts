// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  isRTLContent,
  normalizeMarkdown,
  postProcessRenderedHTML,
  splitMarkdownSections,
} from './render';

describe('normalizeMarkdown', () => {
  it('normalises CRLF and lone CR to LF', () => {
    expect(normalizeMarkdown('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('leaves LF-only input untouched', () => {
    expect(normalizeMarkdown('a\nb')).toBe('a\nb');
  });
});

describe('splitMarkdownSections', () => {
  it('splits on /// page-break markers, trimming and dropping empties', () => {
    expect(
      splitMarkdownSections('first\n\n///\n\n  second  \n///\n\n///\nthird'),
    ).toEqual(['first', 'second', 'third']);
  });

  it('returns the whole document as one section without markers', () => {
    expect(splitMarkdownSections('one\ntwo\n')).toEqual(['one\ntwo']);
  });
});

describe('isRTLContent', () => {
  it('is true when RTL script chars dominate', () => {
    expect(isRTLContent('هذا نص عربي طويل جداً للتجربة')).toBe(true);
  });

  it('is false when RTL chars are a small minority', () => {
    expect(
      isRTLContent(
        'Mostly English prose with only a tiny bit of عربي mixed in for flavor.',
      ),
    ).toBe(false);
  });

  it('is false for empty or non-alphabetic text', () => {
    expect(isRTLContent('')).toBe(false);
    expect(isRTLContent('12345 !!!')).toBe(false);
  });
});

describe('postProcessRenderedHTML', () => {
  const process = (html: string): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = html;
    postProcessRenderedHTML(root);
    return root;
  };

  it('assigns slugified heading IDs and deduplicates repeats', () => {
    const root = process(
      '<h1>Hello World!</h1><h2>Hello World!</h2><h3>Hello  World?</h3>',
    );
    const headings = [...root.querySelectorAll('h1,h2,h3')];
    expect(headings.map((h) => h.id)).toEqual([
      'hello-world',
      'hello-world-1',
      'hello-world-2',
    ]);
  });

  it('leaves headings with no sluggable text un-IDed', () => {
    const root = process('<h2>???</h2>');
    expect(root.querySelector('h2')?.hasAttribute('id')).toBe(false);
  });

  it('rewrites fragment anchors to the slugified target', () => {
    const root = process('<a href="#Section Two">jump</a>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#section-two');
  });

  it('leaves external anchors untouched', () => {
    const root = process('<a href="https://example.com">ext</a>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com',
    );
  });

  it('removes copy-code buttons', () => {
    const root = process(
      '<pre><button class="copy-code-button">copy</button>x</pre>',
    );
    expect(root.querySelector('.copy-code-button')).toBeNull();
  });

  it('strips top-level style and script nodes but keeps SVG-embedded styles', () => {
    const root = process(
      '<style>.theme{}</style><script>evil()</script>' +
        '<svg><style>.mermaid-theme{fill:red}</style><circle/></svg>',
    );
    expect(root.querySelector('script')).toBeNull();
    // The only surviving <style> is the one embedded in the SVG.
    expect(root.querySelector('style')?.closest('svg')).toBeTruthy();
  });
});

// ─── renderMarkdown pipeline ──────────────────────────────────────────────────

import { DEFAULT_SETTINGS } from './settings';
import { renderMarkdown } from './render';
import { getSingletonHighlighter } from 'shiki';

describe('renderMarkdown — GFM basics', () => {
  it('renders headings, tables, strikethrough, and linkified URLs', async () => {
    const { html } = await renderMarkdown(
      '# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~\n\nsee https://example.com now',
    );
    expect(html).toContain('<h1');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<s>gone</s>');
    expect(html).toContain('<a href="https://example.com">');
  });

  it('applies typographic quotes', async () => {
    const { html } = await renderMarkdown('say "quoted" words');
    expect(html).toContain('“quoted”');
  });

  it('renders task lists as static checkboxes', async () => {
    const { html } = await renderMarkdown('- [x] done\n- [ ] todo');
    expect(html).toContain('ul class="contains-task-list"');
    expect(html).toContain('li class="task-list-item"');
    const checkbox =
      html.match(/<input[^>]*task-list-item-checkbox[^>]*>/g) ?? [];
    expect(checkbox).toHaveLength(2);
    expect(checkbox.every((tag) => tag.includes('disabled'))).toBe(true);
  });

  it('renders footnotes', async () => {
    const { html } = await renderMarkdown('x[^1]\n\n[^1]: the note');
    expect(html).toContain('section class="footnotes"');
    expect(html).toContain('footnote-ref');
  });

  it('renders GFM alerts as markdown-alert structures', async () => {
    const { html } = await renderMarkdown('> [!NOTE]\n> useful info');
    expect(html).toContain('div class="markdown-alert markdown-alert-note"');
    expect(html).toContain('markdown-alert-title');
    expect(html).toContain('Note');
    expect(html).toContain('<svg');
  });

  it('renders the other alert variants with their own class', async () => {
    const { html } = await renderMarkdown('> [!CAUTION]\n> risky');
    expect(html).toContain('markdown-alert-caution');
  });

  it('passes raw HTML through but strips script and style elements', async () => {
    const { html } = await renderMarkdown(
      '<b>bold</b>\n\n<script>evil()</script>\n\n<style>.x{}</style>',
    );
    expect(html).toContain('<b>bold</b>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('evil()');
    expect(html).not.toContain('<style');
  });

  it('does not enable attr-style syntax', async () => {
    const { html } = await renderMarkdown('# Heading {#custom}');
    expect(html).not.toContain('id="custom"');
    expect(html).toContain('<h1');
  });
});

describe('renderMarkdown — frontmatter', () => {
  const DOC = '---\ntitle: Hello\ntags:\n  - a\n  - b\n---\n\n# Body';

  it('parses and exposes frontmatter, visible as a table by default', async () => {
    const { html, frontmatter } = await renderMarkdown(DOC);
    expect(frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] });
    expect(html).toContain('<table>');
    expect(html).toContain('Hello');
    expect(html).toContain('<h1');
  });

  it('strips frontmatter from the HTML when hideFrontmatter is set', async () => {
    const { html, frontmatter } = await renderMarkdown(DOC, {
      settings: { ...DEFAULT_SETTINGS, hideFrontmatter: true },
    });
    expect(frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] });
    expect(html).not.toContain('Hello');
    expect(html).not.toContain('<table');
  });

  it('yields null frontmatter for missing or invalid YAML', async () => {
    expect((await renderMarkdown('# Just body')).frontmatter).toBeNull();
    const invalid = await renderMarkdown('---\n: : :\n---\n\n# Body');
    expect(invalid.frontmatter).toBeNull();
    expect(invalid.html).toContain('<h1');
  });
});

describe('renderMarkdown — math', () => {
  it('renders inline and display math with KaTeX', async () => {
    const { html } = await renderMarkdown(
      'Inline $E=mc^2$ here.\n\n$$\nx^2\n$$',
    );
    expect(html).toContain('katex-display');
    expect(html).not.toContain('$$');
    expect(html).not.toContain('$E=mc^2$');
  });

  it('leaves math inside code fences untouched', async () => {
    const { html } = await renderMarkdown('```\n$x$\n```');
    expect(html).not.toContain('katex');
    expect(html).toContain('$x$');
  });

  it('leaves lone dollar signs alone', async () => {
    const { html } = await renderMarkdown('a $5 bill');
    expect(html).not.toContain('katex');
    expect(html).toContain('$5');
  });
});

describe('renderMarkdown — code highlighting', () => {
  it('highlights fenced code with the settings theme', async () => {
    const { html } = await renderMarkdown('```js\nconst answer = 42;\n```');
    expect(html).toContain('class="shiki github-light"');
    expect(html).toContain('background-color');
    expect(html).toContain('<span style="color:');
  });

  it('honours dark themes from settings', async () => {
    const { html } = await renderMarkdown('```js\nconst answer = 42;\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'github-dark' },
    });
    expect(html).toContain('github-dark');
    // Shiki's own github-dark palette (bg/fg differ slightly from the old
    // plugin's hand-rolled catalog, which Shiki now supplies).
    expect(html).toContain('#24292e');
  });

  it('maps legacy atom-one-* theme names to their shiki equivalents', async () => {
    const dark = await renderMarkdown('```js\nx\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'atom-one-dark' },
    });
    expect(dark.html).toContain('one-dark-pro');
    const light = await renderMarkdown('```js\nx\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'atom-one-light' },
    });
    expect(light.html).toContain('one-light');
  });

  it('falls back to github-light for unknown theme names', async () => {
    const { html } = await renderMarkdown('```js\nx\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'not-a-theme' },
    });
    expect(html).toContain('github-light');
  });

  it('renders plain escaped code with codeTheme none', async () => {
    const { html } = await renderMarkdown('```js\nconst a = "<b>";\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'none' },
    });
    expect(html).not.toContain('shiki');
    expect(html).toContain('<pre><code class="language-js">');
    expect(html).toContain('const a = "&lt;b&gt;";');
  });

  it('falls back to plain code for unknown languages', async () => {
    const { html } = await renderMarkdown('```notalang\nplain text\n```');
    expect(html).not.toContain('shiki');
    expect(html).toContain('language-notalang');
  });
});

// ─── Highlighter reuse and lazy themes (launch/05) ────────────────────────────
//
// The preview re-renders on every keystroke, so the highlighting pass has to
// share one highlighter and pull in a theme only when a render actually asks
// for it. Both properties come from Shiki's own singleton shorthand
// (`codeToHtml` from 'shiki'), which is exactly why they need pinning: a
// refactor to a per-render `createHighlighter`, or to registering the theme
// catalog up front, would leave the output identical and the cost invisible.
describe('renderMarkdown — highlighter reuse and lazy themes', () => {
  it('loads only the theme the render asks for, on the shared highlighter', async () => {
    const highlighter = await getSingletonHighlighter();
    const before = highlighter.getLoadedThemes();
    expect(before).not.toContain('nord');

    await renderMarkdown('```js\nconst answer = 42;\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'nord' },
    });

    // The same instance served the render — nothing was built per call.
    const after = await getSingletonHighlighter();
    expect(after).toBe(highlighter);
    // Exactly one theme arrived, and it is the one that was asked for: the
    // catalog was not loaded wholesale.
    expect(after.getLoadedThemes().filter((t) => !before.includes(t))).toEqual([
      'nord',
    ]);
  });

  it('does not reload a theme it already holds', async () => {
    await renderMarkdown('```js\nconst a = 1;\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'nord' },
    });
    const highlighter = await getSingletonHighlighter();
    const loaded = highlighter.getLoadedThemes();

    await renderMarkdown('```js\nconst b = 2;\n```', {
      settings: { ...DEFAULT_SETTINGS, codeTheme: 'nord' },
    });

    expect(highlighter.getLoadedThemes()).toEqual(loaded);
  });
});

describe('renderMarkdown — mermaid', () => {
  it('renders mermaid fences through the injected hook', async () => {
    const received: string[] = [];
    const { html } = await renderMarkdown('```mermaid\ngraph TD; A-->B\n```', {
      renderMermaid: async (code) => {
        received.push(code);
        return `<svg data-diagram="done"><desc>${code.trim()}</desc></svg>`;
      },
    });
    expect(received).toEqual(['graph TD; A-->B\n']);
    expect(html).toContain('data-diagram="done"');
    expect(html).toContain('graph TD; A--&gt;B');
    expect(html).not.toContain('language-mermaid');
  });

  it('renders mermaid as a plain code block without a hook', async () => {
    const { html } = await renderMarkdown('```mermaid\ngraph TD\n```');
    expect(html).toContain('language-mermaid');
    expect(html).toContain('graph TD');
  });

  it('falls back to a plain code block when the hook fails', async () => {
    const { html } = await renderMarkdown('```mermaid\ngraph TD\n```', {
      renderMermaid: async () => {
        throw new Error('mermaid exploded');
      },
    });
    expect(html).toContain('language-mermaid');
  });
});

describe('renderMarkdown — acceptance sample', () => {
  const SAMPLE = [
    '# Report',
    '',
    'See [details](#Details) below.',
    '',
    '## Details',
    '',
    '| Item | Qty |',
    '|------|-----|',
    '| Pen  | 2   |',
    '',
    '- [x] draft',
    '- [ ] review',
    '',
    '> [!WARNING]',
    '> Handle with care.',
    '',
    'Inline $a^2+b^2=c^2$ math.',
    '',
    '$$',
    '\\int_0^1 x\\,dx',
    '$$',
    '',
    '```js',
    'const answer = 42;',
    '```',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    '## Details',
    '',
    'Arabic paragraph: هذا نص عربي للتجربة.',
  ].join('\n');

  it('renders every feature into one clean HTML document', async () => {
    const { html } = await renderMarkdown(SAMPLE, {
      renderMermaid: async () => '<svg data-mermaid="1"></svg>',
    });

    expect(html).toContain('<h1 id="report"');
    expect(html).toContain('href="#details"');
    // Duplicate "Details" headings get deduplicated slug IDs.
    expect(html.match(/id="details(-1)?"/g)).toEqual([
      'id="details"',
      'id="details-1"',
    ]);
    expect(html).toContain('<table>');
    expect(html).toContain('task-list-item');
    expect(html).toContain('markdown-alert markdown-alert-warning');
    expect(html).toContain('katex-display');
    expect(html).toContain('class="shiki github-light"');
    expect(html).toContain('<svg data-mermaid="1">');
    expect(html).toContain('هذا نص عربي');
    expect(html).not.toContain('```');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('---');
  });

  it('exposes no frontmatter and requires no frontmatter settings', async () => {
    const { frontmatter } = await renderMarkdown(SAMPLE);
    expect(frontmatter).toBeNull();
  });
});
