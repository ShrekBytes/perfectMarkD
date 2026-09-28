# 03: Web sweep — table-driven inspector, shared plumbing, small cuts

Status: ready-for-agent

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

- [ ] One `BandSection` over a `{header, footer}` config replaces the two
  63-line band sections; every settings key, label, and test id renders as
  before.
- [ ] StyleTab's eight color rows come from one row table (including the
  transparent-to-paper display quirk, preserved exactly).
- [ ] A `useDismissOnOutsidePointer` hook in the shell focus module
  replaces the five copies (two shell menus, the export split button, the
  library panel, the AI prompt popover's anchor-exempt variant); each
  popover/menu opens, dismisses, and re-opens as before.
- [ ] One `useTransientToast` hook replaces the duplicated toast plumbing
  in both export hooks; toast timing (6s) and dismissal behavior are
  unchanged.
- [ ] The admin API imports the plan price/limit types from the pricing
  API instead of re-declaring them.
- [ ] One blob→data-URL helper serves both the asset resolver and the font
  loader; one asset-ref swap loop serves both the client export and the
  export protocol path; one `newId()` serves documents and fonts; one date
  helper serves the AI and history sections; one entitlement label serves
  the admin users panel and user detail.
- [ ] `DURATIONS` and the paid-plan id list are imported from the pricing
  plans module, not re-declared in the admin settings panel.
- [ ] `FileTextIcon` and `getAsset` are deleted with their references
  updated (tests re-pointed or dropped with the fixture).
- [ ] A `TextField` helper replaces the three hand-rolled label+input
  blocks in the admin AI-provider section.
- [ ] The four test-fixture exports live in their test files, not in
  production modules.
- [ ] The web's local `countOccurrences` copy is deleted in favor of the
  core import.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`
  green.
- [ ] `pnpm --filter @perfectmarkd/web test:e2e` green **without baseline
  updates** — the inspector and canvas render identically; if a visual
  baseline moves, stop and investigate rather than `--update-snapshots`.
