# Announcement drafts

Three drafts for the launch of `perfectmarkd.00022000.xyz`. Each is written for
its venue, and each stays inside what
[launch-checklist.md](launch-checklist.md) has actually verified.

**Before posting:** replace `<REPO_URL>` with
`https://github.com/ShrekBytes/perfectMarkD`, and work through
[What is still open](launch-checklist.md#what-is-still-open) — the real payments
are the one that matters, and the rest is "before you say it works". Wallets
are set and AI Actions are live and working, and these drafts describe both
accurately.

Tone follows the project's own product copy: plain sentences, no exclamation
marks, no growth-marketing register. `apps/web/DESIGN.md` governs the interface,
not the prose, so it is not a style source for these.

---

## The privacy line, stated once, correctly

The drafts below all draw the same distinction, and it is the one the Privacy
page draws ([ADR-0009](../adr/0009-ai-content-goes-to-a-third-party.md),
[ADR-0013](../adr/0013-email-via-resend.md)):

- **No page loads anything from another company's server.** Fonts are
  self-hosted; analytics is a self-hosted Umami on the same origin. Verified
  with a network log across every public route.
- **Three deliberate exceptions, all disclosed on the Privacy page:** an AI
  Action sends the text you selected to an external provider (paid, and
  switchable off per account); transactional email hands an address and a
  one-time link to Resend; Google Sign-In is a redirect you click.
- **The line that matters: AI Actions are the only flow that ever ships your
  Document content to a third party.** Email carries an address and a link;
  Google carries back an account id.

"Zero third-party requests" is not available as a claim, and no draft below
uses it.

---

## 1. Show HN

**Title**

> Show HN: PerfectMarkD – Markdown to print-perfect PDFs in the browser, no account

**Body**

> I built a web app that turns Markdown into print-ready PDFs, and the part I'm
> most opinionated about is that the preview *is* the contract: one rendering
> engine drives the on-screen paper and the print output, so what you see is
> the PDF you get. No "preview may differ" caveat.
>
> **https://perfectmarkd.00022000.xyz/** — the editor is the homepage. There's
> nothing to install and no account to make.
>
> It started as a plugin problem. I wrote *Advanced PDF Export* for Obsidian
> (<https://github.com/ShrekBytes/advanced-pdf-export>), which made
> print-perfect PDFs inside one note-taking app. The engine was the good part,
> so I ported it out and rebuilt it for the browser, where it works for anyone
> who writes Markdown rather than only for Obsidian users.
>
> What it does:
>
> - Editor and paper preview side by side, reflowing as you type
> - Headings become the PDF outline, so the bookmark tree is real
> - GitHub-style callouts, tables, Shiki-highlighted code, KaTeX math, Mermaid
>   diagrams — all vector in the output
> - Page size, margins, orientation, page numbers, header/footer, crop marks
> - **Client Export** — the browser's own print pipeline. Free, unmetered, no
>   account, and your document never leaves the machine. This is the same
>   Chromium print engine the paid path uses, so the output is identical.
>
> The privacy posture is deliberate rather than incidental. Free users'
> documents live in IndexedDB and are never uploaded. No page loads anything
> from another company's server — fonts are self-hosted, analytics is a
> self-hosted Umami on the same origin — and I audited every public route in a
> real browser to check that claim before launching.
>
> Three things do leave your machine, all deliberate and all on the Privacy
> page. Transactional email hands your address and a one-time link to Resend.
> Google Sign-In is a redirect you click, not something the site loads. And an
> AI Action — paid, and switchable off in your Account — sends the text you
> selected to an external AI provider. That last one is the only flow that ever
> ships your document text to a third party; email carries an address and a
> link, and neither ever carries anything you wrote.
>
> Two things worth being upfront about:
>
> 1. **It's hosted on my own machine at home**, behind a Cloudflare Tunnel, not
>    a VPS. Zero server rent before there's revenue, and uptime is my home
>    uptime. It's a deliberate trade, and it means Cloudflare's edge is in the
>    request path — the Privacy page says so plainly.
> 2. **The paid tier exists and payments are manual crypto** (USDT or Litecoin).
>    There's no payment gateway, so I verify each transaction on-chain myself
>    and grant the entitlement. No card data is held because there's nothing
>    holding it. Server Export, custom page size, a Custom Stylesheet that
>    overrides everything, custom fonts, and AI Actions are the paid features;
>    Server Export PDFs are kept 30 days in Export History so you can
>    re-download them.
>
> The whole thing — editor, rendering engine, and server — is AGPL-3.0. You can
> read it, audit it, or run your own instance and keep your data entirely
> yourself: <REPO_URL>
>
> What I'd like feedback on: whether the "one engine, preview is the contract"
> approach actually feels better than the usual preview-is-approximate honesty,
> and whether anyone has a Markdown-to-PDF setup they'd want to try this on.

---

## 2. Obsidian community (forum or Discord)

**Title**

> PerfectMarkD — the Advanced PDF Export plugin, rebuilt to work outside Obsidian

**Body**

> Some of you will know the *Advanced PDF Export* plugin — it's how I made
> print-perfect PDFs inside Obsidian, with headings that became real PDF
> bookmarks.
>
> I've rebuilt that engine as a standalone web app, and it no longer needs
> Obsidian at all:
>
> **https://perfectmarkd.00022000.xyz/**
>
> The editor is the page. You type Markdown on the left, the paper reflows on
> the right, and the same engine produces the PDF — so the preview isn't an
> approximation of the output, it *is* the output.
>
> Why move it out? Because the layout engine was never Obsidian-specific, and
> being locked to one app to get good PDF output is a strange constraint for
> anyone who keeps their notes elsewhere. The plugin still exists and still
> works; this is the same engine, ported and extended.
>
> What's in it:
>
> - Headings → PDF outline/bookmarks
> - Callouts (NOTE/TIP/IMPORTANT/WARNING/CAUTION), tables, Shiki code
>   highlighting, KaTeX math, Mermaid diagrams — vector, not screenshots
> - Page geometry: size, margins, orientation, page numbers, header/footer,
>   optional crop marks
> - A **Custom Stylesheet** (paid) that overrides the preset and the page
>   chrome, plus custom font uploads and custom page sizes
> - **AI Actions** (paid) — `/ai` to ask about the document and `/ss` to generate
>   a stylesheet, reviewed in-editor before anything is applied
>
> The export path matters if you care about this: **Client Export uses the
> browser's own print pipeline and is completely free and unmetered**, with no
> account. Your document never leaves your machine — free users' documents live
> in the browser and are never uploaded. Server Export (also paid) renders on
> the server for larger jobs and keeps the PDF in Export History for 30 days so
> you can re-download it.
>
> On privacy, the short version: no page here loads anything from another
> company's server — fonts are self-hosted, analytics is a self-hosted Umami on
> the same origin. The exceptions are all on the Privacy page and all
> deliberate: email goes through Resend, Google Sign-In is a redirect you click,
> and an AI Action sends the text you selected to an external provider. Only
> that last one ever carries your actual document text; email carries your
> address and a one-time link.
>
> Honestly: it's hosted on my own home machine, so uptime is my home uptime,
> and payments for the paid tier are manual crypto (USDT/LTC) that I verify
> on-chain myself. No card data is held. If either of those is a dealbreaker,
> the whole thing is AGPL-3.0 and you can run your own.
>
> Repo: <REPO_URL>
>
> Feedback on the layout engine and the stylesheet override would be especially
> useful — that's where this has the most inherited assumptions from the
> plugin.

---

## 3. r/Markdown

**Title**

> PerfectMarkD: a browser app that turns Markdown into print-ready PDFs, and the preview really is the output

**Body**

> I made a web app for Markdown → PDF where the on-screen paper preview and the
> printed PDF come out of the same rendering engine. Not "close enough" — the
> same engine, so the page breaks, the fonts, and the geometry you see are the
> ones you get.
>
> **https://perfectmarkd.00022000.xyz/**
>
> No install, no account. Editor on the left, paper on the right, reflowing as
> you type.
>
> Features that matter if you write Markdown for a living or for pleasure:
>
> - Headings become the PDF outline, so the bookmark tree is genuine
> - Callouts, tables, syntax-highlighted code, math (KaTeX), and Mermaid
>   diagrams, all rendered as vectors
> - Page size, margins, orientation, page numbers, header/footer, crop marks
> - **Client Export is free and unmetered** — it uses your browser's own print
>   pipeline, so your Markdown never leaves your machine
> - Optional paid tier: server-side export for big jobs, custom page size, a
>   full Custom Stylesheet override, and custom fonts
>
> The privacy angle, since this sub will ask: free users' documents are stored
> in your browser and never uploaded. No page here loads anything from another
> company's server — I self-host the fonts and the analytics, and I checked with
> a network log in a real browser that it holds on every public route.
>
> Three things do leave your machine, all deliberate and all on the Privacy
> page: transactional email hands your address and a one-time link to Resend;
> Google Sign-In is a redirect you click, not something the site loads; and an
> AI Action sends the text you selected to an external provider, which is
> opt-out per account. Only that last one ever carries your actual document
> text — email carries an address and a link, and neither carries anything you
> wrote.
>
> Two caveats stated up front: it's hosted on my home machine (so availability is
> my home availability, and Cloudflare's edge sits in the request path, which
> the Privacy page discloses), and the paid tier takes manual crypto payments
> (USDT/LTC) that I verify on-chain by hand. No card data is stored anywhere.
>
> It's AGPL-3.0 throughout, including the server, so you can self-host and keep
> everything local: <REPO_URL>
>
> Happy to answer questions about the pagination engine — that's the part I
> spent the most time on and the part I'd most like to be wrong about in
> public.

---

## Claims these drafts deliberately avoid

- Nothing about verified payments, expiry, or the Server Export path being
  driven on the live instance — see
  [What is still open](launch-checklist.md#what-is-still-open).
- No uptime or reliability promise beyond the honest "it's my home machine".
- No claim that every browser prints identically. The app itself warns Firefox
  and Safari that page sizing prints best in Chrome or Edge, and the drafts
  don't contradict that.
- No AI-provider name, model id, or quality claim, even though the feature is
  live and working. Naming the model would date the post and invite a
  performance comparison that a launch announcement cannot support; the drafts
  say what AI Actions do, not how good they are.
- No user counts, no "most accurate", no comparison to other tools.
- **No "zero third-party requests" claim.** That was in an earlier draft of all
  three and was wrong: it contradicted ADR-0013 (email goes to Resend),
  contradicted the Privacy page the drafts are promoting, and is the exact
  overclaim ADR-0009 already forced the project to restate once. The corrected
  line is above, and no draft uses the old phrasing.

