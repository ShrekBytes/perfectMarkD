# Test suite reliability: `pnpm test` is not green

Status: resolved (see `issues/01-pnpm-test-unreliable.md` for the findings)

## Problem Statement

`pnpm test` is the check CI runs first, and the one every claim about this
codebase rests on. It cannot be relied on. It fails intermittently, in two
distinct ways, and a red run currently tells you nothing about whether the
change under test is at fault.

**It fails locally, reproducibly.** Two full runs on the same commit, on an
otherwise idle machine, both produced the same 4 failures across 3 files — all
jsdom component tests in `apps/web`, all timing out:

- `apps/web/src/canvas/PaperCanvas.test.tsx` — two of the "large-document
  guard" tests, which already pass an explicit 20 000 ms timeout
- `apps/web/src/library/LibraryPanel.test.tsx` — "renames through the
  coarse-pointer kebab menu"
- `apps/web/src/shell/shell-compact.test.tsx` — "switches the visible pane by
  name"

Every one of them passes in isolation, repeatedly — run twice, all green. The
failure set also shifts with what else is running: a web-only run
(`npx vitest run apps/web`) failed a single test instead of four, and a third
test appeared there that the full run did not produce. The whole suite is
1617–1621 tests in ~150 s, of which `import 228 s` and `environment 275 s`
(vitest's own cumulative counters across workers) show that module loading and
jsdom construction dominate — the tests themselves are a minority of the cost.

**It fails in CI, differently.** Seven of the last 20 `ci.yml` runs are red, but
they split cleanly by step, and only two are this problem:

| Failing step | Runs | Signature |
| --- | --- | --- |
| `Test` (`pnpm test`) | 2 | every test **passed**, then a leaked `AbortError` surfaced as an unhandled rejection and vitest exited non-zero |
| `Engine golden tests (real Chromium)` | 5 (all on 2026-09-24) | a different problem, out of scope here |

The `Test` failures (`be8d55b` 2026-09-25, `268d33a` 2026-09-26) are identical
in both runs: `125 passed (125)` test files, all tests passed, then
`⎯ Unhandled Errors ⎯ / Unhandled Rejection / stack: 'AbortError'` and
`[ELIFECYCLE] Test failed`. A suite where everything passes must not report
failure; an escape of asynchronous work past the end of the test that started
it is the shape that produces exactly this.

The two symptoms may share one root cause — an abortable operation outliving
its test would time out *inside* a test when the machine is slow and reject
*after* it when it is not — but that is a hypothesis, not a finding. Treat them
as two problems until proven otherwise.

**Why it matters now.** `pnpm test` is the gate for every change, and the next
pieces of work are large: `email/02` is ~1 050 lines across a migration, a new
table, security-sensitive token handling and new user-facing pages. A baseline
that is red for unrelated reasons is the worst possible time to find out whether
a red run is yours.

## Solution

Diagnose both failure modes properly and fix the cause, so that `pnpm test` is
green on this machine and in CI for reasons that are understood rather than
tolerated. The outcome is one of: a real race or leak fixed at its source, or a
deliberate, documented resource decision (concurrency, pool, environment reuse)
that makes the suite fit the machine it runs on.

**Rules for the fix**, because each of the obvious shortcuts destroys the
signal the suite exists to provide:

- **Do not raise a timeout to make a failure go away.** `PaperCanvas`'s guard
  tests already carry 20 s and still fail; a bigger number hides a stall. If a
  test is genuinely slow, fix why.
- **Do not add `--unhandled-rejections=warn`, an `onUnhandledRejection`
  swallow, or a global `dangerouslyIgnoreUnhandledErrors`.** The CI failure
  *is* an unhandled rejection; silencing it deletes the only evidence.
- **Do not skip, delete, quarantine, or `.only` a test to get a green run.**
- **Do not weaken an assertion.** These tests assert real behaviour; the
  flake is in timing or teardown, not in what they claim.
- Every fix needs a test that fails before it and passes after, or a documented
  reason it cannot have one.

## Evidence

Environment, as measured on the development host:

- Node 24.21.0, vitest 4.1.11, `environment: 'node'` globally with 68 files
  opting into jsdom by `@vitest-environment` docblock
- `vitest.config.ts` sets no `pool`, no `poolOptions`, and no `testTimeout` —
  so the default 5 s applies to any test that does not pass its own budget, and
  concurrency is vitest's own default (CPU-count-driven)
- Host: 8 cores, 7 GB RAM, load average 12.6 during a "clean" run because
  podman is running four containers (including the api) alongside the suite

Candidate sources for the unhandled `AbortError`, by inspection — **all
disproved; see `issues/01-pnpm-test-unreliable.md`**:

- `apps/web/src/ai/useAiCommand.ts` and `apps/web/src/ai/useStylesheetChat.ts`
  are the only client-side `AbortController` users (4 and 2 occurrences). An
  in-flight AI request aborted on unmount, whose rejection nothing awaits,
  would land after the test body returns. The AI Actions feature landed
  2026-09-23; both `Test` failures are 2026-09-25 and later. **Wrong:** both
  hooks await inside a `try`/`catch` that maps an abort to a silent return, and
  neither is reachable from the file the failure names.
- `apps/server/src/ai/provider.ts` and `apps/server/src/mail/resend.ts` are the
  server-side ones, each with a 10 s deadline. The server suite is currently
  clean (358 passed), so these are the weaker hypothesis. **Also wrong.**

The confirmed source was in neither list, and is recorded in
`issues/01-pnpm-test-unreliable.md`: `gh run view --log` attributes it to
`apps/web/src/assets/export-embed.test.ts`, and the stack is `fake-indexeddb`'s
`FDBTransaction._abort` — an `idb` request promise that
`apps/web/src/assets/resolver.ts` discarded (`void resolveAsync`) rejecting
after the connection closed under it. Read the CI log before searching by
inspection; it names the file and the stack.

Out of scope, but recorded so it is not conflated: the 5 CI failures of
2026-09-24 on `Engine golden tests (real Chromium)`. That is the paginator
golden suite and a different problem; it deserves its own ticket if it is still
reproducing.

## Further Notes

- The two CI `Test` failures are on commits titled `docs(ops): …` and
  `Update .env.example` — neither touched test code. That is consistent with a
  race rather than a regression, and it is why the "did I break it?" question
  has no useful answer from a red run today.
- `gh run list --workflow ci.yml` and `gh run view <id> --log` are the fastest
  way to re-check the CI signature; the vitest `FAIL` lines are interleaved
  with timestamps in the raw log, so grep for `Unhandled` and
  `Test Files`, not `FAIL`.
