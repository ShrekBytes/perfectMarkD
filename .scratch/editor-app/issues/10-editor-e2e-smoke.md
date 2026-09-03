# 10 — Editor E2E smoke tests

Status: ready-for-agent
Blocked by: editor-app/04, editor-app/05, editor-app/06, editor-app/07

Playwright E2E: fresh profile → sample doc renders (page count >1); edit text → page count changes after debounce; change preset + page size → canvas updates; import/export .md round-trip; library create/rename/delete; Client Export → assert hidden iframe HTML structure (print dialog itself can't be automated); dark toggle persists; locks visible on gated controls. Visual regression screenshots of Paper Canvas (light+dark) at 2 viewport sizes.

**Accepts**: suite green in CI; catches a broken render pipeline or a pane-layout regression.
