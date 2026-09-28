# 13 — Remove the AI cost readout

Status: resolved
Blocked by: None (could start immediately)

**What to build:** the Admin panel's AI Provider Config loses its cost readout
entirely — the price arithmetic and the token counts both. The Admin's call on
2026-09-28: the arithmetic prices a worst case from two caps and two published
rates, which is too basic to plan a real budget around, so the honest thing is
to remove it rather than pretend it is a budgeting tool.

**What stays,** and is the part that earns its place: Test connection still
reports the model's context window and output cap, and still warns when a
configured cap does not fit the model. That is the signal worth a glance before
announcing.

**What to remove:**

- The cost module itself — its price and per-action cost types and the two
  formatting functions — and its test file.
- The cost readout component in the AI Provider Config panel, its call site, and
  the now-unused imports that went with it. The panel's budget and write-cap
  helpers are used by core and by the AI command hook; only the panel's import
  goes.
- The assertions in the Settings panel tests covering the cost readout and the
  per-action cost. There are three such tests and five assertion sites, not the
  four cases the source note listed — two of the sites are the token counts,
  which go with the readout.
- On the server: the input and output price fields from the model-info type, the
  pricing read from the `/models` payload, and the per-million price helper,
  which nothing else calls.
- On the client: the same two price fields from the connection-model type, so the
  Admin's view of the report matches what the server sends.
- The price assertions in the provider and settings-route tests, which pin the
  test-connection report's full shape.

**The judgement call, resolved rather than assumed:** the character-to-token
estimator is exported from the AI primitives and its only production consumer
was the cost module — but it is also exercised directly by the core test suite,
so it is not orphaned and it stays. Its doc comment names "the panel's per-Action
arithmetic", so the comment needs rewriting either way. The non-ASCII
characters-per-token constant stays regardless; the AI size estimator selects
from the same constant.

**Follow-on work, so nothing points at a ghost:**

- The launch checklist's AI prerequisite says a model is chosen "with the
  per-Action cost arithmetic in mind" and names the panel's worst-case cost as
  the number to compare. It describes a panel that will no longer exist. Reword
  it.
- The AI transforms spec and its verification-and-release ticket record the cost
  readout as the accepted home for an earlier deferral. They need a line saying
  where it went.
- `PRODUCTION.md` tells the operator to check the worst-case cost of one AI
  Action in the panel. That is the readout being deleted. The source to-do did
  not list this file.
- The launch checklist's "What is still open" and "Follow-up work" sections
  still describe this as an open item.

- [x] No cost, price, or token row appears anywhere in the AI Provider Config
      panel, and no panel copy refers to price.
- [x] Test connection still reports the context window and the output cap, and
      still warns on a mismatch.
- [x] The estimator and its test stay, and the estimator's doc comment no longer
      refers to the panel's arithmetic.
- [x] The test-connection report's shape matches on both sides of the wire, with
      no price field.
- [x] The launch checklist's AI prerequisite, the AI transforms spec and its
      verification ticket, the launch checklist's open and follow-up lists, and
      the production runbook no longer refer to a readout that does not exist.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass.

## Comments

- **Implemented (2026-09-28).** `apps/web/src/admin/ai-cost.ts` and its test are
  deleted; `AiCostReadout`, its call site, the panel's `@perfectmarkd/core`
  import (`aiBudgets`, `aiWriteCapTokens` — the only panel use of either), and
  the panel's `./ai-cost` import go with them. The panel now has no cost, price,
  or token row: the caps are the fields, and Test connection's report is where
  the model's published numbers are read.
- **Server:** `AiModelInfo` drops `inputPricePerMillion` and
  `outputPricePerMillion`; `parseModelInfo` no longer reads `pricing` out of the
  `/models` payload, and `pricePerMillion` is gone with nothing left to call it.
  `AiConnectionModel` on the client drops the same two fields, and
  `settings-routes.test.ts` pins the whole report with `toEqual`, so a price
  field reappearing on either side of the wire fails a test.
- **The tests went with the behaviour, not around it.** `SettingsPanel.test.tsx`
  loses one test outright and two are edited: nine assertion sites go, the ones
  the ticket counts plus the Test connection report's own price row and the two
  token counts. What survives is that the readout is *absent*
  (`queryByTestId('ai-cost')`), that the report still states the window and the
  output cap, and that the cap-mismatch warning still fires. The
  `provider.test.ts` payload keeps its `pricing` block, so the test now says a
  provider's published price is ignored rather than merely unasserted.
- **The estimator stays, and its doc comment was rewritten** to explain itself
  instead of naming the panel: the conservative end of `estimateAiSize`'s
  range, for a character budget with no text to measure. It has no production
  consumer now, but it is the tight ratio a caller needs and the core suite
  exercises it directly, so it is not orphaned code.
- **Docs that pointed at the readout:** the launch checklist's AI prerequisite
  (now `[x]`, with the reasoning and the ticket), its "Test connection has been
  run" line, "What is still open" item 1 (three to-dos remain, not four), and
  the "Follow-up work" list; `PRODUCTION.md` steps 3, 5, and 6; this ticket's
  own source note, `.scratch/launch/issues/06-launch-checklist.md`, whose AI
  prerequisite list and closing comment both named the panel's worst-case cost;
  the AI transforms spec (story 99 marked withdrawn, the two §AI Provider Config
  bullets, and the shipping-checklist bullet); and that workstream's ticket 08,
  whose checkbox and implementation comment now say where the readout went.
- **Verified in a real browser**, against a local API and a stub OpenAI-compatible
  endpoint that publishes a price in its `/models` payload: the panel renders
  with no cost, price, or token row and no orphaned rule above the Test
  connection button, and the report shows the context window, the output cap,
  and the cap-mismatch warning with no price line. Screenshots in
  `/tmp/opencode/pmd/ai-panel.png` and `/tmp/opencode/pmd/ai-report.png` (not
  committed, matching how ticket 08's review screenshots were handled).
- **Left alone deliberately:** `live-pricing/spec.md`'s out-of-scope note
  ("removing its cost readout is a launch follow-on rather than part of this")
  was true when written and is still true — it is a scoping statement about a
  different spec, not a pointer at the panel.
