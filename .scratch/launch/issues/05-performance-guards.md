# 05 — Performance guards for large documents

Status: resolved
Blocked by: editor-app/04, server/03

Client: chunked rendering with yields between sections so 200+ page docs don't freeze the tab (progress indicator), mermaid SVG cache keyed by source, Shiki highlighter reuse (singleton) + lazy theme loading, editor debounced render tuned (400ms idle, cancel on keystroke). Server: render timeout per job (60s) → typed failure; payload streaming parse to avoid double memory; chromium single-instance reuse (browser context pool).

**Accepts**: 300-page golden doc renders client-side without tab freeze (test with CDP throttling); server job times out cleanly with typed error.

## Comments

- **Implemented** (2026-09-25). Where the ticket's list turned out to be already satisfied at HEAD, that is recorded as such rather than re-done.

  **Client.** The freeze was real but not where the ticket assumed: a 339-page
  document measured ~760ms inside a *single* `paginateEl` call (one section, no
  Page Breaks), and ~3-4s under CDP throttling. Yielding *between* sections
  cannot touch that — there is only one section — so the paginator itself became
  resumable: `beginPagination` holds the loop's state and `paginateElChunked`
  drains it with a yield every 50 nodes, reporting pages as it goes.
  `paginateEl` keeps its exact synchronous behaviour and output (the 22 golden
  tests pass unchanged). `runDocumentPipeline` uses the chunked variant, yields
  between sections too, and reports `PipelineProgress`; the Paper Canvas paints
  it as a slim indicator that only appears once a run has been going 250ms.

  **A trap worth recording.** The first cut yielded with `scheduler.yield()`,
  which resumes at *user-blocking* priority. Chained 195 times it kept the
  render permanently ahead of every normal-priority task: timers and animation
  frames starved for 4.8s, so the indicator never appeared and the tab still did
  not paint. `yieldToBrowser` now posts a MessageChannel task — ordinary
  priority, so paint, timers, and the render all keep moving. The measured worst
  gap went 4844ms → 708ms on that change alone.

  Already satisfied at HEAD, verified and now pinned by tests rather than
  re-implemented: the **mermaid cache** (`canvas/mermaid.ts` keys by source) and
  **Shiki reuse + lazy themes** (`render.ts` calls Shiki's own singleton
  `codeToHtml`, so a theme loads on demand and is parsed once). The 400ms
  **debounce with cancel-on-keystroke** also already existed; both are now
  regression-tested, and each test was falsified against a deliberate break
  before being kept.

  **Server.** `EXPORT_RENDER_TIMEOUT_MS` defaults to 60s and the deadline now
  covers the whole job — browser launch, handshake, page render, and
  `Page.pdf()`, which Playwright will otherwise wait on forever (it takes no
  timeout option, so an expired budget cancels the print by closing the page).
  Chromium contexts are pooled and reused across jobs instead of one per job;
  a failed context is discarded rather than handed on.

  **Typed-timeout bug found and fixed.** A page that answered the handshake and
  then went quiet failed as `render_failed`, not `render_timeout` — the
  handshake's own error channel was flattened on the way out, so the job row and
  the client lost the distinction between "too slow" and "broken". Pinned by a
  new e2e fixture that goes ready and then silent.

  **Payload streaming** reads the request stream, decoding chunk by chunk and
  letting the bytes go, and re-checks the 50 MB cap against bytes actually
  received rather than only the declared `Content-Length`. Honest limit: it does
  not parse incrementally, so the string and the parsed object still coexist —
  the saving is the byte buffer, not a second copy of the document. The header
  comment says exactly that.

- **Accepts, measured** (`apps/web/e2e/performance.spec.ts`, 4× CPU throttling,
  339-page imported document): longest main-thread task **626ms**, ceiling
  1500ms. Disabling the chunking takes the same run to **4475ms** and the
  progress indicator never appears — the test fails on both assertions. The
  residual 626ms is the markdown-it parse of a single-section document, which no
  chunking can split; a document with Page Breaks would be smaller. The server
  side was already covered by `render.e2e.test.ts` and still passes, with the
  page-goes-quiet case added.

  The suite runs as its own Playwright project. Sharing the machine with the
  rest of the suite doubled the numbers (601ms alone, 1345ms contended), and a
  measurement that depends on what else is running is not a measurement. That
  split also moves every committed visual baseline — Playwright puts the project
  name in the snapshot path, so the four screenshot tests fail with "A snapshot
  doesn't exist at ...-app-linux.png" and write fresh files beside the committed
  ones (reverting the template takes the suite from 10 failures to 14; verified,
  not assumed). `snapshotPathTemplate` is pinned to the project-less form, which
  keeps the existing baselines in force and the file naming independent of
  whatever the projects are called.

- **Review findings acted on**: the indicator broke DESIGN.md's "a hairline or a
  shadow, never both" (fixed — shadow only, `shadow-lg` for a floating layer);
  the progress-timer teardown was duplicated across two call sites (extracted);
  the `'empty'` body reason was untested and a test name lied about it (both
  fixed); the browser launch sat outside the deadline while the comment claimed
  otherwise (now inside it); and the acceptance test's original metric — the gap
  between two of the page's own timers — was both jittery and loose at a 2000ms
  ceiling, so it now measures the browser's own long-task record with a 1500ms
  ceiling.

- **Not done, deliberately**: `DESIGN.md` has no entry for the new indicator
  chrome. It conforms to the existing Elevation and Motion rules, but if the
  design system should name it, that is the design owner's call, not this
  ticket's. `readJsonBody`'s header also now lists the modules that share the
  file — auth, orders, admin, and AI still use `parseJson` for their small
  bodies, which is correct; only the export route streams.

- **Found while verifying, not fixed (out of scope)**: 10 web e2e tests fail on
  `main` before this change — `ai-command.spec.ts`, `ai-long-document.spec.ts`,
  and `ai-stylesheet.spec.ts` still wait for `ai-review-dialog`, which
  035c7d8 ("review AI proposals in place, not in a modal") removed. The
  selectors are stale, not the product. `shell-compact.spec.ts`'s 44px-floor
  test also flakes under parallel load. Both reproduce on a clean tree.
