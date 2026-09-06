// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  buildDocCSS,
  resolvePageGeometry,
} from '@perfectmarkd/core';
import {
  applyAutoBreaks,
  collectAssetRefs,
  runDocumentPipeline,
} from './pipeline';

describe('applyAutoBreaks', () => {
  it('is a no-op when both auto-break settings are off', () => {
    const md = '# One\n\ntext\n\n## Two\n';
    expect(applyAutoBreaks(md, DEFAULT_SETTINGS)).toBe(md);
  });

  it('inserts a page break before H1s when autoBreakH1 is on', () => {
    const md = 'intro\n\n# Chapter\n\ntext';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe('intro\n\n///\n# Chapter\n\ntext');
  });

  it('inserts a page break before H2s when autoBreakH2 is on', () => {
    const md = '# Chapter\n\n## Section\n\ntext';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH2: true });
    expect(out).toBe('# Chapter\n\n///\n## Section\n\ntext');
  });

  it('does not break before H3+ headings or non-heading # lines', () => {
    const md = '### tiny\n\n# tag\n';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe('### tiny\n\n///\n# tag\n');
  });

  it('skips headings inside fenced code blocks', () => {
    const md = 'text\n\n```md\n# not a heading\n```\n\n# real heading\n';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe(
      'text\n\n```md\n# not a heading\n```\n\n///\n# real heading\n',
    );
  });

  it('tracks tilde fences as well as backticks', () => {
    const md = '~~~\n# not a heading\n~~~\n\n# real heading\n';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe('~~~\n# not a heading\n~~~\n\n///\n# real heading\n');
  });

  it('does not insert before the first line of the document', () => {
    const md = '# Title\n\nbody';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe('# Title\n\nbody');
  });

  it('does not double-break when a break marker is already present', () => {
    const md = 'intro\n\n///\n# Chapter\n';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe(md);
  });

  it('normalizes CRLF line endings', () => {
    const md = 'intro\r\n\r\n# Chapter\r\n';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe('intro\n\n///\n# Chapter\n');
  });

  it('does not confuse indented code blocks (four spaces) with headings', () => {
    const md = 'text\n\n    # not a heading\n\n# real heading\n';
    const out = applyAutoBreaks(md, { ...DEFAULT_SETTINGS, autoBreakH1: true });
    expect(out).toBe('text\n\n    # not a heading\n\n///\n# real heading\n');
  });
});

describe('collectAssetRefs', () => {
  it('collects asset:// refs from markdown image syntax', () => {
    const md = '![alt](asset://abc) and ![](asset://def)';
    expect(collectAssetRefs(md, DEFAULT_SETTINGS)).toEqual([
      'asset://abc',
      'asset://def',
    ]);
  });

  it('deduplicates refs', () => {
    const md = '![a](asset://abc)\n\n![b](asset://abc)';
    expect(collectAssetRefs(md, DEFAULT_SETTINGS)).toEqual(['asset://abc']);
  });

  it('includes the settings banner/background refs', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      headerImageRef: 'asset://head',
      footerImageRef: 'asset://foot',
      backgroundImageRef: 'asset://bg',
    };
    expect(collectAssetRefs('', s).sort()).toEqual([
      'asset://bg',
      'asset://foot',
      'asset://head',
    ]);
  });

  it('ignores remote and relative image targets', () => {
    const md = '![x](https://example.com/i.png) ![y](local.png)';
    expect(collectAssetRefs(md, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('stops refs at markdown syntax boundaries', () => {
    const md = '![a](asset://abc "title")';
    expect(collectAssetRefs(md, DEFAULT_SETTINGS)).toEqual(['asset://abc']);
  });
});

describe('runDocumentPipeline', () => {
  it('returns a single empty page for a blank document', async () => {
    const result = await runDocumentPipeline('', DEFAULT_SETTINGS, {
      title: 'Doc',
    });
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0]!.pageNodes).toHaveLength(0);
    expect(result.layouts[0]!.pageNum).toBe(1);
    expect(result.layouts[0]!.totalPages).toBe(1);
  });

  it('renders markdown into page nodes with heading slugs', async () => {
    const result = await runDocumentPipeline(
      '# Hello\n\nWorld.',
      DEFAULT_SETTINGS,
      {
        title: 'Doc',
      },
    );
    const nodes = result.layouts[0]!.pageNodes;
    expect(nodes.map((n) => n.tagName)).toEqual(['H1', 'P']);
    expect(nodes[0]!.id).toBe('hello');
  });

  it('splits sections on /// page breaks into separate pages', async () => {
    const md = 'one\n\n///\n\ntwo\n\n///\n\nthree';
    const result = await runDocumentPipeline(md, DEFAULT_SETTINGS, {
      title: 'Doc',
    });
    expect(result.layouts).toHaveLength(3);
    expect(result.layouts.map((l) => l.pageNodes[0]?.textContent)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('auto-breaks before H1s when autoBreakH1 is on', async () => {
    const md = '# One\n\ntext\n\n# Two';
    const result = await runDocumentPipeline(
      md,
      { ...DEFAULT_SETTINGS, autoBreakH1: true },
      { title: 'Doc' },
    );
    expect(result.layouts).toHaveLength(2);
  });

  it('detects RTL from the raw markdown and reflects it in docCSS', async () => {
    const md = '# مرحبا\n\nهذا نص عربي طويل enough to tip the ratio';
    const result = await runDocumentPipeline(md, DEFAULT_SETTINGS, {
      title: 'Doc',
    });
    expect(result.isRTL).toBe(true);
    expect(result.docCSS).toBe(buildDocCSS(DEFAULT_SETTINGS, true));
  });

  it('exposes the shared page geometry for the settings', async () => {
    const result = await runDocumentPipeline('hi', DEFAULT_SETTINGS, {
      title: 'Doc',
    });
    expect(result.geometry).toEqual(resolvePageGeometry(DEFAULT_SETTINGS));
  });

  it('forwards the mermaid hook to the renderer', async () => {
    const hook = vi.fn().mockResolvedValue('<svg id="diagram"></svg>');
    const result = await runDocumentPipeline(
      '```mermaid\ngraph TD\n```\n',
      DEFAULT_SETTINGS,
      { title: 'Doc', renderMermaid: hook },
    );
    expect(hook).toHaveBeenCalledWith('graph TD\n');
    // The hook's markup replaces the fence placeholder wholesale, so the
    // rendered SVG is the section's top-level node.
    expect(result.layouts[0]!.pageNodes[0]!.tagName.toLowerCase()).toBe('svg');
  });

  it('honors hideFrontmatter from settings', async () => {
    const md = '---\ntitle: Secret\n---\n\nbody';
    const shown = await runDocumentPipeline(md, DEFAULT_SETTINGS, {
      title: 'Doc',
    });
    expect(shown.layouts[0]!.pageNodes[0]!.textContent).toContain('title');

    const hidden = await runDocumentPipeline(
      md,
      { ...DEFAULT_SETTINGS, hideFrontmatter: true },
      { title: 'Doc' },
    );
    expect(hidden.layouts[0]!.pageNodes.map((n) => n.textContent)).toEqual([
      'body',
    ]);
  });
});
