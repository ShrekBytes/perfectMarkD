# 08: End-to-end verification and the release checklist

**What to build:** The proof, and the last mile before it is real for anyone else. Nothing here adds a feature: it is the pass that only makes sense once every surface exists — the whole AI path driven in a real browser, the browser suite covering what the unit tests cannot, the export regression that guards the promise, the tracker left unambiguous, and the launch checklist carrying the AI prerequisites so the day it ships is not the day someone discovers the caps do not fit their model.

**Spec:** `.scratch/ai-transforms/spec.md` (the testing decisions, the promises, and the further notes).

**Blocked by:** 02, 05, 06, 07.

**Status:** resolved

- [x] Every user-facing surface this work introduced is verified in a real browser — the hint, the popup in each of its states, the review dialog's accept, reject, and partial accept, the Stylesheet tab's three regions, the gallery tile's four states, and a Document rendered with a Custom Stylesheet — with screenshots saved for the Admin's aesthetic review rather than judged from code.
- [x] The browser suite covers the paths where only a real browser proves the feature: typing `/ai` through to an accepted change, `/ss` through to a new-looking paper, and a gated state rendering its copy — driving a stubbed provider so no live API is ever called.
- [x] A Document with a Custom Stylesheet exported on the server produces a PDF whose page geometry is unchanged from the same Document without it — the regression test for the one bug this work could cause.
- [x] The AI Provider Config panel shows the token equivalent of the input cap and the worst-case cost of one AI Action (spec §AI Provider Config — ticket 03's deferral lands here): the input cap converted through the shared estimator and the output cap as configured, both labelled as estimates, priced at the model's published rates when Test connection reports them, with the price flagged as unknown when it does not, so a pricey model is a visible decision.
- [x] The whole workspace is green: unit suites, both browser suites, typecheck, and lint, with no skipped or quarantined tests standing in for a fix.
- [x] The launch checklist carries the AI prerequisites as items an operator can act on: a key in the environment, a model chosen with the per-Action cost arithmetic in mind, caps sized to that model's window, Test connection run to completion, and the Privacy page confirming what leaves the browser.
- [x] The tracker holds no duplicate work: the two superseded tickets are marked as such, and the spec's status reflects what actually shipped.

## Comments

- Implemented (ai-transforms/08). This was the verification-and-release pass, and it found one real defect the feature work had left behind.

- **The Admin panel's cost readout** (the one item ticket 03 deferred here). A new pure module `apps/web/src/admin/ai-cost.ts` computes the worst case for one AI Action: the input cap through a new shared helper, `estimateTokensForCharacters` in `packages/core/src/ai.ts` (the same conservative, script-aware ratio `estimateAiSize` uses — the tighter 2-chars-per-token rate, so the arithmetic errs toward over-estimating), plus the output cap as configured, priced at the model's published per-million rates. `AiCostReadout` in `SettingsPanel.tsx` renders it under the caps: "Input cap, in tokens" (~30,000 for the seeded 60,000-character cap), "Output cap" (16,000), and "Worst-case cost of one AI Action", labelled estimates in a footnote. The price reads "price unknown" until Test connection reports both rates, and returns to unknown the moment the model id is edited away from the one that was tested — a half-known or stale price is not a price to plan around. Tests: `ai-cost.test.ts` (the arithmetic, the both-rates rule, zero caps) and `SettingsPanel.test.tsx` (unknown before Test connection, `$0.0141` after for the cheap model, `$0.3300` for a frontier model, and re-flagged when the model changes).

- **The `shell-compact` failure that had been recorded as pre-existing was not a test to accept — it was ticket 01's fourth Inspector tab overflowing the pane.** At 900px the shell's `scrollWidth` was 924: the Inspector's tab row (four tabs = 316px with gaps and padding) overflowed the 280px pane at its default width and the 260px floor, and `overflow-hidden` on the shell turned that into the 24px the test measured. Three tabs (234px) fit; the fourth, added by ai-transforms/01, did not. The fix follows DESIGN.md's own rule — the Inspector tablist is one of the bars that "carry min-heights, not fixed heights, so they grow with their contents", and the editor toolbar wraps for exactly this reason — so the tablist and its row now wrap (`flex-wrap`) and the row carries `min-h-9` plus `py-1`; DESIGN.md's touch-target section now names the tablist among the wrapping bars, so code and doc agree (AGENTS.md). Verified: the `shell-compact` suite passes 11/11 and the full web suite 65/65, where the old run failed on this one test.

- **The screenshots for the Admin's aesthetic review** are in `.scratch/ai-transforms/screenshots/` (23 PNGs): the hint, the popup ready / upsell / exhausted / provider-unavailable, the review dialog, partial accept, reject, the stale-accept disabled reason, the styled paper, the Stylesheet tab's ready and AI-off states, the proposal and its provisional paper, the gallery tile off/on/locked, the plan offer and approval surface, the Admin cost readout, the styling reference, and the wrapped Inspector tab row. Saved rather than judged from code; not committed, matching how ticket 03's review screenshot was handled.

- **Verified green**: `pnpm test` (118 files, 1,512 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, the web browser suite (65 tests), the server e2e suite (3 tests, including the Custom Stylesheet page-geometry regression), and the core golden suite (22 tests). No test is skipped or quarantined.

- **Tracker**: the two superseded tickets were already marked — `.scratch/billing/issues/05-custom-css-fonts.md` records that its custom-stylesheet half is superseded by ai-transforms/01, and `.scratch/launch/issues/02-docs-page.md` is `wontfix`, superseded by ai-transforms/02. The spec and this ticket are flipped to `resolved`.

- **Launch checklist**: `.scratch/launch/issues/06-launch-checklist.md` now carries an "AI prerequisites" block — the key in the environment, a model chosen with the per-Action arithmetic in mind, caps sized to the model's window, Test connection run to completion, the Privacy page confirmed, and the kill switch left deliberately on or off.

- Note on the OpenRouter test ids in the ticket header: the live-provider pass is an operator step, not an agent one. The provider seam means every automated test runs against a fake and no live API is ever called, so the ids are recorded for the Admin's own Test connection run against a real key; `AI_API_KEY` stays in `.env`, environment-only per ADR-0008.



for testing use these:
open router
dots-studio/dots-3-note-preview:free
poolside/laguna-s-2.1:free

The provider's key is `AI_API_KEY` in `.env` (gitignored). It is never written
to a tracked file, a setting, a log, or an endpoint — see `.env.example` and
ADR-0008. Rotating it needs a server restart.
