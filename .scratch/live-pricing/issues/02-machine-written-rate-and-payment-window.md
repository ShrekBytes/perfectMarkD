# 02 — The Rate is machine-written, and a quote lapses after six hours

Status: ready-for-agent
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

- [ ] The Rate updates on its own within twelve hours of a successful fetch,
      with the provider faked in tests so the suite needs no network.
- [ ] The Admin panel shows the current Rate, its age, and the last error, and
      offers no way to edit any of them.
- [ ] The settings write path rejects the Rate key outright.
- [ ] A failed fetch leaves the previous Rate in place, records the error, and
      surfaces it in the panel.
- [ ] A non-positive, missing, or non-finite value is rejected and never stored.
- [ ] A value more than fifty percent from the last good Rate is rejected while
      that Rate is under twenty-four hours old, and accepted once it is older.
- [ ] The first fetch with no prior Rate is accepted with no band applied.
- [ ] Once the Rate passes its maximum age, new LTC Orders are refused with the
      rate-is-refreshing message, and the unset-rate message still serves an
      unset Rate.
- [ ] The rate fetch writes no audit entry on success.
- [ ] The job is started and released with the other scheduled jobs, and its stop
      function halts the interval.
- [ ] An Order created now cannot be paid more than six hours later; the
      submission route refuses it with a message pointing at a new Order.
- [ ] Resubmitting corrected details does not move the deadline.
- [ ] An Order with a null deadline stays submittable regardless of age.
- [ ] The Account page and the payment instructions show the deadline, and show
      it as lapsed once it passes, offering a new Order.
- [ ] The Admin queue will not offer to verify a lapsed Order, and shows the rate
      context on a short payment so the rejection reason can be the right one.
- [ ] A new Order is always creatable and is priced at the current Rate.
- [ ] The glossary, the admin runbook, the Privacy page, and the ADR are updated.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, and the server e2e
      suite all pass.
