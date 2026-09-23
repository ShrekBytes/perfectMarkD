# Docs page

Status: resolved

## Problem Statement

The product's features — Page Break markers, Presets, the Outline, Client
Export vs Server Export, the plans — are discoverable only by poking the
editor. The onboarding sample demos the engine but doesn't explain anything: a
visitor deciding whether the tool fits, and a user who wants to know how page
breaks or exports work, have no reference to consult.

## Solution

A single long Docs page at `/docs` explaining every feature and how to use the
editor, with an in-page section nav, rendered from one markdown source file
through the core engine's markdown renderer with plain web CSS (no
pagination). A **Docs** item in the AccountMenu and a Docs link in the shared
footer make it reachable from everywhere.

## User Stories

1. As a visitor, I want a Docs page listing every feature, so that I can decide whether the tool fits my workflow before trying it.
2. As a new user, I want a getting-started section, so that I can go from a blank page to an exported PDF quickly.
3. As a user, I want an explanation of the Page Break marker (`///`) and how it differs from a horizontal rule, so that I can control pagination deliberately.
4. As a user, I want an explanation of Presets, so that I can switch my Document's look with confidence.
5. As a user, I want an explanation of the Outline (PDF bookmarks in the reader's side panel) versus a visible TOC, so that I know what my readers actually get.
6. As a user, I want the difference between Client Export (free, in my browser) and Server Export (paid, on the server) explained, so that I know which export to use and why.
7. As a Free Tier user, I want the Docs to state exactly what is free and account-less, so that I know what I get without signing up.
8. As a paid user, I want the Docs to explain the plans, Quota, Comps, and Plan Expiry (nothing auto-renews), so that I know exactly what I'm paying for.
9. As a user, I want an in-page section nav, so that I can jump straight to the section I need on a long page.
10. As a user on a phone, I want the Docs readable in a single column, so that I can consult them from the compact shell mode.
11. As a keyboard or screen-reader user, I want proper heading structure and working anchor links, so that I can navigate a long reference page.
12. As the Admin, I want the Docs source to be a single markdown file I can edit, so that updating the reference doesn't mean touching components.
13. As a signed-in user, I want a **Docs** item in the Account menu, so that I can check a feature's details without leaving the app.
14. As a visitor on any static page, I want a Docs link in the footer, so that I can find the feature explanations from anywhere on the site.

## Implementation Decisions

- Docs page at the `/docs` route: one long scrolling page. The content lives in a single markdown source file, rendered at build time through the core package's public markdown renderer with plain web CSS — the paginator is not involved, so nothing paginates.
- The in-page section nav is generated from the markdown headings (anchor links), so nav and content can never drift apart.
- A **Docs** item is added to the AccountMenu in both its signed-in and signed-out states — that menu is the app's catch-all menu.
- A Docs link is added to the shared Footer component from the `launch-chrome` spec.
- Page chrome matches the auth pages' minimal header pattern (wordmark linking to the editor, theme toggle).
- Gated features are described in the Docs with their gating stated in prose; there are no interactive locks inside the Docs.
- No server changes — the content is static.

## Testing Decisions

- Unit tests for the new docs rendering module: heading-to-anchor-id mapping, section nav order, and that the content renders — colocated with the module, following the repo's colocated-test prior art. Only external behavior (rendered structure, generated nav) is asserted, not implementation details.
- Web e2e smoke test against the existing Playwright seam (serverless — the content bundles at build time): `/docs` renders its sections and the section nav scrolls to a section.
- Prior art: the existing e2e onboarding spec.
- Good test: asserts the rendered structure and navigation, never internal wiring.

## Out of Scope

- Multi-page docs, docs search, versioning, or an embedded read-only editor.
- Interactive tutorials or a FAQ page (the pricing page answers plan questions; the Docs cover features).
- Any server changes.

## Further Notes

- Blocked by: `launch-chrome` (the shared Footer component it adds the Docs link to).
- The **Docs** term is defined in the project glossary (`CONTEXT.md`), distinct from the onboarding sample Document, which demos the engine inside the editor rather than explaining features.
- Of the three launch specs (`account-page`, `launch-chrome`, `docs-page`), this one is the only one with a dependency: implement `launch-chrome` first.

## Comments

- **Shipped via `ai-transforms/02`** (commit `49ee531`), not via `launch/02`. That ticket was superseded and marked `wontfix`, with the `/docs` page and the styling reference delivered under the `ai-transforms` workstream instead. `Status` flipped `ready-for-agent` → `resolved` on 2026-09-23, since leaving it `ready-for-agent` advertised work that no longer exists. The `launch-chrome` blocker above is satisfied — that spec shipped in `3ba10b1`.
