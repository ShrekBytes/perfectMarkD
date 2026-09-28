# Launch checklist

The pass that runs before PerfectMarkD is announced. It exists because the two
things that can still go wrong at launch are both invisible from the code: a
payment that never verifies, and a privacy claim that is not true of the
deployed instance.

**This checklist is not all-green.** Items are marked with what actually
happened, and what remains needs real money, a real Mac, or an authenticated
Admin session. See [Status](#status) for what the marks mean and
[What is still open](#what-is-still-open) for the short version.

Deployment and the day-to-day Admin jobs live elsewhere:
[README's Deployment section](../../README.md#deployment) to bring the stack up,
[admin.md](admin.md) to run it, [hosting.md](hosting.md) for what the host does
*not* need, and [restore.md](restore.md) for a bad day.

## The instance this pass ran against

| | |
|---|---|
| Domain | `perfectmarkd.00022000.xyz` |
| Host | the Admin's own machine, rootless podman, behind a Cloudflare Tunnel ([ADR-0010](../adr/0010-deploy-on-own-machine-behind-cloudflare-tunnel.md)) |
| Checkout | `/home/samy/self-hosted/perfectmarkd/` |
| Reported build | `{"ok":true,"version":"0.1.0","commit":"93aa378"}` from `/healthz` — matches the repo's `HEAD` |
| Date of pass | 2026-09-28 |
| Browser | Chrome for Testing via CDP, desktop 1440×900 and iPhone 12 emulation |

Umami answers at `/analytics` on the same domain (a path, not a subdomain), and
`/analytics/api/heartbeat` returned 200.

## Status

| Mark | Meaning |
|---|---|
| ✅ | Checked against the **live instance**, and it held. Evidence below. |
| 📄 | Checked by **reading the source** — a static claim, not a live observation. |
| ⚠️ | Checked, and something needs a decision or a fix. |
| ⬜ | Not checked. Needs real money, a real browser I do not have, or an authenticated Admin session. |

The 📄 mark is not a weaker ✅. This document exists because the two things
that break at launch — a payment that never verifies, and a privacy claim that
is not true of the deployed instance — are both invisible from the code. A 📄
item is an argument from the source; a ✅ is something that was observed.

## Before anything else: the two gates

These two were first because everything below them is unobservable until they
pass. Neither is answerable from the code or from outside an Admin session —
which is exactly why the first draft of this document got both wrong. Both are
now settled by the Admin.

**✅ Wallet addresses are set for all three methods.** Confirmed by the Admin,
2026-09-28. Worth checking rather than assuming, because `getWallets` seeds
empty (`apps/server/src/db/settings.ts:50`) and `POST /api/orders` refuses an
unset method with `503 "This payment method is not set up yet"` — the correct
fail-safe, since nobody is sent to a blank address, but it also means an
unconfigured wallet means nobody can pay at all. Neither is visible without an
Admin session.

**✅ A model is chosen and AI Actions are live.** `stealth/space-bunny-alpha`,
confirmed working by the Admin on 2026-09-28. `aiConfigured()` requires a
non-empty model *and* a key *and* `enabled` (`apps/server/src/ai/state.ts`), and
all three hold here — the model is in the settings table, not the seed default,
which is why reading `DEFAULT_AI_PROVIDER_CONFIG` says nothing about the running
instance. See [AI prerequisites](#ai-prerequisites), where the cost arithmetic was
removed rather than used.

## Payment

**⬜ Real USDT-TRC20 and LTC transactions, end to end.** Untested, and it is the
one thing on this list that cannot be verified without spending money. The full
path: Order → Verification queue → `Verify & grant` → paid gates open → expiry
→ gates re-lock. Specifically:

- the amount on-chain matches the Order **exactly** (the LTC amount is computed
  from a rate captured at Order creation, so it is a moving target)
- a rejected Order lets the user resubmit and comes back to the queue
- an Entitlement extended while active stacks from the current expiry
- expiry re-locks Server Export and stops the quota

The mechanism around it is verified — see [Boundaries](#boundaries) and
`docs/ops/admin.md` — but none of that substitutes for one real transaction.

**✅ Verification is not automatic.** No gateway, no webhook. A submission lands
in the queue as `pending` and stays there (`docs/ops/admin.md`).

## Privacy posture

**✅ Third-party request audit — every public route, same-origin only.** Driven
in a real browser with the network log captured. Zero cross-origin requests on
`/`, `/pricing`, `/docs`, `/privacy`, `/account`, `/export`, and `/signin`.
Fonts are self-hosted (`/assets/ibm-plex-*`, `/assets/KaTeX_*`), and analytics
is the instance's own Umami at `/analytics`. The page's claim that "no page
here loads anything from another company's server" is **true as written**.

**✅ `/signin` loads nothing from Google.** No Google host in the network log,
and no `accounts.google`/`gsi` reference anywhere in the DOM — so the page's
"a page you asked to go to, not this site loading anything from Google" holds.
Google Sign-In is a redirect the user initiates, not a resource load.

**✅ Nothing leaves the machine in a request body.** The export document the
app generated for the sample was captured and inspected: every non-`data:` URL
is same-origin `/assets/...`, there are **zero** `<script>` tags, and no
non-`data:` `img src`. No app JavaScript can reach the print output.

**📄 No document content in logs.** `requestLogger` emits exactly
`METHOD /path STATUS Xms` (`apps/server/src/request-logger.ts:29`) — `c.req.path`
excludes the query string, and bodies are never touched. Five non-test
`console.*` calls exist in the whole server; none logs content. Read from the
source, not from a live log tail — the journald lines this instance is writing
were not read, because doing so means reading a running production log.

**📄 No document content on disk from rendering.** `apps/server/src/export/render.ts`
contains no `console`, no `writeFile`, no `mkdtemp`, no temp path — the
renderer writes nothing. What does persist is bounded and accounted for: Export
History, 30-day retention, encrypted at rest, swept daily
(`apps/server/src/history/purge.ts`). Again a source reading; confirming the
absence on disk would mean inspecting the running container's filesystem.

**✅ The Privacy page names the Cloudflare edge.** The shipped page discloses
the tunnel, says what Cloudflare is (network provider, not analytics, not used
to measure anyone), and says a Server Export payload rides the same path. The
live copy matches the source. Pinned by `apps/web/src/pages/PrivacyPage.test.tsx`
— 9 tests, whose own header says they pin the two claims most likely to be
rewritten away.

**✅ …and the docs now agree with it.** Commit `4b2bd64` shipped that disclosure
while ADR-0010 still recorded the opposite decision (an interim 2026-09-24
edit). Both were corrected on 2026-09-28 under this ticket's "docs accurate"
item: the ADR's trade-off paragraph, and the status comment on the launch-chrome
spec that carried the same superseded decision. This was the one real
documentation defect the pass found in the privacy chain.

**⬜ Read the live copy against the configured providers.** The page names
Resend (ADR-0013) and, conditionally, Google. Both are set in the deployment's
`.env`. An Admin should read the rendered page once and confirm the wording
still describes what is configured — that is a judgement about copy, not a
check a script can make.

## Boundaries

**✅ The 50 MB request cap is enforced live.** A 60 MB body to `POST /api/export`
returned `413` with `{"error":"This document is too large — Server Export
accepts up to 50 MB.","code":"payload_too_large"}`. The cap is
`MAX_EXPORT_BODY_BYTES = 50 * 1024 * 1024` (`export/payload.ts:52`), enforced
both by declared `Content-Length` and by bytes actually received
(`request-body.ts`).

**✅ Unauthenticated export is refused.** `POST /api/export` anonymous → `401
{"error":"Not signed in."}`.

**✅ Page caps are a server-side plan limit, not a client promise.** Pro 300 /
Premium 1000 pages (`settings.ts:28`), enforced against the client's reported
`pageCount` in `parseExportPayload` *before* any Chromium time is spent.

**✅ The large-document preview guard fires.** A 355 KB, 167-page document
seeded through the Library triggered "This document renders 167 pages —
previewing may slow your browser. Render anyway" (`LARGE_DOC_PAGES = 100`,
`PaperCanvas.tsx:47`). "Render anyway" completed all 167 pages in under 5
seconds, with a clean console.

**⬜ Safari and Firefox print geometry.** The app detects both and shows "Tip:
page sizing prints best in Chrome or Edge" — verified live by user-agent
emulation (shown on Firefox 130 and Safari 17, absent on Edge 130). But emulated
user agents are not real browsers, and the underlying `@page` behaviour differs
between engines. **Chrome-family printing is verified; Firefox and Safari are
not.** Someone needs to run one Client Export in each.

## Preview and export

**✅ The preview renders the full engine, live.** The 5-page sample produced
headings, lists, callouts, a styled table, Shiki-highlighted code, KaTeX math
(MathML output), and a Mermaid diagram (SVG) — read out of the page shadow
roots, with correct `Page N of 5` labels throughout.

**✅ Client Export produces a self-contained print document.** Captured the
exact `srcdoc` the app hands to its hidden print iframe: 78 KB, 5
`.mpdf-export-page` elements matching the 5 preview pages, `@page { size: 794px
1123px; margin: 0 }` — A4 at 96 dpi — and the `data-pm-print-ready` sentinel
the flow waits on. Printed through Chromium: 5 PDF pages, matching the preview.

**⚠️ One caveat on that print check, stated so it is not over-read.** The PDF's
`MediaBox` came out `612×792` — US Letter, not A4 — because CDP's
`Page.printToPDF` defaults to Letter and `agent-browser pdf` exposes no
`preferCSSPageSize` flag. This is **my tool's default, not the app's**: the
Server Export path passes `preferCSSPageSize: true`
(`apps/server/src/export/render.ts:155`), and the repo's own e2e test asserts
the resulting geometry is `794 × 0.75 pt` (`render.e2e.test.ts:395`) — A4. So
the A4 contract is covered by that assertion, and this capture is evidence about
page *count* and self-containment only.

**⬜ Server Export on the live instance.** It is a paid, authenticated feature.
The code path is covered by `pnpm --filter @perfectmarkd/server test:e2e`
(including the Custom Stylesheet page-geometry regression), but no export has
been driven against `perfectmarkd.00022000.xyz` end to end.

## Empty and error states

**✅ No crashes, no console errors, across every case tried.** `console
--errors-only` and uncaught-exception checks were empty after the whole
session, including every malformed input below.

| Input | Behaviour |
|---|---|
| Blank document | 1 page, "Page 1 of 1", "Previewing 1 page", no crash |
| Broken Mermaid `((( not a diagram ]]]` | degrades to plain text, no error surface |
| Broken math `\frac{1}{` unclosed | degrades to the literal source |
| Unclosed code fence | renders the code content |
| Missing `asset://` ref | drops the image, keeps surrounding text — matches the documented behaviour |
| RTL Arabic | renders, direction handled |

**✅ Editor is the homepage** ([ADR-0007](../adr/0007-editor-is-the-homepage.md)),
as specified.

**✅ 44px coarse-pointer floor holds on the phone layout.** iPhone 12
emulation: 16 interactive elements in view, **0** under 44px in either axis.

**⬜ Authenticated error states.** Bad verification link, expired Entitlement,
quota exhausted, and the Server Export upgrade prompt all need a signed-in
session. Their copy is unit-tested; none has been seen rendered.

## Repo, licence, and docs

**✅ AGPL-3.0 present and complete.** `LICENSE` is the full 34,523-byte GNU AGPL
v3 text, linked from the README (line 44) and reasoned about in ADR-0001 — which
argues for the licence but does not itself link the file. The Privacy page's
self-host escape hatch claims rest on it.

**✅ `.env.example` documents every key the deployment sets.** All 16 keys in
the live `.env` now appear in `.env.example` (which names 25 in total, most of
them commented-out options). `BACKUP_STAGE` was the one that did not: it is used
by `ops/backup.sh` (its header and throughout the script), `ops/restore.sh`, and
`docs/ops/restore.md`, and the live `.env` sets it, but `.env.example` never
named it — so a self-hoster wanting a non-default staging path had to read the
script to learn the variable's name. One commented line added there during this
pass, next to `BACKUP_ENABLED` and `BACKUP_REMOTE` (`launch/12`'s territory, but
it is a documentation-accuracy defect and finding those is this ticket's job).

**📄 Deployment docs match the deployed compose file.** Images pull from GHCR
with no build toolchain, `SITE_ADDRESS` stays `:80` behind the tunnel, and
`/healthz` reports the build identity the README describes. The compose file and
README were read side by side; the running stack was not re-inspected beyond
what the HTTP probes above establish.

**📄 Admin runbook committed and current.** `docs/ops/admin.md` covers all three
named jobs — verify a payment, reset a password, change a wallet — plus moving a
dead mailbox, the audit log, and what is deliberately absent (uptime monitoring,
analytics-history backup, order deletion). Checked against the shipped panel by
reading both: four tabs, three wallet keys that must all be present to save, and
the mail actions sharing one send budget. Not opened in a browser — that needs
an Admin session.

## AI prerequisites

The ticket body's list, with the state of each as of 2026-09-28. The Admin
confirmed five of the ticket's six are done, so **AI Actions are live on the
instance** — the launch does include them. The sixth, the cost arithmetic, was
resolved the other way round: the readout is gone rather than used. The caps
item below is a warning, not an unfinished box.

- [x] `AI_API_KEY` is set in the deployment's `.env` (environment-only, never
      the settings table, a tracked file, or a log — ADR-0008), and **the API has
      been restarted** so the worker picked it up. Confirmed by the Admin,
      2026-09-28, by AI working. Rotating the key is also a restart.
- [x] **A model is chosen:** `stealth/space-bunny-alpha`, live and working as of
      2026-09-28. Two free OpenRouter ids are also recorded on
      `ai-transforms/08` if a zero-cost option is ever wanted.
- [x] **The cost calculator was removed rather than used.** The Admin's call,
      2026-09-28, and it is now done —
      [`launch/13`](../../.scratch/launch/issues/13-remove-ai-cost-readout.md).
      The readout is gone, the price arithmetic and the token counts both:
      pricing a worst case from two caps and two published rates is too basic to
      plan a real budget around. The Test connection **cap-mismatch warnings
      stay** — they are the part that tells you a configured cap does not fit
      the model, and they are worth a glance before announcing.
- [x] **Test connection has been run to completion** against the chosen model,
      and its published window and output cap read (Admin, 2026-09-28).
- [⚠️ **The caps were not resized.** They remain the seeded values —
      `contextWindow: 128_000`, `maxOutputTokens: 16_000`,
      `maxInputCharacters: 60_000` (`settings.ts:43-45`) — while Test connection
      reported what this model actually publishes. A mismatch is surfaced as a
      warning in the panel, not corrected silently, so check that the panel is
      not showing one: if the model publishes a smaller output cap than 16,000,
      a long stylesheet generation could be truncated. Worth one glance.
- [x] **The Privacy page copy is confirmed** against the configured provider
      (Admin, 2026-09-28). The "AI Actions" section describes the provider as
      external, says nothing is stored, and defers retention to the provider's
      policy.
- [x] **The kill switch is deliberately on** (Admin, 2026-09-28), not a default
      that happened to fall this way. `enabled: true` with a model set, so the
      commands exist and the upsell appears.

## What is still open

Short version, for the announcement decision:

1. **The three remaining follow-up to-dos**, written up in
   [`.scratch/launch/follow-up-todos.md`](../../.scratch/launch/follow-up-todos.md)
   and since cut into tickets: make the pricing surface read live admin
   settings, fetch the LTC rate every 12 hours instead of by hand, and give a
   pending Order a 6-hour payment window. The fourth to-do, removing the AI
   cost calculator, is done —
   [launch/13](../../.scratch/launch/issues/13-remove-ai-cost-readout.md).
2. **One real USDT-TRC20 payment and one real LTC payment**, through to
   verification and expiry. The only remaining launch blocker that needs
   something this pass could not do.
3. **One Client Export in Firefox and one in Safari.** Chrome-family is done.
4. **Safari is the one browser not represented at all** here — no macOS host was
   available, and its `@page` behaviour is the known-risky one (PLAN.md).
5. **A Server Export against the live instance**, authenticated.
6. **Authenticated error states** rendered, not just unit-tested.

Wallets, the AI model, and Test connection are settled — see
[the two gates](#before-anything-else-the-two-gates) and
[AI prerequisites](#ai-prerequisites). Item 2 should be done before
announcing; 1 and 3–6 are "before you say it works".

## Follow-up work

Three to-dos came out of this pass. They are written up in
[`.scratch/launch/follow-up-todos.md`](../../.scratch/launch/follow-up-todos.md),
where they have since been cut into tickets:

- **Make the pricing surface read live admin settings.** This one is not
  cosmetic. `apps/web/src/pricing/plans.ts` hardcodes the prices while Orders are
  priced from the settings table, and the hardcoded module is imported by both
  the purchase flow and the Verification queue — so a price changed in the Admin
  panel can leave a customer shown one amount and asked to send another.
- **Fetch the LTC rate every 12 hours, and take it off the Admin's hands.** The
  Admin's call: the rate should be machine-written from the CoinGecko free API,
  with no manual override, because hand-setting it daily is impractical and an
  Admin who can set it can set it to suit themselves. Worth noting this one
  interacts with money — the rate is frozen onto the Order at creation and
  verification compares the on-chain amount against that figure exactly, so a
  stale rate is a real risk rather than a cosmetic one.
- **Give a pending Order a 6-hour payment window.** Paired with the above, and
  new behaviour: there is currently **no payment window at all** — the `orders`
  table has no expiry column, so a pending Order lives forever. The window
  bounds how long a quote can sit before a rate refresh invalidates it. It does
  not make the rate fresh: at any moment the live rate is 0–12 hours old, so an
  Order paid at T+6h may still quote a rate up to 18 hours old.

## Announcement drafts

Drafts live in [announcements.md](announcements.md) — Show HN, the Obsidian
community, and r/Markdown. They are written to be honest about what is free,
what is paid, that the instance is one person's home machine, and that
Cloudflare's edge is in the request path.

Their AI paragraphs are accurate as they stand — AI Actions are live, and the
drafts describe them as a paid feature, which is what they are. No model name,
provider, or quality claim appears in any of them, which is deliberate.
