# 06: `/ss` and the Stylesheet tab's AI conversation

**What to build:** A paying user with AI Actions left opens the Stylesheet tab and asks, in the AI block beside the box, for a look — "thinner rules, a warmer accent, tighter spacing". The reply arrives as a proposal card: the stylesheet diff plus the Paper Canvas redrawn with the proposed CSS so they judge the look, not the CSS. Accept writes the box; Reject leaves it exactly as it was, and the turn stays in the log so the next instruction can refer to it. Editing the box by hand is always safe: the box is what gets sent, never a stale transcript. Typing `/ss` in the editor does the same thing without yanking the Inspector to another tab. The AI block states its own condition — locked, off, unavailable, or ready — because the box works whether or not AI does.

**Spec:** `.scratch/ai-transforms/spec.md` (the interface and conversation decisions for the Stylesheet).

**Blocked by:** 01 (the Stylesheet tab and its box), 05 (the shared popup, review dialog, route shape, gates, allowance, and disclosure).

**Status:** ready-for-agent

- [ ] The AI block sits below the box and above the reference link, with its own states: not entitled (locked, opening the pricing modal), AI off (an off state with a turn-on action, since a user standing in this tab needs a way back), provider unavailable (a plain message with Retry), and ready.
- [ ] Each reply is a proposal card with the stylesheet diff and per-change acceptance; accepting writes the box, rejecting leaves it untouched, and rejected turns remain visible in the log.
- [ ] A stylesheet proposal renders the Paper Canvas with the proposed CSS applied as a provisional render that is never persisted and is reverted on Reject; the box is written only on Accept.
- [ ] Each request sends the box's current text plus the last three exchanges, so hand edits can never be overwritten by stale context; the log is capped in length, scoped to the active Document, and gone after a reload.
- [ ] `/ss` typed in the editor opens the same popup and the same proposal dialog and appends its turns to the same per-Document conversation, without changing the Inspector's selected tab or pane.
- [ ] Gate, allowance, and disclosure behaviour matches the markdown command exactly, including the first-use disclosure being recorded once per account, and the Custom Stylesheet gating remaining independent — a user with no AI Actions left still edits CSS by hand.
- [ ] Tests: the block's states and the accept/reject/partial-accept behaviour as component tests; the stylesheet kind of the route against a fake provider; the conversation's per-Document scoping and its length cap; and an end-to-end browser pass where `/ss` changes what the Paper Canvas renders.
