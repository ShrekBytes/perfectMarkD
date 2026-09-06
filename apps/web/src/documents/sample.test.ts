// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@perfectmarkd/core';
import { runDocumentPipeline } from '../canvas/pipeline';
import { SAMPLE_MARKDOWN, sampleSettings } from './sample';

/**
 * The acceptance gate for the sample document: a fresh profile must render
 * more than one page quickly. jsdom measures zero-height content, so every
 * `///` section yields exactly one page — the page count here is the section
 * count, which is what guarantees multi-page output in a real browser too.
 */
describe('sample document', () => {
  it('paginates into multiple pages', async () => {
    const result = await runDocumentPipeline(
      SAMPLE_MARKDOWN,
      sampleSettings(),
      { title: 'Welcome to PerfectMarkD' },
    );

    expect(result.layouts.length).toBeGreaterThan(1);
    const labels = result.layouts.map(
      (layout) => `${layout.pageNum}/${layout.totalPages}`,
    );
    expect(labels[0]).toBe(`1/${result.layouts.length}`);
    expect(labels.at(-1)).toBe(
      `${result.layouts.length}/${result.layouts.length}`,
    );
  });

  it('showcases the engine feature set', () => {
    expect(SAMPLE_MARKDOWN).toContain('> [!NOTE]');
    expect(SAMPLE_MARKDOWN).toContain('> [!WARNING]');
    expect(SAMPLE_MARKDOWN).toMatch(/^\| .+\|$/m); // a table
    expect(SAMPLE_MARKDOWN).toContain('```ts');
    expect(SAMPLE_MARKDOWN).toContain('```mermaid');
    expect(SAMPLE_MARKDOWN).toMatch(/\$[^$]+\$/); // inline math
    expect(SAMPLE_MARKDOWN).toContain('$$'); // display math
    expect(SAMPLE_MARKDOWN).toContain('///'); // page breaks
  });

  it('renders alerts, math, and highlighting through the engine', async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN, {
      settings: sampleSettings(),
    });

    expect(html).toContain('markdown-alert');
    expect(html).toContain('katex');
    expect(html).toContain('class="shiki');
  });
});
