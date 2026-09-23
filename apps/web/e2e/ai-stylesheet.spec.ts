// ─────────────────────────────────────────────────────────────────────────────
// `/ss` and the Stylesheet tab's AI conversation (ai-transforms/06), in a real
// browser: the box, the proposal card, the provisional paper, Accept and
// Reject, and the editor's `/ss` writing the same box and the same
// conversation without moving the Inspector.
//
// The instance's AI state comes from the intercepted /api/me payload and the
// proposal from the intercepted stylesheet route — the provider is never
// reached. What is asserted on the paper is the *computed* style inside a real
// page's shadow root, so a proposal that never reached the render would fail
// here.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test, type Page } from '@playwright/test';
import {
  openApp,
  openInspectorTab,
  typeAtEditorEnd,
  waitForMinPages,
} from './helpers';

/** A Pro account on an instance with AI configured and Actions left. */
const PRO_AI_ME = {
  email: 'writer@example.com',
  isAdmin: false,
  plan: 'pro',
  expiresAt: '2030-01-01T00:00:00.000Z',
  quota: { used: 0, limit: 300 },
  flags: {
    customPageSize: true,
    customStylesheet: true,
    bannerImages: true,
    backgroundImage: true,
    customFonts: true,
  },
  ai: {
    configured: true,
    included: true,
    access: true,
    disclosureSeen: true,
    maxInputCharacters: 60_000,
    maxOutputTokens: 16_000,
    contextWindow: 128_000,
    allowance: 100,
    remaining: 100,
    period: '2026-09',
    resetsAt: '2026-10-01T00:00:00.000Z',
  },
};

/**
 * The stylesheet already in the box, and the one the route proposes. A colour
 * rather than a length: the computed value is the same number whatever the
 * H1's font size or the preset, so the assertion cannot drift.
 */
const BASE = '.mpdf-doc h1 { color: rgb(128, 0, 128); }';
const PROPOSED = '.mpdf-doc h1 { color: rgb(0, 128, 128); }';
/** The proposed look, as the browser computes it. */
const PROPOSED_COLOR = 'rgb(0, 128, 128)';

/** Routes /api/me and the stylesheet AI route; the provider is never reached. */
async function routeAi(page: Page, reply: string = PROPOSED): Promise<void> {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PRO_AI_ME),
    }),
  );
  await page.route('**/api/ai/stylesheet', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        proposal: { kind: 'replace', text: reply },
        remaining: 99,
      }),
    }),
  );
}

/**
 * The colour the first page's heading actually renders in — read from inside
 * the page's open shadow root, where the engine's CSS lands. A proposal that
 * never reached the render cannot satisfy this.
 */
async function headingColor(page: Page): Promise<string> {
  return page
    .locator('.pm-page-host')
    .first()
    .evaluate(
      (host) =>
        getComputedStyle(host.shadowRoot!.querySelector('.mpdf-doc h1')!).color,
    );
}

/** Opens the Stylesheet tab with BASE typed into the box (the layer off). */
async function openStylesheetTabWithCSS(page: Page): Promise<void> {
  await openInspectorTab(page, 'Stylesheet');
  await page.getByTestId('stylesheet-box').fill(BASE);
}

test('the tab’s conversation: ask, judge the paper, accept', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await waitForMinPages(page, 1);
  const before = await headingColor(page);

  await openStylesheetTabWithCSS(page);
  // The layer is off, so the CSS in the box has not reached the paper yet.
  expect(await headingColor(page)).toBe(before);

  await page.getByTestId('stylesheet-ai-input').fill('a warmer accent');
  await page.getByTestId('stylesheet-ai-send').click();

  // The reply is a proposal card: the diff, and nothing written to the box.
  const card = page.getByTestId('stylesheet-ai-proposal');
  await expect(card).toBeVisible();
  await expect(card).toContainText(BASE);
  await expect(card).toContainText(PROPOSED);
  await expect(page.getByTestId('stylesheet-box')).toHaveValue(BASE);

  // The paper is drawn with the proposal, so the look can be judged rather
  // than the CSS — and it is a render only: the box still holds BASE.
  await expect.poll(() => headingColor(page)).toBe(PROPOSED_COLOR);
  await expect(page.getByTestId('stylesheet-box')).toHaveValue(BASE);

  await page.getByTestId('stylesheet-ai-accept').click();

  // Accepting writes the box and keeps the look it was judged by.
  await expect(page.getByTestId('stylesheet-box')).toHaveValue(PROPOSED);
  await expect(
    page.getByRole('checkbox', { name: 'Apply to pages' }),
  ).toBeChecked();
  await expect.poll(() => headingColor(page)).toBe(PROPOSED_COLOR);
  await expect(page.getByTestId('stylesheet-ai-decision')).toContainText(
    'Accepted',
  );
});

test('rejecting reverts the paper and leaves the box exactly as it was', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await waitForMinPages(page, 1);
  const before = await headingColor(page);

  await openStylesheetTabWithCSS(page);
  await page.getByTestId('stylesheet-ai-input').fill('a warmer accent');
  await page.getByTestId('stylesheet-ai-send').click();
  await expect(page.getByTestId('stylesheet-ai-proposal')).toBeVisible();
  await expect.poll(() => headingColor(page)).toBe(PROPOSED_COLOR);

  await page.getByTestId('stylesheet-ai-reject').click();

  // The paper goes back to the box, and the box was never touched.
  await expect.poll(() => headingColor(page)).toBe(before);
  await expect(page.getByTestId('stylesheet-box')).toHaveValue(BASE);
  // The rejected turn stays in the log: "not like that, try this" needs it.
  await expect(page.getByTestId('stylesheet-ai-decision')).toContainText(
    'Rejected',
  );
});

test('/ss in the editor writes the box, joins the conversation, and moves no tab', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await waitForMinPages(page, 1);

  // The Inspector starts on Page, and stays there: `/ss` is an editor
  // interaction, not a reason to yank the user to another tab.
  await expect(page.getByTestId('inspector-tab-Page')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await typeAtEditorEnd(page, '\n\n/ss');
  await expect(page.getByTestId('ai-hint')).toContainText(
    'Edit the Custom stylesheet',
  );
  await page.keyboard.press('Space');

  const popup = page.getByTestId('ai-prompt');
  await expect(popup).toBeVisible();
  // The target is the stylesheet, not the Document.
  await expect(popup).toContainText('Custom stylesheet');
  await popup.getByTestId('ai-prompt-input').fill('a warmer accent');
  await page.keyboard.press('Enter');

  const dialog = page.getByTestId('ai-review-dialog');
  await expect(dialog).toBeVisible();
  // The proposed look is on the paper before it is accepted.
  await expect.poll(() => headingColor(page)).toBe(PROPOSED_COLOR);

  await page.getByRole('button', { name: 'Accept (1)' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByTestId('inspector-tab-Page')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect.poll(() => headingColor(page)).toBe(PROPOSED_COLOR);

  // The turn joined this Document's conversation, which the tab shows.
  await openInspectorTab(page, 'Stylesheet');
  await expect(page.getByTestId('stylesheet-box')).toHaveValue(PROPOSED);
  await expect(page.getByTestId('stylesheet-ai-log')).toContainText(
    'a warmer accent',
  );
  await expect(page.getByTestId('stylesheet-ai-decision')).toContainText(
    'Accepted',
  );
});
