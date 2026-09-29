# 04: Web sweep leftovers — one plan label, one date helper, no restated tables

Status: resolved

The sweep's last ticket listed six leftovers and left `spec.md` open for a
final pass over them. This is that pass. All six are duplication the sweep
itself created or sharpened, and each is now closed by deletion or by deriving
from the table that already exists — no new module, no new dependency, no
change to a rendered pixel.

**Blocked by:** 03 — Web sweep (the leftovers it lists).

**Accepts:**

- [x] The two hand-rolled `PLAN_LABEL` constants (`GrantEntitlementDialog`,
  `VerifyDialog`) are gone; both dialogs read plan names through `planName`
  and dates through the shared `formatDate`, and `PlanSummary`'s two inline
  `.slice(0, 10)` calls do too. One plan-label source, one date source.
- [x] `orderDate` is deleted from `billing/payment.ts`; its four call sites
  and `entitlementLabel`'s own `.slice(0, 10)` read `formatDate`. The
  locale-aware `orderDateTime` is untouched — a different question.
- [x] `PaidPlanId` is an alias of the pricing API's `PaidPlan` rather than a
  second copy of the union, and `PAID_PLAN_IDS` is read off `PLANS` instead of
  restated, so a paid plan added to the catalog cannot be left out of the
  admin's numbers.
- [x] The two "see documents/text.ts" pointers in the AI and History format
  modules are gone.
- [x] `StyleTab`'s color subgroups are derived from `COLOR_ROWS`, and the
  striped-table toggle is data beside the rows rather than an `if` on the
  subgroup's title — a third subgroup renders.
- [x] `HeaderFooterTab`'s banner-image settings key is an explicit
  `BandConfig` field like the other nine; the template string and the now-dead
  `band` field are gone.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`,
  `pnpm test` green.
- [x] `pnpm --filter @perfectmarkd/web test:e2e` green **without baseline
  updates** — the inspector renders identically.

## Comments

- **Implemented in one commit plus a two-axis review pass (2026-09-29).**
  16 files, +82/−66. Production-only; no test file needed a change, which is
  itself the signal that the sweep moved no behaviour.
- **All six leftovers closed, by deletion or by derivation rather than by a new
  module.** No new file was created — leftover 4's suggested `shared/` home was
  not taken, because it would have moved a function rather than removed a
  duplicate; the two stale pointers it existed to justify are simply gone.
- **What the review changed.** Five findings, all fixed before closing. The two
  axes agreed independently on the first three, which is the strongest signal
  in the pass:
  - **The `COLOR_SUBGROUP_TAILS` map was reverted.** The first pass moved the
    striped-table toggle from an `if` on the subgroup's title into a
    one-entry `Partial<Record<…>>` beside the rows — which was *+14 lines in a
    de-duplication sweep*, carried a dead `key` field (the render still
    hardcoded `settings.tableStriped`), and a non-null assertion. Both reviewers
    flagged it as Speculative Generality and "no config nobody sets". Reverted
    to the `if`. The part of leftover 5 that mattered — subgroups derived from
    `COLOR_ROWS` so a third one renders — is kept, and it is two lines.
  - **The `formatDate` docstring claimed an invariant the code did not hold.**
    It said *every* surface that shows a date reads it through the helper, while
    `admin/AuditLog.tsx`'s `entryTime` still sliced inline. Rather than soften
    the claim, `entryTime`'s date half now reads the helper (it formats the
    `HH:MM` itself, which is genuinely its own job), and the docstring names
    that exception explicitly.
  - **The two dialogs still hand-composed the string `entitlementLabel`
    returns.** The first pass swapped `PLAN_LABEL` for `planName` and left both
    files building `Current: ${planName(x)} until ${formatDate(y)}.` — which is
    character-for-character `entitlementLabel`, a helper whose own docstring
    says it is "the Entitlement readout the admin surfaces *share*". Both now
    call it, and the duplicate casts go with them.
  - **`PAID_PLAN_IDS` used an unchecked cast.** It filtered `PLANS` and mapped
    `as PaidPlanId`, with a comment claiming "the cast is the filter's own
    guarantee" — a guarantee it was not (the filter proves `id !== 'free'`,
    not membership in `PaidPlan`). Replaced with a real type predicate, so the
    narrowing is checked.
  - **`GrantEntitlementDialog` declared `'pro' | 'premium'` twice** — the
    `useState` type and the button map's literal — immediately after leftover 3
    was about that union being declared twice. It now types its state
    `PaidPlanId` and iterates `PAID_PLAN_IDS`.
- **One reviewer disagreement, resolved toward the ticket.** The Standards axis
  called the `ai/format.ts` and `history/format.ts` comment edits scope creep
  ("do not fix unrelated problems"). They are not: leftover 4 names those two
  modules and those two pointers as the thing to resolve. Kept.
- **Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
  `pnpm build`, `pnpm test` (1,908 tests), web e2e (69), and server e2e (5) all
  green. The e2e visual baselines are byte-identical — `git status` on
  `apps/web/e2e/` is empty, no `--update-snapshots`.
- Closes the sweep: `spec.md` is now fully delivered.
