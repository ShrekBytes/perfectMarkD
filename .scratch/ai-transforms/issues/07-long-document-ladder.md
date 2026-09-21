# 07: Long Documents — the ladder

**What to build:** A user with a Document far too large for one request gets a working path instead of a wall. Over the send cap, the action still runs on the part they chose, with the popup saying that only the target in full and an outline of the rest was sent. Over the write cap, a whole-Document intent becomes an **AI Plan**: one cheap action against the outline proposes what would change, section by section; the user sees how many AI Actions it will cost and how many they have left; each approved step then arrives as its own proposal, one section at a time, staying consistent because the plan travels with every step. Stopping early keeps what was already accepted. A Document with one enormous unstructured section is offered a paragraph range around the cursor instead. Something that genuinely cannot be worked on is refused with its size and the alternative stated — never truncated in silence.

**Spec:** `.scratch/ai-transforms/spec.md` (the scope ladder, the AI Plan, and the refusal paths).

**Blocked by:** 05 (the request path, the popup, the review dialog, and the primitives it wires up).

**Status:** ready-for-agent

- [ ] The size decision is one ladder over the Document, the target, and the configured budgets: everything fits; target fits with a digest of the rest; target past the write cap; nothing fits. The client and the server reach the same decision from the same shared code, and the server never trusts the client's numbers.
- [ ] When only part of the Document is sent, the popup says so in plain words — the target in full plus an outline of the remaining sections — and the digest is built locally from the section structure with no model call.
- [ ] A whole-Document intent past the write cap offers an AI Plan instead of running: the plan is produced from the outline alone, is shown for approval, and states the number of AI Actions it needs against the allowance remaining.
- [ ] Running a plan produces one proposal per step, each accepted or rejected on its own, carrying the plan as a shared brief so the tone and terminology stay consistent across sections; stopping a run or running out of allowance keeps the steps already accepted and says what remains.
- [ ] A target that cannot be worked on even scoped — one oversized section with no structure — offers a paragraph range around the cursor, and a request that still cannot fit is refused with its size, the configured cap, and the path forward.
- [ ] Nothing in this path truncates silently, applies partially, or spends an AI Action on a step that produced no proposal; a plan is never started without the user approving it.
- [ ] Tests: unit tests for each tier boundary and the digest's shape; a component test for the plan's approval surface and its action count; route tests for a plan request and a step request against a fake provider; and a manual real-browser check of a large Document's path through the popup.
