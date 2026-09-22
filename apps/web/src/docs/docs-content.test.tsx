// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

// The docs render through the engine's markdown renderer, whose mermaid hook
// lazy-imports the multi-megabyte bundle — swap in the test stub like the
// shell suites do.
vi.mock('../canvas/mermaid', async () => {
  const { stubMermaidModule } = await import('../testing/stub-mermaid');
  return stubMermaidModule;
});

import {
  STYLING_REFERENCE_ANCHOR,
  STYLING_REFERENCE_SELECTORS,
  STYLING_REFERENCE_VARIABLES,
} from '@perfectmarkd/core';
import { loadDocsContent, sectionNavFromHtml } from './docs-content';

describe('loadDocsContent', () => {
  it('renders every section from the single markdown source, in order', async () => {
    const { sections } = await loadDocsContent();
    expect(sections.map((s) => s.title)).toEqual([
      'Getting started',
      'Page Breaks',
      'Presets and style settings',
      'Math, diagrams, and tables',
      'Fonts',
      'Exporting',
      'Plans, Quota, and Comps',
      'Self-hosting',
      'Privacy FAQ',
      'Styling reference',
    ]);
  });

  it('maps each section heading to a unique anchor id', async () => {
    const { sections } = await loadDocsContent();
    const ids = sections.map((s) => s.id);
    expect(ids.every((id) => id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('getting-started');
  });

  it('carries the engine-owned styling reference at its anchor', async () => {
    const { html, sections } = await loadDocsContent();
    expect(sections.at(-1)).toEqual({
      id: STYLING_REFERENCE_ANCHOR,
      title: 'Styling reference',
    });
    expect(html).toContain(`id="${STYLING_REFERENCE_ANCHOR}"`);
  });

  it('renders the drift-tested contract names, the @page note, and the internal statement', async () => {
    const { html } = await loadDocsContent();
    for (const { name } of STYLING_REFERENCE_VARIABLES) {
      expect(html).toContain(name);
    }
    for (const { name } of STYLING_REFERENCE_SELECTORS) {
      expect(html).toContain(name);
    }
    expect(html).toContain('@page');
    // Source-line wraps surface as whitespace in the rendered HTML.
    expect(html).toMatch(/internal and free\s+to\s+change/);
  });

  it('renders math, diagrams, and tables through the engine', async () => {
    const { html } = await loadDocsContent();
    // Math: KaTeX typeset (not a bare $E = mc^2$ string).
    expect(html).toContain('class="katex"');
    // Diagram: the mermaid hook's SVG swapped into the fence.
    expect(html).toContain('<svg data-test-mermaid');
    // GFM table.
    expect(html).toContain('<table>');
  });
});

describe('sectionNavFromHtml', () => {
  it('takes only h2s, in document order, dropping id-less headings', () => {
    const nav = sectionNavFromHtml(
      '<h2 id="a">First</h2><h3 id="b">Skipped</h3><h2 id="c">Second</h2><h2>No id</h2>',
    );
    expect(nav).toEqual([
      { id: 'a', title: 'First' },
      { id: 'c', title: 'Second' },
    ]);
  });
});
