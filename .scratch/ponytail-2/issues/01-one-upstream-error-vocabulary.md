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

**Status:** ready-for-agent

- [ ] One upstream error type and one code set exist for the outbound HTTP
      boundary, owned beside the fetch-with-timeout helper that already scopes
      itself to exactly these four clients.
- [ ] All four clients raise that type. Their distinct error-class names, the
      four `*_ERROR_CODES` constants they each exported, and their own message
      strings at their own throw sites are gone — no message text moves
      between clients.
- [ ] The three-closure `errors` literal each client passed collapses to the
      two things that actually differ between them (the timeout sentence and
      the transport sentence). The fetch-with-timeout seam is smaller on the
      far side of this ticket than it is on the near side.
- [ ] The JSON-body reader is written once, including its rethrow-the-abort
      and its invalid-response mapping. Each client still parses its own
      successful payload.
- [ ] The four existing client test suites pass without rework: same failure
      cases, same codes, same statuses, same detail excerpts.
- [ ] The fetch-with-timeout helper's header comment no longer claims the
      split is deliberate, and instead states the boundary this ticket
      actually drew.
- [ ] The comment recording email/01's original decision is not edited, and
      not contradicted without an answer: the ticket records that the
      premise changed from two copies to four, that the "five knobs" figure
      drops to two strings plus one parser, and that the coupling the
      decision warned about already existed as four copies of one vocabulary.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the server
      export e2e green.

## Comments

- The recorded decision this ticket overturns lives in the closed ticket
  `.scratch/email/issues/01-mailer.md`, not in `docs/adr/`, so no ADR is
  needed: an internal error class is cheap to revert and the reasoning is
  preserved where it was written. The argument belongs here.
