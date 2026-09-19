# Launch chrome: shared footer, About, Privacy, 404

Status: ready-for-human

## Problem Statement

The site's non-editor surfaces lack the chrome of a finished product. There is
no About page, so a visitor cannot learn what PerfectMarkD is or who runs it.
There is no Privacy page, so a prospective user cannot see what happens to
their data before signing up — even though the service holds account emails,
Server Export PDFs for 30 days, and payment references. Unknown paths silently
fall through into a fresh editor, which reads as broken rather than
intentional. And a footer exists only on `/pricing`, so the static surfaces
have nowhere that ties them together.

## Solution

A shared minimal footer used on the five non-editor surfaces (pricing, About,
Privacy, Docs, 404); a small single-column About page (what the tool is, the
Obsidian-plugin successor story, why AGPL, contact, CTAs); one short combined
Privacy page (what's stored, what's never done, no card data, self-host escape
hatch); and a minimal 404 page with a link back to the editor.

## User Stories

1. As a visitor, I want an About page, so that I can learn what PerfectMarkD is and who is behind it before I commit.
2. As a visitor, I want the story of the Advanced PDF Export Obsidian plugin it succeeds, so that I understand where the tool comes from and why it exists.
3. As a visitor, I want to see why the project is AGPL/open source with a GitHub link, so that I can audit or self-host it.
4. As a visitor, I want contact info (GitHub / email) on the About page, so that I can reach the Admin without a dedicated contact page.
5. As a visitor, I want calls-to-action to the editor and to pricing from the About page, so that I can act immediately after reading.
6. As a prospective user, I want a Privacy page, so that I know what happens to my data before I create an account.
7. As a user, I want the Privacy page to state what is stored (account email, Server Export PDFs kept 30 days, payment reference), so that I know exactly what the service holds.
8. As a user, I want the Privacy page to state what is never done (no third-party analytics, no tracking, PDF content never used for anything), so that I can trust the service with my documents.
9. As a user paying by crypto, I want the Privacy page to state that no card data is held, so that I know Manual Payment keeps payment credentials out of the service entirely.
10. As a privacy-conscious user, I want the self-host escape hatch stated on the Privacy page (AGPL — run your own instance, your data never leaves), so that I know I am not locked in.
11. As a user, I want the Privacy page to state there is no warranty, so that the "no separate Terms page" decision still leaves the essential caveat visible.
12. As a visitor who mistypes a URL, I want a minimal 404 page with a link back to the editor, so that the site feels intentional rather than broken.
13. As a visitor, I want a consistent minimal footer across pricing, About, Privacy, Docs, and 404, so that I can navigate the site's static surfaces from any of them.
14. As a visitor on the pricing page, I want the existing footer content preserved (AGPL badge, GitHub link, plugin-successor link), so that nothing I relied on disappears when it becomes the shared footer.
15. As a visitor to the editor, I want the editor chrome to stay clean with no footer, so that the drop-in experience stays uncluttered.

## Implementation Decisions

- A shared Footer component: AGPL-3.0 badge, GitHub link, plugin-successor link, and links to the site's static surfaces. It replaces the inline footer on `/pricing` (content preserved) and is used on the About, Privacy, and 404 pages. The Docs link is added to it by the `docs-page` spec, not this one.
- About page at `/about`: single-column and small. Sections: what PerfectMarkD is, the successor story, why AGPL/open source, contact, and CTAs to the editor and pricing. No team page, no blog, no roadmap.
- Privacy page at `/privacy`: one short combined page. What is stored (account email, Server Export PDFs kept 30 days, payment reference/transaction ID), what is never done (no third-party analytics or tracking, PDF content never used), crypto payments mean no card data is held, the self-host escape hatch, and a one-line no-warranty caveat. No separate Terms page.
- 404 page: minimal, with a working link back to the editor. The router's unknown-path behavior becomes the 404 instead of falling through to the editor.
- All three new pages use the same minimal header pattern as the auth pages (wordmark linking to the editor, theme toggle).
- The editor and the auth pages get no footer; auth pages keep their existing minimal header.
- No server changes — all pages are static content.

## Testing Decisions

- Web e2e smoke tests against the existing Playwright seam (the suite builds the production bundle and drives real Chromium; it runs without the API server, which these static pages don't need): `/about` and `/privacy` render their key content; an unknown route renders the 404 with a working link back to the editor; the footer renders with its links on pricing, About, Privacy, and 404.
- Prior art: the existing e2e onboarding spec, the only precedent for driving the production bundle.
- No component tests (static content) and no server tests (no server changes).
- Good test: asserts rendered content and navigation behavior — never implementation details.

## Out of Scope

- Landing page — deliberately absent (ADR-0007: the editor is the homepage).
- FAQ, dedicated contact page, separate Terms page, changelog page (GitHub Releases covers it for an AGPL project).
- The Docs page — its own spec (`docs-page`), which depends on this spec's Footer.
- SEO work.
- Any server changes.

## Further Notes

- ADR-0007 records the no-landing-page decision and when to revisit it.
- This spec has no dependencies; `docs-page` depends on its Footer. Together with `account-page` (independent), the three specs cover the launch work.

## Comments

- Implemented in commit 3ba10b1 (feat(web): shared footer, About and Privacy pages, 404 for unknown paths). All 15 stories covered; e2e smoke tests in `apps/web/e2e/launch-chrome.spec.ts` (7 passing); typecheck, lint, full unit suite (1035 tests), and full e2e suite (42 tests) green. Verified in a real browser (About, Privacy, 404, pricing screenshots). Contact email `shrebytes@duck.com` confirmed by the Admin during implementation. Two-axis code review run; its actionable findings (Headline tier in DESIGN.md, footer touch targets, CTA button spec alignment, shared PageHeader/site-links modules, the premature "only analytics are self-hosted" claim) were addressed; remaining notes: trailing-slash deep links (`/about/`) land on the 404 (consistent with the case-sensitivity treatment), and the shared header is not yet used by the auth/pricing pages (out of scope here).
