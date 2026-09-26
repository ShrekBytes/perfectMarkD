# AI in the editor and in the Custom Stylesheet

Status: resolved — the workstream shipped, including the [09](issues/09-browser-suite-after-in-place-review.md) browser-suite follow-up.

## Problem Statement

The editor renders a Document beautifully but cannot help write one. A user who has pasted a rough draft and wants it structured, a user whose report needs a plainer register, and a user who wants an introduction written from three bullet points all have to do that work by hand, outside the tool, in another window — and then paste the result back and hope nothing was silently altered on the way.

The Custom Stylesheet is worse than missing: it is promised. Both paid plans advertise it, the Inspector shows a locked "Custom stylesheet" row, and a paying user who unlocks it finds no editor to type in, no reference that explains the engine's class names, and no help writing a single selector. The capability is named in the pricing table and has no home in the interface.

Two smaller failures sit underneath. Long Documents have no path at all: any assistance that only works on a paragraph is useless to the user who most needs restructuring. And the product currently promises, in writing, that no third-party requests are ever made — a promise an AI feature necessarily breaks, which means the promise has to be renegotiated openly with the user rather than quietly narrowed.

## Solution

Two commands, one review surface, one invisible provider.

In the editor, typing `/ai` opens a popup to describe the change; typing `/ss` opens the same popup for the Custom Stylesheet. The typed trigger is consumed, hints appear only for the two letters that can start a real command, and nothing happens until the request is submitted. The AI never rewrites the Document. It returns an **AI Proposal** — a change the user reviews as a diff and accepts, rejects, or partially accepts — and only an accepted proposal becomes an edit, as one undoable step. The Custom Stylesheet gets a real home: a fourth Inspector tab holding the CSS box, an AI chat that proposes stylesheet changes turn by turn, and a link to the styling reference, with the gallery tile that turns the stylesheet on and off sitting where the user already looks for looks.

The provider is the operator's business, not the user's. The Admin sets an OpenAI-compatible endpoint, a model, and how much reasoning; the key belongs to the deployment. No user-facing surface ever names the provider or the model, and no user can reach the feature at all unless their plan includes AI Actions — of which they get a monthly allowance, metered server-side, exactly like Server Exports. Documents too large for one action degrade through a defined ladder instead of failing: scoped context, then an approved step-by-step plan, then a refusal that says what to do instead. What is never allowed is a silent truncation, a partial application, or a half-rewritten thesis presented as a result.

## User Stories

### Asking for help in the editor

1. As a writer, I want to type `/ai` in the editor and describe what I need, so that I can get help without leaving the Document or learning a new tool.
2. As a writer, I want the prompt typed in a popup rather than in the Document, so that my instructions never end up in the exported PDF.
3. As a writer, I want the `/ai` trigger text removed from the Document when the popup opens, so that the Document is never polluted by the act of asking.
4. As a writer, I want Esc to restore the trigger exactly as I typed it, so that an accidental `/ai` costs me nothing and the Document is untouched if I change my mind.
5. As a writer, I want a hint to appear when I type `/a` or `/s`, so that I can discover the two commands without reading documentation.
6. As a writer, I want typing a bare `/` to show nothing at all, so that ordinary slashes in my prose don't flash menus at me.
7. As a writer, I want the hint to be accept-able with Tab, Enter, or a click, so that keyboard and mouse users both get there in one step.
8. As a writer, I want `/aix` and `/a-something` never to open a popup, so that only the two real commands trigger anything.
9. As a writer, I want a URL like `https://example.com/ai` never to trigger the popup, so that ordinary text can't be hijacked mid-word.
10. As a writer, I want `/ai` inside a fenced code block or inline code never to trigger the popup, so that writing documentation about the command doesn't invoke it.
11. As a writer, I want pasting text containing `/ai` to trigger nothing, so that importing a Document can't pop dialogs at me.
12. As a keyboard-only user, I want the popup, its prompt field, and its buttons to be fully operable without a mouse, so that the feature meets the app's accessibility bar.
13. As a writer, I want the popup anchored to where I am in the editor, so that I keep my place in the Document while I think.
14. As a writer, I want the popup to show which part of the Document is about to change and how big it is, so that I never guess what I am handing over.
15. As a writer, I want to send my prompt with Enter and cancel with Esc, so that the interaction is two keystrokes wide.
16. As a writer, I want the popup to tell me why it is unavailable when it is, so that I know whether to upgrade, turn something on, or come back later.

### Writing and restructuring

17. As a writer with an empty Document, I want to ask for something like "write a project brief with these headings", so that I start from a draft rather than a blank page.
18. As a writer, I want an AI Action with text selected to affect only the selection, so that I can tune one paragraph without risking the rest.
19. As a writer, I want an AI Action with nothing selected to affect the whole Document, so that "restructure this" means the whole thing.
20. As a writer, I want to ask for structural changes (add a summary, reorder sections, convert a list into a table), so that the reorganization I dread doing by hand is one request.
21. As a writer, I want to ask for tone and register changes, so that a draft written for a colleague can become one written for a client.
22. As a writer, I want to ask for copy-editing (typos, grammar, consistency), so that I can send the Document out without a second pass by hand.
23. As a writer, I want the AI to know this Document's dialect — Page Breaks, math, diagrams, GFM tables, GFM Alerts — so that it never invents syntax the engine cannot render.
24. As a writer, I want the AI to leave Page Breaks, math, diagrams, links, and image references intact unless I asked about them, so that a wording fix does not wreck my pagination.
25. As a writer, I want the AI to know that page size, margins, and header/footer bands belong to the Inspector and not to CSS, so that I never accept a change that silently does nothing.
26. As a writer, I want a request that produces nothing usable to be refused rather than offered, so that I never review an empty or truncated proposal.
27. As a writer, I want to be told when the answer was cut off, so that I understand the failure was size-related and can retry with a smaller scope.
28. As a writer, I want Retry to be one click away, so that a disappointing result is not a dead end.
29. As a writer, I want to reopen the popup with my prompt intact and edit it, so that I can steer a second attempt instead of starting over.
30. As a writer, I want every accepted AI edit to be a single undo step, so that Ctrl+Z takes me back exactly as far as the AI did.
31. As a writer, I want to keep typing in the editor while an AI Action is running, so that forty seconds of waiting is not forty seconds of nothing.
32. As a writer, I want the editor to tell me if the text changed while the AI was working, so that I never apply a change to text it no longer matches.
33. As a writer, I want to cancel a running AI Action, so that I can back out when I realize I asked the wrong question.
34. As a writer, I want the AI's answer never to appear in my Document until I accept it, so that nothing surprising is ever in my file.

### Documents too large for one request

35. As a writer with a 200-page Document, I want to be told up front what part of it can be worked on, so that I do not spend time on a prompt that cannot succeed.
36. As a writer with a large Document, I want a selection-based action to still work, so that long Documents are not second-class.
37. As a writer with a large Document, I want an action on one section to see an outline of the rest, so that the result stays consistent with the Document it belongs to.
38. As a writer, I want to be told when only part of my Document was sent as context, so that I know what the AI could and could not see.
39. As a writer with a Document too large to work on at once, I want to be offered a plan first — what would change, section by section — so that I approve the work before any of it happens.
40. As a writer, I want to know how many AI Actions a plan will cost before it starts, so that I do not discover it by running out halfway.
41. As a writer, I want to stop a plan partway and keep what I already accepted, so that I stay in control of a long run.
42. As a writer, I want each step of a plan to be its own proposal, so that "run this plan" never means "trust me with twenty edits".
43. As a writer, I want a long run to stay consistent across sections, so that the tone in the last section matches the tone the plan set in the first.
44. As a writer whose Document has one enormous unstructured section, I want a paragraph range around my cursor offered instead, so that I still have a way forward.
45. As a writer, I want a Document that simply cannot be worked on to be refused clearly, with its size and the alternative stated, so that nothing fails silently.
46. As a writer, I want to split a Document myself and work section by section, so that the limit is not a wall around my whole project.

### Reviewing an AI Proposal

47. As a writer, I want to see exactly what would change before it changes, so that I never discover an edit by reading my own Document afterwards.
48. As a writer, I want the change shown as a diff with the surrounding lines for context, so that I can judge it in place rather than in isolation.
49. As a writer, I want the diff to be readable in the app's graphite palette rather than a red/green highlighter, so that the review surface looks like the product I am using.
50. As a writer facing a twenty-change proposal, I want to accept the changes I agree with and drop the rest, so that one bad heading doesn't force me to reject an otherwise good rewrite.
51. As a writer, I want Accept to apply only my checked changes as one undoable step, so that a partial acceptance is still one edit in my history.
52. As a writer, I want to reject a proposal without any trace of it in the Document, so that "no" is genuinely no.
53. As a writer, I want to be told how many changes a proposal contains, so that I know whether to read carefully or glance.
54. As a writer facing a very long diff, I want it collapsed behind a "show all" control, so that the dialog stays usable.
55. As a writer who changes my mind mid-review, I want to close the dialog with Esc and lose nothing, so that reviewing is risk-free.
56. As a writer, I want the proposal to be refused if the text it targets has changed under it, so that no change is ever applied to a Document I no longer have.
57. As a writer, I want to see the reason a proposal cannot be applied, so that a disabled Accept button is never a mystery.
58. As a writer, I want focus back at my place in the editor after accepting, so that I can keep working immediately.
59. As a writer, I want no confirmation toast after accepting, because I just reviewed it, so that the app doesn't narrate the obvious.
60. As a screen-reader user, I want the dialog, its summary, its hunks, and its buttons announced in a sensible order, so that review is a first-class accessible surface.

### The Custom Stylesheet and `/ss`

61. As a paying user, I want to type `/ss` in the editor and describe what the page should look like, so that styling is a sentence rather than a research project.
62. As a paying user, I want `/ss` to show the same popup as `/ai`, so that I learn one interaction, not two.
63. As a paying user, I want a Stylesheet tab in the Inspector, so that the stylesheet is somewhere I can find, read, and edit.
64. As a paying user, I want a CSS box that behaves like a text box — selection, undo, paste, resize — so that editing my stylesheet feels like editing, not configuring.
65. As a paying user, I want an AI chat beside the box, so that I can iterate on the stylesheet conversationally instead of writing a perfect prompt once.
66. As a paying user, I want each AI reply in the chat to be a proposal I accept, so that the chat can never quietly rewrite my stylesheet.
67. As a paying user, I want rejected replies to stay in the conversation, so that "not like that, try it this way" still makes sense.
68. As a paying user, I want my own manual edits to the box to be the source of truth, so that the AI never overwrites work I did by hand.
69. As a paying user, I want the chat to be about this Document's stylesheet and to follow me when I switch Documents, so that conversations never bleed between Documents.
70. As a paying user, I want the chat to be ephemeral, so that my conversation isn't stored anywhere — only the stylesheet I accepted is kept.
71. As a paying user, I want to see the reference for the engine's class names and styling variables, so that I can write or repair CSS with confidence.
72. As a paying user, I want the reference to tell me what is stable and what is internal, so that I know which parts of my stylesheet are safe to rely on.
73. As a paying user, I want to be told that page size and margins are Inspector settings and not CSS, so that I don't write rules that are ignored.
74. As a paying user, I want to preview a stylesheet proposal on the real paper before accepting it, so that I judge the look rather than the CSS.
75. As a paying user, I want the Custom stylesheet tile in the preset gallery, so that I find the feature where I already choose how the page looks.
76. As a paying user, I want the tile to be a layer that can be on alongside any Preset, so that my stylesheet and my typography choices are not mutually exclusive.
77. As a paying user, I want to turn the layer off without losing the CSS I wrote, so that switching looks back and forth is cheap.
78. As a paying user, I want an empty stylesheet to turn the layer off automatically, so that the gallery never claims the paper is styled when it isn't.
79. As a paying user, I want the tile to switch me to the Stylesheet tab when there is no stylesheet yet, so that the first step is obvious.

### Plans, the monthly allowance, and the switch

80. As a Free Tier visitor, I want to discover the AI feature and be told it is part of the paid plans, so that I know what an upgrade buys me.
81. As a Free Tier visitor, I want the upsell to open the pricing modal rather than block me with a signup wall, so that the free experience stays honest.
82. As a paying user, I want my own on/off switch for AI in my Account, so that a feature that sends my text away is something I control.
83. As a paying user, I want AI on by default so that it works the first time I try it, and off whenever I say so.
84. As a paying user who has turned AI off, I want the commands to stop existing for me, so that the app doesn't keep offering something I declined.
85. As a paying user, I want to see how many AI Actions I have left this month next to my export Quota, so that I can plan around it.
86. As a paying user who has used them all, I want to be told when they reset, so that I know when to come back.
87. As a paying user, I want a failed or unusable AI Action not to count against my allowance, so that I am only charged for results I actually got.
88. As a paying user, I want a retry to be a fresh AI Action, so that the accounting is honest and predictable.
89. As a paying user, I want my AI Actions not to be mixed up with my Server Export Quota, so that one never silently eats the other.
90. As a paying user whose plan has lapsed, I want the AI commands to lock with the rest of the paid features, so that expiry behaves the same everywhere.
91. As a paying user, I want my AI Actions to be counted per calendar month, so that the reset is a date I can predict.
92. As a paying user, I want AI, the Stylesheet, and my exports to agree about what my plan includes, so that I never see two different answers.

### Running the instance

93. As the Admin, I want to configure an OpenAI-compatible endpoint, model, and reasoning effort, so that I can choose any provider without touching code.
94. As the Admin, I want to switch models and providers without a redeploy, so that a price change or an outage is not an incident.
95. As the Admin, I want the API key to live in the deployment's environment and never in the settings table, so that a settings read or a backup can never leak it.
96. As the Admin, I want a Test connection action, so that I find out a model is wrong before my users do.
97. As the Admin, I want the panel to show my model's window, output cap, and price when the provider publishes them, so that I can size the caps to the model rather than guessing.
98. As the Admin, I want to set the input cap, the output cap, and the model's context window, so that the AI can't be pointed at a budget it cannot fit.
99. As the Admin, I want to see the worst-case token cost of a single AI Action, so that a pricey model is a decision and not a surprise.
100. As the Admin, I want a kill switch that removes the feature from the interface entirely, so that turning AI off never leaves a broken-looking command behind.
101. As the Admin, I want per-plan monthly AI allowances in the same panel as my other limits, so that pricing and cost live in one place.
102. As the Admin, I want each user's AI Action count for the current period in their detail view, so that a support question has an answer.
103. As the Admin, I want every AI configuration change written to the audit log, so that the trail covers the feature that spends money.
104. As the Admin, I want AI to stay absent on a fresh Self-Hosted Instance until I configure it, so that no instance silently acquires a third-party dependency.
105. As the Admin, I want provider errors and upstream bodies visible to me and invisible to users, so that I can debug without leaking which service I use.

### Privacy and trust

106. As a user, I want to be told the first time I use AI where my text goes, so that consent happens at the moment it matters rather than in a policy I never read.
107. As a user, I want that notice to appear once per account, so that it doesn't nag me on every device.
108. As a user, I want to know that my prompt, my Document, and the result are not stored, not logged, and never kept as Export History, so that using AI doesn't change what the service holds about me.
109. As a user, I want the Privacy page to say plainly that AI Actions send my text to a third party, so that the product's promises stay true.
110. As a user, I want to know which part of my Document was sent when only part was sent, so that a summary of my work is not sent behind my back.
111. As a user, I want the AI feature to never identify the provider or the model, including in error messages, so that I never have to think about which AI this is.

### The styling reference and the engine

112. As a paying user, I want the styling reference to document the CSS variables I should use, so that my stylesheet depends on a contract rather than on internals.
113. As a paying user, I want it to document the class names for the content I can style, so that I can target headings, tables, alerts, and code blocks.
114. As a paying user, I want the reference to be maintained with the engine, so that it cannot describe a class the engine stopped emitting.
115. As a paying user, I want the Custom Stylesheet to appear identically in the Paper Canvas, Client Export, and Server Export, so that the promise of a print-exact preview survives my own CSS.
116. As a paying user, I want a `@page` rule I paste to be ignored rather than obeyed in the PDF only, so that my preview and my print never disagree.
117. As a paying user, I want the stylesheet to survive preset switches and Document reloads, so that my styling work is not fragile.
118. As a paying user, I want the stylesheet to stay per Document, so that a résumé's styling doesn't leak onto a report.

## Implementation Decisions

### AI is a paid capability with a monthly allowance

- AI Actions are a paid capability on both plans, on the same footing as the Custom Stylesheet and Server Export: gated server-side, never client-side, because the operator pays for every call.
- Each plan gains a monthly **AI Allowance** (`aiActionsMonthly`), editable by the Admin in the existing limits section beside page cap and Server Export quota. Defaults: Pro 100, Premium 300. Zero is a legal value (AI disabled for that plan), which is why this limit validates as a non-negative integer while the other two limits keep their positive-integer rule.
- One AI Action is **one request that produced a usable proposal**. Counted on that basis only: provider failures, timeouts, truncated answers, unusable responses, and refusals cost nothing, because the user received no result. Retry and resubmit are fresh AI Actions (the generation happened, so the accounting follows it).
- Usage is counted per calendar month in an `YYYY-MM` period, in a dedicated counter table keyed by user and period, mirroring the Server Export usage table. Counters are separate from `Quota` in every surface, in the database, and in the copy.
- **Comps do not apply to AI.** `Comp` stays the Server Export allowance it is defined as; AI allowance is what the plan says and what the Admin edits in the limits section.
- The allowance is enforced before the provider is called, so an exhausted user never costs anything to reject.
- The remaining count is reported by the account endpoint, displayed on the Account page next to the Server Export Quota, stated in the exhausted state's copy together with the reset date, and shown per user in the Admin's user detail view.

### AI Access is on by default, and off when the user says so

- `AI Access` (the glossary's term) is an account-level switch, stored server-side on the user record and reported by the account endpoint. It defaults to **on**: a request only exists because the user submitted one, so the submit is the choice, and a switch to find and flip before the feature works would buy no privacy the submit does not already provide (ADR-0009).
- With AI Access off, the two commands **do not exist** for that user: no hints, no popup, no locked state in the editor. The exception is the Stylesheet tab, where the AI block stays visible in an "AI is off · Turn on" state — a user standing in that tab needs a way back, and the CSS editing around it is a separate paid feature that keeps working.
- The switch lives in a new AI section of the Account page, beside plan and Quota.
- **First-use disclosure**: the first AI Action per account shows a one-line notice stating that the text being submitted goes to an external AI provider, with a link to the Privacy page. It is recorded server-side on the account (not per browser) so it never nags a second time on another device. It is a disclosure, not a gate: the request proceeds.
- The Admin's kill switch is separate: an enabled flag in the AI Provider Config, plus the deployment's key. Either one missing means the commands do not exist for anyone, and no upsell appears — advertising a feature the operator cannot serve is worse than not having it.

### Gate precedence

Every AI surface resolves the gates in one order, and each state has exactly one sentence of copy naming the problem and the recovery:

1. **Not configured or disabled** (no key, or the Admin's flag is off) — the commands do not exist anywhere. No hint, no popup, no tab block.
2. **Not entitled** (no active Entitlement) — the commands exist and the popup opens, stating that AI Actions are part of Pro and Premium, with one line stating that AI Actions send the submitted text to an external AI provider, and a control that opens the pricing modal. Never a signup wall.
3. **AI Access off** — nothing in the editor; the Stylesheet tab's AI block shows the off state with a turn-on action.
4. **Allowance spent** — the popup opens and states the count, the period, and the reset date.
5. **Burst limit hit** — a short "too many at once" state with the wait implied, not counted against the allowance.

- A plan that lapses re-locks AI by the same rule as the other gated features, and the once-shown disclosure does not return.

### AI Provider Config (Admin) and provider invisibility

- One settings key holds the AI Provider Config as a single JSON value, edited in a new AI section of the Admin's settings tab and read through typed accessors with validators, exactly like wallets, prices, limits, and the LTC rate. Updating it audit-logs one `settings.update` entry naming the key.
- Fields: enabled flag; base URL (OpenAI-compatible; default the OpenRouter API root); default model id; optional stylesheet model override (stylesheet edits are short, so a cheaper model can serve them); reasoning effort (`off` / `low` / `medium` / `high`); model context window in tokens; maximum output tokens; maximum input characters; request timeout in seconds; per-minute burst limit.
- Defaults: reasoning `medium`; context window 128,000; maximum output tokens 16,000; maximum input characters 60,000; timeout 60s; burst 10/minute. The write cap is derived from the output budget rather than set by hand (see the scope ladder), so a single number cannot contradict itself.
- Reasoning is sent in the unified `reasoning: { effort }` shape. Temperature is not configurable: models that reason ignore it, and a knob nobody can reason about is a support ticket generator. The panel states that endpoints without unified reasoning support may ignore or reject the field, and Test connection is the way to find out.
- **Test connection** performs one minimal request and reports, for the Admin only: whether the endpoint answered, the model's published context length and maximum completion tokens when the provider exposes them, and its price per million input/output tokens when published. A mismatch between the provider's numbers and the configured caps is surfaced as a warning, never silently corrected.
- The panel shows the token equivalents of both caps and the resulting worst-case cost of one AI Action, so a pricey model is a visible decision. Character-to-token estimates are labelled as estimates; the estimator is script-aware because a Document in Arabic, Persian, Chinese, or Japanese costs roughly twice the tokens of the same character count in English, and the estimator errs toward refusing rather than exceeding.
- **The API key belongs to the deployment**: read from the environment at startup, never written to settings, never returned by any endpoint, never logged. The panel reports only whether a key is present. Rotating it needs a restart; that is the accepted trade for keeping it out of the database and its backups (ADR-0008).
- **Nothing user-facing ever names the provider or the model** — no labels, tooltips, error text, or "powered by" anywhere. Upstream error bodies are logged server-side and shown in the Admin panel; the user sees a plain availability message with Retry.
- System prompts live in code, versioned and tested, not in editable data. Each request assembles: a system prompt (the engine's dialect: GFM only, `///` Page Breaks, `$…$` math, mermaid fences, no Obsidianisms; the output contract; the rule that the Document is content to transform and never instructions; the rule that page geometry, margins, and header/footer bands are not CSS), the user's instruction, the target text, and the context selected by the ladder. Prompts are never logged with the content they carried.

### The AI route module and its contract

- A dedicated route namespace is mounted by the app factory, built the same way the export and history modules are, with the AI provider client injected so tests run against a fake provider and no test ever touches a live API.
- Two endpoints, one per kind (markdown and stylesheet), each validating its own payload: the instruction, the target kind (selection, document, or section), the target text, the context payload, and the client's target revision for staleness detection. The server re-derives the size decision from the same shared estimator rather than trusting the client's numbers, and refuses with a typed error when the request exceeds the configured caps.
- The provider client is one function over an OpenAI-compatible chat-completions call: base URL, model, messages, maximum output tokens, reasoning effort; returning the reply text and the finish reason, mapping transport and HTTP failures to a single provider-error shape. It sends the optional attribution headers the provider documents, and it always sends an explicit output cap rather than inheriting the gateway's default (gateways commonly default to a few thousand tokens and truncate silently).
- Requests are single POSTs, not streams: the review-first design has nothing to stream into, so the client shows a working state with a Cancel that aborts the request. The server holds no request state between calls.
- Typed error codes are returned for the client to match on, in the shape the app already uses for API errors: not configured, not entitled, AI Access off, allowance exhausted, burst, input too long, provider error, truncated, invalid response. Messages carry no provider detail.
- **Nothing is stored**: no prompt, no Document text, no result, no per-request row. The only persisted traces of an AI Action are the usage counter and, for configuration changes, the audit log. AI content never reaches Export History, analytics, or logs.

### The two commands and their trigger rules

- `/ai` (edit the markdown) and `/ss` (edit the Custom Stylesheet) are the only commands. The trigger is typed input only: a paste or a programmatic edit never opens anything.
- Matching: the two characters after a `/` decide; hints exist for `/a` and `/s` only, and a bare `/` shows nothing. Matching is case-insensitive, and only when the `/` starts a line or follows whitespace — so a URL path like `/ai` inside `https://example.com/ai` can never trigger. A `/ai` or `/ss` inside an inline code span or a fenced code block never triggers.
- The hint is a small graphite popover listing the one matching command ("/ai — Edit the markdown", "/ss — Edit the Custom stylesheet"), acceptable with Tab, Enter, or a click. It disappears the moment the text stops matching.
- A popup opens when the command is complete and followed by a space (or when its hint is accepted), and the trigger text plus that space is removed from the Document. `/aix` and `/aisle` never trigger, because the space never arrives.
- Esc restores exactly what was removed, so a cancelled interaction leaves the Document byte-identical. Both keys are handled before the editor's own bindings so Esc can never fall through.
- The popup is anchored below the caret inside the editor pane and clamped to it: a graphite panel with the prompt field, the resolved scope with its size readout, the command's own state (available, locked, off, exhausted, unavailable), and a footnote line naming what happens on Enter. Enter submits, Shift+Enter inserts a newline, Esc cancels, Cancel aborts a running request.
- The editor keeps working while a request runs. The proposal records the target range it was computed against; if the Document changed under it, Accept is disabled with the reason and Retry is offered, so a stale proposal is never applied.

### Scope, the size ladder, and one shared decision module

- The target of an AI Action is resolved locally and deterministically: the selection if there is one, otherwise the whole Document. The popup states which, with its character count against the cap. The structural split reuses the engine's existing section machinery (headings and `///` Page Breaks); nothing is ever spent asking the model how to chunk.
- The size ladder is a pure decision over the Document text, the target, and the configured budgets. It lives in one shared module with no DOM and no I/O so the client and the server make the same decision from the same code:
  - **Tier 0 — fits**: target and context both inside the send cap; everything is sent.
  - **Tier 1 — target fits, Document does not**: the target in full plus a locally built outline digest of the rest (headings, first line of each section, word counts). The popup states that only part of the Document was sent and that a digest of the rest went with it.
  - **Tier 2 — the target is past the write cap**: a whole-document intent on a large Document becomes an **AI Plan**: one action against the outline digest returns the plan; the user approves or edits it; each approved step then runs as its own AI Action against its own section, and each step's result is its own proposal. The plan's action count and the remaining allowance are shown before it starts.
  - **Tier 3 — even the target cannot be worked on**: refused, with the size stated and a path offered (work on a selection, or on a paragraph range around the cursor).
- The write cap is derived from the output budget rather than configured separately: a target may be at most about half the output budget in estimated tokens, so a reply can never be asked for more text than the configured cap allows. The send cap, the output cap, and the model's window are configured; the derived numbers are shown in the Admin panel beside them.
- Successful plan steps stay applied if a run is stopped early or the allowance runs out; the plan itself is ephemeral (session state, never persisted), because the durable artifacts are the Document and its stylesheet.
- A plan is never auto-run. The user sees what would change, how many actions it costs, and accepts or rejects each step.

### What the model returns, and how it is applied

- The output contract depends on the target, and it exists because a whole-Document reply is the one thing that fails at scale: gateway output caps sit at 8k–32k tokens (10–30× below their context windows), a reply that hits the cap stops mid-sentence and is billed in full, and long rewrites are documented to elide content ("…original text here…") or to "clean up" things nobody asked about. Reading a large Document is fine; asking one action to *write* it back is not.
- Selection targets are rewritten outright: the reply is the replacement text for the selection, stripped of any wrapping fence.
- An empty target returns the whole content — the generate-from-nothing case.
- Whole-Document targets return **anchored edit blocks**, not a rewrite. The format is the widely-seen search/replace shape, which models produce reliably:

```
<<<<<<< SEARCH
the exact existing text, quoted verbatim from the Document
=======
the replacement text
>>>>>>> REPLACE
```

- Application rules: blocks are applied in the order given; each `SEARCH` must match exactly once in the text as it stands when that block is applied; a block that matches zero times, more than once, or not at all refuses the **entire** proposal. Nothing is ever partially applied, and a proposal that cannot be applied is not offered for review.
- A whole-Document target whose reply contains no blocks is treated as unusable and refused (it is also not counted against the allowance): a model that ignored the contract has not earned the benefit of the doubt with the user's thesis.
- The reply's finish reason is inspected on every call. A truncated reply is an error, never a proposal; so is an empty or whitespace-only reply. Both surface as a plain message with Retry and a smaller-scope suggestion, with no allowance consumed.
- After parsing, the resulting text is computed locally and handed to the review surface as a change set. The user always reviews the *outcome*, not the format.

### The review surface

_Revised after the first working pass: the modal review dialog was replaced by in-place review — the change is shown where it lands, not in a dialog on top._

- Every AI Action ends in an AI Proposal, never a silent edit. A markdown proposal is drawn **in the editor at its real location**: the original text struck through and faded, the proposed text in an inset suggestion block under it (CodeMirror decorations, never document text). The review bar above the editor carries the change count, the per-change check toggles, and the actions.
- A stylesheet proposal is reviewed **in the stylesheet box**: while a proposal is pending the box swaps to a read-only before/after diff view of the CSS — the box's own place — with Accept and Reject beneath. The conversation card in the AI block says what came back and what became of it.
- The diff language is the app's graphite palette: `+`/`−` gutter marks, soft surface fills, struck originals. No red/green highlighter: chrome carries no accent hue, and `--danger` stays reserved for failures. An unchecked change's suggestion is dimmed, so what Accept will apply is exactly what reads solid.
- Each change is independently checkable and checked by default, so a twenty-change rewrite can be accepted except for the one heading nobody wanted (the pattern Google Docs settled on). Accept applies the checked changes as **one undoable edit**; Reject closes with the Document untouched.
- The bar offers Retry (a fresh AI Action, same prompt) and Edit prompt (returns to the popup with the prompt intact; submitting is a new AI Action). Both are refused when the allowance is spent, with the exhausted copy inline.
- A stylesheet proposal also renders the Paper Canvas with the proposed CSS applied — a provisional render that is never persisted and is reverted on Reject, so the user judges the look rather than the CSS. A markdown proposal shows the diff only; the paper re-paginates on Accept, so a review pass never costs a render of a 500-page Document.
- Keyboard: Esc rejects, Enter accepts, focus returns to the caret in the editor after accepting. Accept is disabled with a stated reason when the proposal's target text has changed underneath it, when the proposal belongs to another Document, or when the provider is unavailable.
- Accepting writes through the existing document-update path, which keeps autosave, cross-tab broadcast, and undo working exactly as for a hand edit. No extra toast: the user just reviewed the change.
- The editor toolbar gains an **Ask AI** button (the AI Access–gated commands): pressed with a selection it opens the prompt popup scoped to the selection; pressed without, it opens it scoped to the whole Document. The typed `/ai` trigger and the button share the popup and the scope readout; the button never opens `/ss`, which is the stylesheet's own surface. There is no trigger to remove and no anchor to restore, so Esc just closes.

### The Custom Stylesheet becomes a real engine field

- The Document's settings gain two fields: the stylesheet text, and whether the layer is on. Both live in the settings snapshot that the whole product already treats as the Document's style state, so they persist, broadcast between tabs, and export without any new plumbing.
- The settings schema version is bumped, the new fields are added to the defaults and to the settings validator, and existing saved Documents get the fields filled from the defaults — the same repair path the server payload already uses for absent fields.
- The stylesheet is appended **inside the engine's CSS builder**, after the generated rules, so the pagination sandbox, the Paper Canvas, Client Export, and Server Export all inherit it from one seam. Anything less — styling the preview but not the export — would break the product's core promise.
- Sanitisation: the existing `</style>` escaping applies, and **`@page` at-rules are stripped**. The printed page size is written by the export before the Document CSS, so a user's `@page { size: A3 }` would win in the PDF while the preview's page boxes ignore it — a silent preview/print divergence, which is the one bug this product cannot ship. The stylesheet box says so plainly ("Page size and margins are set in the Page tab; `@page` rules are ignored"), the reference repeats it, and the AI's prompt is told the same.
- The layer is on only while it has non-empty CSS: emptying the box turns it off automatically, so the gallery can never claim the paper is styled when it is not. Turning the layer off keeps the CSS.
- Gating is unchanged: the Custom Stylesheet stays behind the existing paid feature flag; AI Actions are a separate gate with their own allowance. A user with no AI Actions left still edits CSS by hand.

### Where the stylesheet lives in the interface

- The gallery in the Style tab gains a **Custom stylesheet** tile, and the Style tab's inert "Custom (Pro)" section is deleted. The tile renders the currently selected Preset's page thumbnail with a small monospace `CSS` chip, because the layer sits over whatever Preset is chosen — it is not a Preset itself and never changes a style value (the glossary says so explicitly).
- Tile behaviour: layer off with an empty box → switch the Inspector to the Stylesheet tab (there is nothing to toggle yet); layer off with CSS present → turn the layer on, leaving the Preset's tile lit as well; layer on → turn it off, keeping the CSS; not entitled → a lock glyph whose click opens the pricing modal.
- A fourth Inspector tab, labelled **Stylesheet** (accessible name "Custom stylesheet"), always present, next to Page, Style, and Header/Footer. Not entitled: the body states what the plan includes and opens the pricing modal. Compact mode stacks it like the other tabs.
- The tab is three stacked regions: the CSS box (monospace, its own scroll, roughly the top half), the AI block below it (conversation log with its own scroll, pinned input beneath), and a footer line linking to the styling reference. The AI block has its own states — locked, AI off with a turn-on action, unavailable, ready — because the box works whether or not AI does.
- The AI block is a conversation: each reply is a proposal card with the stylesheet diff and per-change acceptance; accepted changes write the box; rejected ones stay in the log so the next instruction can refer to them ("not like that — try it with a thinner rule"). The box is authoritative: each request sends the box's current text plus the last three exchanges, so hand edits can never be overwritten by stale context. The log is capped in length and is **ephemeral** — session-scoped, per Document, gone on reload — because the durable artifact is the stylesheet, and keeping a chat log would mean a new store, a new sync surface, and a new thing to explain in the privacy story.
- An `/ss` typed in the editor uses the same popup, the same proposal dialog, and appends its turns to the same per-Document conversation; it does not yank the Inspector to another tab, because the user is working in the editor.

### The styling reference

- The reference is a section of the Docs page and is the tab's link target. It documents, as the stable contract: the `.mpdf-doc`-scoped CSS variables (typography, line height, paragraph spacing, body/heading/bold colours, accent, code background and font, blockquote background, table header) and the content selectors a user is likely to need (headings, paragraphs, quotes, lists, tables, cells, pre and inline code, links, images, rules, alerts, diagrams). Everything else is declared internal and free to change.
- Page geometry, page size, paper background, and header/footer bands are documented as Inspector settings, not CSS, with `@page` named as ignored — so nobody writes rules that silently do nothing.
- A test in the engine package builds the CSS with every branch enabled and asserts that each documented variable and selector really appears in the output, so the reference can never describe something the engine stopped emitting. Documenting fewer things than the engine emits is fine; the reverse fails the build.
- The Docs page does not exist yet (the router has no docs route; its spec is written and unblocked). This work includes landing that page, because a link shipped to a page that isn't there is worse than no link.

### Data model and the account endpoint

- The user record gains two booleans: AI Access (default on) and the first-use disclosure flag (default off). Both are server-side so the switch follows the account and the notice appears once, not once per browser.
- Plan limits gain the monthly AI allowance for each paid plan, validated as a non-negative integer; page cap and export quota keep their existing positive-integer rule. Defaults are seeded like the other limits, and Admin edits survive restarts through the same absent-key seeding rule.
- A dedicated AI usage counter table, keyed by user and `YYYY-MM` period, holds the count of AI Actions. It is deliberately separate from the Server Export usage table: separate features, separate allowances, and a shared row would make one feature's bookkeeping depend on the other's.
- The account endpoint reports an `ai` block alongside plan, Quota, and flags: whether AI is configured on this instance, whether the caller's entitlement includes AI, whether AI Access is on, how many AI Actions remain this period, and when the period resets. This is the client's single source of truth for every AI state, mirroring how the feature flags already work. The global "is AI configured" answer also lets the client hide the commands entirely on a self-hosted instance with no key, without a second request.
- The client keeps no AI state of its own: the popup, the tab, and the review dialog read the account store, and AI state refreshes with the same cadence as the existing flags.

### Documentation and promises that must change

- The Privacy page is rewritten to state plainly what leaves the browser, when, and what is never done with it: AI Actions send the submitted text (and, for large Documents, an outline digest of the rest) to an external AI provider; nothing is stored by us; the provider's own retention is the provider's.
- The product principles document's "no third-party requests" claim is narrowed to what remains true — the editor, the preview, exports, and fonts make no third-party requests — with AI Actions named as the deliberate exception, and the project plan's privacy posture corrected rather than left to contradict the ADR.
- The shipping checklist gains the AI prerequisites: a key in the environment, a model chosen with the cost arithmetic in mind, caps sized to the model's window, Test connection run, and the Privacy page updated.
- The billing ticket that owned the Custom Stylesheet's UI keeps only its custom-fonts half, which is untouched by this work. The custom-CSS half is superseded by this spec, and that is recorded on the ticket rather than left ambiguous.

## Testing Decisions

**What makes a good test here** — the repo's existing bar: assert external behavior, never implementation details. A gate test asserts the HTTP outcome and the counter; a review test asserts what the Document looks like after Accept and after Reject, not which component re-rendered; an engine test asserts the CSS that reaches the page, not how it was assembled.

**The seams.** Two new seams, everything else rides seams that already exist (the fewer, the better — and both of these are the highest point each concern can be tested at):

1. **The AI provider client, injected into the app factory** — the same shape as the injected Playwright renderer in the export worker. Every server-side AI test runs against a fake provider, so the whole feature is testable with no network and no live API: gate order, allowance accounting, truncation detection, error mapping, configuration validation, and admin settings round-trips.
2. **One pure AI decision module in the engine package** — the size ladder, the script-aware estimator, the outline digest, and the anchored-edit parser/matcher/applier. No DOM, no I/O, so it is unit-tested exhaustively and shared by the client (which resolves scope and applies a proposal) and the server (which re-derives the decision rather than trusting the client).

**Reused seams, and what is tested at each:**

- **The engine's CSS builder**, extended for the Custom Stylesheet: appended rules, `@page` stripping, `</style>` escaping, and the invariant that the stylesheet reaches the pagination sandbox, the preview, and the export HTML identically. Prior art: the existing CSS-builder unit tests and the golden-page suite, which already compare rendered pages for a Document — a golden covering a Document with a Custom Stylesheet extends that directly.
- **The server app in-process** (`app.request` over a temporary database), for the AI routes and the account endpoint. Prior art: the existing quota, billing, and admin route tests, which already assert typed error codes and audit rows.
- **The admin settings surface** for the AI Provider Config: validation rejection, validation acceptance, the audit entry, and — one test that matters more than the rest — that **no read of the settings ever returns the key**.
- **The web component layer in jsdom**, for the trigger rules, the hint, the popup's states, the review dialog's check/uncheck and Accept/Reject behaviour, the gallery tile's four states, and the Stylesheet tab's regions. Prior art: the existing editor, Inspector, and admin panel component tests, which drive real user events and assert rendered state and accessibility roles.
- **The end-to-end browser suite** with request interception, for the paths where only a real browser proves the feature: typing `/ai`, the popup, a proposal, Accept, and the Document's new text; `/ss` reaching the paper. Prior art: the onboarding and launch-chrome specs, which already drive the production bundle and assert rendered content.
- **The real-Chromium server export test**, asserting that a Document with a Custom Stylesheet produces a PDF whose page geometry is unchanged — the regression test for the one bug this feature could cause.

**Behaviour the tests must pin, because getting these wrong is silent:**

- A refused, failed, or truncated AI Action leaves the allowance where it was; a completed proposal consumes exactly one.
- A proposal whose target text changed under it cannot be accepted.
- An anchored edit that does not match exactly once refuses the whole proposal rather than applying the rest.
- `@page` in a Custom Stylesheet does not change the printed page size.
- The allowance counter is separate from the Server Export Quota in both directions (one never decrements the other).
- With AI Access off, no hint and no popup appear; with the instance unconfigured, nothing appears even for an entitled user.
- No rendered or returned string names the provider or the model — asserted at the boundary, not by grep.

## Out of Scope

- **AI over the Library.** No cross-Document operations, no "summarize my notes", no bulk rewriting. An AI Action acts on the open Document only — anything else is a different feature with a different privacy story (it would have to send more than one Document).
- **Retrieval.** No embeddings, no vector store, no relevance search over the user's content. It solves a different problem, it would mean storing user content server-side, and it contradicts "we store nothing".
- **Asking questions about a Document.** Chat with the Document, summarization of the Document, and "find me the part about X" are not this feature; nothing here reads the Document back to the user, it only proposes changes to it.
- **AI for anything other than markdown and CSS.** No "set the margins to 2cm" through AI: the Inspector owns settings, and a natural-language settings editor is a separate surface with its own risk of silent change.
- **AI on any unpaid footing.** No anonymous AI Actions, no complimentary taste, no Comps for AI, no token-based metering, no per-Action pricing shown to users. Free Tier sees the upsell and nothing else.
- **Bring-your-own-key for users** (ADR-0008), and **Admin-editable prompts**.
- **Streaming into the Document or the box.** The review-first design has nothing to stream into, and partial application is exactly what must not happen.
- **A conversation for markdown.** `/ai` is one-shot; iteration is Retry and Edit prompt. The multi-turn conversation exists only for the stylesheet.
- **Persisting AI conversations.** The log is session-scoped by design.
- **Custom fonts, custom page size, banner and background images.** The custom-fonts half of the billing ticket stays its own work; the rest already shipped.
- **The Docs page's remaining content.** This spec lands the Docs page because the styling reference needs a target; the page's other sections follow its existing spec.
- **Model failover, provider routing, prompt caching, batching, background runs, and usage dashboards** beyond the per-user count.
- **i18n of prompts and copy.** Prompts are English; the interface follows the app's existing copy.

## Further Notes

- **Decisions recorded as ADRs**: `0008-ai-runs-server-side.md` (the provider is reached through the API server, the key is deployment configuration, and no user-facing surface names the provider or the model) and `0009-ai-content-goes-to-a-third-party.md` (AI Actions send content to a third party; paid, metered, disclosed at the point of use, switchable off in the Account page).
- **Glossary terms added to `CONTEXT.md`**: Custom Stylesheet (explicitly *not* a Preset — it is a layer that changes no style value), AI Action, AI Allowance, AI Access, AI Proposal, AI Provider Config, AI Plan, AI Scope. Spec copy must use these terms; "AI quota", "AI credits", "suggestion", and "custom preset" are the vocabulary this work rejects.
- **Suggested ticket order** (tickets themselves follow this spec, one file each): 01 engine Custom Stylesheet and its guardrails; 02 the Docs page with the styling reference and its drift test; 03 the server AI module (provider config, the provider seam, metering, gates, the account endpoint, the AI Allowance in the Admin's limits section, and per-user usage in the user detail view); 04 the AI primitives prefactor (the estimator, scope resolution, anchored edits — the shared pure module); 05 the editor `/ai` surface (trigger rules, hints, popup, review dialog); 06 the Stylesheet tab (gallery tile, box, AI conversation, `/ss`); 07 the long-Document ladder; 08 the verification pass and the release checklist. Dependencies: 02 on 01; 05 on 03 and 04; 06 on 01 and 05; 07 on 05; 08 on 02, 05, 06, and 07 — 01, 03, and 04 can start immediately, and 03/04 run in parallel.
- **Cost, for the model decision** (one AI Action with a whole-Document target at the send cap, ≈7.5k input tokens): a cheap model (~$0.15/$0.60 per million) costs ≈$0.005 per full rewrite and ≈$0.001 per anchored edit; a mid model (~$0.50/$1.50) ≈$0.015 and ≈$0.005; a frontier model (~$3/$15) ≈$0.135 and ≈$0.030. At Pro's default 100 actions a month, a frontier model costs about the plan's entire revenue even with anchored edits — which is why the panel shows the arithmetic and why the defaults assume a cheap or mid model.
- **Evidence behind the shape of this spec** (all verifiable, and worth re-reading before anyone "simplifies" it): Google Docs shows AI suggestions in-document with per-change Accept and Reject all; Notion caps *usage* rather than document size, puts expensive models behind an admin switch with per-person budgets, and bills tokens at provider rates; aider documents that whole-file rewrites are slow and costly and that models elide long content with "…original code here…" comments; Cursor documents that whole-file rewrites suffer unrelated cleanup and only work behind a purpose-trained apply model; Anthropic names context rot — recall degrades as the context grows — and recommends the smallest high-signal context that gets the job done.
- **The blast radius is deliberately small**: one new server module (with one injected seam), one new pure module in the engine, one new Inspector tab, one new popup and dialog, one new Admin section, and two new settings fields on the Document. Nothing in the rendering pipeline changes shape, which is why the pixel-parity promise can survive a user's own CSS.
- **Verification**: per the repo's agent rules, the rendered result of this work — the popup, the dialog, the tab, the gallery tile, and the styled paper — must be checked in a real browser before the work is called done, and the e2e suite only guards the rendered paper and pane layout.
