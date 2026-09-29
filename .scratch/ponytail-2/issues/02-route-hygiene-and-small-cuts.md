# 02: Route hygiene, small cuts, dead exports (server)

**What to build:** the server package stops restating things it already has
in a dozen places each. Thirteen routes open with their own copy of the
"not signed in" guard; twelve read their body through the same four-call
expression; the gated-feature flag is a module whose entire answer is a fact
its one caller is already holding; a handful of small helpers hand-roll
what Node already ships. After this ticket each of those is one place, and
the package's exported surface says what it means.

Nothing a user sees changes. The gated-feature payload keeps its field name
and its value, so the web app's reader is untouched.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The "not signed in" guard is one middleware, mounted once per protected
      sub-app, in the shape the History routes already use. All thirteen
      verbatim copies are gone and each protected route returns the identical
      401 body and status.
- [ ] Request-body parsing is one call beside the existing record helper. All
      twelve verbatim read chains collapse to it. The streaming reader is
      untouched — the route's size middleware trusts a declared Content-Length
      and this counts what actually arrived, so on a 50 MB export payload the
      two are not interchangeable and the comment saying so stays.
- [ ] The gated-feature flag module is deleted. Its sole answer is "an active
      Entitlement exists", and its one caller already holds the Entitlement it
      was derived from. The wire shape is byte-identical, so the web app's
      flags reader and its tests need no change.
- [ ] The Order reference code is generated with Node's own uniform integer
      source rather than a hand-rolled rejection sampler and its private bias
      limit. The alphabet, the length and the resulting distribution are
      unchanged.
- [ ] The UTC day end is one expression rather than a hand-assembled
      `23:59:59.999`, with no behavior change at any boundary the Entitlement
      tests already cover.
- [ ] The usage period string is derived from the platform's own ISO form
      rather than assembled from year and month fields.
- [ ] The fixed-window limiter's clock parameter is gone: no construction site
      in the repo passes it. The rolling-window limiter's equivalent stays,
      because that one genuinely is injected.
- [ ] The entitlement row read that duplicates another read in the same module
      is collapsed onto the one it duplicates.
- [ ] The history-store factory is gone. It wraps a single product in an empty
      body, and it is the only reason the store's options type is exported;
      the class is exported instead and the options type stops being public.
- [ ] Every export removed in this ticket has been checked to have no import
      site anywhere in the repository — web, server, core, unit tests and e2e
      alike — and the removals are recorded so a later reader can tell a
      deliberate non-export from an oversight.
- [ ] **The Rate refusal in the admin settings route is NOT cut.** ADR-0014
      records it as the enforcement mechanism for "the Admin cannot choose the
      number a customer is quoted", so the 403 naming the fetch is load-
      bearing even though the generic refusal would also answer. It stays,
      and it keeps its documented status.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` green;
      the full unit suite green; the server export e2e green.
