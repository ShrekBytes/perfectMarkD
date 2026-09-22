import { expect, it } from 'vitest';
import * as core from './index';

it('exposes the public engine surface from the package index', () => {
  const api = Object.keys(core).sort();
  expect(api).toContain('renderMarkdown');
  expect(api).toContain('postProcessRenderedHTML');
  expect(api).toContain('buildDocCSS');
  expect(api).toContain('DEFAULT_SETTINGS');
  expect(api).toContain('buildExportHTML');
  expect(api).toContain('resolvePageGeometry');
  expect(api).toContain('estimateAiSize');
  // The scaffold placeholder is gone.
  expect(api).not.toContain('hello');
});
