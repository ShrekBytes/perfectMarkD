// ─────────────────────────────────────────────────────────────────────────────
// Client Export (ticket editor-app/10): the print dialog itself can't be
// automated, so the suite asserts what the ticket asks for — the hidden
// iframe's HTML structure, i.e. the exact print document the dialog receives.
// The iframe is captured at insertion (helpers.IFRAME_CAPTURE) and window.print
// is stubbed (helpers.PRINT_STUB), so headless runs are deterministic and the
// printed document is kept for assertions.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test, type Page } from '@playwright/test';
import {
  IFRAME_CAPTURE,
  PRINT_STUB,
  RENDER_TIMEOUT,
  openApp,
  waitForMinPages,
} from './helpers';

/** The print document captured from the hidden iframe (sticky on the window,
 *  so there is no race with the frame's removal after print()). */
const capturedPrintDoc = (page: Page) =>
  page.evaluate(
    () => (window as { __pmPrintHTML?: string }).__pmPrintHTML ?? null,
  );

/** The print-call counter the PRINT_STUB records on the main window. */
const printCalls = (page: Page) =>
  page.evaluate(
    () => (window as { __pmPrintCalls?: number }).__pmPrintCalls ?? 0,
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(IFRAME_CAPTURE);
  await page.addInitScript(PRINT_STUB);
});

test('export builds the print document in a hidden iframe', async ({
  page,
}) => {
  await openApp(page);
  const canvasPages = await waitForMinPages(page, 2);

  await page.getByRole('button', { name: 'Export', exact: true }).click();

  // First export of the session shows the one-time "choose Save as PDF" hint.
  const hint = page.getByTestId('print-hint-dialog');
  await expect(hint).toBeVisible();
  await hint.getByRole('button', { name: 'Continue to print' }).click();

  await expect
    .poll(() => capturedPrintDoc(page), { timeout: RENDER_TIMEOUT })
    .not.toBeNull();
  const html = (await capturedPrintDoc(page))!;

  // Structure per ADR-0003's single pipeline: the same layouts the canvas
  // showed, serialized by the engine's buildExportHTML.
  expect(html).toContain('data-pm-print-ready'); // parse sentinel
  expect(html).toContain('@page'); // page sizing for the print pipeline
  expect(html).toContain('class="mpdf-export-page"'); // one box per page
  expect(html).toContain('mpdf-doc'); // content root
  expect(html).toContain('.katex'); // math stylesheet inlined
  expect(html).toContain('<title>Welcome to PerfectMarkD</title>');
  expect(html).toContain('Made with PerfectMarkD'); // sample footer text

  // Export page count matches what the preview paginated.
  const exportPages = html.split('class="mpdf-export-page"').length - 1;
  expect(exportPages).toBe(canvasPages);

  // print() was invoked on the frame's window and the flow completed.
  await expect.poll(() => printCalls(page)).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('export-split')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

test('a second export in the same session skips the print hint', async ({
  page,
}) => {
  await openApp(page);
  await waitForMinPages(page, 2);

  const exportButton = page.getByRole('button', {
    name: 'Export',
    exact: true,
  });
  const hint = page.getByTestId('print-hint-dialog');

  await exportButton.click();
  await hint.getByRole('button', { name: 'Continue to print' }).click();
  await expect.poll(() => printCalls(page)).toBe(1);

  await exportButton.click();
  await expect(hint).toBeHidden();
  await expect.poll(() => printCalls(page)).toBe(2);
});
