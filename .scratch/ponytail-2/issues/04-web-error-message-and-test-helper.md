# 04: One error message, one test helper, dead code (web)

**What to build:** every surface in the SPA that reports a failure goes
through the one helper that already exists for it, and every test that stubs
the API goes through the one response helper that already exists for it.
Today eight files import the error helper and nineteen more hand-roll the
same fallback; eight test files import the response helper and eighteen more
redeclare it byte for byte, three of those with the arguments in the wrong
order. After this ticket there is one of each.

The error half is the one behavior change in the whole sweep, and it is a
fix. A user whose device is offline currently reads the browser's raw "Failed to
fetch" on most panels; after this they read the sentence the other eight
files already show them.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The hand-rolled error fallback is gone from every site where it can be
      replaced by the shared helper, and every migrated site's existing test
      passes. A site whose catch can receive something other than an API error
      is **not** migrated — it keeps its own local shape rather than losing a
      message it was showing.
- [x] The two sites that are not this pattern stay as they are, and the
      ticket names them: the one that constructs an API error from a cause
      inside the client's own fallback path, and the render pipeline's failure
      detail, whose wording is not a user-facing API message and must not be
      folded into the API helper's vocabulary.
- [x] The offline case is now named on every surface that reports a failure,
      not eight of them. Where a surface has no test covering its failure
      text, the site is not migrated rather than the behavior being asserted
      by inspection.
      **Delivered on 11 of the 17 candidate sites.** The carve-out in the
      second sentence applies to six; they are listed by name under "What was
      done". "Every surface" is therefore *not* yet true — see the open item at
      the end of this file.
- [x] All eighteen test files that redeclare the shared JSON response helper
      import it instead, including the three with the arguments reversed —
      which is a live footgun this ticket closes rather than a cleanup.
- [x] Every export removed in this ticket has been checked against the whole
      repository for an import site, and the removals are recorded. This
      includes the AI error-code union that no consumer ever matched on, the
      proposal type nothing names, the pane-layout internals that exist only
      to be white-box tested, and the theme, document, asset, font and admin
      API types that are file-local.
- [x] The three props no call site passes are gone, each with the default and
      the now-unreachable styling fragments that existed only for them: the
      dialog's content-class override, the inspector text input's class
      override, and the editor toolbar button's disabled state.
- [x] Shared test fixtures are untouched — they are intentional shared
      fixtures, and this ticket only removes exports from production modules.
      **One caveat, disclosed rather than hidden:** no fixture's code or
      exports changed, but `src/testing/json-response.ts` gained a six-line
      doc comment recording the single-read rule (see below). If "untouched"
      is read as byte-identical, this is the one byte that moved.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the full unit
      suite green.
- [x] The web e2e suite passes **without `--update-snapshots`**.

## Comments

- This ticket and 05 both touch the admin dialogs, which is why 05 is blocked
  by it. It goes first so the error-message migration lands on those files
  once, not twice.

## What was done

### Error messages: 11 of 17 candidate sites migrated

The 19 hand-rolled fallbacks break down as the spec said: 2 are not the
pattern at all, 17 are candidates, and of those **11 have an existing test
that drives the catch path**. Those 11 now call `errorToMessage`, and all 11
are now *verified* rather than merely exercised:

| Surface | Test that covers the failure text |
| --- | --- |
| `admin/AuditLog.tsx` | stubs `TypeError('network down')`; **tightened here** — see below |
| `admin/VerificationQueue.tsx` | stubs `TypeError('network down')`; **tightened here** — see below |
| `admin/RejectDialog.tsx` | asserts `'Order not found.'` |
| `admin/GrantEntitlementDialog.tsx` | asserts the server's duration refusal |
| `admin/CompQuotaDialog.tsx` | asserts `'Comps for this period cannot go below zero.'` |
| `admin/DeleteAccountDialog.tsx` | asserts the self-delete refusal |
| `admin/VerifyDialog.tsx` | asserts `'Only pending orders can be decided.'` |
| `admin/ChangeEmailDialog.tsx` | asserts the same-address refusal |
| `admin/SendResetLinkDialog.tsx` | asserts `'User not found.'` |
| `billing/UpgradeFlow.tsx` | asserts the 503 payment-method refusal |
| `billing/PaymentForm.tsx` | `UpgradeFlow.test.tsx` asserts `'Order not found.'` |

**Two of the eleven needed their assertion tightened.** `AuditLog.test.tsx`
and `VerificationQueue.test.tsx` both stubbed the offline `TypeError` and then
asserted only that an alert *element* appeared. That proves the catch ran, but
not what it said — so under them the new offline sentence would have been
verified by inspection, which is the one thing the ticket forbids. Both now
assert the sentence their own fixture already produces:

```js
expect(alert).toHaveTextContent(
  /couldn.t reach the server\. Check your connection and try again\./i,
);
```

This adds no new file, no new scenario, and no new mock — the fixture and the
render path were already there, and the assertion is a real guard: before the
migration those two alerts read `network down`, which that regex rejects. It
is also the only test in the repo that pins the offline sentence end to end,
which is the whole behaviour change of this ticket.

**Six candidates keep their local shape on purpose** — no test covers their
failure path, and the ticket's rule is not to assert that behaviour by
inspection: `admin/UsersPanel.tsx:31`, `admin/UserDetail.tsx:63`,
`admin/UserDetail.tsx:342`, `admin/SettingsPanel.tsx:44`,
`admin/SettingsPanel.tsx:132` (the shared `useSectionSave` catch),
`admin/SettingsPanel.tsx:655`. Their existing suites pass either way, because
none of them renders those states. A follow-up that wants the offline sentence
on those six needs the tests first — that is the cheap order.

The behaviour change is confined to the offline path, and it is the fix the
ticket describes: a `TypeError` from a failed `fetch` now reads "Couldn't
reach the server. Check your connection and try again." instead of the
browser's raw "Failed to fetch". Every `ApiError` still shows the server's own
message unchanged, which is what all the assertions above check.

### The two named exclusions, unchanged

- `account/HistorySection.tsx` — `toApiError` constructs an `ApiError` from a
  cause because the section branches on `error.status === 403` for the Premium
  gate. It needs an object, not a string; folding it into `errorToMessage`
  would cost the upsell state.
- `export/protocol.ts:155` — the `render_failed` detail, whose
  "Unknown render error." wording is a render-pipeline diagnostic, not a
  user-facing API message.

### One test response helper: 17 declarations, 25 import sites

The audit counted 18; the actual number of redeclaring files is 17, and the
three with reversed arguments are exactly `auth/api.test.ts`,
`export/serverExport.test.ts` and `export/ExportSplitButton.test.tsx`. All 17
now import `testing/json-response`, and every call site in those three was
re-ordered to `(status, body)`.

The two export suites were the interesting ones: their local helper was not a
`Response` at all but a hand-rolled object literal with `ok`/`status`/`json()`
and reversed arguments, so it also drifted in shape. Swapping in the shared
helper made them build real `Response`s, and that surfaced one genuine
difference: a real body is readable once, so the poll-timeout test — which
reused a single instance across every poll — now mints a fresh one per call
instead of failing the second read.

### Dead exports removed: 25

Every one was checked against the whole repository (`apps/web`, `apps/server`,
`packages/core`, e2e) for an import site; none had one. Where a name also
exists in the server package it is an unrelated module of its own
(`ExportPayload`, `EntitlementView`, `UsageView`, `AiConnectionModel`).

| Module | Removals |
| --- | --- |
| `ai/api.ts` | `AiErrorCode` (the union no consumer ever matched on) |
| `ai/types.ts` | `AiProposal` (the proposal type nothing names) |
| `shell/pane-layout.ts` | `shellModeFor`, `PaneLayoutState`, `effectiveEditorWidth`, `clampPaneWidth` |
| `theme/theme.ts` | `readStoredTheme`, `systemTheme` |
| `documents/store.ts` | `OnboardingMeta`, `DeleteSnapshot`, `ExportPayload`, `DocumentStore`, `documentStore` |
| `assets/ingest.ts` | `AssetIngestError`, `PreparedAsset`, `PreparedAssetResult` |
| `assets/resolver.ts` | `AssetUrlMode` |
| `fonts/ingest.ts` | `PreparedFont`, `PreparedFontResult` |
| `fonts/loader.ts` | `FontRegisterVerdict` |
| `admin/api.ts` | `EntitlementView`, `VerifyGrant`, `UsageView`, `ManualGrant`, `AiConnectionModel` |

No fixture code or export was removed or renamed: `src/testing/*` is the
intentional shared-fixture surface and the dead-export removals all came from
production modules. The single exception is a doc comment added to
`src/testing/json-response.ts`, which records the single-read rule — the two
export suites' fake `Response` had hidden it, and the first real-`Response`
stub hit "Body is unusable" on its second read. See the caveat on the
checklist.

**The pane-layout trade-off, stated plainly.** The four pane-layout internals
were exported solely so `pane-layout.test.ts` could drive them directly, so
de-exporting them means the three white-box `describe` blocks
(`effectiveEditorWidth`, `clampPaneWidth`, `shellModeFor`) lose their import
and go. The `usePaneLayout` hook-level describes stay, and the documented
numbers were re-pinned **through the hook** rather than left to the sum buried
inside `PANE_LIMITS`:

| Assertion | Where it lives now |
| --- | --- |
| `860` = the row's own minimum; wide at 860, compact at 859 | `pane-layout.test.ts`, via `result.current.mode` |
| `SHELL_WIDE_MIN === 860` | same test |
| the 38% editor default | e2e `visual.spec.ts` "pane layout contract" (±16px) |
| the 320px inspector default, the 320px canvas minimum | e2e, same test; and the hook's `1200 - 320 - 260` ceiling |
| the 280 editor floor and the 260 inspector floor | new hook test, "holds each pane at its own floor" |
| the min-wins-on-a-too-small-container case | new hook test, at 800px |
| growing across a collapsed neighbour | new hook test |

`860 = 280 + 320 + 260` is a claim in DESIGN.md and ADR-0006, so leaving the
three terms unpinned would have been a standards breach rather than a cleanup.
The one assertion genuinely lost is `effectiveEditorWidth`'s direct unit test
that the 38% default returns exactly 456 at a 1200px container — and that
number is what `AppShell.test.tsx`'s "clamps drags to the editor min and max
widths" and the e2e contract assert instead. A reviewer who wants the
exact-456 unit test back should add it against the hook, not re-export the
internals.

### Three props no call site passes

- `shell/Dialog.tsx` — `contentClassName`, its `= ''` default, and the
  template that interpolated it. The wrapper's class list is unchanged
  (`mt-3`), so no pixel moves.
- `inspector/controls.tsx` — `TextInput`'s `className`, with the
  `w-full ${className ?? ''}` collapse to `w-full`. Note this is the
  *inspector* input; `SettingsPanel`'s own `TextField` keeps its `className`,
  which two call sites do pass.
- `editor/EditorPane.tsx` — `ToolButton`'s `disabled`, the `disabled={...}`
  binding, and the three now-unreachable `disabled:*` utility fragments. No
  one can ever disable those ten buttons, so those variants were dead CSS.

### Verification

`pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean; `pnpm test` green at
150 files / 1901 tests; `pnpm --filter @perfectmarkd/web test:e2e` green at 69
tests with the four visual baselines byte-identical and no
`--update-snapshots`. `apps/server` and `packages/core` are untouched.

## Open item

**The six untested error surfaces still read the browser's raw "Failed to
fetch" when the device is offline.** This is the one acceptance criterion not
fully met, and it is left open rather than ticked silently:

- `admin/UsersPanel.tsx:31` — needs a test that makes `listAdminUsers` fail
- `admin/UserDetail.tsx:63` — needs a test that makes `getAdminUser` fail
- `admin/UserDetail.tsx:342` — needs a test that makes `revokeEntitlement` fail
- `admin/SettingsPanel.tsx:44` — needs a test that makes `getAdminSettings` fail
- `admin/SettingsPanel.tsx:132` — needs a test that makes `updateAdminSetting` fail
  (its `error` state is shared with the client-side validation errors, so the
  test must assert the save-path message, not the validation one)
- `admin/SettingsPanel.tsx:655` — needs a test that makes `testAiConnection`
  fail rather than return a report

The tests are cheap and the order is the right way round: write the test, then
swap the four words for `errorToMessage(cause)`. Until they exist, the
migration there would be behaviour asserted by inspection, which this ticket
forbids.

## Review outcome

A two-axis review (`/code-review`, standards + spec) ran over the diff. Both
axes raised hard findings; all three are fixed in this commit.

**Standards, hard #1 — the deleted white-box blocks were the only assertions
on DESIGN.md's `860 = 280 + 320 + 260` and ADR-0006's pane minimums.** Fixed
by adding three hook-level tests that pin the 280/260 floors, the min-wins
case, and the collapsed-neighbour growth — driven through the public hook, so
the internals stay unexported. The 38% default is pinned by the e2e
"pane layout contract". See the table above for where each number lives.

**Standards, hard #2 — the "offline case is now named on every surface" box
was ticked while six surfaces still hand-roll the fallback.** Fixed by
annotating the box with the real number and adding the Open item section.

**Spec, hard — two of the eleven migrated sites asserted only that an alert
existed, so their new sentence was verified by inspection.** Fixed by
tightening those two assertions, as described above. Without this the
migration would have been exactly the thing the ticket's rule forbids, and
the offline sentence — the ticket's one behaviour change — would have had no
test anywhere.

Three judgement calls were raised and deliberately not actioned, with reasons:

- *Duplicated Code* — the nine dialogs now share
  `setError(errorToMessage(cause)); setSubmitting(false);`. Pre-existing, and
  the shared dialog action row is ticket 05's job, not this one's.
- *Mysterious Name* — `errorToMessage` vs `errorToUserMessage`. Pre-existing
  pair; which surface picks which is a decision for 05, and the spec names
  `errorToMessage` as the right one for these surfaces.
- *Primitive Obsession* — with `AiErrorCode` gone, `StylesheetAiBlock.test.tsx`
  passes `'ai_provider_error'` as a bare literal. It already did; the test
  never imported the union, so removing it loses nothing. The ticket asks for
  that union to go precisely because nothing matched on it.

The spec axis also confirmed, independently, that all 25 removals are
file-local with no importer in any package or in e2e, that the export-stub
swap is safe, and that no rendered pixel, wire shape, or public behaviour
moved beyond the offline `TypeError`.
