import { expect, it } from 'vitest';
import * as core from './index';

it('exposes the public engine surface from the package index', () => {
  const api = Object.keys(core).sort();
  expect(api).toContain('renderMarkdown');
  expect(api).toContain('buildDocCSS');
  expect(api).toContain('DEFAULT_SETTINGS');
  expect(api).toContain('buildExportHTML');
  expect(api).toContain('resolvePageGeometry');
  expect(api).toContain('paginateElChunked');
  expect(api).toContain('countOccurrences');
  expect(api).toContain('buildInfo');
  // The scaffold placeholder is gone.
  expect(api).not.toContain('hello');
});

it('keeps the internal-only helpers off the package surface', () => {
  const api = Object.keys(core);
  // Spot-checks across the modules: an estimate the ladder owns, a render
  // clean-up pass, splitters, a geometry constant, a settings constant, and
  // the styling-reference tables.
  for (const internal of [
    'estimateAiSize',
    'postProcessRenderedHTML',
    'splitInlineElement',
    'mmToPx',
    'SETTINGS_VERSION',
    'STYLING_REFERENCE_VARIABLES',
    // Four more, each a live `export` in its own module that the package
    // surface deliberately omits: the ladder's write cap, a section-label
    // predicate, a second splitter, and a stylesheet sanitiser. Their being
    // real exports is the point — the assertion can only fail if one of them
    // is promoted to the barrel.
    'aiWriteCapTokens',
    'isBareSectionLabel',
    'splitListElement',
    'stripPageAtRules',
  ]) {
    expect(api, internal).not.toContain(internal);
  }
});
