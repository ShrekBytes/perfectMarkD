# 05 — Port the paginator engine

Status: resolved
Blocked by: engine-port/01, engine-port/03

New `packages/core/src/paginator.ts` — verbatim port of `paginateEl` and its splitters from the plugin's `paginator.ts`: inline text (word-boundary binary search with character-level fallback), lists (fit-count split with OL `start` continuity across fragments), tables (body-row split with thead + caption + colgroup replication into both fragments), and pre/code by line (Range-based split preserving nested highlighting spans, trailing-newline handling). Shared measurement helpers, the shadow-DOM sandbox with adopted-stylesheet scoped CSS, the 2px `HEIGHT_EPS`, and the unsplittable/force-split/flush-and-retry main loop are unchanged. `packages/core/src/dom.ts` shims the Obsidian globals (`createDiv`, `createEl`, `setCssStyles`); `activeDocument`/`activeWindow` resolve to ambient `document`/`window` — browser-only package, same assumption render.ts already makes. The MathJax stylesheet wait is gone from the callers' path: the markdown pipeline (ticket 04) is fully settled before pagination runs (KaTeX typesets synchronously; Shiki awaits inside `renderMarkdown`).

**Accepts**: runs in a plain browser page; structural unit tests for each splitter; no Obsidian imports.

## Comments

Implemented 2026-09-06 (this commit).

- `packages/core/src/paginator.ts`: `paginateEl(sourceEl, contentWidthPx, contentHeightPx, docCSS) → HTMLElement[][]` plus exported splitters `splitInlineElement`, `splitListElement`, `splitTableElement`, `splitPreElement` (exported because structural tests target them directly at the seam; they're pure DOM functions taking an injected `fits` predicate). Dispatcher (`splitElement`, `isInlineSplitCandidate`) and all constants/tag sets stay private, ported verbatim.
- Shims: `createDiv`/`createEl`/`setCssStyles` live in `packages/core/src/dom.ts`; Obsidian's `activeDocument`/`activeWindow` → ambient `document`/`window`; Obsidian's `el.empty()` → `replaceChildren()`. No fallback for constructable stylesheets — verified jsdom 30 (the test env) supports `new CSSStyleSheet()` + `adoptedStyleSheets`, and every real target is Chromium.
- MathJax wait removal: the plugin awaited `waitForMathJaxStylesheetStable()` immediately before paginating and pre-warmed MathJax at startup. Our pipeline has no MathJax (KaTeX static CSS per ticket 03) and `renderMarkdown` resolves only after math/highlighting/post-processing complete, so `paginateEl`'s contract is "call with renderer-settled HTML" — no wait exists to port.
- Tests: 36 in `paginator.test.ts` (jsdom). Splitters tested structurally with deterministic `fits` predicates (text-length for inline/pre lines, item/row counts for lists/tables) — no layout dependence. `paginateEl`'s bucket loop tested with mocked measurement heights (`getBoundingClientRect` patched to sum declared `data-h` attributes on the measure div's contents): bucket distribution, unsplittable-element flush-and-retry, forced list split with `start` continuity, per-page thead replication, empty source → `[[]]`, source non-mutation, sandbox cleanup. Real-height golden tests over sample documents are engine-port/08's Playwright suite (spec: jsdom lies about heights).
- One behavioural note surfaced by the tests: a code fragment split after line *n* keeps line *n*'s newline in the first fragment (split points are line-end offsets), and a block-final newline doesn't open a rendered line — matches the plugin's behaviour with renderer-realistic (trailing-newline) input.
- Verified: monorepo typecheck + lint green; full suite 241/241 (16 files); core build green; prettier applied to the new files (six pre-existing apps/web files also fail `format:check` on main — left untouched, out of scope).
