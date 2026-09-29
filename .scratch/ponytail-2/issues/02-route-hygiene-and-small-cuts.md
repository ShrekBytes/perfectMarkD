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

**Status:** resolved

- [x] The "not signed in" guard is one middleware, mounted once per protected
      sub-app, in the shape the History routes already use. All thirteen
      verbatim copies are gone and each protected route returns the identical
      401 body and status.
- [x] Request-body parsing is one call beside the existing record helper. All
      twelve verbatim read chains collapse to it. The streaming reader is
      untouched — the route's size middleware trusts a declared Content-Length
      and this counts what actually arrived, so on a 50 MB export payload the
      two are not interchangeable and the comment saying so stays.
- [x] The gated-feature flag module is deleted. Its sole answer is "an active
      Entitlement exists", and its one caller already holds the Entitlement it
      was derived from. The wire shape is byte-identical, so the web app's
      flags reader and its tests need no change.
- [x] The Order reference code is generated with Node's own uniform integer
      source rather than a hand-rolled rejection sampler and its private bias
      limit. The alphabet, the length and the resulting distribution are
      unchanged.
- [x] The UTC day end is one expression rather than a hand-assembled
      `23:59:59.999`, with no behavior change at any boundary the Entitlement
      tests already cover.
- [x] The usage period string is derived from the platform's own ISO form
      rather than assembled from year and month fields.
- [x] The fixed-window limiter's clock parameter is gone: no construction site
      in the repo passes it. The rolling-window limiter's equivalent stays,
      because that one genuinely is injected.
- [x] The entitlement row read that duplicates another read in the same module
      is collapsed onto the one it duplicates.
- [x] The history-store factory is gone. It wraps a single product in an empty
      body, and it is the only reason the store's options type is exported;
      the class is exported instead and the options type stops being public.
- [x] Every export removed in this ticket has been checked to have no import
      site anywhere in the repository — web, server, core, unit tests and e2e
      alike — and the removals are recorded so a later reader can tell a
      deliberate non-export from an oversight.
- [x] **The Rate refusal in the admin settings route is NOT cut.** ADR-0014
      records it as the enforcement mechanism for "the Admin cannot choose the
      number a customer is quoted", so the 403 naming the fetch is load-
      bearing even though the generic refusal would also answer. It stays,
      and it keeps its documented status.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` green;
      the full unit suite green; the server export e2e green.

## Comments

- **One guard, beside the transport helpers it belongs with.**
  `requireSession` lives in `src/auth/http.ts` — the module the session
  middleware and the auth routes already share — and is a plain
  `MiddlewareHandler<AppEnv>`. Mounted with `app.use('*', …)` on the five
  sub-apps that have no public route — three of them new (Orders, `/api/me`,
  the AI commands) and two (the Admin panel, Export History) already carrying
  the shape, now composing the shared guard — and per route on the two sub-apps
  that also serve signed-out callers: the auth router's four account actions
  and the export **enqueue**. The admin sub-app's own gate became
  `app.use('*', requireSession, adminOnly)` rather than restating the 401.
  Handlers behind it read `c.var.user!`, which is the same trust the History
  routes already declared. All thirteen verbatim copies are gone; `git grep
  "Not signed in"` now finds one, in the middleware.
- **The export job reads stay unguarded on purpose.** `GET /jobs/:id` and
  `/jobs/:id/pdf` answer 404 for an unknown or unowned job, signed out
  included, so mounting the guard on the whole sub-app would have turned a 404
  into a 401 and told a stranger a job id was worth asking about.
- **Two orderings moved, both only visible to a signed-out caller.** (a) The
  guard runs before `rejectRateLimited` on `/change-password` and
  `/change-email`, so an anonymous caller now draws 401 rather than spending
  (or being answered from) the password-confirm budget — the one divergence
  from "the identical 401 body and status", and an unavoidable consequence of
  the guard being middleware at all. (b) `app.use('*', …)` on a sub-app also
  intercepts *unmatched* paths under it, so `GET /api/me/x`, `/api/orders/x`
  and `/api/ai/x` answer 401 where they answered 404. Nothing in the SPA asks
  for such a path (it calls `/api/me`, `/api/orders`, `/api/orders/:id/submission`,
  `/api/ai/markdown|stylesheet|access` and no others), and the admin and
  History sub-apps already answered this way before the change — but it is a
  status change, so it is written down rather than claimed away.
- **`jsonBody` is the one read, and the streaming reader stayed.** All twelve
  verbatim `asRecord(parseJson(await c.req.text()))` chains (auth 8, admin
  users 3, AI 1) collapse to it. Ten further `parseJson(await c.req.text())`
  reads hand the raw value to a parser that calls `asRecord` itself; those keep
  their own validation chains, as the spec asks. `readJsonBody` is untouched
  and its comment about the declared-vs-actual size still stands; `jsonBody`'s
  own doc says why it is not that one.
- **The flags module is gone, its reasoning kept.** `flags.ts` was a module
  whose whole answer was `plan === 'pro' || plan === 'premium'`, called once
  from a function that had already resolved the active Entitlement. `me.ts`
  now writes `flags: { paidTier: activeEntitlement !== null }` and carries the
  "why one boolean for five controls" comment that used to head the module,
  including the comp clause (a comped user without a plan spends comps on
  Server Export and gains no features). The wire shape is byte-identical, so
  the web reader, the Inspector controls, the account store and the e2e
  `/api/me` stubs needed no change — verified by the web unit suite rather
  than asserted. The reader's header comment did name the deleted module, so
  that one line was repointed at `/api/me`.
- **Three platform swaps, each checked at the boundary it names.**
  `newReferenceCode` is five `randomInt(31)` picks — Node's sampler is uniform
  over the range, so the rejection loop and the 248-byte bias limit are gone
  (200k codes, all 31 letters, χ² 20.4 on 30 dof). `endOfUtcDay` is
  "midnight tomorrow minus a millisecond", compared against the old assembly
  day by day across two years (0 mismatches, including the leap day and both
  month/year rollovers). `usagePeriod` is `toISOString().slice(0, 7)`, and
  the three boundary cases the suite pins (Jan 9, Dec 31 23:59, Feb 1 00:30)
  pass untouched.
- **The dead surface: 99 `export` declarations.** Every name was checked for an
  import site in every module of all three packages plus the e2e specs, and
  `pnpm typecheck` is the proof — a symbol with no importer would have failed
  the build. The 99 break down as **5 rewritten in place and still exported**
  (the schema unions `ORDER_STATUSES`, `AUDIT_ACTIONS`,
  `EXPORT_JOB_STATUSES`, `EXPORT_JOB_ERROR_CODES`, `AUDIT_TARGET_TYPES` and
  `TOKEN_PURPOSES` existed to spell — ESLint rejects a value nothing reads, so
  keeping the arrays would have meant keeping dead code; the five arrays that
  *are* read as values, `PLANS`, `DURATION_MONTHS`, `PAYMENT_METHODS`,
  `NETWORKS` and `REASONING_EFFORTS`, stay exported); **11 declarations gone**
  — `FeatureFlags` and `featureFlagsFor` with the deleted flags module,
  `createHistoryStore` (the five construction sites, `main.ts`,
  `ops/seed-rehearsal.mjs` and the three history suites, now call
  `new HistoryStore(…)`, and the rehearsal script was run against the built
  `dist` to confirm it), the unread `PricingView`, the unread
  `ExportJobStatus` type (its four states now ride on the column comment, the
  table's own doc already carrying the memory-only payload), and the six
  arrays; and **83 un-exported**, recorded by module below.
  **The audit's estimate for this ticket was ~40; the real figure for the
  server package was 99, and taking all of them rather than the named few was
  the user's call.**

  ```
  admin/grant.ts            GrantInput, endOfUtcDay
  admin/routes.ts           AdminRoutesOptions
  admin/settings-routes.ts  LtcRateStatusView, AdminSettingsView,
                            ltcRateStatusView, settingsView,
                            SettingsRoutesOptions
  admin/users.ts            UsersRoutesOptions, EntitlementView,
                            AdminOrderView, UsageView, AdminUserView,
                            AdminUserDetailView
  ai/prompts.ts             AiTargetKind,
                            AI_MARKDOWN_REPLACEMENT_SYSTEM_PROMPT,
                            AI_PLAN_SYSTEM_PROMPT, PlanPromptInput,
                            MarkdownPromptInput, MAX_STYLESHEET_HISTORY,
                            StylesheetPromptInput
  ai/provider.ts            AiModelInfoRequest
  ai/routes.ts              AiRoutesOptions, AiProposalResult
  ai/state.ts               AiUsageState
  ai/test-connection.ts     AiConnectionModel, connectionWarnings
  auth/rate-limit.ts        RateLimitRule, RateLimitDecision,
                            SendRateLimitConfig
  auth/sessions.ts          ResolvedSession
  auth/testing.ts           RegisterOptions, cookiePair
  auth/tokens.ts            RedeemedToken, IssueTokenOptions, LinkRequest
  db/backup.ts              VacuumIntoResult, VacuumIntoOptions
  db/schema.ts              PlanPrice, PlanLimit
  db/settings.ts            parseLtcRate, StoredLtcRate,
                            parseStoredLtcRate, LtcRate
  env.ts                    ServerEnv
  export/payload.ts         ParsedExportPayload
  export/queue.ts           ExportJobView
  export/render.ts          PlaywrightRenderOptions, PlaywrightRenderer
  export/routes.ts          ExportRoutesOptions
  export/worker.ts          ExportWorkerOptions
  fetch-with-timeout.ts     UpstreamErrorCode, TimeoutFetchErrors
  google/exchange.ts        IdentityExchange, GoogleSignInOptions,
                            GoogleIdentityExchangeOptions
  google/routes.ts          GoogleRoutesOptions
  history/purge.ts          PurgeResult, HistoryPurgeOptions
  history/routes.ts         HistoryRoutesOptions, historyEntryView
  history/store.ts          HistoryStoreOptions
  index.ts                  ExportAppOptions, CreateAppOptions
  mail/config.ts            MailOptions
  mail/mailer.ts            MailRecipient, VerificationEmail,
                            PasswordResetEmail, EmailChangeEmail,
                            EmailChangedNotice
  mail/resend.ts            ResendMailerOptions
  mail/testing.ts           RecordedSendKind, RecordedSend
  me.ts                     MeRoutesOptions
  orders/routes.ts          OrderRoutesOptions
  quota.ts                  QuotaState
  rate/job.ts               RATE_AUDIT_ACTION, RateRefreshOutcome,
                            RateRefreshResult, RateRefreshOptions,
                            RateRefreshJobOptions
  rate/provider.ts          LtcRateProviderOptions
  request-body.ts           JsonBodyResult
  ```

  Eleven of the 83 are values rather than types — `cookiePair`,
  `connectionWarnings`, `historyEntryView`, `ltcRateStatusView`,
  `settingsView`, `parseLtcRate`, `parseStoredLtcRate`, `RATE_AUDIT_ACTION`,
  `MAX_STYLESHEET_HISTORY` and the two AI system prompts — each called only
  from its own module. A few names that lost the keyword are still cited in a
  neighbouring comment (`ExportJobErrorCode`, `Mailer`'s payloads): the names
  live on, only the `export` went.
- **Deliberately not cut:** the admin settings route's 403 for `ltcRateUsdt`
  (ADR-0014's enforcement mechanism, checked as the ticket asked), the
  rolling-window limiter's injected clock, and the one-time link vocabulary
  that *is* imported (`UpstreamError`, `TokenPurpose`,
  `ExportJobErrorCode`, `AuditAction` and `OrderStatus` keep their exports; only
  their unread neighbours lost theirs).
- **The one thing the sweep could not be:** "no behavior change" is true of
  every payload, status, message and limit, and false in the two orderings
  named above. Both are invisible to a signed-in caller.
- **Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
  `pnpm build`, `pnpm test` (150 files, 1,908 tests — the same set as before the
  change, none re-pointed), `pnpm --filter @perfectmarkd/server test:e2e` (5),
  `pnpm --filter @perfectmarkd/web test:e2e` (69, run because two web comments
  changed; the first run failed the performance spec at its 1,500 ms
  main-thread ceiling and passed on a clean re-run at 1,472 ms — the box's
  contention, not the diff, which is two comment lines in `apps/web`), and the
  restore rehearsal's seed script against the built `dist`. Three test files
  changed, all construction calls (`createHistoryStore` →
  `new HistoryStore`). A two-axis review pass (Standards + Spec) followed; its
  findings are the comment repoint, the stale `EXPORT_JOB_ERROR_CODES`
  reference in `apps/web/src/export/serverExport.ts`, the stale
  `// ExportJobStatus` column note, the comp clause `me.ts` had dropped, the
  `.scratch/launch` note naming the deleted `ORDER_STATUSES`, and the four
  overstatements this Comments section now corrects.
- Unblocks `03-core-dead-exports-and-shrinks.md`.
