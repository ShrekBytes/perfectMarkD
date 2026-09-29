# 05: Shared UI components for dialogs, sections, toasts and auth fields

**What to build:** the four repeated shapes in the SPA's own chrome become one
component each, so the next change to a hit target, a heading level or a
dismissal delay is one edit. Eleven dialogs restate the same confirm/cancel
row; eight account cards restate the same shell; three toasts restate the
same markup and four more hand-roll the timer the toast hook already owns;
five auth files declare the same input styling and four declare the same
password floor.

Every surface renders exactly as it does today. This is a change about where
the markup lives, not about what it looks like — which is why the visual
baselines must come out byte-identical.

**Blocked by:** 04 — One error message, one test helper, dead code (web) —
seven admin dialogs are touched by both tickets, so they go in one order.

**Status:** resolved

- [x] The dialog action row — the error line, the confirm button and the
      cancel button — is one component beside the existing dialog primitive.
      All eleven call sites use it and every one renders as before, including
      the destructive confirm, whose tone is carried by the shared form rather
      than by a hand-written variant. Hit targets, focus rings and the
      busy-state label are unchanged.
      **Delivered at eight of the eleven**, named and counted under "What was
      done": the other three are the compact right-aligned pairs, which are a
      different shape, not eleven copies of one.
- [x] The account section card is one component. All eight surfaces use it
      and each keeps its own heading text, its own label wiring and its own
      contents.
      **Delivered at seven**, with the eighth named: it is `ErrorBoundary`'s
      inline failure, which shares the shell's class string and sits in the
      shell layer.
- [x] The toast is one presentational component and its timer is the hook the
      previous sweep already extracted. All three toasts use both, and the
      four surviving hand-rolled timer effects are gone.
      **Two of the four timers went, and the other two were never the toast's** —
      named under "What was done". All three toasts now render one component
      off one clock.
- [x] **The toast dismissal timing becomes one number.** It is currently two —
      one file dismisses sooner than the others — and the ticket's acceptance
      is that every surface now reads the same. Which value wins is the one
      deliberate change, and it is stated here so the implementer picks
      deliberately rather than by accident.
      **7000ms wins** over 6000ms. The reasoning, and what it costs, is under
      "What was done".
- [x] The input field-class string is declared once and imported by all five
      auth and account files. The declaration is byte-identical everywhere it
      was, so the rendered input does not move.
      **Seven files declared it, not five.** Six declared it as
      `const INPUT_CLASS`; `auth/ResendVerification` held a seventh copy
      inline, and was found by the review rather than by the audit. All seven
      were byte-identical, so the rendered input does not move anywhere.
- [x] The password minimum floor is declared once, and the "at least N
      characters — M more needed" hint is computed one way. The hint's exact
      wording is unchanged at every point in its range.
- [x] No new dependency is added. A class-name merge utility is the obvious
      temptation here and is explicitly refused: the repo's own rule is not to
      take a dependency for trivial functionality, and the template-literal
      idiom is fine.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the full unit
      suite green.
- [x] The web e2e suite passes **without `--update-snapshots`**, and the
      visual baseline files come out byte-identical — verified by checksum
      before and after, the way the previous web sweep tickets did. Three of
      this ticket's changes touch rendered chrome, so a baseline move means a
      pixel moved and the change is wrong, not the baseline.

## Comments

- This is the largest ticket in the sweep, at roughly 275 lines across about
  25 files, and it is deliberately one ticket rather than two: the previous
  sweep's comparable web ticket was slightly larger and landed clean, and
  splitting it would put a shared-component seam between two halves that both
  need it.
- The line estimate for the dialog action row assumes the eleven blocks are
  structurally identical beyond their class strings, which was verified for
  the classes but not for every label. The implementer should revise the
  estimate early if that assumption is wrong, and say so in the ticket's
  comments rather than quietly absorbing it.

## What was done

### Four shapes, four homes

| Shape | Home | Reached |
| --- | --- | --- |
| The dialog action row | `shell/DialogActions.tsx`, beside `Dialog` | 8 dialogs |
| The Account page's section card | `account/AccountSection.tsx` | 7 sections |
| The transient toast | `shell/Toast.tsx` | 3 toasts |
| The toast's clock | `shell/useTransientToast.ts` (moved out of `export/`) | 3 toasts |
| The auth field class + password floor | `auth/field.ts` | 7 files / 4 files |

The toast's clock moved out of `export/` because it is no longer the export
flow's own: `library/DeleteToast` and `shell/AppShell` both need it, and
importing a shared primitive out of the export feature is the coupling this
ticket exists to remove. It sits beside the toast's markup, and the two export
flows import it from there. The file was `git mv`d, but the rewrite is large
enough that git scores the pair below its rename threshold, so it lands in this
commit as a delete and a create — stated here rather than left for someone to
find in the log. The spec's Out of Scope rule against "reorganising hooks out
of their files" is about hooks with one caller; this one has three.

### The dialog action row: 8 of the 11, and the three that are not the same shape

`DialogActions` takes the failure line, the confirm and the cancel as one row.
Its `tone` carries the fill, so no call site hand-writes a confirm:

| Call site | Tone | Busy label |
| --- | --- | --- |
| `admin/VerifyDialog` | primary | Granting… |
| `admin/GrantEntitlementDialog` | primary | Granting… |
| `admin/ChangeEmailDialog` | primary | Sending… |
| `admin/CompQuotaDialog` | primary | Applying… |
| `admin/SendResetLinkDialog` | primary | Sending… |
| `admin/RejectDialog` | danger | Rejecting… |
| `admin/DeleteAccountDialog` | danger-ghost | Deleting… |
| `admin/UserDetail` (`RevokeActions`) | danger-ghost | Revoking… |

**The three the ticket's count includes are not eleven copies of one row, and
folding them in would have made the component worse.** The audit verified their
class strings and not their structure, and the structure is what differs:

- `export/PrintHintDialog` — `justify-end` rather than a full-width confirm,
  both buttons 32px, **Cancel first**, no failure line.
- `shell/DocName` (the compact rename dialog) — the same right-aligned,
  cancel-first pair at 36px, and the confirm is a `type="submit"` inside a
  `<form>`.
- `billing/PaymentForm` — the same 36px full-width row as the eight, but the
  confirm is a `type="submit"`, the cancel is conditional, and the pair carries
  `touch-target`.

Taking all three needs an `align`, a `size`, a `confirmType`, an
`optionalCancel` and a `touchTarget` — five knobs, each with exactly one
caller, wrapped around a row the eight common call sites would then have to
read past. That is the config nobody sets. **They stay as they are, and the
next sweep should not look here again.**

Note what is *not* the reason, because the first draft of this ticket had it
wrong: the compact pairs carry `shadow-sm` on the primary and the eight
migrated confirms do not, but neither do the eight carry `touch-target` — so
neither the shadow nor the touch floor distinguishes the two groups, and
neither is a reason to keep them apart. The reasons are the ones above.

**Three confirm tones, not one, and that is a finding rather than a choice.**
`RejectDialog` renders a solid `--danger` fill; `DeleteAccountDialog` and
`RevokeActions` render the hairline `--danger` ghost that DESIGN.md names for
"copy that warns of loss". They are different pixels, so the component carries
both and the ticket's "renders as before" holds. The solid fill is the one
treatment DESIGN.md's Buttons section does not name — reconciling it is a
design decision, not a deduplication, and it is flagged below rather than
decided here.

**`disabled` and `submitting` merged into one prop.** Every one of the eight
already disabled its confirm while submitting, and seven also repeated
`|| submitting` in the caller's own precondition. The component now ORs the two
and a caller states only its own reason. Behaviour is identical at all eight
(verified: `SendResetLinkDialog`'s confirm was *only* `submitting`, so it now
omits `disabled` entirely and is disabled by the same rule as before).

### The Account section card: 7, and the eighth is named

All seven sections share the shell byte for byte — `aria-labelledby` wired to
the heading's own `id`, the same pane class, the same `h2`. Each keeps its
heading text, its ids and its contents.

**The eighth is `shell/ErrorBoundary`'s inline failure.** It renders the same
pane class in the same column, which is why an audit counting the string found
eight. It is not migrated: it has no heading and no label wiring to keep, and
it lives in `shell/`, so importing `account/` into the shell layer — to save
one string — is a dependency inversion the ticket does not justify. It stays as
it is, and the two layers' card geometry is now the one place a future DESIGN.md
change could still drift.

`PasswordSection` is a caption plus a form, not a card, and renders no shell;
the signed-out prompt in `AccountPage` is an `h1` in a `p-6` panel, a different
shape again.

### The toast: one component, one clock, 7 seconds

`Toast` owns the wrapper, the pane, the message and the dismiss button; the
caller owns the message and the clock. Two optional slots, both load-bearing:
`tone` (the export toast's one danger message) and `action` (the delete toast's
Undo, which is the only toast that starts a flow).

**The clock is two hooks in one module, for two kinds of consumer.** The spec
asks for one mechanism and gets one: there is one `TOAST_MS`, one `setTimeout`
call site, and one cleanup path. `useTransientToast` is that mechanism's
message-owning form, for a flow that raises its own toasts (both export
flows); `useToastTimer` is the clock alone, for a surface whose message already
lives somewhere else — the document store owns the delete toast, and
`AppShell` owns the rejected-drop names. `useTransientToast` is itself built
on `useToastTimer`, so there is nothing to keep in step.

The alternative was mirroring store state into `useTransientToast`'s own state,
which the review's spec axis flagged as "a second mechanism" and is worth
answering on the merits: it works, and it leaves two sources of truth for "is
this toast up" — the store's `deleteToast` and the hook's `toast` — which have
to agree on every render, for no gain. The two-hook split is the smaller
mechanism, not a larger one.

So the two hand-rolled timer effects are gone, and the ticket's count of four
includes two that are not the toast's:

- `editor/EditorPane` — the asset-ingest notice, a 6s `role="status"` strip in
  the editor's own column, not a toast and not this chrome.
- `billing/CopyButton` — the 1.5s flip back to the copy icon. A boolean, not a
  message, and the shortest window in the app by design.

Neither would gain anything from a toast clock, and neither is drift: both
already name their own constant at its own site.

**7000ms wins over 6000ms, and it is the more consequential number that stays
put.** The one number has to be right for the hardest case in the set, and the
hardest case is the undoable delete: its expiry is the only thing in the app
that makes something permanent, and the toast offers an explicit Undo control
beside it. Choosing 6000 would have shortened the only window whose loss is
irreversible, to buy nothing — the two informational toasts gaining a second
they cannot notice is free, the reverse is not. `TOAST_MS` moves from 6000 to
7000; the export toast and the rejected-drop notice each wait out that second.

Nothing tests the constant, and this ticket adds nothing that does: the clock
is not observable in jsdom without fake timers, and a test asserting a wall
clock number is the kind of seam the spec's Testing Decisions refuse to add.

### The auth field class and the password floor: 7 files, 4 files

`auth/field.ts` declares `INPUT_CLASS`, `PASSWORD_MIN` and `passwordHint()`.
Seven files carried the field class — six as `const INPUT_CLASS` and
`auth/ResendVerification` inline. All seven were byte-identical, so the
rendered input does not move anywhere.

Six of the seven are in `auth/` and `account/`. The other classes in the app
that *look* like this one are not: `PaymentForm`'s and `SettingsPanel`'s
monospace fields, the admin dialogs' non-`touch-target` inputs, and
`PaymentForm`'s `px-2` field are each a different field, and adopting them
would move a pixel or change a font.

Four declared `PASSWORD_MIN = 8` and four computed the hint; all four now call
`passwordHint(length)`. `AuthForm` is the one that wrapped the hint in a mode
check, and it still does: `mode === 'register' ? passwordHint(password.length)
: null`. The wording is byte-identical at all three points in its range —
empty (policy only), short (policy + the count), satisfied (policy only) — and
`AuthPage.test.tsx`, which asserts two of those three, still passes unchanged.

### Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean.
- `pnpm test` green at **150 files / 1901 tests** — the same count as the run
  before the change. No test file was added, edited or removed, as the spec's
  Testing Decisions require.
- `pnpm --filter @perfectmarkd/web test:e2e` green at **69 tests**, no
  `--update-snapshots`, and the four visual baselines byte-identical by md5
  before and after.
- Every class string this ticket moved was compared **token by token against
  `HEAD`** (class order in the attribute is not the cascade; the utility set
  is). All 24 dialog-row strings, all 9 toast strings plus the Undo action, the
  7 section shells and all 7 field classes came back identical. The one
  intentional exception is below.
- `apps/server` and `packages/core` are untouched; the diff is `apps/web/src`
  only, 30 files.

### The one pixel that moved, and why

`RejectDialog`'s failure line was `mt-2` where the other seven are `mt-3`. The
shared line is `mt-3`, so that line sits 4px lower than it did.

**This deviates from the ticket's own premise** — "every surface renders
exactly as it does today" — and it is the one place the diff does. The
alternatives were:

1. Keep it at `mt-2` and move the *other seven* to `mt-2`. Rejected: seven
   pixels of movement instead of one.
2. Keep it with an `errorClassName` prop that one caller passes. Rejected: an
   escape hatch on the one line the shared row exists to own, with exactly one
   user, which re-creates the drift this component removes — and it is the same
   shape as the class-override props ticket 04 deleted three days earlier.
3. Accept the 4px, disclosed, as above. Chosen.

What makes it survivable is that nothing observes it: no visual baseline covers
an admin dialog, no e2e spec opens one, and no test asserts the class. The
ticket's rule that a moved baseline means the change is wrong still holds — no
baseline moved.

## Open items

- **The eight migrated confirms are 36px with no `touch-target`, so they do not
  reach DESIGN.md's 44px coarse-pointer floor** for overlay controls, which the
  same spec requires of the compact pairs this ticket deliberately left alone.
  The spec's User Story 3 asked for the hit targets to be *corrected* "in one
  place"; the ticket downgraded that to "unchanged", which was the right call
  for a no-pixel-change sweep, and the correction is now one edit — in
  `CONFIRM_CLASS`. Inherited, not introduced, and not fixable here.
- **`RejectDialog`'s solid `--danger` confirm is not a treatment DESIGN.md
  names**, and none of the eight confirms carries the `shadow-sm` DESIGN.md
  gives Primary. Both are one map entry and one class constant now, so
  reconciling the confirm's treatments is a single edit.
- **`shell/ErrorBoundary`'s card** keeps its own copy of the Account page's pane
  class for the layer reason above. Worth a decision about which layer owns the
  Account page's card geometry, not another deduplication pass.

## Review outcome

A two-axis review (`/code-review`, standards + spec) ran over the staged diff.
Both axes raised findings; six are fixed in this commit, and the rest are
recorded above or in the Open items.

**Standards, hard 1 — a seventh copy of the field class survived the diff.**
`auth/ResendVerification.tsx` carried the same string inline rather than as
`const INPUT_CLASS`, which is why the audit's grep missed it. Fixed: it imports
`field.ts` now, and the count in the checklist is corrected to seven.

**Standards, hard 2 — `field.ts`'s header contradicted the glossary.** It
justified the constant with Custom Stylesheets targeting a form field.
CONTEXT.md:20 and ADR-0011 scope a Custom Stylesheet to `--mpdf-*` on
`.mpdf-doc`/`.mpdf-page` — the printed Document, which cannot reach an auth
input. Rewritten to the reason that actually holds.

**Standards, hard 3 — a comment that contradicted the code.** The `TOAST_MS`
doc said the delete toast "keeps the longer window", which is false: all three
are 7000 and two were lengthened. Rewritten to say what happened.

**Standards, hard 4/5 — the tone comment misdescribed DESIGN.md and the
miscounted its own callers** ("seven dialogs", "eleven edits", and a quote
attributed to the Buttons section that lives in the Banner Strip section).
Corrected, and the `DialogActions` doc now says plainly that it is not a
conformance fix rather than implying the hit targets are handled.

**Standards, hard 6 — a false claim about history.** "git mv'd, so the history
follows it" is not true: the rewrite scores below git's rename threshold, so
this commit records a delete and a create. Stated as such in "What was done".

**Spec, hard — the one pixel.** The spec axis held that the `mt-2` → `mt-3`
move inverts the ticket's own rule ("a baseline move means the change is
wrong"). The three alternatives are now written out above rather than argued in
prose, and the deviation is labelled as one.

**Spec — "a second mechanism" for the two-hook clock.** Answered on the merits
in "What was done": one constant, one `setTimeout`, one cleanup, and the
message-owning hook is built on the clock-only one. The alternative the axis
implied — mirroring store state into the hook — trades a real correctness
hazard (two sources of truth) for a smaller export list.

**Spec — a factual slip, corrected.** The first draft of this file called
`PrintHintDialog`'s buttons 28px; `h-8` is 32px. The conclusion is unaffected
and the reasoning no longer rests on it.

**Standards, judgement — `ExportToast` in shell chrome.** The type was named
for the export feature that first needed it, and it is now shared by three
features in `shell/`. Renamed `ToastMessage`. `confirmTestId` and `error` were
also optional although all eight callers pass both, which is the inverse of the
spec's User Story 18 and of ticket 04's own cleanup; both are required now.
