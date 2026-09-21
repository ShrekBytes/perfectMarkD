# 04: The AI primitives — estimator, scope resolution, anchored edits (prefactor)

**What to build:** No user-visible behaviour on its own. This is the shared, pure groundwork that makes the two writer-facing tickets thin and identical on both sides of the wire: how large a request is estimated to be, which part of a Document a request targets, and how a reply expressed as anchored edits is turned into the text that would replace it. Landing it first means the client and the server never disagree, and every rule below is executable rather than described.

**Spec:** `.scratch/ai-transforms/spec.md` (the scope ladder, the output contract, and the testing decisions).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A size estimate over text that is deliberately conservative: roughly four characters per token for Latin text, a tighter ratio when the non-ASCII letter share is high, so a Document in Arabic, Persian, Chinese, or Japanese is refused early rather than sent oversized.
- [ ] Scope resolution over a Document and a cursor or selection: the selection when there is one, otherwise the whole Document, reported with the target text, its size, and its source range.
- [ ] A parser and applier for anchored edits in the widely-recognized search/replace block form: blocks apply in order, each anchor must match exactly once in the text as it stands when applied, and a single unmatched, ambiguous, or missing anchor refuses the whole change set — never a partial result.
- [ ] The extracted section structure the ladder needs: sections derived locally from headings and Page Breaks, with an outline digest (headings, first line, word counts) buildable from them without any model call.
- [ ] Every rule above is unit-tested in isolation, including the refusals: ambiguous anchor, missing anchor, reordered blocks, an empty reply, and the boundary cases of the estimator.
- [ ] No DOM, no I/O, no imports beyond the engine package — the module is shared verbatim by the client and the server.

**Notes:** This ticket exists so that the two commands' tickets can each be one fresh context window. It delivers no interface; its tests are the executable form of the output-contract rules in the spec.
