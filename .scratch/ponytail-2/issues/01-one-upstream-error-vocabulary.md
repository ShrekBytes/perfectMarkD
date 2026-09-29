# 01: One upstream error vocabulary across the four HTTP clients

**What to build:** the AI provider, the Resend mailer, the Google identity
exchange and the LTC rate provider stop each carrying their own copy of the
same failure vocabulary. Right now all four declare the same four codes, the
same `{ code, status, detail }` error class, the same three-closure `errors`
literal and — in three of the four — the same JSON-body reader, all
copy-pasted. After this ticket there is one error type and one code set for
that boundary, and the failure a maintainer sees when grepping for "the
provider did not answer in time" is one concept rather than four.

The boundary the previous ponytail sweep drew is honoured one level in. Each
client keeps its own message strings at its own throw sites and its own
response parsing; only the type, the vocabulary, the JSON reader and the
deadline mapping merge.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] One upstream error type and one code set exist for the outbound HTTP
      boundary, owned beside the fetch-with-timeout helper that already scopes
      itself to exactly these four clients.
- [x] All four clients raise that type. Their distinct error-class names, the
      four `*_ERROR_CODES` constants they each exported, and their own message
      strings at their own throw sites are gone — no message text moves
      between clients.
- [x] The three-closure `errors` literal each client passed collapses to the
      two things that actually differ between them (the timeout sentence and
      the transport sentence). The fetch-with-timeout seam is smaller on the
      far side of this ticket than it is on the near side.
- [x] The JSON-body reader is written once, including its rethrow-the-abort
      and its invalid-response mapping. Each client still parses its own
      successful payload.
- [x] The four existing client test suites pass without rework: same failure
      cases, same codes, same statuses, same detail excerpts.
- [x] The fetch-with-timeout helper's header comment no longer claims the
      split is deliberate, and instead states the boundary this ticket
      actually drew.
- [x] The comment recording email/01's original decision is not edited, and
      not contradicted without an answer: the ticket records that the
      premise changed from two copies to four, that the "five knobs" figure
      drops to two strings plus one parser, and that the coupling the
      decision warned about already existed as four copies of one vocabulary.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the server
      export e2e green.

## Comments

- The recorded decision this ticket overturns lives in the closed ticket
  `.scratch/email/issues/01-mailer.md`, not in `docs/adr/`, so no ADR is
  needed: an internal error class is cheap to revert and the reasoning is
  preserved where it was written. The argument belongs here.

## Answer

The four outbound HTTP clients now share one failure vocabulary. The type and
its four codes live in `fetch-with-timeout.ts` beside the helper that already
scoped itself to exactly these four clients, and the four clients import them
from there. `AiProviderError`, `MailerError`, `GoogleExchangeError` and
`RateProviderError` are gone, along with the four `*_ERROR_CODES` constants
and the four derived `*ErrorCode` types; `UpstreamErrorCode` is the one code
set. Net −242/+181 lines across the 18 source files, plus this ticket — and a
much larger reduction in what a reader has to hold: four error classes, four
code sets and three JSON readers become one of each.

**The three premises email/01 recorded, answered.** The comment in
`.scratch/email/issues/01-mailer.md` is unedited and its reasoning stands as
written — what changed is the arithmetic it was reasoning about, so the
decision it justified no longer follows from it:

- *"there were two copies when the decision was recorded and there are four
  now."* Confirmed. The Google identity exchange
  (`google/exchange.ts`) and the LTC rate provider (`rate/provider.ts`) both
  landed after email/01 and each carried a full copy: the same four code
  strings, the same `{ code, status, detail }` shape (two of the four without
  the last two fields), the same three-closure `errors` literal. Two clients
  was a defensible duplication; four copies of one vocabulary is drift waiting
  to happen, and the ticket's grep — "the provider did not answer in time" as
  one concept — is the thing that makes it visible.
- *"the shared shape would need five knobs."* It does not. The seam takes two
  strings and one parser: the timeout sentence, the transport sentence, and the
  `readJson` call that maps a non-JSON body. `fetchWithTimeout` lost the
  `isOwnError` closure and reads `error instanceof UpstreamError` itself, so
  the interface a client passes is **smaller** on the far side of this ticket
  than on the near side, not larger.
- *"it would couple the mail feature to the AI one."* The coupling is already
  there in substance and this ticket makes it explicit rather than adding it.
  Four files agreed on one vocabulary by copy-paste; two of them must have
  changed together every time a code was added, and the first sweep's comment
  on `fetch-with-timeout.ts` was already a partial admission that the split
  was a fact about copies rather than about the two features.

**What did not move, deliberately.** Every message string stayed at its own
throw site and no text crossed between clients: the AI provider still says
"The provider returned a malformed reply.", the mailer "The mail provider
returned a malformed reply.", the rate provider "The rate feed returned a
malformed reply." The shared `readJson` takes the sentence as an argument
rather than owning one. Each client still parses its own successful payload
(`firstChoice`/`parseModelInfo`, `readMessageId`, `readAccessToken`/
`readIdentity`, `readLastPrice`), and each still decides for itself whether an
HTTP failure carries the upstream body excerpt — the AI provider and the
mailer do, the other two deliberately do not. The header comment on
`fetch-with-timeout.ts` now states this boundary instead of asserting the
split was deliberate.

**One behaviour change, and it is a fix rather than a regression.**
`readMessageId` previously swallowed a non-JSON 2xx body and returned `null`,
so a truncated or HTML-errored acceptance became "The mail provider accepted
the message without an id." — reporting a provider error as a send. Routing
it through the shared reader makes it "The mail provider returned a malformed
reply." Same `invalid_response` code, same `detail: null`, so nothing
observable to a route or a log line changes; the sentence is now the honest
one. This is the sweep's only behaviour change, and the resend suite now pins
both sentences (the malformed one and the idless one) so the split cannot
regress silently. The idless path itself is unchanged.

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
`pnpm build`, `pnpm test` (1,908 tests, no new test file) and the server
export e2e (5) all green. The four client suites pass with the same failure
cases, codes, statuses and detail excerpts; the only assertion changes are the
class name and the two resend messages above. The core goldens and the web e2e
were not run: no file outside `apps/server` changed.

**Not done, deliberately.** The two `cause instanceof UpstreamError ? … : 'unknown'`
log lines in `auth/routes.ts` and `google/routes.ts` are now byte-identical, and
a `upstreamCode(cause)` helper would close that; it is a fifth item of the same
kind and belongs with the route-hygiene ticket, not here. The `errors` literal
still takes two factories rather than two plain strings; the factories are what
let a client stay in charge of constructing its own error, which is the part of
this boundary that was not negotiable.
