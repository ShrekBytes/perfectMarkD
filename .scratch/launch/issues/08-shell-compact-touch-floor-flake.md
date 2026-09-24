# 08 — The 44px touch-floor sweep failed once under load and has not reproduced

Status: needs-triage
Blocked by:

`apps/web/e2e/shell-compact.spec.ts:219` — *touch floor › the shell and its overlays keep the 44px floor at 320px* — failed once, in a full-suite run, and has passed in every run since. No failure message was captured, so this ticket is the observation and the reproduction attempts, not a diagnosis.

## What it looks like

The test walks the shell at 320px and, after each step, asserts that every visible `button, a[href], input, select` is at least 44×44:

```
await page.getByRole('button', { name: 'More options', exact: true }).click();
await expectFloor(page);
```

`expectFloor` reads `getBoundingClientRect()` for every control in one synchronous `page.evaluate`, filters to those that are visible (non-zero box, not `display:none` / `visibility:hidden`), and fails listing any under the floor by name and size. It has no settling wait beyond the element it just clicked or opened being visible.

## When it failed

One run, 2026-09-25, `pnpm --filter @perfectmarkd/web exec playwright test --grep-invert ai`, 45 passed / 2 failed. The other failure was `performance.spec.ts` — expected at that moment, it was mid-development and its threshold was not yet calibrated.

**That run is the only one in which the CPU-throttled performance test ran concurrently with the rest of the suite.** It renders a 339-page document under `Emulation.setCPUThrottlingRate(4)`; in every other run it was either absent, or (since launch/05) isolated in its own Playwright project. That coincidence is the whole of the evidence, and it is not proof.

## What has not reproduced it

Four runs since, all green on this test:

| Run | Result |
| --- | --- |
| `test:e2e` (full suite) × 2 | passed |
| `test:e2e --workers=8` (twice the default worker count, for contention) | passed, 5.9s |
| `shell-compact.spec.ts --repeat-each=8` (eight executions of this test) | passed |

Before the failure, the full suite had also passed several times. So the flake is rare, and the one occurrence sat in a run whose load profile no longer occurs.

## Candidate causes, neither confirmed

1. **Caught mid-layout under load.** The sweep reads boxes once with no settling, so a heavily loaded browser could be measured while a control is still being laid out. Worth noting what this is *not*: the overlays animate with `fade-in` (opacity) and `slide-in-left` (`translateX`), neither of which changes a box's size, so a mid-animation read is not by itself an explanation.
2. **A transient control.** The e2e suite runs without the API server (`/api/me` fails to connect), so a banner or notice can appear depending on how a failed fetch settles. A control that exists in one run and not the next would change the measured set — though it would also have to be under 44px, which is the very thing the test exists to catch.

## What triage needs to answer

- **Is it still reachable at all?** launch/05 isolated the performance test, so the contention that accompanied the one failure no longer happens in a normal run. If it is not reachable, closing this as such is the honest outcome — but say so explicitly rather than letting it sit.
- **If it is reachable, which control is it?** A reproduction names the control in the assertion's own output, which is all the diagnosis needed. The two most likely places to try: a run with the performance project put back alongside the suite, and repeated runs of this spec with the machine otherwise loaded.
- **Is the assertion load-proof?** If the cause is (1), the fix is to make the sweep retry until the layout settles rather than read boxes once — the test should fail when a control is genuinely too small, never when the browser was busy.

## Why it is worth a ticket

A test that fails once without a reproducible cause is re-run rather than investigated, and re-running is how a real regression gets waved through. `launch/06`'s acceptance is an all-green checklist, and a flaky member of that checklist is worse than an absent one. This is thin evidence, which is exactly why it is filed as `needs-triage` rather than dressed up as a specified fix.

**Accepts**: a triage verdict — a reproduction naming the control, or a recorded decision to make the assertion load-proof with the change that does it, or a recorded decision that the isolation removed the trigger and the ticket is closed for that reason.

## Comments

- **Found while verifying [launch/05](05-performance-guards.md)** (2026-09-25), which ran the whole web suite. Recorded here rather than left in a transcript, following [07](07-goldens-on-the-runner.md): it gates a green pipeline before announcement. Filed under `launch` for that reason — move it if the shell workstream is the better home, but note that its spec directory no longer exists.
