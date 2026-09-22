# 04: The AI primitives — estimator, scope resolution, anchored edits (prefactor)

**What to build:** No user-visible behaviour on its own. This is the shared, pure groundwork that makes the two writer-facing tickets thin and identical on both sides of the wire: how large a request is estimated to be, which part of a Document a request targets, and how a reply expressed as anchored edits is turned into the text that would replace it. Landing it first means the client and the server never disagree, and every rule below is executable rather than described.

**Spec:** `.scratch/ai-transforms/spec.md` (the scope ladder, the output contract, and the testing decisions).

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] A size estimate over text that is deliberately conservative: roughly four characters per token for Latin text, a tighter ratio when the non-ASCII letter share is high, so a Document in Arabic, Persian, Chinese, or Japanese is refused early rather than sent oversized.
- [x] Scope resolution over a Document and a cursor or selection: the selection when there is one, otherwise the whole Document, reported with the target text, its size, and its source range.
- [x] A parser and applier for anchored edits in the widely-recognized search/replace block form: blocks apply in order, each anchor must match exactly once in the text as it stands when applied, and a single unmatched, ambiguous, or missing anchor refuses the whole change set — never a partial result.
- [x] The extracted section structure the ladder needs: sections derived locally from headings and Page Breaks, with an outline digest (headings, first line, word counts) buildable from them without any model call.
- [x] Every rule above is unit-tested in isolation, including the refusals: ambiguous anchor, missing anchor, reordered blocks, an empty reply, and the boundary cases of the estimator.
- [x] No DOM, no I/O, no imports beyond the engine package — the module is shared verbatim by the client and the server.

**Notes:** This ticket exists so that the two commands' tickets can each be one fresh context window. It delivers no interface; its tests are the executable form of the output-contract rules in the spec.

## Comments

- Implemented (ai-transforms/04) as `packages/core/src/ai.ts`, exported from the package index, with unit tests in `packages/core/src/ai.test.ts`. The module has no imports at all — no DOM, no I/O — and its tests run in the Node environment, so the browser and the API process execute the identical file.
- The estimator (`estimateAiSize`) reports code-point characters and whole estimated tokens, rounding up so it only errs toward refusing. It switches from 4 to 2 characters per token when the non-ASCII letter share reaches 25% (the share is decided over letters only; digits, punctuation, symbols, and emoji do not trigger it). Code-point counting matches the editor's existing `countCharacters` rule.
- `resolveAiScope` returns the exact target text plus its UTF-16 offsets: a non-empty selection wins; an empty selection is a cursor and resolves the whole Document.
- `parseAnchoredEdits` reads the `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` form in the order given, tolerating prose around the blocks and CRLF line endings, and refuses the whole reply on a broken marker structure or an empty anchor. `applyAnchoredEdits` re-reads the text after each block and refuses the whole change set on the first missing (`not_found`), ambiguous (`ambiguous`), or empty (`empty_search`) anchor, naming it by zero-based `blockIndex` — there is no partially applied result to return, and partial acceptance is expressed by passing only the checked subset. Overlapping readings count as ambiguous (`aa` in `aaa` can be read in two places), so the "exactly once" rule errs toward refusing.
- `extractSections` splits at every ATX heading and every Page Break; a Page Break splits even inside a fence, because the renderer's `splitMarkdownSections` is fence-unaware and each renderer section starts fresh. Setext and blockquote headings are deliberately not section starts — the feature's dialect is ATX headings — and headings inside fences are ignored. Each section carries its exact source slice in `from`/`to` and reports level, heading text (markers stripped), word count (heading markers excluded), and the first body line. `buildOutlineDigest` turns that list into one line per section — heading (or `(no heading)`), level, word count, first line clipped at 120 code points — with no model call.
- Verified: `pnpm vitest run packages/core/src/ai.test.ts` (63 tests covering the refusals and the estimator boundaries), the full `pnpm test` (104 files, 1,278 tests), `pnpm typecheck`, and `pnpm lint`. `pnpm format:check` fails on 36 files that are already unformatted on a clean checkout; the new and touched files are prettier-clean.
