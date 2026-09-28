# Live pricing: the price shown is the price paid, and a quote is bounded

Status: ready-for-agent

## Problem Statement

A prospective customer reads the pricing page and sees one set of numbers. The
Order they then create is priced from a different set, held in admin settings
that the Admin can change at any moment. Nothing reconciles the two, so the
price on the page and the amount demanded can differ — and the customer
discovers it at the worst possible time, when they are told how much to send.
The same gap runs the other way: the feature table on the pricing page
advertises Quotas and page caps as hardcoded text, and the AI Allowance not at
all, so an Admin who changes a limit has changed what the product allows
without changing what it advertises.

The Litecoin Rate is a number a human types into the Admin panel. It is
snapshotted onto an Order when that Order is created, and Verification compares
the on-chain amount against the frozen figure exactly. So the Rate is a quote,
and its accuracy depends entirely on whether the Admin remembered to update it
and typed it honestly. Two consequences follow. A Rate set once and forgotten
quotes customers wrongly and silently, and the failure only becomes visible
when someone underpays and is rejected. And an Admin who can set the Rate can
set it to whatever suits them, which for a customer converting a price before
starting an Order is a trust problem before it is a convenience problem.

Underneath both sits a third gap: there is no payment window at all. A pending
Order stays payable forever, so a frozen quote can be presented long after it
stopped being true, and the pending queue has nothing bounding its growth.

## Solution

The Admin panel becomes the single source of truth for every price and limit a
customer is shown, served by an unauthenticated read endpoint that the pricing
surfaces fetch — so a price changed in Settings appears on the pricing page, in
the pricing modal, in the comparison table, and in the purchase dialog, with no
hardcoded plan price left in the client.

The Rate stops being a human input. A job fetches it every twelve hours from a
keyless public price feed, validates the response before storing it, keeps the
last good value when a fetch fails, and shows the Admin the current value, its
age, and the last error with no way to edit any of it. Once the Rate is too old
to trust, new LTC Orders are refused with a message that says why.

Every Order then carries a Payment Window of six hours, fixed when the Order is
created. A window lapsing is not a decision the Admin made and does not become
a fourth Order status: it is derived from the deadline, needs no job to stay
correct, and never blocks the user from starting a fresh Order at the current
rate.

## User Stories

1. As a prospective customer, I want the price on the pricing page to be the
   price I am charged, so that I am never surprised at the point of payment.
2. As a prospective customer, I want the plan comparison table to show the
   Quotas and page caps I will actually get, so that I can tell Pro from
   Premium on something other than a number I have to take on trust.
3. As a prospective customer, I want to see what the AI Allowance is for each
   paid plan, so that I can tell whether the AI Actions I want are included and
   how many I get.
4. As a prospective customer, I want plan names, blurbs, and the feature list
   to appear immediately on the pricing page, so that I am not looking at an
   empty page while prices load.
5. As a prospective customer, I want the prices to appear once they have
   loaded, so that I never briefly read a stale price and act on it.
6. As a prospective customer, I want to be told plainly when prices cannot be
   loaded, so that I do not mistake an outage for a free plan or assume a
   number I cannot see is current.
7. As a prospective customer, I want plan prices shown in dollars, so that I
   can read them without converting anything in my head.
8. As a customer starting an Order, I want the amount I must send named in the
   coin I am actually sending, so that I do not mistake a dollar sign for a
   crypto amount.
9. As a customer choosing a duration, I want the total I will pay to come from
   the same numbers the pricing page showed, so that the two never disagree.
10. As a customer, I want the pricing modal to show the same prices as the
    pricing page, so that opening the modal from the editor does not change the
    answer.
11. As a customer, I want the purchase dialog to show the same prices as the
    pricing page, so that the figure I am shown before committing is the figure
    I am held to.
12. As a customer, I want a decimal price to render as a proper amount rather
    than a bare number, so that a price like 3.5 does not look broken.
13. As the Admin, I want the Admin panel to be the only place a plan price
    lives, so that changing a price is one action with no second edit to
    remember.
14. As the Admin, I want the plan limits to be as live as the prices, so that
    raising a Quota does not leave the pricing page advertising the old one.
15. As the Admin, I want a deliberate annual discount to remain expressible, so
    that the twelve-month price need not be a fixed multiple of the monthly one.
16. As the Admin, I want the Rate fetched for me, so that I am not typing a
    number into a form every day.
17. As the Admin, I want no way to override the Rate, so that the number a
    customer is quoted cannot be one I chose.
18. As the Admin, I want the settings write path to refuse the Rate key, so that
    "the Admin cannot set it" is enforced by the server and not by a
    convention in the UI.
19. As the Admin, I want to see the current Rate, so that I know what customers
    are being quoted.
20. As the Admin, I want to see how old the Rate is, so that I know whether I am
    looking at a fresh number or a stale one.
21. As the Admin, I want to see the last error when a fetch failed, so that an
    LTC outage is diagnosable without reading logs.
22. As the Admin, I want a failed fetch to keep the previous Rate, so that a
    provider blip does not take LTC payments down.
23. As the Admin, I want a nonsense response rejected rather than stored, so
    that a bad payload cannot poison the price everyone is quoted.
24. As the Admin, I want the refresh job to be visible in the same way as the
    other scheduled jobs, so that it is started and stopped with the process.
25. As the Admin, I want the rate fetch to leave no trail of audit entries, so
    that the entries that matter are still readable.
26. As the Admin, I want a hundred pending Orders to be a bounded queue, so
    that Verification stays workable.
27. As the Admin, I want the Verification queue not to offer a decision on an
    Order that can no longer be paid, so that I do not verify a dead quote.
28. As the Admin, I want to see why a short payment happened when the Rate
    moved, so that I reject for the right reason rather than assuming the user
    miscalculated.
29. As a customer paying with LTC, I want the Rate I am quoted to be one the
    machine fetched, so that I can convert the price myself and send the right
    amount first time.
30. As a customer paying with LTC, I want to see the Rate my Order was created
    with, so that the amount I am shown is traceable to a figure.
31. As a customer, I want to know when my Order stops being payable, so that I
    am not left submitting against a quote that has lapsed.
32. As a customer, I want my Order to be payable for long enough to send a
    crypto transfer, so that a normal transfer is not cut short.
33. As a customer who misses the window, I want to be told to start a new
    Order, so that I am not left resubmitting into a dead quote.
34. As a customer who misses the window, I want starting a new Order to be
    straightforward, so that the lapse costs me nothing but the wait.
35. As a customer who misses the window, I want the new Order priced at the
    current rate, so that I am not held to a figure from hours ago.
36. As a customer, I want resubmitting corrected details not to reset my
    clock, so that the window means what it says.
37. As a customer paying in USDT, I want the same window as everyone else, so
    that the rules are one rule.
38. As a customer, I want the LTC figure to appear in the payment phase where I
    am actually paying, so that I am not reading a rate on a marketing page that
    may be hours old.
39. As a customer, I want to be told that LTC is briefly unavailable while the
    rate refreshes, so that a provider outage does not read as "this product is
    broken".
40. As a privacy-conscious reader, I want to know the server queries a public
    price feed, so that the third-party story on the Privacy page is complete.
41. As a reader, I want the Privacy page's no-page-loads claim to keep its
    precise scope, so that a new server-side request does not quietly make the
    page's wording false.
42. As a future maintainer, I want the reason the Rate cannot be set by hand
    recorded, so that I do not read the missing control as an oversight.
43. As a self-hoster, I want the runbook to describe the Rate accurately, so
    that I am not told to edit a field that no longer exists.

## Implementation Decisions

### One source of truth for prices and limits

- An unauthenticated read endpoint returns the stored plan prices and plan
  limits. No session, no personal data, and explicitly not the wallet addresses
  and not the Rate. It is the first unauthenticated read the app performs other
  than the auth-provider probe, so its response is treated as public.
- The plan catalog stays a static module: plan ids, names, blurbs, feature-row
  labels and group boundaries, the plan-facts prose, the duration options, and
  the display notes. Only the numbers are fetched.
- The endpoint returns the stored per-duration prices verbatim. The client
  performs no price arithmetic at all, and the client-side duration price
  function is removed. This is what makes the Admin panel literally the source
  of truth: the numbers the Admin saved are the numbers the customer sees, and
  a deliberate twelve-month discount stays expressible because the monthly and
  per-duration values are both stored.
- Plan limits move the same way as prices: page cap, Quota, and AI Allowance.
  The feature table's Quota and page-cap cells are filled from the response
  rather than from hardcoded strings.
- A new feature row for the AI Allowance is added to the comparison table. It is
  the only structural change to the table, it adds one row, and the e2e
  layout assertion that pins the row count is updated with it. The row is
  labelled with the glossary term, not with a restatement of it.
- The prose that states a plan price — the strategy document's tiers table and
  risk line, the product document's tiers table, and the billing spec — is
  reworded to match. Prose that names payment instruments is left alone,
  because naming the instruments is still accurate.

### Display currency

- Plan prices are stored and demanded in USDT. The dollar sign is a
  presentation of the same numeral, not a conversion, and there is no
  USD-to-USDT rate anywhere in the system.
- The dollar sign appears on the catalog surfaces only: the plan comparison
  table, the pricing page, the pricing modal, and the duration buttons and
  total in the purchase flow. Every surface that names a coin actually demanded
  keeps naming it — the payment instructions, the Order rows, the Admin queue,
  and the payment-method labels.
- One money formatter, in the catalog module, used by every call site. Integer
  prices render without decimals and non-integer prices render with two. No
  locale formatting is introduced; the app has none today.
- The pricing surfaces render plan identity and feature labels immediately and
  the numeric values only once the response has landed, so a visitor never
  reads a price that is about to change. A failed fetch renders an explicit
  unavailable state. It never falls back to the seeded default, because a wrong
  price is the exact failure this removes.
- The Verification queue is not a stale-price surface and receives no pricing
  work. It displays the Order's own amount, which is already authoritative.

### The Rate is machine-written

- The Rate is written only by a job. The settings write path drops the key
  entirely, so a request naming it is refused rather than silently ignored.
- The job follows the existing scheduled-job pattern: an injectable clock, an
  interval, one run immediately on start, a stop function, and registration and
  release alongside the other jobs in the process entry point.
- The feed is keyless and public. The provider sits behind an injected
  interface resolved in the composition root, matching the seams the AI
  provider and the identity exchange already use, so the rest of the codebase
  never learns a URL and the tests need no network. There is no injectable
  fetch in this codebase and this does not introduce one.
- Validation runs before the write, and a bad response is rejected rather than
  stored. A non-positive, missing, or non-finite value is refused. A value more
  than fifty percent from the last good Rate is refused as a provider fault
  rather than a market move — but only while that last good Rate is under
  twenty-four hours old, because after a longer outage the band is the wrong
  instrument and the maximum age is what should act. The first fetch has
  nothing to compare against and skips the band entirely.
- Three timestamps are kept with the Rate: last success, last attempt, and last
  error. They live in the rate's own stored value rather than in the settings
  row's generic updated-at column, so a failing job is distinguishable from a
  fresh one and the Rate and its age cannot drift apart.
- The rate's read accessor gains an age. Its validator stays, because the Order
  path still reads and validates the stored value; only the admin-facing write
  path goes.
- New LTC Orders are refused once the Rate is older than a maximum age of
  forty-eight hours. The refusal is distinct from the existing unset-rate
  refusal and carries its own message, because "LTC is not set up yet" and
  "the rate feed is down" are different things and only one of them is alarming.
  The existing message is wrong for an outage and stays correct for an unset
  rate.
- The fetch writes no audit entries. At twice a day that is roughly seven
  hundred a year, which would drown the entries that matter. Change is logged at
  info level; a failure or a validation rejection is what earns an audit entry.
- The Rate source, its staleness policy, and the outbound-request disclosure are
  recorded as an ADR, and the Privacy page gains a line naming the price feed
  for what it is. The admin runbook's description of the settings tab is
  corrected, since it currently tells the operator the Rate is edited there.

### The Payment Window

- A nullable payment deadline is set on the Order at creation, six hours out.
  Expired is derived: the Order is pending, the deadline is present, and it has
  passed. Nothing writes the flag back, and no job maintains it.
- The Order status set is unchanged. Pending, verified, and rejected are the
  three outcomes of a decision, and a lapsing window is not a decision anyone
  made.
- The deadline is fixed at creation and a resubmission does not extend it.
  Resubmission amends the same Order, so an extending window could be held open
  indefinitely by resubmitting, which would defeat the window entirely.
- Orders that already exist when the deadline column lands are exempt. A null
  deadline means no window. There is no backfill, because backfilling would
  instantly lapse every pending Order including any with a payment in flight.
- The window applies to USDT and LTC alike. The rate only moves for LTC, but
  one rule is simpler, bounds the queue, and avoids doubling the states every
  surface has to render. The user-facing message for a lapsed window does not
  blame the Rate, because for a USDT Order nothing moved.
- Submitting against a lapsed Order is refused with a message pointing at a new
  Order. A lapsed Order never blocks a new one, and the new Order is priced at
  the current Rate.
- The maximum-age bound applies at quote time only. Re-checking it at
  Verification would mean either rejecting a customer who paid the figure they
  were quoted or re-pricing them after the fact, and both are worse than the
  exposure being accepted here. The consequence is stated rather than hidden: an
  Order verified up to six hours after creation can be quoting a Rate up to
  fifty-four hours old. A fresher guarantee would need a refresh on read or a
  much shorter window, not a longer one.
- Verification still compares exactly, with no tolerance. That is correct. But a
  short payment will now often mean the Rate moved rather than the user
  miscalculated, so the queue shows that context and the rejection affordance
  offers it as a reason — the rejection reason is typed by the Admin today, so
  this is new, not a copy change.
- The deadline and the derived flag are exposed on the order view, so the
  Account page's upgrade status, the payment instructions, and the Admin queue
  all render from one source.

### Vocabulary

- The glossary gains **Rate** and **Payment Window**, and the **Order** entry is
  amended: an Order is payable within a Payment Window, and letting one lapse is
  not a decision. The current wording — pending until the Admin verifies or
  rejects it — is the exact sentence the window falsifies.

## Testing Decisions

- Tests assert external behaviour only. Which module computes a number, which
  component formats it, and which seam a value arrives through are all
  implementation details and are not asserted directly.
- **Server routes** are tested at the seam the codebase already uses: the Hono
  app over a real SQLite database, driven through the route. The pricing
  endpoint is tested there — reachable without a session, correct shape, prices
  and limits reflecting an Admin edit, and neither wallet addresses nor the Rate
  present in the response.
- **The rate job** is tested at the seam the existing scheduled jobs use: an
  injected clock and a returned stop function, with the provider as a fake
  interface so no test touches the network. Covered there: a successful fetch
  writing the Rate; a fetch before the first success writing it with no band
  applied; a rejection of a non-positive or missing value; a rejection outside
  the band while the last success is recent; a value outside the band being
  accepted once the last success is old; a failed fetch leaving the previous
  Rate in place and recording the error; and the stop function halting the
  interval.
- **The rate's age** is tested through the same accessor the Order path uses:
  a fresh Rate is under the maximum age, a Rate past it is refused for new
  Orders, and the refusal message says the rate is refreshing rather than that
  LTC is not set up.
- **The Order window** is tested at the route seam: an Order created now is
  submittable, an Order past its deadline is refused with a message pointing at
  a new Order, a resubmission does not move the deadline, and a null deadline is
  submittable regardless of age. Expired is derived, so there is no sweeper to
  test.
- **Web surfaces** are tested at the seam the codebase already uses: React
  Testing Library over a stubbed fetch with the shared JSON response helper.
  The pricing surfaces are tested rendering a stubbed response, a failed fetch
  is tested rendering the unavailable state, and the money formatter is tested
  directly for its integer and non-integer rules.
- **Prior art** the new tests should look like: the history purge job test for
  the injectable clock; the AI provider test for an injected external interface
  with no network; the settings route tests for admin write validation; the
  order route tests for the Order lifecycle; the verification queue tests for
  the exact-match display.
- **The e2e pricing layout spec** has its row-count assertion updated for the
  new row, and gains a check that the rendered prices come from the endpoint
  rather than from constants.
- The full suite green is an acceptance criterion on every ticket in this
  spec.

## Out of Scope

- Changing what a plan includes, beyond adding the AI Allowance row to the
  comparison table.
- Any USD-to-USDT conversion, and any price not stored in USDT.
- Showing the Rate, or any rate, on the pricing surface. The LTC figure lives in
  the payment phase, where it is computed for the Order being paid.
- A freshness guarantee on the Rate beyond the twelve-hourly fetch. A refresh on
  read, or a much shorter window, is the honest way to get a fresher number;
  neither is in scope, and the fifty-four-hour consequence above is accepted
  rather than solved.
- Re-pricing, cancelling, or auto-rejecting a lapsed Order. It is replaced by a
  new one.
- Any tolerance on the Verification amount comparison.
- Sweeping, deleting, or expiring lapsed Orders in the background.
- Any change to the AI provider configuration beyond removing its cost readout,
  which is tracked separately as a launch follow-on.
- Changing the payment instruments or the manual Verification model
  (ADR-0005).
- Repricing or adding a Rate for any coin other than Litecoin.

## Further Notes

- The four to-dos this spec came from were written as a pass over the launch
  work and live in `.scratch/launch/follow-up-todos.md`. Three of its claims
  were checked against the code and found wrong, and the corrections matter if
  anyone works from that file: the Verification queue is not affected by the
  pricing surface at all, since it displays the Order's own amount; the catalog
  module has eleven importers rather than ten, and only four of them read
  prices at all; and the client and server duration arithmetic already agree,
  so that drift is latent rather than present.
- The rate work ships in two stages inside its ticket, not as two tickets. The
  job lands first and is confirmed against the live instance, and only then is
  the write path removed. Shipping the removal first would switch LTC off on a
  live payment method whose wallets are already configured, because there is no
  seeded rate and an unset rate refuses LTC Orders. The ordering lives in the
  commit history of the ticket.
- The AI cost readout removal is a launch follow-on rather than part of this
  spec, because it is not an instance of this problem. It is tracked as
  `launch/13`.
- Nothing here changes the client-side preview or export path, so the contract
  that one engine drives preview, Client Export, and Server Export is untouched.
