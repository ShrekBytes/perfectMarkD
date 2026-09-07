// ─────────────────────────────────────────────────────────────────────────────
// Harness smoke test: proves the Playwright plumbing itself — Chromium
// launches, the route-served engine bundle imports, the pipeline runs
// end-to-end — before any golden comparison logic is trusted. A failure
// here means the harness is broken, not the engine.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../settings.js';
import { closeBrowser, runPipeline } from './harness.js';

afterAll(async () => {
  await closeBrowser();
});

describe('harness smoke', () => {
  it('runs the pipeline in real Chromium', async () => {
    const result = await runPipeline(
      '# Title\n\n' +
        'Paragraph one with some prose.\n\nParagraph two.\n\n' +
        '- a\n- b\n- c\n',
      DEFAULT_SETTINGS,
      { title: 'Smoke' },
    );
    expect(result.pageCount).toBe(1);
    expect(result.pages[0]!.sigs).toContain('H1 «Title»');
    expect(result.violations).toEqual([]);
    expect(result.exportHTML).toContain('Paragraph two.');
  }, 60_000);
});
