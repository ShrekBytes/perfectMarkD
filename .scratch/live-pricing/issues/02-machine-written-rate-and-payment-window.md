# 02 — The Rate is machine-written, and a quote lapses after six hours

Status: resolved
Blocked by: None (can start immediately)

**What to build:** the Litecoin Rate stops being something the Admin types and
becomes something a job fetches from a keyless public price feed every twelve
hours, with no manual override and no way for the Admin to set it — the settings
write path refuses the key, so the decision is enforced by the server rather
than by a convention in the UI. A failed fetch keeps the last good Rate, shows
the Admin why, and once the Rate passes a maximum age new LTC Orders are
refused with a message that says the rate is refreshing rather than that LTC is
not set up. Alongside it, every Order carries a six-hour Payment Window, fixed
when the Order is created: submitting against a lapsed Order is refused with a
message pointing at a new one, the Account page and the payment instructions
show the deadline and then show it as lapsed, and the Admin queue will not offer
to verify an Order that can no longer be paid.

This is the spec's [live pricing spec](../spec.md), ticket 2 of 2. It touches
none of the pricing surface's files, so the two tickets can run in parallel.

## Stage one — the job, then the write path, in that order

These two halves are one ticket on purpose, and the order is load-bearing.
There is no seeded Rate: an unset Rate refuses LTC Orders, and the live
instance's wallets are already configured and accepting LTC. Cutting the write
path before the job has ever succeeded would switch LTC off on a payment method
that works today. So stage one lands the job, stage two is confirmed against
the live instance, and only then does stage two land.

**Stage one — the Rate job and its read-only status**

- A scheduled job following the existing job pattern: injectable clock,
  interval, one run immediately on start, a stop function, registered and
  released alongside the other jobs in the process entry point.
- The feed is keyless and public. The provider sits behind an injected
  interface resolved in the composition root, matching the seams the AI provider
  and the identity exchange already use, so the rest of the codebase never
  learns a URL and no test touches the network. There is no injectable `fetch`
  in this codebase and this does not add one.
- Validation runs before the write, and a bad response is rejected, never
  clamped. Refuse a non-positive, missing, or non-finite value. Refuse a value
  more than fifty percent from the last good Rate as a provider fault rather
  than a market move — but only while that last good Rate is under
  twenty-four hours old, because after a longer outage the band is the wrong
  instrument and the maximum age is what should act. The first fetch has nothing
  to compare against and skips the band entirely.
- Three timestamps live with the Rate: last success, last attempt, last error.
  They belong in the Rate's own stored value, not the settings row's generic
  updated-at column, so a failing job is distinguishable from a fresh one and
  the Rate and its age cannot drift apart.
- The rate's read accessor gains an age. Its validator stays — the Order path
  still reads and validates the stored value. Only the admin-facing write path
  goes: the settings key, its validator, and its key mapping are dropped, so a
  request naming the Rate is refused rather than silently ignored.
- The Admin panel's Rate section stops being a save section and becomes a
  read-only status: the current Rate, when it was last fetched, and the last
  error if there was one.
- The fetch writes no audit entries. Twice a day is roughly seven hundred a year
  and would drown the entries that matter. Change is logged at info level; a
  failure or a validation rejection is what earns an audit entry.

**Stage two — the write path, after a confirmed live fetch**

- The settings write path drops the Rate key: the settings `PUT` rejects it.
- New LTC Orders are refused once the Rate is older than a maximum age of
  forty-eight hours. The refusal is distinct from the existing unset-rate
  refusal and carries its own message. The existing message — that LTC is not
  set up yet — stays correct for an unset Rate and is wrong and alarming for a
  provider outage, so the new one says the rate is refreshing instead.

## The Payment Window

- A nullable payment deadline on the Order, set six hours out at creation.
  Expired is derived — pending, deadline present, past — and never written
  back, matching how the codebase already derives an active Entitlement from its
  expiry rather than storing a flag and maintaining it with a job.
- The Order status set is unchanged. Pending, verified, and rejected are the
  three outcomes of a decision, and a lapsing window is not a decision anyone
  made. The order view carries the deadline and the derived flag; the client
  renders from that.
- The deadline is fixed at creation and a resubmission does not extend it.
  Resubmission amends the same Order, so an extending window could be held open
  indefinitely by resubmitting, which defeats the window entirely. This is the
  reading that matches why the window exists; a fresh window per attempt is a
  different design and would need saying out loud.
- Orders that already exist when the column lands are exempt. A null deadline
  means no window, and there is no backfill — backfilling would instantly lapse
  every pending Order, including any with a live payment in flight.
- The window applies to USDT and LTC alike. The rate only moves for LTC, but one
  rule is simpler, bounds the queue, and avoids doubling the states every
  surface renders. The user-facing message for a lapsed window does not blame
  the Rate, because for a USDT Order nothing moved.
- Submitting against a lapsed Order is refused with a message pointing at a new
  Order. A lapsed Order never blocks a new one, and a new Order is priced at
  the current Rate.
- The deadline and the derived flag are exposed on the order view, so the
  Account page's upgrade status, the payment instructions, and the Admin queue
  all render from one source. The Admin queue filters lapsed Orders out or shows
  why, rather than offering to verify a dead quote.
- The maximum-age bound applies at quote time only. Re-checking it at
  Verification would mean either rejecting a customer who paid the figure they
  were quoted or re-pricing them after the fact; both are worse than the
  exposure accepted here. State the consequence rather than hiding it: an Order
  verified up to six hours after creation can be quoting a Rate up to fifty-four
  hours old.
- Verification still compares exactly, with no tolerance — that is correct. But a
  short payment will now often mean the Rate moved rather than the user
  miscalculated, so the queue shows that context and the rejection affordance
  offers it as a reason. The rejection reason is typed by the Admin today, so
  this is new work, not a copy change.

## Documentation that this falsifies

- The admin runbook currently says the Rate "is edited in the same Settings tab"
  and that every save is a separate audit entry. Both are false after stage two.
- The Privacy page gains a line naming the public price feed for what it is: a
  plain price query carrying nothing about the user. The no-page-loads claim
  keeps its precise scope, because this is a server-side request, not a page
  load. The source, the staleness policy, and the disclosure decision are
  recorded as an ADR.
- The glossary gains **Rate** and **Payment Window**, and the **Order** entry is
  amended — its current wording, that an Order is pending until the Admin
  verifies or rejects it, is the exact sentence a lapsing window falsifies.

- [x] The Rate updates on its own within twelve hours of a successful fetch,
      with the provider faked in tests so the suite needs no network.
- [x] The Admin panel shows the current Rate, its age, and the last error, and
      offers no way to edit any of them.
- [x] The settings write path rejects the Rate key outright.
- [x] A failed fetch leaves the previous Rate in place, records the error, and
      surfaces it in the panel.
- [x] A non-positive, missing, or non-finite value is rejected and never stored.
- [x] A value more than fifty percent from the last good Rate is rejected while
      that Rate is under twenty-four hours old, and accepted once it is older.
- [x] The first fetch with no prior Rate is accepted with no band applied.
- [x] Once the Rate passes its maximum age, new LTC Orders are refused with the
      rate-is-refreshing message, and the unset-rate message still serves an
      unset Rate.
- [x] The rate fetch writes no audit entry on success.
- [x] The job is started and released with the other scheduled jobs, and its stop
      function halts the interval.
- [x] An Order created now cannot be paid more than six hours later; the
      submission route refuses it with a message pointing at a new Order.
- [x] Resubmitting corrected details does not move the deadline.
- [x] An Order with a null deadline stays submittable regardless of age.
- [x] The Account page and the payment instructions show the deadline, and show
      it as lapsed once it passes, offering a new Order.
- [x] The Admin queue will not offer to verify a lapsed Order, and shows the rate
      context on a short payment so the rejection reason can be the right one.
- [x] A new Order is always creatable and is priced at the current Rate.
- [x] The glossary, the admin runbook, the Privacy page, and the ADR are updated.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, and the server e2e
      suite all pass.

## Comments

- **Implemented in three commits plus a review pass (2026-09-28).** The staging
  the ticket asked for is the commit order: `a20df21` lands the job, the
  read-only panel, and the refused write path; `9619d9b` adds the 48-hour
  maximum age; `5c4c433` adds the Payment Window. **The live confirmation
  between stage one and stage two is outstanding and is the operator's to do** —
  deploy `a20df21`, watch the panel show a fetched Rate with a real age, and
  only then deploy `9619d9b`. The reason the ordering matters is stated in the
  runbook now: between the two deploys an LTC Order is refused until the job's
  first fetch lands, so the second commit must not go first on a live instance.
- **The Rate's own record is the source of its age.** `settings_kv`'s
  `ltc_rate_usdt` now holds `{ usdtPerLtc, lastSuccessAt, lastAttemptAt,
  lastError }` rather than a bare number, which is what makes a failing job
  distinguishable from a fresh one. A bare number is still read, so an upgrade
  does not crash on it — and because it carries no fetch, it is treated as
  having no age and is refused as too old to quote, which is the honest reading.
  `getLtcRateStatus` reports the no-figure case (a first fetch that failed) for
  the panel; `getLtcRate` returns only a quoteable Rate for the Order path.
- **The feed is Kraken's public LTC/USDT ticker** — keyless, and denominated in
  USDT directly so no conversion sits in the middle of a quote. It is behind
  `LtcRateProvider`, resolved in the composition root like the AI provider and
  the identity exchange. No injectable `fetch` was added; the provider's tests
  stub the global, as those two seams' do.
- **`GET /api/admin/rate` was cut during review.** The first pass added it so
  the queue could read the Rate without pulling the AI config and the plan
  catalog with it. It duplicated a projection the settings view already
  returns, so there is now one `ltcRateStatusView` and the queue reads the
  settings view it already fetches.
- **Two rules were softened, then restored.** The review pass removed an
  exemption I had added for an Order whose payment arrived inside the window
  (it made a lapsed Order submittable and verifiable), and a second one for a
  hand-set Rate with no measurable age. Both were mine, not the spec's. The
  spec is explicit that a lapsed Order is refused and not offered for
  verification, and a maximum age with an unverifiable exception is not a
  bound. ADR-0014 now states why the window is a stricter line than the Rate's
  age, and what an operator who wants to be generous does instead.
- **A claim the customer reads must be checkable.** The reject dialog offers
  "the rate moved" only when the queue has established it by comparing the
  captured rate against the current one; the dialog never holds the rate and
  never asserts it. That was the sharpest finding of the review: the first
  version told customers their rate had moved on the strength of nothing.
- **Tests:** the provider at the stubbed-global seam; the job at the purge
  job's injectable-clock seam (first fetch, band inside and outside its window,
  non-positive/missing/non-finite, failed fetch keeping the last good Rate, no
  audit entry on success, the stop function); the 48-hour refusal and both
  distinct messages at the Hono-over-SQLite route seam; the window at the route
  seam (six hours, no extension on resubmission, null stays submittable, lapsed
  refused with a new-Order message, a new Order always creatable, the derived
  flag); the panel, the Account page, the instructions, the queue, and the
  reject dialog at the RTL seam. `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `pnpm test` (1913), `pnpm format:check`, the server e2e suite (5), and the
  web e2e suite (69) all pass.
- **Left alone deliberately:** Verification's amount comparison, still exact
  with no tolerance, and the Rate's staleness bound at Verification, which
  stays off. Both are the spec's calls and both are stated in ADR-0014 rather
  than quietly chosen. `settings.update` audit entries are unchanged for every
  other key; the rate's own `rate.refresh` entries appear only on failure.
