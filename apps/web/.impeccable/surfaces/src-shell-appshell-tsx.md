---
version: 1
slug: "src-shell-appshell-tsx"
primary_target: "src/shell/AppShell.tsx"
related_targets: []
---

# Surface brief — AppShell (workspace)

## Scope & mode

Operate. The three-pane workspace (editor · Paper Canvas · Inspector) plus top
bar, Library drawer, banners, and dialogs. Desktop-first; tablet usable; phone
degraded-but-functional.

## Audience, job, action, constraints

- **Audience:** markdown writers who need print-perfect PDFs; no account to
  start.
- **Job:** write/paste markdown, tune the page, export — in one sitting.
- **Primary action:** Client Export (print dialog). Server Export is the paid
  path.
- **Constraints:** WYSIWYG is the contract (paper = `#ffffff` in both themes);
  free tier is unmetered; gates open the pricing modal, never a signup wall;
  terminology follows CONTEXT.md.

## Direction — "The Light Table" (locked)

Cool graphite instruments around one lit sheet. Monochrome chrome, graphite
inversion selection, 2px radii, IBM Plex Sans/Mono, corner crop marks on every
preview page. Token-level truth lives in `apps/web/DESIGN.md`; the visual world
replaced the former warm-desk/violet identity wholesale (migration of legacy
`#7c6af7` accent values happens in `validate()`).

## Memorable moment

First paint: a framed white sheet with printer's crop marks lying on a cool
bench between two matte graphite instruments — the paper is the only lit
object.

## Unresolved decisions

None blocking. Watch item: dark-mode `--ink-faint` contrast on disabled
inputs is near the legibility floor by design (matches light theme); revisit
only on real WCAG feedback.
