// ─────────────────────────────────────────────────────────────────────────────
// The first-run sample document (ticket 07): a multi-page tour of the engine
// that a fresh profile auto-creates and opens. sample.md is imported as raw
// text so the showcase stays a plain, editable markdown file.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';
import sampleMarkdown from './sample.md?raw';

export const SAMPLE_NAME = 'Welcome to PerfectMarkD';

export const SAMPLE_MARKDOWN = sampleMarkdown;

/** The sample's look: the default preset plus the page furniture it brags
 *  about — centered title, accent page frame, footer text beside the page
 *  numbers. */
export function sampleSettings(): DocumentSettings {
  return {
    ...DEFAULT_SETTINGS,
    centerH1: true,
    frameEnabled: true,
    frameColor: DEFAULT_SETTINGS.accentColor,
    frameStyle: 'solid',
    frameThickness: 3,
    footerText: 'Made with PerfectMarkD',
  };
}
