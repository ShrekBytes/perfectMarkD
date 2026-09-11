// ─────────────────────────────────────────────────────────────────────────────
// Shared E2E helpers (ticket editor-app/10).
//
// Every Playwright test runs in its own browser context, so "fresh profile" is
// the default starting state: empty IndexedDB, no localStorage, onboarding
// ahead. Helpers here navigate, wait for the canvas to settle, and read the
// imperative page DOM the React chrome sits around.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, type Page } from '@playwright/test';

/** A full engine run of a chunky document may take a while (lazy mermaid
 *  chunk, KaTeX, pagination); polls exit early, so only the tail waits. */
export const RENDER_TIMEOUT = 30_000;

/** Opens the app and waits until the shell is live: the store seeded and the
 *  active document's first save landed ("Saved" is the unit suite's ready
 *  gate too). */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
}

/** The mounted page slots — one `.pm-page-slot` per engine layout. */
export function pageSlots(page: Page) {
  return page.locator('[data-testid="canvas-pages"] .pm-page-slot');
}

/** Waits until at least `min` pages are mounted and returns the exact count. */
export async function waitForMinPages(
  page: Page,
  min: number,
): Promise<number> {
  await expect
    .poll(() => pageSlots(page).count(), { timeout: RENDER_TIMEOUT })
    .toBeGreaterThanOrEqual(min);
  return pageSlots(page).count();
}

/** Canvas settled: no in-flight render and all webfonts loaded. */
export async function waitForCanvasSettled(page: Page): Promise<void> {
  await expect
    .poll(() => page.getByTestId('canvas-scroll').getAttribute('aria-busy'))
    .toBe('false');
  await page.evaluate(() => document.fonts.ready);
}

/** Switches the Inspector to the given tab (visible label of the third tab is
 *  "Header/Footer"; the testid uses the internal id `Header-Footer`). */
export async function openInspectorTab(
  page: Page,
  tab: 'Page' | 'Style' | 'Header-Footer',
): Promise<void> {
  await page.getByTestId(`inspector-tab-${tab}`).click();
}

/** The Library drawer (opens over the shell; role dialog named "Library"). */
export function libraryOf(page: Page) {
  return page.getByRole('dialog', { name: 'Library' });
}

/** Opens the Library drawer and returns it once visible. */
export async function openLibrary(page: Page) {
  await page.getByRole('button', { name: 'Library' }).click();
  const library = libraryOf(page);
  await expect(library).toBeVisible();
  return library;
}

/** Appends text at the end of the markdown document via real keystrokes, so
 *  the editor's input path (and its debounced autosave) is what's exercised. */
export async function typeAtEditorEnd(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+End' : 'Control+End',
  );
  await page.keyboard.type(text, { delay: 5 });
}

/** Reads a computed style property from the page box inside the first page's
 *  open shadow root — where the engine's doc CSS actually lands. */
export async function pageBoxStyle(
  page: Page,
  property: string,
): Promise<string> {
  return page
    .locator('.pm-page-host')
    .first()
    .evaluate(
      (host, prop) =>
        getComputedStyle(
          host.shadowRoot!.querySelector('.pm-page-box')!,
        ).getPropertyValue(prop),
      property,
    );
}

/** Outer width of the first page's zoom frame (page pixels × zoom). */
export async function firstPageFrameWidth(page: Page): Promise<number> {
  const box = await page.locator('.pm-page-frame').first().boundingBox();
  expect(box).not.toBeNull();
  return box!.width;
}

/**
 * Overrides `window.print` in every frame (the main frame and the Client
 * Export's srcdoc iframe) with a counter: the print dialog itself can't be
 * automated, but we can prove print() was invoked on the frame's window.
 * Headless no-ops print() anyway; this also keeps headed runs dialog-free.
 * (The browser-print jsdom stub is a separate environment: src/testing/
 * stub-print-iframe.ts.)
 */
export const PRINT_STUB = `
  window.print = () => {
    try {
      window.parent.__pmPrintCalls = (window.parent.__pmPrintCalls || 0) + 1;
    } catch (e) {}
  };
`;

/**
 * Main-frame observer that records the hidden print iframe's document the
 * moment it is inserted: the flow removes the frame right after print(), so
 * waiting to read it from the outside races. The srcdoc attribute is set
 * before append, so the captured value is the complete print document.
 */
export const IFRAME_CAPTURE = `
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node.nodeType === 1 &&
          node.tagName === 'IFRAME' &&
          node.getAttribute('aria-hidden') === 'true'
        ) {
          window.__pmPrintHTML = node.getAttribute('srcdoc');
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
`;
