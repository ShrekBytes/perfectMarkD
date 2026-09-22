# PerfectMarkD

A web app that turns markdown into perfectly laid-out PDFs, independent of any note-taking platform. Born from the Advanced PDF Export Obsidian plugin.

## Documents & pages

**Document**:
A markdown source plus its style settings that the user edits and renders into a PDF.
_Avoid_: note, file, project

**Page Break**:
A `///` marker on its own line that forces the next content onto a new page.
_Avoid_: break, separator (a `---` horizontal rule is not a Page Break)

**Preset**:
A named bundle of Document style values (typography, colors, layout) the user can switch between.
_Avoid_: theme, template, style

**Custom Stylesheet**:
The user's own CSS for a Document, layered on top of the CSS the engine generates from that Document's style values. A paid capability. It is a layer, not a Preset: it changes no style value, so it can be on alongside any Preset (the preset gallery shows it as a tile, and the Preset's tile stays selected).
_Avoid_: custom preset, theme, template, skin

**Outline**:
A bookmark tree embedded in the exported PDF, built from the Document's headings; shown in PDF readers' side panel.
_Avoid_: TOC (a TOC is visible content inside the Document; the Outline is PDF metadata)

## Exports

**Client Export**:
Generating the PDF inside the user's own browser via the browser's print pipeline. Always free, unmetered, no account required.
_Avoid_: local export, free export, browser export

**Server Export**:
Generating the PDF on the project's server with headless Chromium. Requires a paid plan and consumes monthly quota.
_Avoid_: cloud export, HD export, premium export

**Free Tier**:
Use of the editor and Client Export with no account. Never includes Server Export.
_Avoid_: guest, anonymous user

**Export History**:
The Premium feature that keeps a user's Server Export PDFs for 30 days for re-download. The only place user content rests server-side.
_Avoid_: archive, recycle bin

## Billing

**Pro / Premium**:
The two paid plans. Both include all gated features; they differ in Server Export quota, page caps, queue priority, and Export History.
_Avoid_: paid user, subscriber

**Quota**:
The monthly number of Server Exports a paid plan allows.
_Avoid_: credits, tokens

**Comp**:
Extra Server Export allowance the Admin grants a user for one period, on top of the plan's Quota. A negative comp retracts it; comps never drop below zero.
_Avoid_: bonus, credit, freebie

**Plan Expiry**:
The date until which a paid plan's entitlement lasts. Nothing auto-renews.
_Avoid_: subscription, renewal

**Entitlement**:
A user's granted plan and expiry date, created by a verified Order.
_Avoid_: license, key

**Manual Payment**:
A payment where the user sends crypto themselves and submits the transaction details in the app. No payment gateway involved.
_Avoid_: checkout, invoice

**Order**:
A user's submitted request to verify a Manual Payment: Reference Code, plan, duration, coin/network, transaction ID, and amount. Pending until the Admin verifies or rejects it.
_Avoid_: payment, invoice, transaction (the transaction is the on-chain event; the Order is the request)

**Reference Code**:
An Order's short unique identifier, shown to the user so Verification can match an on-chain transaction to the Order.
_Avoid_: memo, note

**Verification**:
The Admin's manual on-chain confirmation of a submitted Order before granting or extending an Entitlement.
_Avoid_: approval, validation

**Admin**:
The single operator (the owner) who verifies Orders and manages Entitlements through an admin panel.
_Avoid_: staff, moderator

**Self-Hosted Instance**:
A deployment of the AGPL-3.0 codebase run by someone other than the Admin. It is its own operator's service, with its own wallets and Verification.
_Avoid_: fork, mirror

## AI

**AI Action**:
One thing a user asks the AI to do: rewrite markdown from the editor (`/ai`), or edit the Custom Stylesheet (`/ss`, from the editor or from the Stylesheet tab's chat). Each AI Action counts against the plan's AI Allowance.
_Avoid_: transform, generation, prompt, job

**AI Allowance**:
The monthly number of AI Actions a paid plan allows. Distinct from Quota, which counts Server Exports.
_Avoid_: AI quota, AI credits, AI tokens

**AI Access**:
The user's own on/off switch for AI Actions. On by default; while the user has it off, the AI commands do not exist for them.
_Avoid_: AI opt-in, AI consent, AI permission

**AI Proposal**:
What an AI Action produced, shown for review before anything is applied. Neither the Document nor the Custom Stylesheet changes until the user accepts the proposal.
_Avoid_: suggestion, draft, diff, preview

**AI Scope**:
Which part of a Document an AI Action may change: the selection, one section, or the whole Document. Distinct from what the AI may read as context.
_Avoid_: target, range, window

**AI Plan**:
For a Document too large for one AI Action, the approved list of steps the work is broken into; each step is its own AI Action with its own AI Proposal.
_Avoid_: batch, job, queue, run

**AI Provider Config**:
The Admin's configuration of the AI service: which compatible endpoint, which model, and how much reasoning. The API key belongs to the deployment, not to a setting.
_Avoid_: AI settings, model config

## Product UI

**Paper Canvas**:
The central preview area showing paginated pages exactly as they will print.
_Avoid_: viewer, preview pane

**Inspector**:
The right-hand settings panel with its four tabs: Page, Style, Stylesheet, Header/Footer.
_Avoid_: settings, sidebar

**Library**:
The panel listing the user's local Documents (rename, duplicate, delete, import, export).
_Avoid_: file manager, recents

**Account**:
The signed-in user's space for plan and Quota status, Orders, Export History, and password management. Distinct from the account-less Free Tier and from the local Library.
_Avoid_: profile, dashboard, workspace

**Docs**:
The single page explaining every feature and how to use the editor. Distinct from the onboarding sample Document, which demos the engine inside the editor itself.
_Avoid_: tutorial, guide, help

**Styling reference**:
The Docs page's section documenting the stable contract a Custom Stylesheet may rely on: the `.mpdf-doc`-scoped CSS variables and content selectors the engine emits. Maintained with the engine — a drift test fails the build if it names something the engine stopped emitting. The Stylesheet tab's footer line links to it.
_Avoid_: CSS docs, class list, API reference
