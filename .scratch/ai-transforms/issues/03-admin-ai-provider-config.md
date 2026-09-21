# 03: Admin AI Provider Config, the provider seam, and the instance's AI state

**What to build:** The Admin opens the admin panel, fills in an OpenAI-compatible endpoint, a model, and a reasoning effort, presses Test connection, and is told whether the endpoint answered — with the model's published context length, output cap, and price when the provider reports them. A kill switch removes AI from the whole instance; a fresh self-hosted instance has no AI until a key is present in its environment. The account endpoint reports the instance's and the caller's AI state so no other surface has to guess.

**Spec:** `.scratch/ai-transforms/spec.md` (the AI Provider Config, provider invisibility, and account-endpoint decisions).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The AI Provider Config is one admin-editable setting with validation that rejects malformed values and accepts valid ones, seeded with defaults, audited on every change, and never echoed back with the key.
- [ ] The provider client is one seam over an OpenAI-compatible chat completion: endpoint, model, messages, an explicit output cap, and reasoning effort; it returns the reply text and the finish reason, and maps every transport and HTTP failure to one provider-error shape. It is injected into the app the way the export renderer already is, so tests run against a fake and nothing in the test suite touches a live API.
- [ ] The API key is read from the environment only: never written to settings, never returned by any endpoint, never logged. The panel reports only whether a key is present, and rotating it needs a restart.
- [ ] Test connection reports, for the Admin only, whether the endpoint answered, the model's published context length and output cap and price where available, and a warning when the configured caps cannot fit the model's window. No user-facing surface, including every error message, names the provider or the model.
- [ ] The account endpoint reports the instance's AI state alongside plan, Quota, and flags: configured, included in the caller's plan, whether the caller has AI on, how many AI Actions remain this period, and when the period resets.
- [ ] The kill switch (config flag, or an absent key) makes AI report as unavailable, with no upsell anywhere.
- [ ] The monthly AI Allowance joins the Admin's plan limits beside page cap and Server Export quota: validated as a non-negative integer (zero disables AI for that plan), defaults seeded like the other limits, Admin edits surviving restarts through the same absent-key seeding rule.
- [ ] The Admin's user detail view shows the user's AI Action count for the current period.
- [ ] Tests: config validation and audit, the key never appearing in any settings read, the provider client against a fake for success and every failure shape, Test connection's reporting, the account endpoint's AI block for each state, the allowance limit's validation and seeding, and the per-user usage count in the user detail view.
