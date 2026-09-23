# 08: End-to-end verification and the release checklist

**What to build:** The proof, and the last mile before it is real for anyone else. Nothing here adds a feature: it is the pass that only makes sense once every surface exists — the whole AI path driven in a real browser, the browser suite covering what the unit tests cannot, the export regression that guards the promise, the tracker left unambiguous, and the launch checklist carrying the AI prerequisites so the day it ships is not the day someone discovers the caps do not fit their model.

**Spec:** `.scratch/ai-transforms/spec.md` (the testing decisions, the promises, and the further notes).

**Blocked by:** 02, 05, 06, 07.

**Status:** ready-for-agent

- [ ] Every user-facing surface this work introduced is verified in a real browser — the hint, the popup in each of its states, the review dialog's accept, reject, and partial accept, the Stylesheet tab's three regions, the gallery tile's four states, and a Document rendered with a Custom Stylesheet — with screenshots saved for the Admin's aesthetic review rather than judged from code.
- [ ] The browser suite covers the paths where only a real browser proves the feature: typing `/ai` through to an accepted change, `/ss` through to a new-looking paper, and a gated state rendering its copy — driving a stubbed provider so no live API is ever called.
- [ ] A Document with a Custom Stylesheet exported on the server produces a PDF whose page geometry is unchanged from the same Document without it — the regression test for the one bug this work could cause.
- [ ] The whole workspace is green: unit suites, both browser suites, typecheck, and lint, with no skipped or quarantined tests standing in for a fix.
- [ ] The launch checklist carries the AI prerequisites as items an operator can act on: a key in the environment, a model chosen with the per-Action cost arithmetic in mind, caps sized to that model's window, Test connection run to completion, and the Privacy page confirming what leaves the browser.
- [ ] The tracker holds no duplicate work: the two superseded tickets are marked as such, and the spec's status reflects what actually shipped.


for testing use these:
open router
dots-studio/dots-3-note-preview:free
poolside/laguna-s-2.1:free

The provider's key is `AI_API_KEY` in `.env` (gitignored). It is never written
to a tracked file, a setting, a log, or an endpoint — see `.env.example` and
ADR-0008. Rotating it needs a server restart.
