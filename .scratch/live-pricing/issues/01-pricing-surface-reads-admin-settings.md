# 01 — The pricing surface reads live admin settings

Status: resolved
Blocked by: None (can start immediately)

**What to build:** an unauthenticated read endpoint that serves the stored plan
prices and plan limits, and a pricing surface that renders those numbers instead
of constants — so a price changed in the Admin panel's Settings reaches the
pricing page, the pricing modal, the comparison table, and the purchase dialog
without a second edit anywhere. Plan identity and feature labels render
immediately; the numbers render once they have loaded; a failed fetch says so
rather than falling back. Plan prices display in dollars on the catalog
surfaces while every surface that names a coin actually demanded keeps naming
it. The comparison table gains a row for the AI Allowance, which is a real
per-plan number today that no pricing surface mentions.

This is the spec's [live pricing spec](../spec.md), ticket 1 of 2. It does not
touch the Verification queue, which already displays the Order's own amount and
is not a stale-price surface. It does not show the Rate; that belongs to the
payment phase, where it is computed per Order.

**What to build, specifically:**

- An unauthenticated read endpoint returning the stored plan prices and plan
  limits. No session required, no personal data, and deliberately not the
  wallet addresses and not the Rate. Nothing in it may be derived from a user.
- The catalog module keeps everything that is not a number — plan ids, names,
  blurbs, feature-row labels and group boundaries, the plan-facts prose, the
  duration options, the display notes — and stops holding prices. The
  client-side duration price function is deleted outright; the client performs
  no price arithmetic, because the endpoint returns the stored per-duration
  values verbatim. That is what lets a deliberate twelve-month discount stay
  expressible.
- Plan limits move the same way: page cap, Quota, and AI Allowance. The
  feature table's Quota and page-cap cells are filled from the response instead
  of from hardcoded strings.
- One new feature row, for the AI Allowance, labelled with the glossary term
  rather than a restatement of it. One new row means the e2e layout assertion
  pinning the row count changes with it.
- One money formatter in the catalog module, used by every call site: integer
  prices without decimals, non-integer prices with two. No locale formatting —
  the app has none today and this does not introduce any.
- Plan identity and feature labels render on first paint; the numeric values
  render only once the response has landed. A failed fetch renders an explicit
  unavailable state. It must never fall back to the seeded default, because a
  quietly wrong price is the exact failure this removes.
- The dollar sign goes on the catalog surfaces only — the comparison table, the
  pricing page, the pricing modal, and the duration buttons and total in the
  purchase flow. The payment instructions, the Order rows, the Admin queue, and
  the payment-method labels keep naming the coin actually demanded. The plan
  price is still stored and demanded in USDT; the dollar sign presents the same
  numeral and no conversion happens anywhere.
- Prose that states a price denomination is reworded to match: the strategy
  document's tiers table and risk line, the product document's tiers table, and
  the billing spec. Prose that names payment instruments is left alone, because
  it is still accurate.

**The correction to record:** the source to-do claimed the Verification queue
was one of the two importers putting a stale figure in front of a human deciding
whether to grant a paid entitlement. It is not. That dialog imports the
duration *options* from the catalog module and displays the Order's own
authoritative amount; no hardcoded price reaches it. The real risk this ticket
fixes is a customer being quoted a stale price and then charged the current
one. The to-do also said the catalog module has ten importers; it has eleven,
and only four of them read prices at all.

- [x] Changing a price in the Admin panel's Settings and reloading the pricing
      page shows the new price on the page, in the modal, in the comparison
      table, and in the purchase dialog's total.
- [x] Changing a plan limit in Settings and reloading shows the new Quota, page
      cap, and AI Allowance in the comparison table, including the new AI
      Allowance row.
- [x] No module in the client reads a hardcoded plan price or plan limit.
- [x] The read endpoint answers without a session, carries no personal data, and
      returns neither the wallet addresses nor the Rate.
- [x] The endpoint returns the stored per-duration prices, and a twelve-month
      price that is deliberately not ten times the monthly one reaches the
      purchase dialog unchanged.
- [x] Plan names, blurbs, and feature labels are on screen before the response
      lands; no stale price is ever painted.
- [x] A failed fetch shows an explicit unavailable state and no number.
- [x] Plan prices read as dollars on the pricing page, the modal, the
      comparison table, and the purchase flow's duration buttons and total; an
      integer price shows no decimals and a non-integer price shows two.
- [x] Every surface that names a coin demanded — payment instructions, Order
      rows, the Admin queue, payment-method labels — still names that coin.
- [x] The comparison table has one more row than before and the AI Allowance
      row uses the glossary's term.
- [x] The e2e pricing layout spec's row-count assertion is updated, and it
      checks that the rendered prices come from the endpoint.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, and the web e2e
      suite all pass.

## Comments

- **Implemented (2026-09-28).** New `GET /api/pricing`
  (`apps/server/src/pricing/routes.ts`), mounted unconditionally beside
  `/api/orders`, returning `{ prices, limits }` from the two existing typed
  accessors and nothing else — no session, no personal data, no wallets, no
  Rate. It carries `cache-control: no-store`, which is the whole point: a
  cached price is the stale quote the endpoint exists to remove.
- **Client:** `pricing/api.ts` (typed, envelope-validating fetcher) and
  `pricing/store.ts` (one zustand store, `loading` / `ready` / `unavailable`,
  deduplicated so several mounted surfaces cause one request). The store
  fetches with no `credentials` — the endpoint is public, so nothing needs a
  session.
- **`plans.ts` is now the display layer and holds no numbers.** `priceMonthlyUsdt`
  and `priceForDuration` are gone; the per-duration prices are read from the
  response, never derived, which is what keeps a deliberate twelve-month
  discount expressible. A feature cell is a string, a boolean, or a `LimitRef`
  naming the stored limit it reads — the Quota, page-cap, and AI Allowance rows
  are `LimitRef`s, and the free cells stay static text (`never`, and the
  not-included mark) because the Free Tier has no stored limit.
- **One formatter, one place:** `formatPrice` renders a whole amount without
  decimals and anything else with two, with a dollar sign. It is used by the
  plan header, the duration buttons, and the flow's total; nothing else formats
  a plan price.
- **Dollar sign scope:** the comparison table, `/pricing`, the pricing modal,
  and the duration buttons and total carry `$`. The payment instructions, the
  Account page's Order rows, the Admin queue, and the payment-method labels are
  untouched and keep naming the coin demanded.
- **AI Allowance row added**, labelled `AI Allowance` — the glossary term on its
  own, since a parenthetical restating the definition is the thing the ticket
  said not to do. A zero allowance reads as not-included, because zero is the
  Admin's way of saying AI is off for a plan (`parsePlanLimits` allows it for
  exactly that reason). The e2e row count goes 11 → 12.
- **The 10× claim is gone from copy and docs.** `DURATION_NOTE`, `PLAN.md`, and
  `PRODUCT.md` all said "12 months costs 10× (two months free)", which the
  stored per-duration figures no longer guarantee — an Admin can set any twelve
  -month price, and the page would then contradict itself. All three now say each
  term has its own stored price and longer terms are priced to save, which is
  what the system guarantees. `plans.test.ts` asserts the copy promises no
  multiple, so the claim cannot creep back.
- **Prose reworded** in `PLAN.md` (tiers table, the price-denomination note, the
  volatility risk line), `apps/web/PRODUCT.md` (tiers table, and its note now
  says what the table's figures are), and `.scratch/billing/spec.md` (step 2 now
  says the amount is denominated in the coin actually demanded rather than
  USDT-denominated). `DURATION_NOTE` and the Privacy page still name USDT and
  Litecoin, which remains accurate — they name instruments, not a price
  denomination.
- **A failed read says so once, out loud.** `PlanComparison` renders one line
  above the table — "Prices and limits could not be loaded, so the numbers below
  are missing rather than free or zero. Reload the page to try again." — because
  a grid of em-dashes is otherwise indistinguishable from a plan that includes
  nothing, which is the exact misreading story 6 is about (and DESIGN.md wants
  error copy that names the problem and the recovery). The per-cell state is the
  same `PRICE_UNAVAILABLE` word the purchase flow uses, so the two surfaces
  cannot describe one state differently.
- **A failed read is not pinned.** The store short-circuits only once it is
  `ready`, so reopening the pricing modal after a blip re-reads rather than
  showing a session-long outage; a price that *has* landed is never re-read into
  a second paint. Both halves are tested.
- **Verified in a browser** against a local API and a real Admin session:
  changed Pro's monthly price to 4.5, its twelve-month total to 47, and its
  limits, reloaded `/pricing`, and the page, the modal, and the purchase dialog's
  duration buttons and total all read `$4.50` and `$47`. Set Pro's AI allowance
  to 0 and the new row read the not-included mark while Premium's read `800/mo`.
  Stopped the API and reloaded: the notice appeared, both paid columns read
  "Unavailable", and no number was anywhere on the page. Screenshots in
  `/tmp/opencode/pmd/` (not committed).
- **Tests:** the server route at the Hono-over-SQLite seam (reachable without a
  session, correct shape, an Admin edit reflected, neither wallets nor the Rate
  in the body, identical for a signed-in visitor, `no-store`); the surfaces at
  the RTL-over-stubbed-fetch seam; and the e2e spec's new price-origin and
  failed-read cases. The stubbed payload is shared from
  `apps/web/src/testing/pricing-response.ts` — beside `json-response.ts`, for the
  same reason: the five suites and the Playwright spec must not drift into five
  slightly different fixtures. Its figures are deliberately unlike the seeds (and
  Pro's twelve months is 47, a discount no client arithmetic could produce), so a
  reintroduced constant fails rather than passing on the defaults. `pnpm lint`,
  `pnpm typecheck`, `pnpm build`, `pnpm test` (1846), `pnpm format:check`, and the
  web e2e suite (69) all pass.
- **Left alone deliberately:** the Verification queue and the Admin grant
  dialogs, which import the duration *options* and never a price — the
  correction this ticket was asked to record. `GET /api/me` still reports the
  caller's own quota and AI allowance, which is account state, not catalog
  state. `CONTEXT.md`'s `Rate` and `Payment Window` entries came with the
  spec and stay as ticket 2's vocabulary; nothing in this diff uses the Rate.
