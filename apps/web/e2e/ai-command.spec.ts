// ─────────────────────────────────────────────────────────────────────────────
// The `/ai` command end to end (ai-transforms/05), in a real browser: typing
// the trigger in the editor, the hint, the popup with the trigger consumed, the
// review dialog, Accept, and one undo step back.
//
// The instance's AI state comes from the intercepted /api/me payload and the
// proposal from the intercepted route — the provider is never reached, so the
// run proves the client half against the contract the server actually speaks.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test, type Page } from '@playwright/test';
import { moveToEditorEnd, openApp, typeAtEditorEnd } from './helpers';

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
    disclosureSeen: false,
    maxInputCharacters: 60_000,
    allowance: 100,
    remaining: 100,
    period: '2026-09',
    resetsAt: '2026-10-01T00:00:00.000Z',
  },
};

/** The line the run types and the anchored edit that rewrites it. */
const SEARCH = 'ZZUNIQUELINE';
const REPLACE = 'ZZREWRITTEN';

/**
 * Routes /api/me and the markdown AI route. `proposal` overrides what the
 * route answers with; `me` overrides the account state (for the gate runs).
 */
async function routeAi(
  page: Page,
  options: {
    proposal?: unknown;
    status?: number;
    me?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.me ?? PRO_AI_ME),
    }),
  );
  await page.route('**/api/ai/markdown', (route) =>
    route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(
        options.proposal ?? {
          proposal: {
            kind: 'anchored',
            edits: [{ search: SEARCH, replace: REPLACE }],
          },
          remaining: 99,
        },
      ),
    }),
  );
}

/** Types a unique line and the trigger at the end of the Document. */
async function typeTrigger(page: Page): Promise<void> {
  await typeAtEditorEnd(page, `\n\n${SEARCH}\n/ai`);
}

test('typing /ai, reviewing, and accepting is one undo step', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);

  await typeTrigger(page);

  // The hint names the one command the typed letters could become.
  const hint = page.getByTestId('ai-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('/ai');
  await expect(hint).toContainText('Edit the markdown');

  // The completing space opens the popup and consumes the trigger, so the
  // Document is never polluted by the act of asking.
  await page.keyboard.press('Space');
  const popup = page.getByTestId('ai-prompt');
  await expect(popup).toBeVisible();
  await expect(page.locator('.cm-content')).not.toContainText('/ai');
  await expect(popup).toContainText('Whole document');
  await expect(popup).toContainText('characters');
  // The first AI Action discloses where the text is going.
  await expect(popup).toContainText('external AI provider');

  await page.getByTestId('ai-prompt-input').fill('make the line shout');
  await page.keyboard.press('Enter');

  // The proposal arrives in the review dialog; nothing has changed yet.
  const dialog = page.getByTestId('ai-review-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('ai-change-count')).toHaveText('1 change');
  await expect(dialog).toContainText(SEARCH);
  await expect(dialog).toContainText(REPLACE);
  await expect(page.locator('.cm-content')).toContainText(SEARCH);

  await page.getByRole('button', { name: 'Accept (1)' }).click();
  await expect(dialog).toBeHidden();

  // Accepting is the only path into the Document, and it is one edit.
  await expect(page.locator('.cm-content')).toContainText(REPLACE);
  await expect(page.locator('.cm-content')).not.toContainText(SEARCH);

  // One undo step takes back exactly what the AI did.
  await page.locator('.cm-content').click();
  await moveToEditorEnd(page);
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+z' : 'Control+z',
  );
  await expect(page.locator('.cm-content')).toContainText(SEARCH);
  await expect(page.locator('.cm-content')).not.toContainText(REPLACE);
});

test('anchors the popup below the caret inside the editor pane', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);

  await typeTrigger(page);
  await page.keyboard.press('Space');

  const popup = await page.getByTestId('ai-prompt').boundingBox();
  const pane = await page.getByTestId('editor-pane').boundingBox();
  expect(popup).not.toBeNull();
  expect(pane).not.toBeNull();

  // The trigger was typed at the document's end, so the caret sits well below
  // the pane's top: a popup at the pane's origin would mean the anchoring
  // silently fell back to its corner.
  expect(popup!.y - pane!.y).toBeGreaterThan(20);
  expect(popup!.x).toBeGreaterThanOrEqual(pane!.x);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(pane!.x + pane!.width);
  expect(popup!.y + popup!.height).toBeLessThanOrEqual(pane!.y + pane!.height);
});

test('rejecting leaves the Document untouched', async ({ page }) => {
  await routeAi(page);
  await openApp(page);

  await typeTrigger(page);
  await page.keyboard.press('Space');
  await page.getByTestId('ai-prompt-input').fill('make the line shout');
  await page.keyboard.press('Enter');

  const dialog = page.getByTestId('ai-review-dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('.cm-content')).toContainText(SEARCH);
  await expect(page.locator('.cm-content')).not.toContainText(REPLACE);
});

test('Esc restores the trigger, leaving the Document as it was', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);

  await typeTrigger(page);
  const before = await page.locator('.cm-content').textContent();

  await page.keyboard.press('Space');
  await expect(page.getByTestId('ai-prompt')).toBeVisible();
  // The trigger is consumed while the popup is open...
  await expect(page.locator('.cm-content')).not.toContainText('/ai');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ai-prompt')).toBeHidden();

  // ...and restored exactly, so a cancelled interaction costs nothing.
  expect(await page.locator('.cm-content').textContent()).toBe(before);
  await expect(page.locator('.cm-content')).toContainText('/ai');
});

test('a truncated reply is refused, not offered', async ({ page }) => {
  await routeAi(page, {
    status: 502,
    proposal: {
      error: 'The reply was cut off before it finished.',
      code: 'ai_truncated',
    },
  });
  await openApp(page);

  await typeTrigger(page);
  await page.keyboard.press('Space');
  await page.getByTestId('ai-prompt-input').fill('make the line shout');
  await page.keyboard.press('Enter');

  // A plain message with Retry, and no proposal to review.
  const popup = page.getByTestId('ai-prompt');
  await expect(popup.getByRole('alert')).toContainText('cut off');
  await expect(popup.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByTestId('ai-review-dialog')).toBeHidden();
  await expect(page.locator('.cm-content')).toContainText(SEARCH);
});

test('a Free Tier visitor gets the upsell, and the pricing modal', async ({
  page,
}) => {
  await routeAi(page, {
    me: {
      ...PRO_AI_ME,
      plan: null,
      expiresAt: null,
      quota: { used: 0, limit: 0 },
      ai: {
        ...PRO_AI_ME.ai,
        included: false,
        remaining: 0,
        disclosureSeen: true,
      },
    },
  });
  await openApp(page);

  await typeTrigger(page);
  await page.keyboard.press('Space');

  const popup = page.getByTestId('ai-prompt');
  await expect(popup).toContainText('AI Actions are part of Pro and Premium.');
  await expect(popup).toContainText('external AI provider');
  await expect(page.getByTestId('ai-prompt-input')).toBeHidden();

  await page.getByRole('button', { name: 'See plans' }).click();
  await expect(page.getByTestId('pricing-modal')).toBeVisible();
});

test('with AI Access off the command does not exist', async ({ page }) => {
  await routeAi(page, {
    me: { ...PRO_AI_ME, ai: { ...PRO_AI_ME.ai, access: false } },
  });
  await openApp(page);

  await typeTrigger(page);

  await expect(page.getByTestId('ai-hint')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('ai-prompt')).toBeHidden();
  // The space is inserted as ordinary text and the trigger stays put: no
  // command exists, so nothing is consumed.
  await expect(page.locator('.cm-content')).toContainText('/ai');
});

test('on an instance with no provider configured nothing appears', async ({
  page,
}) => {
  await routeAi(page, {
    me: {
      ...PRO_AI_ME,
      ai: {
        ...PRO_AI_ME.ai,
        configured: false,
        included: false,
        remaining: 0,
      },
    },
  });
  await openApp(page);

  await typeTrigger(page);

  await expect(page.getByTestId('ai-hint')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('ai-prompt')).toBeHidden();
  // Nothing is consumed and no upsell appears: the feature simply is not here.
  await expect(page.locator('.cm-content')).toContainText('/ai');
});
