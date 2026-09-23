# 03: Admin AI Provider Config, the provider seam, and the instance's AI state

**What to build:** The Admin opens the admin panel, fills in an OpenAI-compatible endpoint, a model, and a reasoning effort, presses Test connection, and is told whether the endpoint answered — with the model's published context length, output cap, and price when the provider reports them. A kill switch removes AI from the whole instance; a fresh self-hosted instance has no AI until a key is present in its environment. The account endpoint reports the instance's and the caller's AI state so no other surface has to guess.

**Spec:** `.scratch/ai-transforms/spec.md` (the AI Provider Config, provider invisibility, and account-endpoint decisions).

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The AI Provider Config is one admin-editable setting with validation that rejects malformed values and accepts valid ones, seeded with defaults, audited on every change, and never echoed back with the key.
- [x] The provider client is one seam over an OpenAI-compatible chat completion: endpoint, model, messages, an explicit output cap, and reasoning effort; it returns the reply text and the finish reason, and maps every transport and HTTP failure to one provider-error shape. It is injected into the app the way the export renderer already is, so tests run against a fake and nothing in the test suite touches a live API.
- [x] The API key is read from the environment only: never written to settings, never returned by any endpoint, never logged. The panel reports only whether a key is present, and rotating it needs a restart.
- [x] Test connection reports, for the Admin only, whether the endpoint answered, the model's published context length and output cap and price where available, and a warning when the configured caps cannot fit the model's window. No user-facing surface, including every error message, names the provider or the model.
- [x] The account endpoint reports the instance's AI state alongside plan, Quota, and flags: configured, included in the caller's plan, whether the caller has AI on, how many AI Actions remain this period, and when the period resets.
- [x] The kill switch (config flag, or an absent key) makes AI report as unavailable, with no upsell anywhere.
- [x] The monthly AI Allowance joins the Admin's plan limits beside page cap and Server Export quota: validated as a non-negative integer (zero disables AI for that plan), defaults seeded like the other limits, Admin edits surviving restarts through the same absent-key seeding rule.
- [x] The Admin's user detail view shows the user's AI Action count for the current period.
- [x] Tests: config validation and audit, the key never appearing in any settings read, the provider client against a fake for success and every failure shape, Test connection's reporting, the account endpoint's AI block for each state, the allowance limit's validation and seeding, and the per-user usage count in the user detail view.

## Comments

Implemented on `main` (uncommitted at the time of writing). Verified with `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` (1216 tests), plus a live browser pass: an admin account in a fresh instance saw the seeded config, saved a base URL/model, and Test connection answered against a local OpenAI-compatible stub with the model's published window, output cap, and price, and the output-cap warning. A screenshot is saved at `.scratch/ai-transforms/ai-admin-settings.png` for aesthetic review.

Deliberate decisions and deferrals:

- `users.ai_disclosure_seen` and `users.ai_access` are added by this ticket's migration (spec §Data model); only `ai_access` is read here (the account block). The disclosure flag is written by 05.
- Upstream error bodies are returned to the caller (`AiProviderError.detail`) and shown in the Admin panel, but not logged here: the only user-flow provider failures are 05's route, which owns server-side logging. The provider seam itself never logs the key, prompt, or reply.
- The panel does not yet show token equivalents or worst-case cost per AI Action: the character→token estimator lands in 04, and the arithmetic belongs with it — folded into 08 on 2026-09-24, which now owns the display. Test connection shows the published price and warns when the configured caps exceed the published numbers.
- `aiConfigured` requires a model id in addition to the key and the kill switch (the seed ships an empty model); adding a key alone does not point the instance at a model the Admin never chose.
- **Status flipped `ready-for-human` → `resolved`** (2026-09-24): the label means "requires human implementation"; the implementation above shipped (`db91291`) and was verified with the suites and a live browser pass. The one deferred spec item — the panel's token-equivalent and worst-case-cost readout — is folded into ticket 08, which now owns it, so nothing here is still waiting on a human.
