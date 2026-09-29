# 04: One error message, one test helper, dead code (web)

**What to build:** every surface in the SPA that reports a failure goes
through the one helper that already exists for it, and every test that stubs
the API goes through the one response helper that already exists for it.
Today eight files import the error helper and nineteen more hand-roll the
same fallback; eight test files import the response helper and eighteen more
redeclare it byte for byte, three of those with the arguments in the wrong
order. After this ticket there is one of each.

The error half is the one behavior change in the whole sweep, and it is a fix.
A user whose device is offline currently reads the browser's raw "Failed to
fetch" on most panels; after this they read the sentence the other eight
files already show them.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The hand-rolled error fallback is gone from every site where it can be
      replaced by the shared helper, and every migrated site's existing test
      passes. A site whose catch can receive something other than an API error
      is **not** migrated — it keeps its own local shape rather than losing a
      message it was showing.
- [ ] The two sites that are not this pattern stay as they are, and the
      ticket names them: the one that constructs an API error from a cause
      inside the client's own fallback path, and the render pipeline's failure
      detail, whose wording is not a user-facing API message and must not be
      folded into the API helper's vocabulary.
- [ ] The offline case is now named on every surface that reports a failure,
      not eight of them. Where a surface has no test covering its failure
      text, the site is not migrated rather than the behavior being asserted
      by inspection.
- [ ] All eighteen test files that redeclare the shared JSON response helper
      import it instead, including the three with the arguments reversed —
      which is a live footgun this ticket closes rather than a cleanup.
- [ ] Every export removed in this ticket has been checked against the whole
      repository for an import site, and the removals are recorded. This
      includes the AI error-code union that no consumer ever matched on, the
      proposal type nothing names, the pane-layout internals that exist only
      to be white-box tested, and the theme, document, asset, font and admin
      API types that are file-local.
- [ ] The three props no call site passes are gone, each with the default and
      the now-unreachable styling fragments that existed only for them: the
      dialog's content-class override, the inspector text input's class
      override, and the editor toolbar button's disabled state.
- [ ] Shared test fixtures are untouched — they are intentional shared
      fixtures, and this ticket only removes exports from production modules.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the full unit
      suite green.
- [ ] The web e2e suite passes **without `--update-snapshots`**.

## Comments

- This ticket and 05 both touch the admin dialogs, which is why 05 is blocked
  by it. It goes first so the error-message migration lands on those files
  once, not twice.
