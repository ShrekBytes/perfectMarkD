# 01 — Make `pnpm test` reliably green

Status: resolved
Blocked by: —

Read `.scratch/test-flakiness/spec.md` first: it carries the measurements, the
CI evidence, and the fix rules this ticket works under. This file is the work
order.

## The two failures to close

**A — local, reproducible: jsdom component tests time out under the full
suite.** Four tests across three files, identical across two full runs on the
same commit:

| Test | Timeout it already has |
| --- | --- |
| `apps/web/src/canvas/PaperCanvas.test.tsx` › large-document guard › *does not re-prompt after confirmation within the same document* | 20 000 ms |
| `apps/web/src/canvas/PaperCanvas.test.tsx` › large-document guard › *resets the guard when the document switches* | 20 000 ms |
| `apps/web/src/library/LibraryPanel.test.tsx` › *renames through the coarse-pointer kebab menu* | default 5 000 ms |
| `apps/web/src/shell/shell-compact.test.tsx` › *switches the visible pane by name* | 5 000 ms (`findByTestId` at line 55) |

All four pass in isolation, twice over. The set shifts with the selection: a
web-only run produced one of these four; a third, different test appeared there
that the full run did not produce. `apps/server` (358 tests) is clean.

**B — CI: everything passes, the run still fails.** Runs `be8d55b` and
`268d33a`, both on the `Test` step: `125 passed (125)` files, all tests
passed, then `Unhandled Rejection` / `stack: 'AbortError'` /
`[ELIFECYCLE] Test failed`. Reproduce the signature locally with a loop until
it appears — a single run will likely be green.

## Order of work

1. **Reproduce B first.** It is the one that makes CI lie, it has a crisp
   signature, and it is cheap to hunt: run `pnpm test` in a loop until a run
   exits non-zero with a green test count, then bisect by suite
   (`npx vitest run <path>`) to the file that leaks. Start with the
   `AbortController` users named in the spec's Evidence section — the two
   `apps/web/src/ai/` hooks — and check whether any of their tests unmount
   mid-request without awaiting the resulting rejection.
2. **Then A.** Establish whether it is contention or a stall, because the
   fixes differ: measure one failing file's wall time inside the full run
   against its isolated time, and check whether the failures cluster in the
   workers that start last. The suite's own counters point at the environment:
   `environment 275 s` against `tests 438 s` cumulative, `import 228 s`.
3. **Decide the resource shape deliberately.** 8 cores, 7 GB, four podman
   containers. `vitest.config.ts` sets no `pool` or `poolOptions`, so
   concurrency is the default. If A is contention, the honest fix is a
   configured, justified concurrency or environment strategy — recorded in the
   config with a comment saying why — not a bigger timeout.

## Verifying each step

- B: a loop of full runs that no longer exits non-zero *and* a regression test
  that fails on the old code. "It passed 10 times" is not the bar on its own —
  pair it with the test.
- A: the four named tests pass in a full run, repeatedly, **and** the fix is
  justified by a measurement rather than a preference.
- Both: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green, and one
  `pnpm test` green on an otherwise idle machine.

## Guardrails

The spec's fix rules apply in full. The two that matter most here:

- **No timeout increases.** Two of the four already carry 20 s.
- **No suppression of unhandled rejections** (`--unhandled-rejections=warn`, an
  `onUnhandledRejection` handler, `dangerouslyIgnoreUnhandledErrors`). B *is* an
  unhandled rejection; silencing it is deleting the finding.

## Out of scope

- The 5 CI failures of 2026-09-24 on `Engine golden tests (real Chromium)` —
  a different step and a different problem, noted in the spec for a separate
  ticket.
- Speeding up the suite for its own sake. The goal is a trustworthy signal, not
  a fast one.
- Anything in `email/02`. This ticket exists so that its baseline means
  something.

## Comments

- **B was not the AI hooks.** `gh run view --log` on the two `Test` failures
  names the leak outright: both runs are the same `fake-indexeddb`
  `FDBTransaction._abort`, `VITEST_TEST_PATH:
  apps/web/src/assets/export-embed.test.ts`. The spec's `useAiCommand` /
  `useStylesheetChat` hypothesis is disproved — both await their request inside
  a `try`/`catch` that maps an abort to a silent return, and neither hook is
  reachable from that file. Don't re-run that search.
- **B's actual cause.** `createAssetResolver`'s synchronous resolver answered
  `undefined` for an uncached ref and started a lazy IndexedDB read whose
  `idb` request promise nothing awaited (`resolver.ts`, `void resolveAsync`).
  `idb` attaches no handler of its own, so when the read lost its race with the
  connection closing — which is exactly what the suite's teardown does — the
  rejection had no observer and reached the process, failing an all-green run.
  The interleaving decides the error's name: a read whose transaction is created
  after the close throws `InvalidStateError`, one created before it and then
  torn down throws `AbortError` (what CI saw). Same defect, so one fix covers
  both: the discarded read is contained at the call site, where the result is
  already known to be unused and `undefined` is already its answer. Regression
  test in `resolver.test.ts` — deterministic, red before the fix, green after.
- **`closeAfterSettle`'s one-`setImmediate` barrier is no longer load-bearing.**
  Its comment already conceded it "can still win the race and flake under load".
  Left as it is deliberately: the only failure it could trigger is the one now
  contained at its source, so making the barrier exact would be fixing a
  symptom. Worth revisiting if a different unobservable IndexedDB read appears.
- **A was two causes, not one.** Only one of the four named tests turned out to
  be a real test bug; the other three share a single cause, and a fifth test
  (not named by the ticket) fell to it as well.
  1. `LibraryPanel > renames through the coarse-pointer kebab menu` — a
     synchronous assertion on the store's *async* rename path. It renames the
     non-open document, so `renameDocument` reads, writes, broadcasts, and only
     then updates the list. Reproduced in 1 of 4 clean full runs. Fixed by
     waiting, which is what the file already does for the duplicate and delete
     cases; the assertion itself is unchanged.
  2. Everything else — both `PaperCanvas` guard tests, `shell-compact > switches
     the visible pane`, and (found here, not named by the ticket) `AppShell >
     edits settings in the Inspector and re-renders the canvas pages` — is pure
     CPU contention. No stall, no lock: a uniform 3.1-5.0x inflation of isolated
     cost at the default worker count. `AppShell`'s was the sharpest edge, a
     `waitFor` left at testing-library's 1000ms default against the canvas's
     400ms render debounce plus a pipeline run; it failed 2 runs in 3 under
     load. It is fixed by the resource decision below, **not** by raising that
     timeout — see the guardrail note below.
- **Resource decision: `maxWorkers: 4`**, recorded with its measurement in
  `vitest.config.ts`. Vitest's default here is `cpus - 1` = 7, which is already
  leaving a core free and still oversubscribes a box shared with the Compose
  stack. Measured 8/6/4/2 workers, quiet and under 4 busy cores. The 20s guard
  tests measure 9.9-12.5s at the default under load against 6.8-8.3s at four
  workers; the suite failed 2 runs in 3 at 8 workers and passed 7 in 7 at 4, for
  95-99s of wall time against 84-86s. The 20s budgets were **not** touched.
  - *Why it has no regression test:* a resource limit has no observable unit to
    assert. What can be tested is that the suite passes, and that it passes
    under load, which is the loop below. The measurement in the config comment
    is the substitute the spec asks for ("a deliberate, documented resource
    decision ... recorded in the config with a comment saying why").
- **Guardrail: no timeout was increased.** An earlier attempt gave the
  `AppShell` `waitFor` the `{ timeout: 10_000 }` its two sibling canvas-render
  waits in that file already carry. Re-measured with the worker cap alone and
  no timeout change: 4 runs in 4 clean under the same load that had failed it 2
  in 3. So the cap does the work, the guardrail stands, and the change was
  reverted — `AppShell.test.tsx` is untouched.
- **Not established: worker-start clustering.** The ticket's step 2 also asks
  whether the failures cluster in the workers that start last. The reporters
  here do not expose per-file start order, so this was not measured. The
  evidence points elsewhere — the failing set moved between files across runs,
  and files running concurrently inflated by a similar factor rather than one
  group standing out — which is starvation, not scheduling order. Recorded as
  the one part of step 2 left unmeasured.
- **Verification.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green.
  Nine consecutive clean `pnpm test` runs (1622 passed, 0 failed, 0 unhandled,
  55-60s each) with the four named tests at 131-191ms, 381-487ms, 4026-5833ms
  and 4859-6126ms of their budgets, plus 7 clean runs under 4 busy cores where
  the old setting failed 2 in 3. Baseline before the change: 1 of 4 clean runs
  red.
- **Left alone, deliberately.** `putAssets` / `deleteAssets` in
  `apps/web/src/documents/db.ts` discard `idb` request promises the same way
  (`void tx.store.put(...)`). Their `tx.done` *is* awaited, so a failure there
  already fails the test visibly rather than silently — a different problem
  from the one this ticket closed, and it needs its own evidence. Worth a
  ticket if the same unhandled-rejection signature ever comes back pointing
  there.

