// ─────────────────────────────────────────────────────────────────────────────
// The long-Document ladder end to end (ai-transforms/07), in a real browser.
//
// The budgets come from the intercepted /api/me payload, so a Document of a
// few hundred characters trips the same tiers a 200-page one does: everything
// fits, the target fits with an outline of the rest, a whole-Document intent
// becomes an AI Plan, and a target that cannot be worked on is refused with
// the paragraph around the caret offered instead.
//
// The provider is never reached: /api/ai/markdown answers from the test, and
// the plan and step replies are told apart by the request body the client
// actually sends.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test, type Page } from '@playwright/test';
import { openApp, typeAtEditorEnd } from './helpers';

/** A Pro account whose budgets make a few hundred characters a large
 *  Document: 250 characters sent, a 48-token output cap (write cap 24 tokens
 *  ≈ 96 characters, so each of the fixture's 83-character sections is one
 *  action), and a window with room to spare. */
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
    maxInputCharacters: 250,
    maxOutputTokens: 48,
    contextWindow: 2_000,
    allowance: 100,
    remaining: 100,
    period: '2026-09',
    resetsAt: '2026-10-01T00:00:00.000Z',
  },
};

/** Three sections of 83 characters each: one section is one action, and the
 *  whole Document (267 characters) is past the 250-character send cap. */
const FILLER =
  'A paragraph long enough that rewriting one section needs an action of its own.';
const SECTIONED = [
  `${FILLER} One.`,
  '',
  '///',
  '',
  `${FILLER} Two.`,
  '',
  '///',
  '',
  `${FILLER} Three.`,
].join('\n');

/** One flat section past the write cap, with a short paragraph at the end. */
const FLAT = `${'A flat paragraph with no headings anywhere in it. '.repeat(2)}\n\nA short tail.`;

/** The plan the route answers with: every section, in order. */
const PLAN_STEPS = [
  { sectionIndex: 0, heading: null, change: 'cut it to two sentences' },
  { sectionIndex: 1, heading: null, change: 'move the findings up' },
  { sectionIndex: 2, heading: null, change: 'close with a recommendation' },
];

/**
 * Routes /api/me and the markdown AI route. `exhaustAfter` moves the account's
 * remaining AI Actions to zero once the step at that index has been served,
 * and `exhaustAfterPlan` once the plan itself has, so a run can be watched
 * running out of allowance between two steps or before the first.
 */
async function routeAi(
  page: Page,
  options: { exhaustAfter?: number; exhaustAfterPlan?: boolean } = {},
): Promise<{ exhausted: () => boolean }> {
  let remaining = 100;
  let exhausted = false;
  await page.route('**/api/me', (route) => {
    if (remaining === 0) exhausted = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...PRO_AI_ME,
        ai: { ...PRO_AI_ME.ai, remaining },
      }),
    });
  });
  await page.route('**/api/ai/markdown', async (route) => {
    const body = route.request().postDataJSON() as {
      mode?: string;
      plan?: { index: number };
    };
    if (body.mode === 'plan') {
      if (options.exhaustAfterPlan) remaining = 0;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          proposal: { kind: 'plan', steps: PLAN_STEPS },
          remaining,
        }),
      });
    }
    // A step of the plan, or a plain action: both come back as the text that
    // would replace the target.
    const step = body.plan?.index;
    if (step === options.exhaustAfter) remaining = 0;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        proposal: {
          kind: 'replace',
          text:
            step === undefined
              ? 'REWRITTEN PASSAGE'
              : `REWRITTEN SECTION ${step}`,
        },
        remaining,
      }),
    });
  });
  return { exhausted: () => exhausted };
}

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Replaces the seeded sample with the Document under test, by real keystrokes
 *  so the editor's own input path is what puts it there. */
async function setDocument(page: Page, markdown: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(markdown, { delay: 2 });
}

/** Sets the Document, types the trigger, and opens the popup. */
async function openPopup(page: Page, document: string): Promise<void> {
  await setDocument(page, document);
  await typeAtEditorEnd(page, '\n\n/ai');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('ai-prompt')).toBeVisible();
}

/** Selects the first `characters` characters of the Document. */
async function selectFirstCharacters(
  page: Page,
  characters: number,
): Promise<void> {
  // Focused without a pointer press: a press inside the editor is an outside
  // click to the open popup, which dismisses it and restores the trigger — so
  // a mouse-made selection can never become an open popup's target. The
  // selection itself is still made by real keystrokes.
  await page.locator('.cm-content').focus();
  await page.keyboard.press(`${MOD}+Home`);
  await page.keyboard.down('Shift');
  for (let i = 0; i < characters; i += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.up('Shift');
}

test('sends the target in full with an outline of the rest', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await openPopup(page, SECTIONED);

  // A whole-Document intent past the caps offers the plan instead.
  const popup = page.getByTestId('ai-prompt');
  await expect(popup).toContainText('Whole document');
  await expect(page.getByTestId('ai-ladder')).toContainText(
    'An AI Plan works through it one section at a time',
  );

  // Selecting a passage makes it the target, and the ladder says what of the
  // Document goes with it.
  await selectFirstCharacters(page, 14);
  await expect(popup).toContainText('Selection');
  await expect(page.getByTestId('ai-ladder')).toContainText(
    'Only part of the document is sent: this selection in full, plus an outline of the other 2 sections',
  );

  await page.getByTestId('ai-prompt-input').fill('tighten this passage');
  await page.getByRole('button', { name: 'Send' }).click();

  const bar = page.getByTestId('ai-review-bar');
  await expect(bar).toBeVisible();
  // The proposal is drawn where it lands, in the editor's suggestion block.
  await expect(page.locator('.cm-ai-suggestion')).toContainText(
    'REWRITTEN PASSAGE',
  );
  await page.getByRole('button', { name: /Accept/ }).click();
  await expect(page.locator('.cm-content')).toContainText('REWRITTEN PASSAGE');
});

test('plans a Document too large for one action, one step at a time', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await openPopup(page, SECTIONED);

  await page.getByTestId('ai-prompt-input').fill('make it plainer');
  await page.getByRole('button', { name: 'Plan the changes' }).click();

  // The plan is shown for approval, with its cost against the allowance.
  const plan = page.getByTestId('ai-plan-dialog');
  await expect(plan).toBeVisible();
  await expect(plan).toContainText('cut it to two sentences');
  await expect(plan).toContainText('move the findings up');
  await expect(plan).toContainText('close with a recommendation');
  await expect(page.getByTestId('ai-plan-cost')).toContainText(
    '3 steps · 3 AI Actions. You have 100 left.',
  );
  // Nothing has run: the Document is untouched while the plan is approved.
  await expect(page.locator('.cm-content')).not.toContainText(
    'REWRITTEN SECTION',
  );

  await page.getByRole('button', { name: 'Run 3 steps' }).click();

  // Each step arrives as its own proposal, carrying its place in the plan and
  // drawn in the editor at the section it rewrites.
  for (const index of [0, 1, 2]) {
    const bar = page.getByTestId('ai-review-bar');
    await expect(bar).toBeVisible();
    await expect(page.locator('.cm-ai-suggestion')).toContainText(
      `REWRITTEN SECTION ${index}`,
    );
    await expect(page.getByTestId('ai-review-plan-step')).toContainText(
      `Step ${index + 1} of 3 of your plan`,
    );
    await page.getByRole('button', { name: /Accept/ }).click();
  }

  // The run ends with a summary that says what was applied.
  await expect(page.getByTestId('ai-plan-summary')).toContainText(
    'Plan finished. 3 of 3 steps applied.',
  );
  const content = page.locator('.cm-content');
  await expect(content).toContainText('REWRITTEN SECTION 0');
  await expect(content).toContainText('REWRITTEN SECTION 1');
  await expect(content).toContainText('REWRITTEN SECTION 2');
});

test('stops a plan partway, keeping the steps already accepted', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await openPopup(page, SECTIONED);

  await page.getByTestId('ai-prompt-input').fill('make it plainer');
  await page.getByRole('button', { name: 'Plan the changes' }).click();
  await page.getByRole('button', { name: 'Run 3 steps' }).click();

  const bar = page.getByTestId('ai-review-bar');
  await expect(bar).toBeVisible();
  await page.getByRole('button', { name: /Accept/ }).click();

  // The second step's proposal is on screen when the user stops the run.
  await expect(page.locator('.cm-ai-suggestion')).toContainText(
    'REWRITTEN SECTION 1',
  );
  await page.getByRole('button', { name: 'Stop the plan' }).click();

  await expect(page.getByTestId('ai-plan-summary')).toContainText(
    'Stopped. 1 of 3 steps applied; 2 steps remain.',
  );
  // What was accepted stays; nothing else was written.
  await expect(page.locator('.cm-content')).toContainText(
    'REWRITTEN SECTION 0',
  );
  await expect(page.locator('.cm-content')).not.toContainText(
    'REWRITTEN SECTION 1',
  );
});

test('offers the paragraph around the cursor for a Document that cannot be planned', async ({
  page,
}) => {
  await routeAi(page);
  await openApp(page);
  await openPopup(page, FLAT);

  // One enormous section with no structure: refused, with the way forward.
  const refusal = page.getByTestId('ai-ladder-refusal');
  await expect(refusal).toContainText('no headings or Page Breaks');
  await expect(refusal).toContainText(
    '24-token limit one AI Action can rewrite',
  );
  await expect(page.getByRole('button', { name: 'Send' })).toBeHidden();

  await page
    .getByRole('button', { name: 'Work on the paragraph around your cursor' })
    .click();

  // The target is now the paragraph the caret is in, and the action runs.
  await expect(page.getByTestId('ai-prompt')).toContainText('Selection');
  await expect(page.getByTestId('ai-ladder')).toContainText(
    'The rest of the document is sent with it',
  );
  await page.getByTestId('ai-prompt-input').fill('make this warmer');
  await page.getByRole('button', { name: 'Send' }).click();

  const bar = page.getByTestId('ai-review-bar');
  await expect(bar).toBeVisible();
  await page.getByRole('button', { name: /Accept/ }).click();
  await expect(page.locator('.cm-content')).toContainText('REWRITTEN PASSAGE');
});

test('rejects one step and carries on with the next', async ({ page }) => {
  await routeAi(page);
  await openApp(page);
  await openPopup(page, SECTIONED);

  await page.getByTestId('ai-prompt-input').fill('make it plainer');
  await page.getByRole('button', { name: 'Plan the changes' }).click();
  await page.getByRole('button', { name: 'Run 3 steps' }).click();

  // Every step is decided on its own: rejecting one skips it and the next
  // arrives in its place, drawn at the section it rewrites.
  const proposalBlock = page.locator('.cm-ai-suggestion');
  await expect(proposalBlock).toContainText('REWRITTEN SECTION 0');
  await page.getByRole('button', { name: 'Reject' }).click();

  await expect(proposalBlock).toContainText('REWRITTEN SECTION 1');
  await expect(page.getByTestId('ai-review-plan-step')).toContainText(
    'Step 2 of 3 of your plan',
  );
  await expect(page.locator('.cm-content')).not.toContainText(
    'REWRITTEN SECTION 0',
  );
  await page.getByRole('button', { name: 'Reject' }).click();

  await expect(proposalBlock).toContainText('REWRITTEN SECTION 2');
  await page.getByRole('button', { name: /Accept/ }).click();

  // Only the step that was accepted was applied, and the summary says so.
  await expect(page.getByTestId('ai-plan-summary')).toContainText(
    'Plan finished. 1 of 3 steps applied.',
  );
  const content = page.locator('.cm-content');
  await expect(content).toContainText('REWRITTEN SECTION 2');
  await expect(content).not.toContainText('REWRITTEN SECTION 0');
  await expect(content).not.toContainText('REWRITTEN SECTION 1');
});

test('keeps the steps already accepted when the allowance runs out', async ({
  page,
}) => {
  const ai = await routeAi(page, { exhaustAfter: 0 });
  await openApp(page);
  await openPopup(page, SECTIONED);

  await page.getByTestId('ai-prompt-input').fill('make it plainer');
  await page.getByRole('button', { name: 'Plan the changes' }).click();
  await page.getByRole('button', { name: 'Run 3 steps' }).click();

  // Step 1's proposal is the last the allowance covers, and the account is
  // told so before it is decided: an Action already counted must still be
  // usable, so Accept is never blocked by a spent allowance.
  await expect(page.locator('.cm-ai-suggestion')).toContainText(
    'REWRITTEN SECTION 0',
  );
  await expect.poll(ai.exhausted).toBe(true);
  await page.waitForTimeout(250);
  // The bar's own slot for a blocked Accept states nothing at all — a spent
  // allowance is not a reason — and Accept stays live, which the click below
  // proves. Asserting the *absence* of that slot is the only form that can
  // fail: its copy is written by `acceptDisabledReason`, so a negative on
  // some particular exhausted wording would pass whatever the app did.
  await expect(page.getByTestId('ai-accept-reason')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Accept/ })).toBeEnabled();
  await page.getByRole('button', { name: /Accept/ }).click();

  // The plan stops before the next step, keeping what was accepted.
  await expect(page.getByTestId('ai-plan-summary')).toContainText(
    'You have used all your AI Actions this period. 1 of 3 steps applied; 2 steps remain.',
  );
  await expect(page.locator('.cm-content')).toContainText(
    'REWRITTEN SECTION 0',
  );
});

test('stops before the first step when the allowance is already gone', async ({
  page,
}) => {
  await routeAi(page, { exhaustAfterPlan: true });
  await openApp(page);
  await openPopup(page, SECTIONED);

  await page.getByTestId('ai-prompt-input').fill('make it plainer');
  await page.getByRole('button', { name: 'Plan the changes' }).click();

  // The plan is approved against an allowance that has nothing left, and says
  // so before anything runs.
  await expect(page.getByTestId('ai-plan-cost')).toContainText(
    '3 steps · 3 AI Actions. You have 0 left',
  );
  await page.getByRole('button', { name: 'Run 3 steps' }).click();

  await expect(page.getByTestId('ai-plan-summary')).toContainText(
    'You have used all your AI Actions this period. 0 of 3 steps applied; 3 steps remain.',
  );
  await expect(page.locator('.cm-content')).not.toContainText(
    'REWRITTEN SECTION',
  );
});
