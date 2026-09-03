# 05 — Port the paginator engine

Status: ready-for-agent
Blocked by: engine-port/01, engine-port/03

Port `paginator.ts`'s `paginateEl` and its splitters (inline word/char binary search, list with OL `start` continuity, table rows with thead replication, pre/code by line preserving token spans) into `packages/core`. Shim the Obsidian globals: `createDiv`/`createEl`/`createSpan` → `document.createElement` helpers; `activeDocument`/`activeWindow` → injected or ambient `document`/`window` (browser-only package — fine). Keep the shadow-DOM sandbox + adopted-stylesheet measurement approach, the 2px epsilon, and the unsplittable/force-split logic verbatim. Remove the MathJax wait from callers' path.

**Accepts**: runs in a plain browser page; structural unit tests for each splitter; no Obsidian imports.
