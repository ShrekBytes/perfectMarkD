# 02: The Docs page and the styling reference

**What to build:** A user can visit the Docs page, and the Stylesheet tab's footer line links to the styling reference it contains: the CSS variables and class names a Custom Stylesheet may rely on, what is explicitly internal, and the statement that page size, margins, and header/footer bands are Inspector settings rather than CSS. The reference cannot describe something the engine no longer emits.

**Spec:** `.scratch/ai-transforms/spec.md` (the styling-reference decisions and the drift test).

**Blocked by:** 01 (the reference documents what 01 introduces, and the drift test asserts those names exist in the engine's output).

**Status:** ready-for-agent

- [ ] The Docs page exists at its route with an in-page section nav generated from its headings, rendered from the single markdown source through the engine's markdown renderer, reachable from the existing Docs entry points.
- [ ] The reference section documents the `.mpdf-doc`-scoped CSS variables and the content selectors a user is likely to need, marks everything else as internal, and states that page geometry, paper size, paper background, and header/footer bands belong to the Inspector, with `@page` named as ignored.
- [ ] A test in the engine package builds the CSS with every settings branch enabled and fails if any documented variable or selector is absent from the output; documenting fewer names than the engine emits passes, inventing one fails.
- [ ] The Stylesheet tab links to the reference from its footer line, and the link works from the editor without losing the open Document.
- [ ] A visitor can read the section on a narrow screen in one column, and heading anchors work for keyboard and screen-reader users.

**Notes:** The page is designed by the docs spec at `.scratch/docs-page/spec.md` (one long page, section nav from headings, rendered from a single markdown source), and the content list to cover comes from the launch workstream's docs-page ticket — getting started, the page-break syntax, math and diagram examples, the font catalog, self-hosting, and the privacy FAQ. That ticket also described the footer and GitHub presence, which already shipped; its remaining page work is delivered here, so it should be marked superseded rather than implemented twice.
