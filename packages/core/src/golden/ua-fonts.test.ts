// ─────────────────────────────────────────────────────────────────────────────
// No element the renderer can emit resolves its font through a generic family
// (launch/09).
//
// The golden documents cover the shapes the paginator splits. They do not
// cover every element a Document can contain, and that gap hid this defect
// class twice: `pre`, then `kbd`/`samp`/`tt`, each left on the UA stylesheet's
// `monospace` — so their metrics came from the host while everything around
// them came from the Document (launch/07, launch/09).
//
// `markdown-it` runs with `html: true`, so the set is not "the elements
// markdown syntax produces": a Document can carry any inline HTML. This walks
// a document built from the elements the engine's own CSS is expected to meet,
// including the ones no golden fixture uses, and fails on any that falls
// through.
//
// Form controls are deliberately out of scope: they take a *named* UA family
// (`Arial`) rather than a generic one, so this check cannot see them, and the
// renderer emits only a task-list checkbox, which paints no text.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, describe, expect, it } from 'vitest';

import { presetSettings } from './documents.js';
import { closeBrowser, genericFontElements, runPipeline } from './harness.js';

afterAll(async () => {
  await closeBrowser();
});

/** One of every text-bearing element the doc CSS is expected to meet. Raw
 *  HTML for the inline ones — no markdown syntax produces `<kbd>` — and
 *  markdown for the block shapes, so the fixture is written the way a
 *  Document would be. */
const EVERY_ELEMENT = [
  '# Heading one',
  '',
  '## Heading two',
  '',
  '### Heading three',
  '',
  '#### Heading four',
  '',
  '##### Heading five',
  '',
  '###### Heading six',
  '',
  'A paragraph with <strong>strong</strong>, <b>b</b>, <em>em</em>, <i>i</i>,',
  '<del>del</del>, <s>s</s>, <mark>mark</mark>, <sub>sub</sub>, <sup>sup</sup>,',
  '<small>small</small>, <abbr>abbr</abbr>, <q>q</q>, <cite>cite</cite>,',
  '<code>code</code>, <kbd>kbd</kbd>, <samp>samp</samp>, <tt>tt</tt>,',
  '<var>var</var>, <a href="https://example.com">a link</a>, and <span>a span</span>.',
  '',
  '- item one',
  '- item two',
  '',
  '1. item one',
  '2. item two',
  '',
  '> a quote',
  '',
  '---',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '| Head | Cell |',
  '| ---- | ---- |',
  '| a    | b    |',
  '',
  '> [!NOTE]',
  '> An alert, which carries its own title band.',
].join('\n');

describe('element fonts (launch/09)', () => {
  it('gives every element a font the document owns', async () => {
    const result = await runPipeline(EVERY_ELEMENT, presetSettings('default'), {
      title: 'Elements',
    });
    // Names the element and the family it fell through to, so a failure here
    // says which rule the engine is missing rather than just that one is.
    expect(await genericFontElements(result.exportHTML)).toEqual([]);
  }, 120_000);
});
