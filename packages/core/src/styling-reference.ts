// ─────────────────────────────────────────────────────────────────────────────
// The Custom Stylesheet's styling reference (ai-transforms/02).
//
// The stable contract a Custom Stylesheet may rely on, owned by the engine so
// the reference is maintained with the engine and can never describe something
// the builder stopped emitting: the .mpdf-doc-scoped CSS variables and the
// content selectors buildDocCSS emits, held as data (the drift test in
// styling-reference.test.ts asserts every name really appears in the built
// CSS) and rendered as the markdown section the Docs page shows
// (buildStylingReferenceMarkdown). Everything the lists do not name is
// internal and free to change.
// ─────────────────────────────────────────────────────────────────────────────

/** One documented name of the stable contract. */
export interface StylingReferenceEntry {
  /** The variable or selector, exactly as a stylesheet writes it. */
  name: string;
  /** One line on what the name holds or targets. */
  description: string;
}

/** The `.mpdf-doc`-scoped custom properties the CSS builder emits: the
 *  settings-derived values (typography, spacing, and the colors) the
 *  generated rules read. Redefining one — on `.mpdf-doc` or any scoped
 *  selector — restyles the Document everywhere the value is used, so a
 *  Custom Stylesheet can override the Preset's typography and colors
 *  wholesale. */
export const STYLING_REFERENCE_VARIABLES: readonly StylingReferenceEntry[] = [
  {
    name: '--mpdf-font',
    description: 'The body font family — the Document’s font setting.',
  },
  {
    name: '--mpdf-font-size',
    description: 'The body font size in px.',
  },
  {
    name: '--mpdf-line-height',
    description: 'The body line height.',
  },
  {
    name: '--mpdf-paragraph-spacing',
    description:
      'The space below paragraphs, lists, tables, and code blocks, in em.',
  },
  {
    name: '--mpdf-body-color',
    description: 'The body text color.',
  },
  {
    name: '--mpdf-heading-color',
    description: 'The heading text color (h1–h6).',
  },
  {
    name: '--mpdf-bold-color',
    description: 'The color of bold text (strong and b).',
  },
  {
    name: '--mpdf-accent',
    description:
      'The accent color: links, inline code, rules, table borders, alerts.',
  },
  {
    name: '--mpdf-code-background',
    description: 'The background of inline code and code blocks.',
  },
  {
    name: '--mpdf-code-font',
    description: 'The code font family — the Document’s code font setting.',
  },
  {
    name: '--mpdf-code-font-size',
    description: 'The code font size, in em relative to the body font size.',
  },
  {
    name: '--mpdf-blockquote-background',
    description: 'The blockquote background fill.',
  },
  {
    name: '--mpdf-blockquote-border',
    description: 'The blockquote’s accent edge color.',
  },
  {
    name: '--mpdf-table-header-background',
    description: 'The table header row’s background.',
  },
];

/** The `.mpdf-page`-scoped custom properties the page-chrome rules emit: the
 *  page-level style values (paper, band text, frame) a Custom Stylesheet can
 *  override the same way — redefining one restyles every page. */
export const STYLING_REFERENCE_PAGE_VARIABLES: readonly StylingReferenceEntry[] =
  [
    {
      name: '--mpdf-page-background',
      description: 'The paper color behind every page’s content.',
    },
    {
      name: '--mpdf-header-color',
      description: 'The header band’s text color.',
    },
    {
      name: '--mpdf-footer-color',
      description: 'The footer band’s text color.',
    },
    {
      name: '--mpdf-frame-color',
      description: 'The page frame’s color (when the frame is enabled).',
    },
  ];

/** The content selectors a stylesheet is likely to need, all scoped under the
 *  document root. The builder emits each of these in every build. */
export const STYLING_REFERENCE_SELECTORS: readonly StylingReferenceEntry[] = [
  {
    name: '.mpdf-doc h1',
    description:
      'Level-1 heading; the Style tab’s underline and centering apply here.',
  },
  {
    name: '.mpdf-doc h2',
    description:
      'Level-2 heading; the Style tab’s hairline underline applies here.',
  },
  { name: '.mpdf-doc h3', description: 'Level-3 heading.' },
  { name: '.mpdf-doc h4', description: 'Level-4 heading (uppercase).' },
  { name: '.mpdf-doc h5', description: 'Level-5 heading (italic).' },
  { name: '.mpdf-doc h6', description: 'Level-6 heading (italic, faded).' },
  { name: '.mpdf-doc p', description: 'A paragraph.' },
  {
    name: '.mpdf-doc strong',
    description: 'Bold text (and b); carries the bold color.',
  },
  { name: '.mpdf-doc em', description: 'Italic text (and i).' },
  { name: '.mpdf-doc mark', description: 'Highlighted text (==mark==).' },
  { name: '.mpdf-doc del', description: 'Strikethrough text (and s).' },
  {
    name: '.mpdf-doc blockquote',
    description: 'A blockquote: accent edge, background fill, italic.',
  },
  { name: '.mpdf-doc ul', description: 'An unordered list.' },
  { name: '.mpdf-doc ol', description: 'An ordered list.' },
  { name: '.mpdf-doc li', description: 'A list item.' },
  { name: '.mpdf-doc table', description: 'A table (GFM tables included).' },
  { name: '.mpdf-doc th', description: 'A table header cell.' },
  { name: '.mpdf-doc td', description: 'A table body cell.' },
  { name: '.mpdf-doc pre', description: 'A fenced code block.' },
  {
    name: '.mpdf-doc code',
    description: 'Inline code, and the code inside fenced blocks.',
  },
  { name: '.mpdf-doc a', description: 'A link; carries the accent color.' },
  { name: '.mpdf-doc img', description: 'An image, centred.' },
  { name: '.mpdf-doc hr', description: 'A horizontal rule.' },
  {
    name: '.mpdf-doc .markdown-alert',
    description:
      'A GFM alert (> [!NOTE] and friends): accent edge and tinted panel.',
  },
  {
    name: '.mpdf-doc .markdown-alert-title',
    description: 'A GFM alert’s title band.',
  },
  {
    name: '.mpdf-doc .mermaid',
    description: 'A rendered mermaid diagram’s container.',
  },
  {
    name: '.mpdf-page',
    description:
      'The page box itself: carries the paper background and the page-chrome variables.',
  },
  {
    name: '.mpdf-page-header-text',
    description:
      'The header text band; carries the header font size and color.',
  },
  {
    name: '.mpdf-page-footer-text',
    description:
      'The footer text band; carries the footer font size and color.',
  },
  {
    name: '.mpdf-page-frame',
    description:
      'The page-edge frame (only emitted while the frame is enabled).',
  },
];

/** The reference section's heading on the Docs page. The Stylesheet tab's
 *  footer link targets its anchor. */
export const STYLING_REFERENCE_HEADING = 'Styling reference';

/** The anchor slug the markdown renderer assigns the section heading
 *  (pinned by the drift test through the real renderer). */
export const STYLING_REFERENCE_ANCHOR = 'styling-reference';

/** Renders the two lists as a definition table. */
function entryTable(
  entries: readonly StylingReferenceEntry[],
  columnHead: string,
): string {
  const rows = entries
    .map((entry) => `| \`${entry.name}\` | ${entry.description} |`)
    .join('\n');
  return `| ${columnHead} | Holds or targets |\n| --- | --- |\n${rows}`;
}

/**
 * Builds the styling reference's markdown — the Docs page section the
 * Stylesheet tab links to. Generated from the lists above, so the rendered
 * section and the drift-tested contract are the same data.
 */
export function buildStylingReferenceMarkdown(): string {
  return `## ${STYLING_REFERENCE_HEADING}

A Custom Stylesheet is your own CSS, layered over the rules the engine
generates from a Document's style values. This section is the stable
contract: the variables and selectors below are safe to rely on, and a change
that removes one is a bug. Everything not listed here is internal and free to
change between versions.

### CSS variables

The generated rules read these custom properties, so a redefinition is an
override: set one on \`.mpdf-doc\` (or \`.mpdf-page\`, for the page-chrome
values) and the whole Document or page follows — no need to restate each
rule.

${entryTable(STYLING_REFERENCE_VARIABLES, 'Variable')}

${entryTable(STYLING_REFERENCE_PAGE_VARIABLES, 'Page variable')}

\`\`\`css
/* Example: quotes that pick up the Document's accent */
.mpdf-doc blockquote {
  border-inline-start-color: var(--mpdf-accent);
}
/* Example: override the Preset's typography and the paper in one place */
.mpdf-doc { --mpdf-font-size: 16px; --mpdf-body-color: #222; }
.mpdf-page { --mpdf-page-background: #faf7f2; }
\`\`\`

### Selectors

Every content selector is scoped under the document root, \`.mpdf-doc\`; the
page-chrome selectors under the page box, \`.mpdf-page\`.

${entryTable(STYLING_REFERENCE_SELECTORS, 'Selector')}

### What is not CSS

Page geometry — paper size, orientation, and margins — stays an Inspector
setting (the Page tab), not CSS. The Custom Stylesheet can restyle the paper,
the header/footer bands, and the page frame, but it cannot move them: the
engine sizes and places every page element so the preview and the PDF stay
pixel-identical. \`@page\` rules are ignored: they are stripped from the
stylesheet before it is applied, because a rule obeyed in the print only
would silently split the preview from the PDF.`;
}
