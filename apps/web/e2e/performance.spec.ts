// ─────────────────────────────────────────────────────────────────────────────
// Large documents do not freeze the tab (launch/05).
//
// The engine's pagination is thousands of layout flushes for a document this
// size, and the render → paginate → mount run happens on the main thread. Left
// uninterrupted it is seconds of an unresponsive tab: no paint, no keystrokes,
// no scrolling. The chunked pipeline yields between batches, and this suite is
// what says so — with the CPU throttled, because an unthrottled dev machine
// hides exactly the class of stall this guards against.
//
// The measurement is the browser's own long-task record: the longest single
// stretch the main thread spent unable to answer anything. That is the stall,
// directly — a gap between two of the page's own timers would also count time
// the thread spent on short tasks, which inflates the number without meaning
// anything to the person waiting.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test, type Page } from '@playwright/test';
import { openApp, openLibrary, pageSlots, RENDER_TIMEOUT } from './helpers';

/** Roughly 300 A4 pages of prose under the default preset. */
function largeDocument(sections: number): string {
  return Array.from(
    { length: sections },
    (_, i) =>
      `## Section ${i + 1}\n\n` +
      `Paragraph ${i + 1}. The quick brown fox jumps over the lazy dog. ` +
      'Pack my box with five dozen liquor jugs. How vexingly quick daft ' +
      'zebras jump! Sphinx of black quartz, judge my vow. '.repeat(4) +
      '\n',
  ).join('\n');
}

/** The document this test claims to cover, in pages. Asserted as a floor, not
 *  an exact count: the page total depends on the preset's font metrics, and a
 *  hard number here would couple this suite to a font set the way the engine
 *  goldens once were (launch/07). */
const MIN_PAGES = 300;
const SECTIONS = 2200;

/** CPU throttling for the run. Slow enough that a synchronous run of the old
 *  pagination would stall for seconds, which is the condition under test. */
const THROTTLE_RATE = 4;

/** No single blocking stretch may exceed this.
 *
 *  At four times throttling, for the 339-page fixture, on the machine this was
 *  written on:
 *
 *    chunked (this change)   longest task ~610ms
 *    unchunked (before it)   longest task ~3-4s, in one call
 *
 *  The 610ms is not the paginator: it is the markdown-it parse of the whole
 *  document, which no chunking can split because the fixture is one section.
 *  Everything the paginator does is now batched well under it.
 *
 *  So the ceiling is a regression gate, not a target — above the one
 *  irreducible task and a slower runner's version of it, well below a return
 *  to an unchunked run. */
const MAX_BLOCKING_TASK_MS = 1500;

/** Installs the long-task record and the progress observer in the page. */
async function startMeasuring(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __pmLongestTaskMs: number;
      __pmProgressSeen: boolean;
    };
    w.__pmLongestTaskMs = 0;
    w.__pmProgressSeen = false;
    // Long-task entries are only emitted for tasks over 50ms, which is the
    // floor of "worth counting" anyway; the longest of them is the stall.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > w.__pmLongestTaskMs) {
          w.__pmLongestTaskMs = Math.round(entry.duration);
        }
      }
    }).observe({ entryTypes: ['longtask'] });
    // The indicator is transient, so a poll from the test would race it: the
    // observer records that it appeared at all.
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="canvas-progress"]')) {
        w.__pmProgressSeen = true;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

async function readMeasurement(page: Page): Promise<{
  longestTaskMs: number;
  progressSeen: boolean;
}> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __pmLongestTaskMs: number;
      __pmProgressSeen: boolean;
    };
    return {
      longestTaskMs: w.__pmLongestTaskMs,
      progressSeen: w.__pmProgressSeen,
    };
  });
}

test('renders a 300-page document under CPU throttling without freezing the tab', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);

  await openApp(page);
  await startMeasuring(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE_RATE });

  // Import through the app's own path — the file input in the Library — so the
  // document lands the way a user's would. The import closes the drawer itself.
  const library = await openLibrary(page);
  await library.getByLabel('Import markdown file').setInputFiles({
    name: 'long-report.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(largeDocument(SECTIONS)),
  });
  await expect(library).toBeHidden();

  // The >100-page guard stops the first render once pagination has measured
  // the document; the count it reports is the proof the run got that far under
  // throttle, and it is the number of pages the render has to mount.
  const toast = page.getByTestId('large-doc-toast');
  await expect(toast).toBeVisible({ timeout: RENDER_TIMEOUT });
  const reported = /renders (\d+) pages/.exec(
    (await toast.textContent()) ?? '',
  );
  const pages = Number(reported?.[1] ?? 0);
  expect(
    pages,
    'the fixture must be a 300+ page document',
  ).toBeGreaterThanOrEqual(MIN_PAGES);

  await page.getByTestId('render-anyway').click();
  await expect
    .poll(() => pageSlots(page).count(), { timeout: 180_000 })
    .toBe(pages);

  const { longestTaskMs, progressSeen } = await readMeasurement(page);
  // Printed on green runs too: the number is the point of this suite, and
  // seeing it drift before it trips the ceiling is how the ceiling gets
  // re-calibrated honestly.
  console.log(
    `performance: ${pages} pages, longest main-thread task ${longestTaskMs}ms (ceiling ${MAX_BLOCKING_TASK_MS}ms), progress indicator seen: ${progressSeen}`,
  );

  // The desk narrated the wait instead of appearing hung. This is the
  // machine-independent half of the assertion: an unchunked run never hands
  // the thread back, so its readout cannot appear.
  expect(progressSeen).toBe(true);

  // And no single stretch blocked the tab for long, at four times slower than
  // the machine this runs on.
  expect(
    longestTaskMs,
    `longest main-thread task was ${longestTaskMs}ms (ceiling ${MAX_BLOCKING_TASK_MS}ms)`,
  ).toBeLessThan(MAX_BLOCKING_TASK_MS);
});
