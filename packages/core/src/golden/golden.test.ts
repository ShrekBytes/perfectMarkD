// ─────────────────────────────────────────────────────────────────────────────
// Engine golden regression suite (engine-port/08).
//
// Real Chromium, via the Playwright harness: each golden document runs
// through the full pipeline (render → paginate → layouts → exportHTML) and
// its laid-out shape is captured in a golden file next to this test. The
// golden files record page counts, per-page top-level structure, headings
// per page, the outline, and measured content heights. Alongside each
// golden snapshot, structural invariants are asserted outright (no node
// extends past the content box; outline entries carry the right pages) —
// these catch regressions golden files alone could hide.
//
// Update golden files after a *deliberate* engine change:
//   pnpm --filter @perfectmarkd/core test:golden:update
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, describe, expect, it } from 'vitest';

import { PRESETS } from '../settings.js';
import {
  closeBrowser,
  genericFontElements,
  measureExport,
  runPipeline,
} from './harness.js';
import {
  CODE_HEAVY,
  FEATURE_MATRIX,
  LIST_HEAVY,
  LONG_PROSE,
  RTL_DOC,
  SECTION_BREAKS,
  TABLE_HEAVY,
  customSizeSettings,
  presetSettings,
} from './documents.js';

/** The digest a golden file stores for one document run. */
function digest(result: {
  pageCount: number;
  pages: { sigs: string[]; headings: { text: string; level: number }[] }[];
  outline: { title: string; level: number; page: number }[];
  contentHeights: number[];
  violations: { page: number; tag: string }[];
}) {
  return {
    pageCount: result.pageCount,
    pages: result.pages,
    outline: result.outline,
    contentHeights: result.contentHeights,
  };
}

/** Structural invariants every golden document must satisfy: content never
 *  extends past its page's content box in the pipeline's measurement *and*
 *  in a fresh layout of the export document (the two could diverge if
 *  export positioning drifts from pagination geometry), and no element in
 *  the laid-out document resolves its font through a generic keyword —
 *  which the host answers, so a measurement that depends on it is a
 *  measurement the machine owns (launch/07). */
async function expectSoundLayout(
  result: {
    violations: { page: number; tag: string }[];
    exportHTML: string;
  },
  label: string,
): Promise<void> {
  expect(result.violations, `${label}: no node past the content box`).toEqual(
    [],
  );
  const remeasured = await measureExport(result.exportHTML);
  expect(
    remeasured.violations,
    `${label}: export document layout overflows its pages`,
  ).toEqual([]);
  expect(
    await genericFontElements(result.exportHTML),
    `${label}: no element falls back to a generic font family`,
  ).toEqual([]);
}

afterAll(async () => {
  await closeBrowser();
});

describe('golden: long prose (inline splitter)', () => {
  it('paginates LONG_PROSE identically', async () => {
    const result = await runPipeline(LONG_PROSE, presetSettings('default'), {
      title: 'Long Prose',
    });
    await expectSoundLayout(result, 'long prose');
    // All 25 headings (1 H1 + 24 H2) land in the outline.
    expect(result.outline).toHaveLength(25);
    expect(result.outline[0]).toMatchObject({
      title: 'The Long Prose Document',
      level: 1,
    });
    expect(result.pageCount).toBeGreaterThan(3);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/long-prose.snapshot.md',
    );
  }, 120_000);
});

describe('golden: table-heavy (table splitter)', () => {
  it('splits the 60-row table and replicates thead', async () => {
    const result = await runPipeline(TABLE_HEAVY, presetSettings('default'), {
      title: 'Tables',
    });
    await expectSoundLayout(result, 'tables');
    // The table must cross at least one boundary: more than one page
    // carries a TABLE node, and every fragment replicates the thead.
    const tablePages = result.pages.filter((p) =>
      p.sigs.some((s) => s.startsWith('TABLE[')),
    );
    expect(result.pageCount).toBeGreaterThan(1);
    expect(tablePages.length).toBeGreaterThan(1);
    for (const page of tablePages) {
      for (const sig of page.sigs.filter((s) => s.startsWith('TABLE['))) {
        expect(sig, 'table fragment replicates thead').toMatch(/\+th\]$/);
      }
    }
    expect(result.outline).toHaveLength(1);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/table-heavy.snapshot.md',
    );
  }, 120_000);
});

describe('golden: list-heavy (list splitter)', () => {
  it('splits lists with OL numbering continuity', async () => {
    const result = await runPipeline(LIST_HEAVY, presetSettings('default'), {
      title: 'Lists',
    });
    await expectSoundLayout(result, 'lists');
    expect(result.pageCount).toBeGreaterThan(2);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/list-heavy.snapshot.md',
    );
  }, 120_000);
});

describe('golden: code-heavy (pre splitter)', () => {
  it('splits code blocks by line', async () => {
    const result = await runPipeline(CODE_HEAVY, presetSettings('default'), {
      title: 'Code',
    });
    await expectSoundLayout(result, 'code');
    expect(result.pageCount).toBeGreaterThan(2);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/code-heavy.snapshot.md',
    );
  }, 120_000);
});

describe('golden: math + mermaid + GFM feature matrix', () => {
  it('renders the full feature matrix', async () => {
    const result = await runPipeline(
      FEATURE_MATRIX,
      presetSettings('default'),
      {
        title: 'Features',
        renderMermaid: true,
      },
    );
    await expectSoundLayout(result, 'feature matrix');
    // Mermaid SVG present in the export document.
    expect(result.exportHTML).toContain('<svg');
    // KaTeX present (span.katex is its wrapper).
    expect(result.exportHTML).toContain('class="katex"');
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/feature-matrix.snapshot.md',
    );
  }, 180_000);
});

describe('golden: /// page breaks', () => {
  it('starts each section on a fresh page', async () => {
    const result = await runPipeline(
      SECTION_BREAKS,
      presetSettings('default'),
      {
        title: 'Sections',
      },
    );
    await expectSoundLayout(result, 'section breaks');
    // Three sections, each beginning with its H1 at a page top: the first
    // heading of a page that opens a section is that section's H1.
    const sectionStartPages = result.pages.filter((p) =>
      p.headings.some((h) => h.level === 1 && h.text === p.headings[0]?.text),
    );
    expect(sectionStartPages.map((p) => p.headings[0]!.text)).toEqual([
      'Sectioned Document',
      'Second Section',
      'Third Section',
    ]);
    // The outline carries the three H1s.
    expect(result.outline.filter((o) => o.level === 1)).toHaveLength(3);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/section-breaks.snapshot.md',
    );
  }, 120_000);
});

describe('golden: custom page size + landscape', () => {
  it('paginates against the custom geometry', async () => {
    const result = await runPipeline(LONG_PROSE, customSizeSettings(), {
      title: 'Custom Size',
    });
    await expectSoundLayout(result, 'custom size');
    // Landscape A5-ish: 210mm × 148mm → 794×559px page. More pages than
    // portrait A4 for the same prose.
    expect(result.pageCount).toBeGreaterThan(6);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/custom-size.snapshot.md',
    );
  }, 120_000);
});

describe('golden: RTL document', () => {
  it('detects RTL and paginates direction-flipped', async () => {
    const result = await runPipeline(RTL_DOC, presetSettings('default'), {
      title: 'RTL',
    });
    await expectSoundLayout(result, 'rtl');
    // The export document carries dir="rtl".
    expect(result.exportHTML).toContain('dir="rtl"');
    expect(result.pageCount).toBeGreaterThan(1);
    await expect(digest(result)).toMatchFileSnapshot(
      './goldens/rtl.snapshot.md',
    );
  }, 120_000);
});

describe('golden: all 7 presets over the feature matrix', () => {
  // Object.keys order is insertion order, matching PRESETS' declaration —
  // and the list can never drift from the settings themselves.
  const PRESET_NAMES = Object.keys(PRESETS);

  for (const preset of PRESET_NAMES) {
    it(`paginates FEATURE_MATRIX under preset "${preset}"`, async () => {
      // Mermaid + math under every preset (the ticket's feature matrix
      // lists both under "all 7 presets"): preset CSS changes heights, so
      // each preset's page count is its own golden value. Mermaid's SVG is
      // identical across presets, but its *fit* inside each preset's
      // content box is what the golden captures.
      const result = await runPipeline(FEATURE_MATRIX, presetSettings(preset), {
        title: `Preset ${preset}`,
        renderMermaid: true,
      });
      await expectSoundLayout(result, `preset ${preset}`);
      await expect(digest(result)).toMatchFileSnapshot(
        `./goldens/preset-${preset}.snapshot.md`,
      );
    }, 180_000);
  }
});

describe('golden: code-heavy under each Shiki code theme', () => {
  // The ticket's "code-heavy (each theme)": the six code themes the
  // presets carry plus the 'none' plain renderer, over a code document
  // that must split across pages. Shiki themes change only inline token
  // colors (not line counts), so page structure stays constant while the
  // run proves every theme renders without breaking pagination.
  const CODE_THEMES = [
    'none',
    'github-light',
    'github-dark',
    'solarized-light',
    'dracula',
    'tokyo-night',
  ];

  for (const theme of CODE_THEMES) {
    it(`paginates CODE_HEAVY under code theme "${theme}"`, async () => {
      const result = await runPipeline(
        CODE_HEAVY,
        presetSettings('default', { codeTheme: theme }),
        { title: `Theme ${theme}` },
      );
      await expectSoundLayout(result, `code theme ${theme}`);
      expect(result.pageCount).toBeGreaterThan(2);
      await expect(digest(result)).toMatchFileSnapshot(
        `./goldens/code-theme-${theme}.snapshot.md`,
      );
    }, 120_000);
  }
});
