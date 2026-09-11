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

## Product UI

**Paper Canvas**:
The central preview area showing paginated pages exactly as they will print.
_Avoid_: viewer, preview pane

**Inspector**:
The right-hand settings panel with its three tabs: Page, Style, Header/Footer.
_Avoid_: settings, sidebar

**Library**:
The panel listing the user's local Documents (rename, duplicate, delete, import, export).
_Avoid_: file manager, recents
