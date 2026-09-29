# Ponytail II: the second repo-wide sweep, at the seams the first one left

Status: ready-for-agent

## Problem Statement

The first ponytail sweep (`.scratch/ponytail/`, four tickets, delivered
2026-09-29) removed roughly 1,180 lines. A second whole-repo audit run the
same day, over what survived, found roughly 780 more. Nothing there is a
correctness, security, or performance finding — the whole list is the same
kind of thing the first sweep was about — and **no dependency is removable**:
every dependency in all three package.json files has a verified import site.
One dependency is miscategorised.

The reason a second sweep finds 780 lines is not that the first missed them.
It is that the first sweep deduplicated *within* each file cluster and left
the copies that straddle clusters. The patterns are the same four:

- **Shared primitives re-declared per consumer.** One error-message helper
  already exists and eight files import it; nineteen more hand-roll the same
  fallback. One `jsonResponse` test helper exists and eight test files import
  it; eighteen more redeclare it byte for byte, three of them with the
  arguments reversed. One 200-character input-class string is declared in five
  files. One "at least 8 characters — N more needed" hint is computed four
  times.
- **One helper that stops short of all its call sites.** The first sweep
  extracted a transient-toast hook and wired up two of five consumers; the
  toast's markup is still byte-identical in three places and three other
  files still hand-roll the timer effect. It extracted a click-outside hook
  and that one did land everywhere.
- **Route scaffolding the first sweep's helpers didn't reach.** Thirteen
  verbatim "Not signed in." guards and twelve verbatim
  `asRecord(parseJson(await c.req.text()))` chains survive; the first sweep
  consolidated the *admin* prelude and left the rest of the package alone.
- **Dead public surface.** Roughly 86 exported symbols have no import site
  outside the file that declares them — most are types, most in the golden
  harness, several in the barrel's own spot-checks.

The cost is not the line count. It is that the copies drift: the toast timer
is 6 s in one file and 7 s in another, the plan CTA class string is identical
in three places and near-identical in a fourth, and the error fallback is the
one place where a swallowed offline `TypeError` becomes a raw "Failed to
fetch" in the UI. A fourth sweep will find the residue this one leaves.

## Solution

Five package-scoped tickets, ordered so that every file is touched by one
ticket at a time. Each is a mechanical, no-behavior-change sweep sized for a
single context window, and each is guarded by the suites that already exist:
the repo-wide unit suite for everything, the paginator goldens for the core
ticket, and the web visual e2e baselines for the two web tickets.

The two findings with design content — one upstream error vocabulary across
the four HTTP clients, and one error-message helper across the web surfaces —
are separated from the mechanical residue around them so the argument they
carry is reviewable on its own.

## User Stories

1. As a maintainer, I want one error-message helper behind every surface that
   shows a failure, so that a user who is offline reads one honest sentence
   instead of the browser's raw "Failed to fetch", and so the wording cannot
   drift per panel.
2. As a maintainer, I want the shared toast to be the only toast, so that its
   dismissal timing is one number rather than three, and so a fourth toast
   inherits working behaviour instead of re-deriving it.
3. As a maintainer, I want one dialog action row, so that the confirm and
   cancel pair's 44 px hit targets and focus rings are corrected in one place
   rather than eleven.
4. As a maintainer, I want one account section shell, so that the eight
   account-page cards share a heading level, padding and label wiring instead
   of restating it.
5. As a maintainer, I want one auth field-class constant, so that the input
   styling a Custom Stylesheet targets is a single selector and the five
   copies cannot drift apart under a DESIGN.md change.
6. As a maintainer, I want the password minimum declared once, so that the
   hint's arithmetic ("N more needed") is computed one way and the server and
   client cannot disagree about the floor.
7. As a maintainer, I want one shared test response helper, so that a stub
   cannot answer with a different content type in one file than in another,
   and so the argument order is a compile error rather than a wrong status.
8. As a maintainer, I want one upstream error type across the four outbound
   HTTP clients, so that "the provider did not answer in time" is one concept
   I can grep, and so a fourth client does not re-invent the vocabulary.
9. As a maintainer, I want the "not signed in" guard to be one middleware, so
   that adding a protected route does not mean copying a guard and hoping the
   401 shape stays the same.
10. As a maintainer, I want request-body parsing to be one call, so that a new
    route does not have to decide between the streaming reader and the text
    reader for no reason.
11. As a maintainer, I want the gated-feature flag computed where the fact
    already is, so that a fifth gated control does not need a flag renamed to
    match it.
12. As a maintainer, I want the platform's own primitives used for reference
    codes and UTC date ends, so that a rejection-sampling loop and a
    hand-assembled `23:59:59.999` are not ours to maintain.
13. As a maintainer, I want dead exports gone, so that the next person reading
    a type declaration can assume something imports it.
14. As a maintainer, I want settings fields that nothing reads removed, so
    that a setting's existence implies a control exposes it.
15. As a maintainer, I want the paginator's fit-counting written once, so that
    a change to how forced splits work lands in one place.
16. As a maintainer, I want the golden harness's internals private, so that
    the regression net's surface is the four functions its suites import.
17. As a maintainer, I want the golden suite's own dependencies declared as
    such, so that a consumer of the engine does not install a diagram renderer
    it never loads.
18. As a maintainer, I want props no call site passes removed, so that the
    next reader does not hunt for a caller of an escape hatch that has none.

## Implementation Decisions

### One upstream error type, and why email/01's boundary moves

`.scratch/email/issues/01-mailer.md` recorded that the Resend client's
transport boilerplate stays separate from the AI provider's: *"different
error
vocabularies and different response readers; the shared shape would need five
knobs and would couple the mail feature to the AI one."* The first sweep
honored that and merged only the abort/timeout mechanics. **This ticket
overturns it, and the reason is that the premise no longer holds:** there were
two copies when the decision was recorded and there are four now (the AI
provider, the mailer, the Google identity exchange, and the LTC rate
provider), all carrying the *same four code strings* — transport, timeout,
http, invalid_response — and the same `{ code, status, detail }` shape and the
same three-closure `errors` literal.

The "five knobs" figure does not survive contact either. With one error class
the seam takes two strings (the timeout message, the transport message) and
one parser, not five knobs — the consolidation *shrinks* the interface the
decision was protecting. And the coupling the decision named is already there
in substance: four files agree on one vocabulary by copy-paste, so they are
coupled whether or not they share a type.

**Boundary kept:** each client keeps its own message strings at its own throw
site and its own response parsing. Only the error type, the code vocabulary,
the JSON reader and the deadline mapping merge. This is the same boundary
`email/01` drew, drawn one level in.

This is not an ADR. It is an internal error class, cheap to revert, and the
original reasoning lives in a closed ticket rather than in `docs/adr/`. The
argument belongs in the ticket that carries it.

### One error-message helper, adopted site by site, not blanket-replaced

`errorToMessage` is not a drop-in for every one of the nineteen hand-rolled
sites, and the difference is load-bearing. The hand-rolled form passes through
*any* `Error`'s message; the helper returns its fallback for anything that is
not an `ApiError` or a `TypeError`. Two sites are not this pattern at all:
one constructs an `ApiError` from a cause inside the client's own fallback
path, and one is the render pipeline's `render_failed` detail with its own
`Unknown render error.` wording, which is not a user-facing API message and
must not be folded in. Seventeen sites are candidates; each is migrated only
where its catch can only ever see an `ApiError`, and the ones that cannot
prove it keep the helper's own local shape.

Adopting it also stops the offline `TypeError` being swallowed — a behavior
change the ticket treats as a fix, verified by the suites, and states as such
rather than claiming zero behavior change.

### Shared UI components are new seams, at the point of highest reuse

`DialogActions`, `AccountSection` and a presentational `Toast` are proposed at
the highest point they can live: beside the existing dialog primitive for the
action row, and in the account surface for the section card. The action row
needs a tone, because one of the eleven call sites is a destructive confirm;
the shared form carries that, and the ticket's acceptance is that all eleven
render as before.

The toast hook already exists from the first sweep. The ticket finishes the
job it started rather than adding a second mechanism — three survivors adopt
the hook and the markup moves into one component.

### Route hygiene is a helper, not a framework

The "not signed in" guard becomes a middleware in the shape already written
for the History routes, mounted once per protected sub-app. The request-body
chain becomes one call beside the existing record helper. Neither introduces
a base class, a response envelope, or a route DSL — the twelve auth call sites
keep their own validation chains.

The streaming request-body reader stays. It is not duplication: the route's
size middleware trusts a declared Content-Length, and this counts what
actually arrives, so a chunked upload cannot slip past the cap on a 50 MB
payload. The first sweep's comment about it stands.

### Deliberate exclusions

- **The yield helper stays.** It looks like a re-implementation of a platform
  API; its comment records a measured failure of that API at this call site's
  cadence. Not speculative, not cut.
- **No dependency is added or removed.** Adding a class-name merge utility for
  template-literal `className`s would be a new dependency for trivial
  functionality; the repo's own rule forbids it and the idiom is fine.
- **No new test seams.** Every item is covered by suites that exist today.
  This is the point of the sweep, and adding a seam to prove a refactor moved
  no behavior would defeat it.

## Testing Decisions

**A good test here is a test that already exists and still passes.** The whole
claim of this sweep is that behavior does not change, so the proof is the
existing net, run unchanged. No new test files, no new coverage, no new
mocks. The one exception is named below.

- **Repo-wide unit suite** covers every ticket. Prior art: the four tickets of
  the first sweep, each of which shipped with no new test file.
- **Core paginator goldens** guard the core ticket, and must pass **without
  snapshot updates**. If a golden moves, that is a rendering change the ticket
  did not intend — stop and investigate rather than `-u`. Prior art:
  `ponytail/02`.
- **Web visual e2e baselines** guard both web tickets, and must pass
  **without `--update-snapshots`**. Three of the five web tickets touch
  rendered chrome; a baseline move means a pixel moved. Prior art:
  `ponytail/03` and `ponytail/04`, both of which verified baseline checksums
  before and after.
- **Server export e2e** guards the server tickets. Prior art: `ponytail/01`.
- **The one new test is a decision, not a seam.** The core ticket removes
  three names from the barrel surface guard that no longer exist anywhere in
  the repo, which leaves that guard asserting nothing. It is replaced with the
  names of internals that do exist, so the guard keeps guarding. The dead
  export removals themselves need no test: `pnpm typecheck` proves a symbol
  with no importer was not an importer.
- **The error-message adoption is verified behaviorally, not structurally.**
  Each migrated site gets its existing test run; where a surface has no test
  covering its failure text, the migration is not made rather than asserted
  by inspection.

## Out of Scope

- Correctness bugs, security holes, and performance. The audit that produced
  this list routes those to a normal review pass, and nothing in it was
  folded in here.
- Any change to a rendered pixel, a wire shape, a database column, or an env
  var. The gated-feature payload keeps its field name and its value; the
  admin Rate refusal keeps its 403.
- Reorganising single-consumer hooks out of their files. A hook with one
  caller is a file-organization preference, not over-engineering, and the
  pane-layout module's real logic would not shrink.
- The date formatter's home. The first sweep considered moving it to a shared
  module and declined, correctly — that moves a function rather than removing
  a duplicate. Its pointers are already gone.
- The Role's own size. Five tickets, not one.

## Tickets

Numbered from 01, ordered so that every file is touched by one ticket at a
time. 01 through 04 have no blockers and no two of them touch the same file,
so they can be worked in any order; 05 is blocked by 04 only because seven
admin dialogs appear in both.

- `01-one-upstream-error-vocabulary.md` — the four HTTP clients share one
  error type, code set and JSON reader. Blocked by: none.
- `02-route-hygiene-and-small-cuts.md` — the "not signed in" guard, the
  request-body read, the gated-feature flag, three platform swaps, ~40 dead
  exports. Blocked by: none.
- `03-core-dead-exports-and-shrinks.md` — ~22 dead `export` keywords, two
  unread settings fields, two constant-returning helpers, one dead flag, the
  doubled fit-count loop, the harness's own dependency, the barrel guard.
  Blocked by: none.
- `04-web-error-message-and-test-helper.md` — one error-message helper,
  one test response helper, ~30 dead exports, three unpassed props.
  Blocked by: none.
- `05-web-shared-ui-components.md` — the dialog action row, the account
  section, the toast, the auth field constants. Blocked by: 04.

## Further Notes

- **Close to `.scratch/ponytail/spec.md`** — that file is the direct
  predecessor and records what the first sweep already did. Read it before
  starting; several findings here are the residue it deliberately left open.
- **The audit's own confidence is uneven and the tickets are ordered by it.**
  The line estimate for the dialog action row assumes the eleven blocks are
  structurally identical, which is verified for the class strings but not for
  every label. The ticket states the assumption so the first agent can revise
  it.
- **Fifth-sweep risk is the real cost.** Every one of these copies is a place
  the next sweep will look again. The durable fix is that the next copy of a
  pattern has nowhere to go — which is what the shared components and helpers
  are for, and the reason this sweep is worth doing rather than logging.
