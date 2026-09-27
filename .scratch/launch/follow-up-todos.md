# Follow-up to-dos from `launch/06`

Two items the launch pass turned up, written to be lifted into tickets. **Not
tickets** — no `Status:`, no `Blocked by:`, no spec files. They live here until
someone cuts them.

Both were found while working
[`docs/ops/launch-checklist.md`](../../docs/ops/launch-checklist.md); the context
for why each matters is in that document.

To-do 3 was added after the first two: the Admin flagged the LTC rate design
itself while reviewing to-do 2's open question. To-do 4 followed from to-do 3 —
a rate that moves every 12 hours only means something if a pending quote cannot
outlive it.

---

## To-do 1 — Remove the AI cost calculator

**Decision (Admin, 2026-09-28):** the Admin panel's AI readout is removed
entirely, price arithmetic and token counts both. The reasoning: the arithmetic
prices a worst case from two caps and two published rates, which is too basic
to plan a real budget around. The simplest honest thing is to remove it.

This replaces the open item in
[launch-checklist.md](../../docs/ops/launch-checklist.md#ai-prerequisites) — the
cost arithmetic no longer needs doing, because the thing that did it is going
away.

**What to build:** delete the readout, and the price fields Test connection
publishes to feed it.

### Delete

- `apps/web/src/admin/ai-cost.ts` — the whole file: `AiActionPrices`,
  `AiActionCost`, `aiActionCost()`, `formatActionCost()`.
- `AiCostReadout` in `apps/web/src/admin/SettingsPanel.tsx` (roughly lines
  843–909) and its call site (~line 790); drop the `ai-cost` import. The
  component also imports `aiBudgets` and `aiWriteCapTokens` — see *Keep* below.
- `apps/web/src/admin/ai-cost.test.ts`.
- The `ai-cost` and `ai-cost-per-action` assertions in
  `SettingsPanel.test.tsx` — the four cases are "price unknown before Test
  connection", `$0.0141` for the cheap model, `$0.3300` for the frontier model,
  and re-flagged when the model id changes.

### Server

- `AiModelInfo` (`apps/server/src/ai/provider.ts:82`) drops
  `inputPricePerMillion` and `outputPricePerMillion`.
- `parseModelInfo` (~line 267) drops the `pricing` read from the
  `/models` payload. `pricePerMillion` (~line 298) goes with it — nothing else
  calls it.
- `AiConnectionModel` (`apps/web/src/admin/api.ts:267`) drops the two fields, so
  the Admin's view of the report matches what the server sends.

### Judgement call, flagged rather than assumed

`estimateTokensForCharacters` (`packages/core/src/ai.ts:73`) is exported but
consumed only by `ai-cost.ts`, so this change orphans it. Its own doc comment
names "the panel's per-Action arithmetic", so the comment needs rewriting
whatever is decided. `NON_ASCII_CHARS_PER_TOKEN` stays either way —
`estimateAiSize` selects from the same constant.

### Keep

- `contextLength` and `maxOutputTokens` in the Test connection report, and the
  cap-mismatch warnings built on them (`test-connection.ts:135-156`). Those are
  the part that earns its place: they tell the Admin the configured cap does not
  fit the model.
- `aiBudgets` and `aiWriteCapTokens` — used by core (`ai.ts:576`, `ai.ts:792`)
  and `useAiCommand.ts`. Only the `SettingsPanel` import goes.

### Follow-on, or the tracker points at a ghost

- `launch/06`'s AI prerequisite — "a model is chosen with the per-Action cost
  arithmetic in mind: the Admin panel's 'worst-case cost of one AI Action' is
  the number to compare against…" — describes a panel that will no longer
  exist. Reword it.
- `.scratch/ai-transforms/spec.md` and ticket `08` record the cost readout as
  the accepted home for ticket `03`'s deferral. They need a line saying where it
  went.
- `docs/ops/launch-checklist.md`'s AI section and open list.

**Accepts:** no cost, price, or token row in the AI Provider Config panel. Test
connection still reports the window and output cap and still warns on a
mismatch. No remaining panel copy refers to price. Full suite green.

---

## To-do 2 — Make the pricing surface read live admin settings

**Decision (Admin, 2026-09-28):** fix the whole surface, not just the page.

**What to build:** every plan price, limit, and duration price shown to a
customer or an Admin reads from the settings table, so the Admin panel is the
single source of truth.

**Why, and it is not a stale page:** `apps/web/src/pricing/plans.ts` hardcodes
the prices (Pro 3, Premium 7 USDT), the duration arithmetic, and the feature
rows, while Orders are priced server-side from `getPlanPrices(db)`. The file's
own header already anticipated this — *"Phase 2's billing workstream feeds the
same shape from admin settings instead of these constants … so the swap needs no
redesign"* — and the swap never happened.

`plans.ts` has ten importers. Two of them are the problem:

- **`billing/UpgradeFlow.tsx` and `UpgradeDialog.tsx` — the purchase path.** With
  a stale constant, a customer can be shown one amount and asked to send
  another.
- **`admin/VerifyDialog.tsx` — the Verification queue**, whose entire job is
  confirming that the amount matches what the Order specified. A stale constant
  puts the wrong figure next to a real Order, in the panel where a human decides
  whether to grant a paid entitlement.

The rest: `PricingPage.tsx`, `PricingModal.tsx`, `PlanComparison.tsx`,
`account/PlanSummary.tsx`, and the admin `UsersPanel` / `UserDetail` /
`GrantEntitlementDialog`.

### What to build, specifically

1. **A public read endpoint.** There is none today: `/api/me` 401s when signed
   out, and a prospective customer on `/pricing` is not signed in. Something
   like `GET /api/plans` returning `{ prices, limits, ltcRateUsdt }`, reusing
   `getPlanPrices` / `getPlanLimits` / `getLtcRate`
   (`apps/server/src/db/settings.ts:335`, `:346`, `:373`). No auth, no personal
   data, and **not** the wallet addresses.
2. **`plans.ts` becomes the display layer.** Keep the catalog shape — ids, names,
   blurbs, `FEATURE_ROWS`, the pitches and notes, `DURATIONS` — and take the
   numbers from the endpoint. Decide the loading story: a visitor should not see
   a flash of the old price before the fetch lands.
3. **Update the ten importers**, starting with the purchase flow and the
   verification queue.
4. **One source of truth for duration pricing.** The client has its own
   `priceForDuration`; the server computes from `MONTHLY_PRICE_USDT` × months
   with a 12-month multiplier of 10 (`settings.ts:23-25`). Two implementations
   of the same arithmetic is how they drift.

### Undecided — needs a call, not a guess

`ltcRateUsdt` is admin-editable and appears **nowhere** on the pricing surface, so
a customer cannot see the Litecoin figure before starting an Order — they meet
it inside the Order. This is partly settled by
[to-do 3](#to-do-3--the-ltc-rate-should-be-fetched-every-12-hours-and-the-admin-should-not-be-able-to-set-it),
which takes the rate off the Admin's hands entirely — but whether to *show* it
on `/pricing` is still open, and to-do 3 makes it harder rather than easier. A
rate on the pricing page is up to 24 hours stale. Show it with its age, or keep
the LTC figure inside the Order where it is computed fresh.

**Accepts:** change a price in `/admin` → Settings, reload `/pricing`, and the
new price appears on the page, in the modal, in the purchase dialog, and in the
Verification queue. No module reads a hardcoded plan price. Full suite green.

---

## To-do 3 — The LTC rate should be fetched every 12 hours, and the Admin should not be able to set it

**Decision (Admin, 2026-09-28):** the rate is machine-written only. A job fetches
LTC/USDT from the CoinGecko free API **every 12 hours**. There is no manual
override — removing it is the point, for two reasons: setting a rate by hand
every day is not practical, and an Admin who can set the rate can set it to
whatever suits them. For a customer converting a USDT price into LTC, that is a
trust problem before it is a convenience problem. On failure the last good rate
is kept, the staleness is shown, and LTC Orders are refused past a maximum age.

Paired with this: a pending Order must be paid within **6 hours** — see
[to-do 4](#to-do-4--a-pending-order-must-be-paid-within-6-hours).

### Why the current design is wrong

`ltc_rate_usdt` is a single `settings_kv` row (`schema.ts:283`) that a human
edits by hand in the Admin panel. The rate is snapshotted onto the Order at
creation (`orders/routes.ts:206-217`) and `amountExpected` is computed from it,
so **the quote is only as good as the rate at that moment** — and verification
compares the on-chain amount against that frozen figure exactly
(`VerificationQueue.tsx:24-25`). A rate set once and forgotten is a quiet way to
quote a customer wrongly, and the failure is invisible until someone is
underpaying and gets rejected.

### What to build

**A 12-hourly fetch, on the existing job pattern.** `startHistoryPurge`
(`history/purge.ts:72`) is the precedent and needs no new machinery: a
`start*` function taking an injectable clock and `intervalMs`, returning a stop
function, called in `main.ts` beside line 53 and released in the shutdown block
at line 89. A `startLtcRateRefresh({ db, intervalMs, now, fetch, log })` should
read the same way — one fetch immediately, then every 12 hours.

**Source: CoinGecko's free `/simple/price`, keyless.** One call a day, no key to
rotate or leak, matching how `AI_API_KEY` and `RESEND_API_KEY` are treated —
except this one has no key at all. Take the provider behind the same injection
seam the AI provider uses, so the fetch is testable without a network call and
the rest of the codebase never learns a URL.

**Validate before writing.** A single bad response must not poison the rate.
Reject a non-positive value, a missing field, and anything wildly outside a band
around the last known rate; log the rejection and keep the previous value. A
rate that moves 5× in an hour is a provider fault, not a market.

**Refuse LTC past a maximum age.** The Order snapshot makes a stale rate a money
risk, so age is a real bound rather than a nicety. When the rate is older than
the bound (48 hours is a reasonable default), `POST /api/orders` refuses LTC the
way it refuses an unset rate today — but with its own message. The current text
is `"LTC payments are not set up yet — please pick another payment method."`
(`orders/routes.ts:210`), which would be wrong and alarming for a provider
outage. Something like "LTC payments are briefly unavailable while the exchange
rate refreshes — please pick another payment method."

### Remove the write path

- `SettingKey` drops `'ltcRateUsdt'` (`admin/settings-routes.ts:75`), along with
  its validator (~line 124) and its `KV_KEYS` mapping (~line 147). The settings
  `PUT` no longer accepts the key at all — a machine-owned value should not be
  reachable from an admin endpoint, or the "Admin cannot set it" decision is only
  a UI convention.
- `LtcRateSection` (`admin/SettingsPanel.tsx:481`) stops being a
  `useSectionSave` section. It becomes a read-only status: current rate, when it
  was last fetched, and the last error if there was one.
- `parseLtcRate` and `getLtcRate`'s admin-facing validator go; `getLtcRate` stays
  for the Order path and gains an age accessor.

### The staleness needs somewhere to live

A maximum age and a last-fetched timestamp are new state. A timestamp alongside
the rate in the same `settings_kv` row is the smallest change and keeps the two
atomic — a rate with no timestamp is a rate of unknown age, which is the thing
being guarded against. Three timestamps are actually wanted — last success, last
attempt, last error — so a failing job is distinguishable from a fresh one.

### Consequences worth deciding deliberately

- **The rate now moves under a pending Order.** It was effectively static
  before, so a customer could accept a quote and pay it hours later against the
  same number. A 12-hourly refresh means LTC can move between the Order being
  created and the customer sending the money. To-do 4 bounds that exposure at 6
  hours, but it does not remove it: at any moment the live rate is 0–12 hours
  old, so an Order paid at T+6h may still be quoting a rate up to 18 hours old.
  **The window bounds how long a pending quote can go stale; it does not make the
  rate fresh.** If a fresher guarantee is ever wanted, the honest version is a
  refresh on read or a much shorter window — not a longer one.
- **Verification still compares exactly.** `VerificationQueue.tsx` recomputes
  from the frozen `amountExpected` and `ltcRateUsdt`, and a short payment is
  rejected. That is correct, but it will now fire for market reasons rather than
  user error, and the rejection copy should probably say so — a customer who sent
  the right LTC at yesterday's rate deserves to be told the rate moved rather than
  left to conclude they miscalculated.
- **A new outbound third-party request from the server.** It carries no user
  data — a plain price query, no document, no address, no identifier — so it does
  not contradict "no page loads anything from another company's server". But this
  project discloses deliberate third-party flows (ADR-0009, ADR-0013) and the
  Privacy page now names three exceptions. Decide whether this becomes a fourth
  disclosed exception or is deliberately out of scope as infrastructure, and
  record the answer. If it is worth recording, it is ADR-shaped: a rate source
  with a staleness policy is a decision that is annoying to reverse.
- **The audit log gets quieter here.** `settings.update` entries for
  `ltcRateUsdt` stop, which is correct. A 12-hourly fetch should *not* produce a
  `settings.update` row — that is roughly 730 a year and it would drown the
  entries that matter. Info-level log on change, and consider an audit entry only
  on failure or on a rate that fails validation.

### Ties into to-do 2

To-do 2 asks whether to surface `ltcRateUsdt` on the pricing surface. With a
12-hourly fetch the answer gets harder: a rate on `/pricing` is up to 12 hours old
by the time a visitor reads it. Either show it with its age stated, or keep the
LTC figure inside the Order where it is computed fresh, and leave the pricing
page showing USDT only. **Do not show a bare rate with no age.**

**Accepts:** the rate updates on its own within 12 hours of a successful fetch.
The Admin panel shows the current rate, its age, and the last error, and offers
no way to edit it — and the settings `PUT` rejects `ltcRateUsdt` if sent. A
failed fetch leaves the previous rate in place, shows the error, and once the
rate passes the maximum age new LTC Orders are refused with a message that says
why. A nonsense response never overwrites a good rate. Full suite green, with
the fetch stubbed.

---

## To-do 4 — A pending Order must be paid within 6 hours

**Decision (Admin, 2026-09-28):** an Order is payable for 6 hours from creation.
Paired with [to-do 3](#to-do-3--the-ltc-rate-should-be-fetched-every-12-hours-and-the-admin-should-not-be-able-to-set-it)'s
12-hourly rate refresh, which is what makes a bounded window meaningful.

**Why:** there is currently **no payment window at all**. The `orders` table has
no expiry column — a pending Order lives forever, and the rate frozen onto it at
creation (`orders/routes.ts:206-217`) goes stale silently. With the rate now
moving every 12 hours, an unbounded pending Order is a quote that can be
presented long after it stopped being true.

**State the bound honestly:** the window does not make the rate fresh. It bounds
how long a pending quote can sit before a refresh invalidates it, and it keeps
the pending queue from growing without bound. At any moment the live rate is
0–12 hours old, so an Order paid at T+6h may still quote a rate up to 18 hours
old. See to-do 3's consequences.

### What to build

**A deadline on the Order, derived rather than stored as a status.** Add
`paymentExpiresAt` to the `orders` table, set to `createdAt + 6h` at creation.
Expired is then `status === 'pending' && now > paymentExpiresAt` — derived from
the timestamp, never written back. This matches how the codebase already handles
expiry: `isEntitlementActive` (`quota.ts:34`) derives it from `expiresAt` rather
than storing an expired flag, and needs no job to stay correct.

**Do not add `'expired'` to `ORDER_STATUSES`.** `ORDER_STATUSES` is
`['pending', 'verified', 'rejected']` (`schema.ts:25`) and those are the three
outcomes of a *decision*. An unpaid Order has had no decision, so it is not a
fourth outcome. `orderView` exposes the deadline and the derived flag instead,
and the client renders from that.

**Guard the submission path.** `POST /api/orders/:id/submission`
(`orders/routes.ts:265`) currently refuses only `verified` (line 285). An expired
Order must be refused too, with a message that sends the user to start a new one
rather than leaving them resubmitting into a dead quote.

**The judgement call: the deadline is fixed at creation, not extended by a
resubmission.** Resubmission amends the same Order and flips `rejected` back to
`pending` (`routes.ts:303-317`), so an extending deadline would let a user hold
one Order open indefinitely by resubmitting — which defeats the window entirely.
Fixed at creation is the reading that matches the reason the window exists. If
the Admin wants a fresh window per attempt instead, that is a different design
and should be said out loud rather than discovered later.

**An expired Order does not block a new one.** The user starts fresh and is
re-priced at the current rate, which is the entire point.

**Surface it in the three places Orders are shown.** `orderView`
(`orders/routes.ts:151`) carries the deadline and the flag; the Account page's
upgrade-status view and `billing/PaymentInstructions.tsx` (which prints
`{order.ltcRateUsdt} USDT/LTC` at line 33) both need the deadline and an expired
state that offers a new Order.

**The Admin queue must not offer to verify an expired Order.** `adminOrderView`
and the Verification queue filter these out or show why, rather than leaving a
half-paid expired quote sitting next to a real one.

### Open questions this surfaces

- **Does the window apply to USDT as well as LTC?** The rate only moves for LTC;
  a USDT amount is fixed in USDT and does not drift. A uniform window is simpler
  and bounds the queue, which is the better default — but it does expire Orders
  that had no reason to expire. Worth a deliberate answer.
- **What happens to Orders already pending at migration?** They have no deadline.
  Backfilling `createdAt + 6h` would instantly expire every one of them, including
  any with a live payment in flight. Exempting them (null deadline = no window) is
  kinder and simpler to reason about. Either is defensible; silently expiring
  someone's in-flight payment is not.
- **Does the exact-match verification copy change?** Covered in to-do 3 — a short
  payment will now often mean the rate moved, and the rejection should say so.

### Distinct from to-do 3's staleness guard

Two different clocks, two different messages, both needed. To-do 3 refuses a
*new* LTC Order when the **rate** is older than its bound (the provider is down).
This refuses *submitting against* an Order older than 6 hours (the quote has sat
too long). Do not conflate them in the copy — a user hitting this one has a
perfectly good rate and a stale quote.

**Accepts:** an Order created at T cannot be paid after T+6h; the submission
route refuses it with a message pointing at a new Order; the Account page and the
payment instructions show the deadline and then show it as expired; the Admin
queue will not verify one; a new Order is always creatable and is priced at the
current rate. Resubmitting does not extend the window. Full suite green.

