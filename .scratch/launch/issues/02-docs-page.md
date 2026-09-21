# 02 — Docs page + GitHub/footer presence

Status: wontfix
Blocked by: editor-app/01

Minimal `/docs` (static, in-app, same design language): getting started, "Save as PDF" walkthrough with screenshots, page-break syntax, math/mermaid/table examples, font catalog list, self-hosting quickstart (Compose + config), FAQ (privacy: where do my documents live? — answer: your browser). Footer: GitHub repo link, AGPL-3.0 badge, link to the Obsidian plugin ("the original"), pricing.

**Accepts**: docs accurate against shipped behavior; no third-party fonts/scripts on the page.

## Comments

- Superseded by `.scratch/ai-transforms/issues/02-docs-and-styling-reference.md`, which lands the `/docs` page as designed by `.scratch/docs-page/spec.md` and adds the styling reference the Stylesheet tab links to. The footer and GitHub/AGPL presence described here shipped with launch-chrome; the page content list above is an input to that ticket, so implementing this one as written now would duplicate it.
