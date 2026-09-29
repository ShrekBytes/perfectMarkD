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

**Status:** ready-for-agent

- [ ] The dialog action row — the error line, the confirm button and the
      cancel button — is one component beside the existing dialog primitive.
      All eleven call sites use it and every one renders as before, including
      the destructive confirm, whose tone is carried by the shared form rather
      than by a hand-written variant. Hit targets, focus rings and the
      busy-state label are unchanged.
- [ ] The account section card is one component. All eight surfaces use it
      and each keeps its own heading text, its own label wiring and its own
      contents.
- [ ] The toast is one presentational component and its timer is the hook the
      previous sweep already extracted. All three toasts use both, and the
      four surviving hand-rolled timer effects are gone.
- [ ] **The toast dismissal timing becomes one number.** It is currently two —
      one file dismisses sooner than the others — and the ticket's acceptance
      is that every surface now reads the same. Which value wins is the one
      deliberate change, and it is stated here so the implementer picks
      deliberately rather than by accident.
- [ ] The input field-class string is declared once and imported by all five
      auth and account files. The declaration is byte-identical everywhere it
      was, so the rendered input does not move.
- [ ] The password minimum floor is declared once, and the "at least N
      characters — M more needed" hint is computed one way. The hint's exact
      wording is unchanged at every point in its range.
- [ ] No new dependency is added. A class-name merge utility is the obvious
      temptation here and is explicitly refused: the repo's own rule is not to
      take a dependency for trivial functionality, and the template-literal
      idiom is fine.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the full unit
      suite green.
- [ ] The web e2e suite passes **without `--update-snapshots`**, and the
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
