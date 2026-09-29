# 03: Web sweep — table-driven inspector, shared plumbing, small cuts

Status: resolved

The SPA sheds ~280 lines of duplication with no behavior change. The
inspector is the big half: the Header and Footer tabs render the same 63-line
band section twice, differing only in settings keys and two labels, and
StyleTab lays out eight copy-pasted color rows — both become small config
tables driving one section component, the pattern those files already use
for their image field and frame styles. The interaction plumbing that five
components copy-paste (outside-pointer-down dismissal) moves into the shell
focus module whose own docstring says it exists so "the overlay layer can
never drift apart", and the twin export hooks share one transient-toast
hook instead of each carrying timer management. The rest is a small-cuts
sweep: single sources for the plan-price wire types, the blob→data-URL
helper, the asset-ref swap loop, `newId()`, the date helper, the
entitlement "until" label, `DURATIONS`/`PLANS`, `delay`, and the `.pdf`
suffix; deletion of the unreferenced `FileTextIcon` and the
production-dead `getAsset`; a `TextField` helper in the admin settings
panel; and the four test-fixture exports (networks, open flags,
unconfigured-AI state, font-loaded check) moved into the tests that are
their only consumers. The ticket closes by adopting core's
`countOccurrences` (seam opened by ticket 02), deleting the web copy so the
AI anchored-edit refusal rule lives in exactly one place.

**Blocked by:** 02 — Core sweep (wave sequencing; the `countOccurrences`
adoption needs its export to exist).

**Accepts**:

- [x] One `BandSection` over a `{header, footer}` config replaces the two
  63-line band sections; every settings key, label, and test id renders as
  before.
- [x] StyleTab's eight color rows come from one row table (including the
  transparent-to-paper display quirk, preserved exactly).
- [x] A `useDismissOnOutsidePointer` hook in the shell focus module
  replaces the five copies (two shell menus, the export split button, the
  library panel, the AI prompt popover's anchor-exempt variant); each
  popover/menu opens, dismisses, and re-opens as before.
- [x] One `useTransientToast` hook replaces the duplicated toast plumbing
  in both export hooks; toast timing (6s) and dismissal behavior are
  unchanged.
- [x] The admin API imports the plan price/limit types from the pricing
  API instead of re-declaring them.
- [x] One blob→data-URL helper serves both the asset resolver and the font
  loader; one asset-ref swap loop serves both the client export and the
  export protocol path; one `newId()` serves documents and fonts; one date
  helper serves the AI and history sections; one entitlement label serves
  the admin users panel and user detail.
- [x] `DURATIONS` and the paid-plan id list are imported from the pricing
  plans module, not re-declared in the admin settings panel.
- [x] `FileTextIcon` and `getAsset` are deleted with their references
  updated (tests re-pointed or dropped with the fixture).
- [x] A `TextField` helper replaces the three hand-rolled label+input
  blocks in the admin AI-provider section.
- [x] The four test-fixture exports live in their test files, not in
  production modules.
- [x] The web's local `countOccurrences` copy is deleted in favor of the
  core import.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`
  green.
- [x] `pnpm --filter @perfectmarkd/web test:e2e` green **without baseline
  updates** — the inspector and canvas render identically; if a visual
  baseline moves, stop and investigate rather than `--update-snapshots`.

## Comments

- **Implemented, then reviewed on both axes (2026-09-29).** 56 files,
  +707/−607. The sweep is a de-duplication: 39 production files and 17 test
  files, no new production behavior.
- **What the review changed.** Four findings, all in tests, all fixed before
  closing:
  - The `blobToDataURL` import in `db.test.ts` was left unused when
    `fontToDataUri` was folded into the shared helper, which failed
    `pnpm lint` and dropped the exact-base64 assertion with it.
    `documents/blob.test.ts` now tests the helper directly (two data URIs
    plus the empty-blob case). It is a **separate file** rather than a
    `describe` in `db.test.ts`: `blobToDataURL` reads through `FileReader`,
    so the file needs jsdom, and jsdom's `Uint8Array` is a different realm
    than Node's, which broke the byte round-trip in `db.test.ts` under the
    pragma. The file's header records that.
  - `loader.test.ts`'s `isFontFamilyLoaded` read the stub's own `registry`,
    which the stubbed `load()` populated — so the loaded-family assertions
    passed even with **no** `document.fonts.add(face)` call anywhere in the
    loader. `registry` is now written only by the `document.fonts.add`/
    `delete` stubs, i.e. only by production code. Verified by mutation:
    deleting `loader.ts`'s `document.fonts.add(face)` took the suite from
    16/16 passing to 2 failures.
  - The web's `NETWORKS` fixture was deleted outright, which took the
    cross-package guard with it. The guard is restored in spirit:
    `payment.test.ts` asserts `NETWORK_LABELS` keys equal the server's
    canonical set, with a comment naming `apps/server/src/db/schema.ts` as
    the source.
  - `text.test.ts` was missing its trailing newline (`prettier --check`).
- **Interpretations worth recording:**
  - `OPEN_FLAGS` and `UNCONFIGURED_AI` landed in a new
    `src/testing/account-state.ts`, not copied into their seven consuming
    test files — per-file copies would reintroduce exactly the duplication
    this ticket removes. It is a plain-data module with no `vi`, and the
    `testing/` directory already existed. The acceptance item's intent (no
    test fixtures in production modules) holds; the letter does not.
  - `NETWORKS` was **deleted rather than moved** — the web had no consumer
    but the test, so the guard was rebuilt against `NETWORK_LABELS` (above).
  - `TextField` also covers the wallet rows, beyond the three AI-provider
    blocks the item names. Leaving an identical fourth hand-rolled block
    beside a fresh helper would have been the worse outcome; markup is
    unchanged apart from a trailing space in the label class.
- **Behavior deltas, all inert by construction:**
  - `newId()` unification changes the font id shape on the
    no-`crypto.randomUUID` path (`font-<ts>-<hex>` → base36). Ids are
    opaque keys; nothing reads their shape.
  - The blob→data-URL helper unified two error strings ('Failed to read
    asset blob.' / 'Failed to read font bytes.' → 'Failed to read stored
    bytes.'). It only ever surfaces as a rejected promise's message in logs.
- **Left for a follow-up sweep** (deliberately out of scope here; none block
  the acceptance criteria):
  - `entitlementLabel` covers 2 of 5 call sites — `GrantEntitlementDialog`,
    `VerifyDialog` and `PlanSummary` still hand-roll their own `PLAN_LABEL`
    and `… until YYYY-MM-DD`. This is the one the sweep *created* the
    asymmetry for (three equal copies became one helper plus an orphan), and
    a third plan-label source is a terminology-precision problem under
    AGENTS.md. Worth finishing.
  - `orderDate` (`billing/payment.ts`) is the surviving twin of the new
    `formatDate`; billing was out of scope by the item's own wording
    ("the AI and history sections"). Note that `entitlementLabel` itself
    calls `.slice(0, 10)` rather than the helper beside it.
  - `PAID_PLAN_IDS` is a second plan-id list in a file that already exports
    `PLANS`; `PaidPlan` (pricing/api) and `PaidPlanId` (pricing/plans)
    declare the same union twice, and `SettingsPanel` now mixes both.
  - The shared ISO-date formatter is homed in `documents/text.ts` and
    reached from the AI, Account and History surfaces; a `shared/` home would
    remove the "see documents/text.ts" pointers now in two format modules.
  - `StyleTab` names its color subgroups in `COLOR_ROWS` *and* again in the
    render loop, with a `Blocks & tables` special case for the striped
    toggle; a third subgroup added to the table would render nowhere.
  - `HeaderFooterTab` derives one settings key by template string where the
    other nine are explicit `BandConfig` fields.
- **Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
  `pnpm test` (1,908 tests) and web e2e (69) all green. The e2e visual
  baselines are byte-identical (verified by checksum before and after) — no
  `--update-snapshots`, per the item.
- Last ticket in the sweep; `spec.md` stays open for a final pass over the
  leftovers above.
