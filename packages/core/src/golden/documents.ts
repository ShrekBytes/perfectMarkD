// ─────────────────────────────────────────────────────────────────────────────
// Golden documents: the markdown + settings pairs the real-Chromium suite
// paginates. Each is chosen to stress a different paginator splitter or
// settings axis, per engine-port/08:
//
//   long prose   → inline splitter (word-boundary binary search) across
//                  page boundaries
//   tables       → table splitter (body rows, thead replication)
//   lists        → list splitter (OL start continuity)
//   code         → pre splitter (line split, highlight-span preservation)
//   math+mermaid → full feature matrix in one document
//   /// breaks   → section splitting, each section paginating fresh
//   custom size  → geometry derivation (mm → px, orientation)
//   RTL          → direction flip end to end
//   7 presets    → every preset styles the same document, exercising the
//                  CSS builder's effect on real layout
//
// Golden page counts assert stability: if pagination changes, these numbers
// are what must be re-verified by a human against the intent (a regression
// is any change that isn't a deliberate engine improvement).
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_SETTINGS,
  PRESETS,
  type DocumentSettings,
} from '../settings.js';

/** A settings object with the given preset applied over the defaults. */
export function presetSettings(
  preset: string,
  overrides: Partial<DocumentSettings> = {},
): DocumentSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...PRESETS[preset]!,
    preset,
    ...overrides,
  };
}

// ─── Long prose ───────────────────────────────────────────────────────────────

/** ~2.5 pages of flowing paragraphs under the default preset — the inline
 *  splitter's workout: paragraphs straddle page boundaries and split at word
 *  boundaries with character-level fallbacks. */
export const LONG_PROSE = [
  '# The Long Prose Document',
  '',
  'This document exists to make the paginator work. Its paragraphs are long enough to wrap several times at A4 width, and there are enough of them to spill across several pages, so the inline text splitter has to find word boundaries mid-paragraph and push remainders onto the next page without losing or duplicating a single character.',
  '',
  ...Array.from({ length: 24 }, (_, i) =>
    [
      `## Section ${i + 1}`,
      '',
      `Paragraph ${i + 1}a. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump! Sphinx of black quartz, judge my vow. Every good boy deserves favour, and the pangram continues past the point of novelty because the point is volume, not variety. Pagination needs real height to measure, and real height needs real words arranged in real lines.`,
      '',
      `Paragraph ${i + 1}b. A second paragraph per section doubles the material the splitter must distribute and gives the measurement loop more boundary cases per heading. When a section heading lands near a page bottom the paginator decides whether the heading fits with its first paragraph or moves forward; when it lands at the exact boundary the two-epsilon guard keeps sub-pixel rounding from making the call flicker.`,
      '',
    ].join('\n'),
  ),
].join('\n');

// ─── Tables ───────────────────────────────────────────────────────────────────

/** One wide table with many rows — the table splitter splits body rows across
 *  pages and replicates thead/caption/colgroup into every fragment. */
export const TABLE_HEAVY = [
  '# Quarterly Regional Report',
  '',
  'Figures are illustrative. The table below runs long enough to cross at least one page boundary under every preset; each continuation page must re-show the header row.',
  '',
  '| Region | Q1 Revenue | Q2 Revenue | Q3 Revenue | Q4 Revenue | Growth | Headcount | Notes |',
  '|--------|-----------:|-----------:|-----------:|-----------:|-------:|----------:|-------|',
  ...Array.from({ length: 60 }, (_, i) => {
    const region = ['North', 'South', 'East', 'West', 'Central'][i % 5]!;
    return `| ${region} ${i + 1} | ${1000 + i * 7} | ${1100 + i * 7} | ${1200 + i * 7} | ${1300 + i * 7} | ${(i % 9) + 1}.${i % 10}% | ${10 + (i % 40)} | Row ${i + 1} commentary text that makes the cell wrap at least once at A4 width |`;
  }),
  '',
  'Closing paragraph after the table so the document does not end mid-table.',
].join('\n');

// ─── Lists ────────────────────────────────────────────────────────────────────

/** Long ordered + unordered lists — the list splitter's workout, with an OL
 *  `start` attribute so numbering continuity across fragments is visible. */
export const LIST_HEAVY = [
  '# Deployment Runbook',
  '',
  '## Ordered procedure',
  '',
  ...Array.from(
    { length: 40 },
    (_, i) =>
      `${i + 1}. Step ${i + 1}: verify the ${['cluster', 'database', 'queue', 'cache', 'edge'][i % 5]!} is healthy before proceeding to the next stage of the rollout, and record the check in the audit log with a timestamp.`,
  ),
  '',
  '## Unordered checklist',
  '',
  ...Array.from(
    { length: 40 },
    (_, i) =>
      `- Item ${i + 1}: ${['Backups verified', 'Migrations applied', 'Indexes rebuilt', 'Alerts silenced', 'Traffic shifted'][i % 5]!} for stage ${i + 1} of the procedure`,
  ),
  '',
  '## Nested structure',
  '',
  '1. Top level one',
  '   1. Nested one',
  '   2. Nested two',
  '2. Top level two',
  '   1. Nested one under two',
  '',
  'Final paragraph.',
].join('\n');

// ─── Code ─────────────────────────────────────────────────────────────────────

/** Code blocks long enough to split by line across pages. Language coverage
 *  picks Shiki themes the presets use (typescript highlights identically
 *  under any theme; theme differences don't change line counts). */
export const CODE_HEAVY = [
  '# Code Sampler',
  '',
  'A TypeScript block that runs past one page at default settings:',
  '',
  '```typescript',
  ...Array.from(
    { length: 120 },
    (_, i) =>
      `export function step${i + 1}(input: number): number { return input * ${i + 1} + ${i % 7}; } // line ${i + 1}`,
  ),
  '```',
  '',
  'A bash block:',
  '',
  '```bash',
  ...Array.from(
    { length: 60 },
    (_, i) => `echo "checkpoint ${i + 1}" && sleep 1`,
  ),
  '```',
  '',
  'Inline `code` and a final paragraph.',
].join('\n');

// ─── Math + mermaid ───────────────────────────────────────────────────────────

/** The full feature matrix: KaTeX inline + display math, a mermaid diagram,
 *  GFM tables, task lists, footnotes, alerts, strikethrough — one document
 *  every preset must also handle (preset coverage uses this document). */
export const FEATURE_MATRIX = [
  '# Feature Matrix',
  '',
  'Inline math $E = mc^2$ and display math:',
  '',
  '$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$',
  '',
  'A mermaid diagram:',
  '',
  '```mermaid',
  'graph TD',
  '    A[Markdown] --> B[Render]',
  '    B --> C[Paginate]',
  '    C --> D[Export]',
  '```',
  '',
  '> [!NOTE]',
  '> An alert block with enough text to wrap: GFM alerts style through the accent color and must not break pagination.',
  '',
  'A task list:',
  '',
  '- [ ] unchecked item',
  '- [x] checked item',
  '',
  'Footnotes[^1] and ~~struck text~~.',
  '',
  '[^1]: The footnote at the document bottom.',
  '',
  '| Feature | Status |',
  '|---------|--------|',
  '| Math    | ✅     |',
  '| Mermaid | ✅     |',
  '',
  '...and three paragraphs of plain prose so the page has filler below the blocks. The engine measures all of it. What matters is that math, diagram, and table each stay whole on one page while prose flows around them.',
  '',
  'Second filler paragraph. The feature matrix document is also the preset-coverage document: all seven presets paginate this same markdown, so any preset-specific CSS regression (a font metric, a margin unit) shows up as a page-count change in exactly one preset row.',
  '',
  'Third filler paragraph. Filler exists to be measured.',
].join('\n');

// ─── /// page breaks ─────────────────────────────────────────────────────────

/** Sections separated by `///` — each section paginates independently, so a
 *  short section never merges into the previous one's last page. */
export const SECTION_BREAKS = [
  '# Sectioned Document',
  '',
  'First section intro. Short.',
  '',
  '///',
  '',
  '# Second Section',
  '',
  Array.from(
    { length: 6 },
    (_, i) =>
      `Paragraph ${i + 1} of the second section. The section is long enough to span onto a second page, and the next section starts on a fresh page regardless.`,
  ).join('\n\n'),
  '',
  '///',
  '',
  '# Third Section',
  '',
  'A short closing section that must begin on its own page.',
].join('\n');

// ─── Custom page size ─────────────────────────────────────────────────────────

/** A long prose document, paginated against a custom mm page size. */
export function customSizeSettings(): DocumentSettings {
  return {
    ...DEFAULT_SETTINGS,
    pageSize: 'Custom',
    customPageWidth: 148, // A5-ish width in mm
    customPageHeight: 210,
    orientation: 'landscape',
  };
}

// ─── RTL ──────────────────────────────────────────────────────────────────────

/** Arabic prose — exercises isRTLContent (>10 % RTL chars), the doc CSS
 *  `direction: rtl`, and right-alignment of pagination under RTL. */
export const RTL_DOC = [
  '# مستند تجريبي',
  '',
  ...Array.from(
    { length: 12 },
    (_, i) =>
      `الفقرة رقم ${i + 1}. هذا نص تجريبي طويل بما يكفي ليتدفق عبر عدة صفحات أثناء ترقيم الصفحات، بحيث يعمل مُقسِّم الفقرات على حدود الكلمات في الاتجاه من اليمين إلى اليسار. النص العربي يُقاس بنفس المحرك لكن مع اتجاه معكوس، وهذا هو الغرض من هذا المستند الذهبي.`,
  ),
].join('\n\n');
