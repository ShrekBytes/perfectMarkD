// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildDocCSS,
  buildStylingReferenceMarkdown,
  DEFAULT_SETTINGS,
  renderMarkdown,
  STYLING_REFERENCE_ANCHOR,
  STYLING_REFERENCE_HEADING,
  STYLING_REFERENCE_SELECTORS,
  STYLING_REFERENCE_VARIABLES,
  type DocumentSettings,
} from './index';

/** Settings with every branch of buildDocCSS enabled: both heading
 *  decorations, centering, striped tables, ligatures, RTL, and the Custom
 *  Stylesheet layer on. Distinctive colors so the value assertions bite. */
const everyBranch: DocumentSettings = {
  ...DEFAULT_SETTINGS,
  h1BorderBottom: true,
  h2BorderBottom: true,
  centerH1: true,
  tableStriped: true,
  codeFontLigatures: true,
  accentColor: '#0af0af',
  bodyColor: '#010203',
  headingColor: '#040506',
  boldColor: '#070809',
  codeBackground: '#0a0b0c',
  blockquoteBg: '#0d0e0f',
  tableHeaderBg: '#101112',
  customStylesheet: '.mpdf-doc p { color: #010203; }',
  customStylesheetEnabled: true,
};

describe('styling reference — the drift test (ai-transforms/02)', () => {
  /** One CSS build with every settings branch on: a name the reference
   *  documents must appear in exactly this output, so the reference can never
   *  describe something the engine stopped emitting. Documenting fewer names
   *  than the engine emits passes — the assertion is one-directional. */
  const css = buildDocCSS(everyBranch, true);

  /** The name as a literal regex fragment (the dots in selector names are
   *  literals, not any-char matches). */
  const literal = (name: string): string => name.replace(/\./g, '\\.');

  it('defines every documented variable on .mpdf-doc', () => {
    for (const { name } of STYLING_REFERENCE_VARIABLES) {
      // Inside the one root rule — the documented scope — and as a
      // definition, not a var() mention.
      expect(css).toMatch(new RegExp(`\\.mpdf-doc \\{[^}]*${literal(name)}: `));
    }
  });

  it('emits the documented variables with the settings-derived values', () => {
    expect(css).toContain('--mpdf-accent: #0af0af;');
    expect(css).toContain('--mpdf-body-color: #010203;');
    expect(css).toContain('--mpdf-heading-color: #040506;');
    expect(css).toContain('--mpdf-bold-color: #070809;');
    expect(css).toContain('--mpdf-code-background: #0a0b0c;');
    expect(css).toContain('--mpdf-blockquote-background: #0d0e0f;');
    expect(css).toContain('--mpdf-table-header-background: #101112;');
    expect(css).toContain('--mpdf-font: Georgia, serif;');
    expect(css).toContain('--mpdf-font-size: 13px;');
    expect(css).toContain('--mpdf-line-height: 1.85;');
    expect(css).toContain('--mpdf-paragraph-spacing: 0.65em;');
    expect(css).toContain("--mpdf-code-font: 'Courier New', monospace;");
  });

  it('emits every documented selector', () => {
    for (const { name } of STYLING_REFERENCE_SELECTORS) {
      // Word-bounded: `.mpdf-doc p` must not match inside `.mpdf-doc pre`,
      // and grouped selectors list with commas (`.mpdf-doc strong, …`).
      expect(css).toMatch(new RegExp(`${literal(name)}(?![a-z-])`));
    }
  });
});

describe('buildStylingReferenceMarkdown', () => {
  const markdown = buildStylingReferenceMarkdown();

  it('names every drift-tested variable and selector', () => {
    // The section the Docs page renders is generated from the same lists the
    // drift test checks, so each name must appear in the rendered text too.
    for (const { name } of STYLING_REFERENCE_VARIABLES) {
      expect(markdown).toContain(name);
    }
    for (const { name } of STYLING_REFERENCE_SELECTORS) {
      expect(markdown).toContain(name);
    }
  });

  it('marks everything else as internal and states the Inspector’s turf', () => {
    // Whitespace-tolerant: the phrase may wrap across source lines.
    expect(markdown).toMatch(/internal and free\s+to\s+change/);
    expect(markdown).toContain('Inspector settings');
    // @page named as ignored, in its own right.
    expect(markdown).toContain('@page');
  });

  it('opens with the section heading the Stylesheet tab links to', () => {
    expect(markdown).toMatch(
      new RegExp(`^## ${STYLING_REFERENCE_HEADING}$`, 'm'),
    );
  });
});

describe('STYLING_REFERENCE_ANCHOR', () => {
  it('is the id the renderer assigns the section heading', async () => {
    // The whole chain the tab's link relies on: heading text → slug → anchor.
    const { html } = await renderMarkdown(
      `# Docs\n\n## ${STYLING_REFERENCE_HEADING}\n\nBody text.\n`,
    );
    expect(html).toContain(`id="${STYLING_REFERENCE_ANCHOR}"`);
  });
});
