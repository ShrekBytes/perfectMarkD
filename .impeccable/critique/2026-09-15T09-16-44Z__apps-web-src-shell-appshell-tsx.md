---
target: home page (index) responsiveness and mobile view
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/home/samy/Documents/GitHub/perfectMarkD/apps/web/src/shell/AppShell.tsx"
target_fingerprint: "sha256:47097f92a51543f827d3857af79c031e22d1b586f7733f73bc35364b95753025"
target_path: /home/samy/Documents/GitHub/perfectMarkD/apps/web/src/shell/AppShell.tsx
timestamp: 2026-09-15T09-16-44Z
slug: apps-web-src-shell-appshell-tsx
closed: true
---
# Critique — Home page / editor shell (`apps/web/src/shell/AppShell.tsx`)

Method: dual-agent (A: ses_f5bad1e8dffekE4EMJw2faGj81 · B: ses_f5bb24e92ffe33WYBAaMJl29KX)
Focus: responsiveness and mobile view.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Saved / "A4 · 5 pages" / page labels / zoom readout all exist — but on a phone the canvas carrying "Page N of M", the render shimmer, and the zoom readout is a ~15–71px sliver (zoom pill `visibleWidth: 15` at 375, **0** at 320). Status exists, in an invisible place. |
| 2 | Match System / Real World | 4 | Paper, crop marks, "Page 1 of 5", mm units map cleanly; nothing mobile-specific breaks the metaphor. |
| 3 | User Control and Freedom | 2 | The two controls that free the canvas are `opacity: 0` until hover (`PaneDivider.tsx:110`) — invisible on touch; Undo/Redo are clipped inside a 280px editor (toolbar `scrollWidth 298 > clientWidth 280`); the pricing modal opens with its close button above the viewport. |
| 4 | Consistency and Standards | 2 | One banner pattern, one token set, one height ladder — but inconsistent with the platform: 41 controls under 44px at 375, hover-only affordances with no touch twin, and the app's only breakpoint lives on a different page (`AdminPage.tsx:54`). |
| 5 | Error Prevention | 3 | Strong error copy and guards (rejected drop, large-doc pause, render-failed Retry) — but the tall-dialog trap and the focus-scroll shift are unguarded. |
| 6 | Recognition Rather Than Recall | 2 | Desktop labels/tooltips are good; on touch the collapse chevrons and all Library row actions are recall-only (hover-gated), and the doc-name field renders **18px wide** — the document's name is unrecognisable. |
| 7 | Flexibility and Efficiency | 2 | Rich on desktop (Ctrl+Enter, Ctrl+B, arrow-key splitter resize, double-click reset). On touch: 16px `touch-none` dividers, no swipe, no pane switcher, no layout mode. |
| 8 | Aesthetic and Minimalist Design | 3 | 1280/1440 is genuinely spare; at 375 the screen is a 280px editor plus clipped chrome slivers — minimalist by intent, accidental by presentation. |
| 9 | Error Recovery | 3 | Retry affordances and named recovery paths exist; the canvas error notice and its Retry sit inside the off-screen canvas at phone widths. |
| 10 | Help and Documentation | 2 | Help lives in `title=` tooltips (never shown on touch) and in the welcome strip (73–113px tall on a phone, eating the top). |
| **Total** | | **26/40** | **Acceptable (65%) — significant improvements needed** |

n/a heuristics: none — all ten apply to this surface.

## Design Specificity Verdict

**LLM assessment (A).** Not authored for this product — the shell has **no responsive layer at all**. The adaptation you see is accidental flexbox shrinking plus hard-coded minimums. Every responsive prefix in `apps/web/src` lives in `AdminPage.tsx` (`sm:p-6`); the only `@media` rule in the whole web app is `prefers-reduced-motion` (`styles/global.css:217`); there is no `pointer: coarse`, no `hover: none`, no container query, no `dvh`. The failure is arithmetic, not styling: `PANE_LIMITS` (`pane-layout.ts:4`) sums to **860px** (editor 280 + canvas 320 + inspector 260), `AppShell.tsx:107` puts `overflow-hidden` on the shell root, and `AppShell.tsx:132` gives the content row no overflow — so below 860px the third pane isn't clipped-but-scrollable, it is **clipped and unreachable**. The one mobile primitive that exists — `fullscreen = editor.collapsed && inspector.collapsed` (`pane-layout.ts:118`) — is never driven by any breakpoint; collapse is manual via two hover-only controls. What *is* authored is desktop/component-level and good: fit-to-width on first paint and every resize, the never-torn-preview contract, pane-width clamping, the zoom pill's recede-at-rest, crop marks scaling with zoom. Verdict: **the "Light Table" world is authored; its responsiveness is generic/unhandled.** "Phone is degraded-but-functional" is an assumption, not a tested behaviour.

**Deterministic scan (B).** `impeccable detect --json apps/web/src/shell` and `... apps/web/src` both exit **0 with zero static findings** — but this is a **coverage gap, not a pass**: the static rule set has no rule for width-dependent clipping. The runtime overlay caught the bug the static scan missed — exactly **1 anti-pattern**: `clipped-overflow-container` on `div.flex.h-full.flex-col.overflow-hidden.bg-canvas.text-ink` (`AppShell.tsx:107`), i.e. the shell root clipping the over-wide pane row. `agent-browser errors` was empty (no uncaught JS). No false positives claimed.

**Visual overlays.** Injection was preflighted and confirmed (mutation of `document.title` + an appended `<script>` read back successfully), so the overlay genuinely ran in the page: `detect.js` served from the Impeccable live-server (port 8400) and its one finding read from the `impeccable` console group. It ran in the agent's **headless Chromium** — there is no [Human] overlay in your visible browser (the recorded fallback signal). Evidence screenshots: `/tmp/opencode/R2B-{375x667,414x896,768x1024,1024x768,1440x900}.png` and `/tmp/opencode/R2A-{320x568,375x667,390x844,667x375,768x1024,1280x800,1440x900}.png`.

## Overall Impression

On a desktop the shell is disciplined and quiet, and the canvas genuinely keeps its "what you see is what you get" contract. On a phone it is not degraded-but-functional — it is **sheared**. A fixed 860px pane row is amputated by an `overflow-hidden` root, and because `documentElement.scrollWidth === innerWidth` at every width there is **no scroll path to the missing half**. The document's *content* is present; its *settings* (the Inspector) and its primary action (Export) are unreachable dead ends. The fix is not pixel polish: the shell needs a breakpoint ladder, and the one single-pane primitive it already owns needs to be wired to it.

## What's Working

1. **The canvas's fit-to-width contract is genuinely responsive.** First paint and every resize refit the page between 24px gutters (`PaperCanvas.tsx:59,385`), so wherever the canvas can be seen the paper is never torn — 278px page in a 320px canvas at 375, 429px in a 474px canvas at 1280. Crop marks scale with zoom.
2. **The pane model already contains the right mobile primitive.** `fullscreen = editor.collapsed && inspector.collapsed` plus `CollapsedPaneToggle` is a working single-pane fallback with a visible restore chevron (`left-2`) — it just needs a breakpoint to drive it.
3. **The Library drawer is the one mobile surface that feels authored.** At 336px it fits a 375px screen, with clear "New document" / "Import .md" and comfortable rows. `BannerStrip` copy wraps rather than truncating, so strips grow instead of hiding consequences.

## Priority Issues

**[P0] The three-pane minimums exceed every phone and tablet-portrait width; the overflow is clipped, not scrollable.**
- **What:** `PANE_LIMITS` sum to 860px; the shell root is `overflow-hidden`. Measured inspector right edge is **860** at 320/375/390/667/768/820/834 (clipped by 540/485/470/193/92/40/26px) and uncut only at ≥860. At 375 the Inspector is entirely off-screen.
- **Why it matters:** This is a dead end, not degradation. The phone has the document's content but not its settings — "tune the page" (page size, margins, frame, background image) is impossible. Tablet portrait (768–834px, the common iPad orientation) is broken too, contradicting "tablet is usable".
- **Fix:** Add a shell breakpoint ladder: ≥1024 keep three panes; 700–1023 auto-collapse the Inspector (remembering a user override); <700 present a single-pane switcher (Editor · Paper · Page). Auto-collapse must set `pane.togglePane`, not just CSS. Make the content row reachable rather than hidden.
- **Command:** `$impeccable adapt`

**[P0] The top-bar right cluster is off-screen at every phone width; the primary action is unreachable.**
- **What:** Header content is **581px in a 375px viewport** (206px clipped). Library x293–376 (half visible); theme x382–408, Export x414–521, Sign in x527–581 all **0 visible**. The cluster first fits at ≥581px.
- **Why it matters:** Client Export is the product's primary action per the surface brief and the only filled primary in the bar. On a phone the app looks like it has no Export, no theme, and no account — the strongest "this is broken" signal in the experience.
- **Fix:** Below ~860px fold the secondary cluster into an overflow (`⋯`) menu, keep Export as an icon+label control that never leaves the bar, and put horizontal overflow on the shell rather than `overflow-hidden` on the root.
- **Command:** `$impeccable adapt`

**[P1] Tall dialogs clip with no scroll; the pricing modal traps the user.**
- **What:** `Dialog.tsx:54` is `fixed inset-0 flex items-center justify-center p-6` with no max-height and no scroll container. At 375×667 the PricingModal panel measures **327×756, y=-44, bottom=712** — the "Plans and pricing" heading and the autoFocus close button are above the viewport, the bottom copy below it. Escape and backdrop-tap are the only exits, and a phone has neither affordance signposted.
- **Why it matters:** A paid surface opens with no visible way to close it, on the exact device class where gates are most likely to appear. `max-h-[85vh]` already exists on `HistoryDialog`/`UpgradeStatusDialog` but not on the shared `Dialog`.
- **Fix:** In `Dialog.tsx`: `items-start` + `p-4 sm:p-6`, panel `max-h-[calc(100dvh-2rem)] overflow-y-auto` using `dvh` (not `vh`, for mobile browser chrome), optionally sticky heading.
- **Command:** `$impeccable adapt`

**[P1] Hover-only affordances have no touch twin.**
- **What:** `PaneDivider.tsx:110` — both collapse chevrons are `opacity-0 … group-hover:opacity-100`; `LibraryPanel.tsx:207` — rename/duplicate/export/delete are `opacity-0 group-hover:opacity-100`. At 375 the Library row shows **no action icons at all**, and the only collapse control computes `opacity: 0` on a 24×24 hotspot.
- **Why it matters:** On touch the canvas can only be reached by tapping an invisible hotspot on a 16px divider, and documents cannot be renamed, duplicated, exported, or deleted from the Library. `group-focus-within` helps keyboard users only.
- **Fix:** In a `@media (hover: none)` / `pointer-coarse:` layer, render collapse chevrons and row actions persistently; give Library rows a kebab menu on coarse pointers.
- **Command:** `$impeccable harden`

**[P2] Systematic sub-44px tap targets; the editor toolbar clips its own Undo/Redo.**
- **What:** **41 interactive elements under 44×44 at 375** (toolbar/zoom 28×28, collapse 24×24, dividers 16px wide, banner buttons 28px tall, top-bar buttons 32px, Inspector tabs 28px; zoom readout 44×16; doc-name input **18×30**). At the 280px editor minimum the toolbar's content is **298px**, so Undo/Redo are clipped at 320/375/390/667/768.
- **Why it matters:** The 28px ladder is the design system's instrument choice — correct for a pointer, wrong for a thumb. The toolbar clip is self-inflicted: the editor cannot display its own default toolset.
- **Fix:** Under coarse pointers apply a 44px minimum hit area to icon buttons/chevrons; let the editor toolbar wrap to two rows or overflow below ~360px; give `DocName` a `min-w-[6rem]` floor.
- **Command:** `$impeccable polish`

## Persona Red Flags

**Casey (distracted mobile user):** the one thing Casey came for — **Export** — is off-screen at every phone width (x414–521, 0 visible at 375/390). The canvas is a **71px page sliver** at 375 and the zoom pill is **15px visible** (0 at 320), with no discoverable way to enlarge either. Library **rename/duplicate/export/delete icons are invisible** on touch. The pricing modal opens with **no visible close button**. Every target is 24–32px, so intent-vs-touch drift is constant.

**Sam (accessibility/keyboard):** focusing an off-screen Inspector tab scrolls the `overflow-hidden` shell (`#root > div` reports `scrollWidth 860 / clientWidth 320`; `.focus()` on `inspector-tab-Style` drives `scrollLeft` to **525**). The whole workspace jumps sideways, hiding the top bar and editor, with **no scrollbar to return** — the `/tmp/opencode/R2A-320x568.png` frame caught exactly this. The pricing modal's autoFocus close button is at **y=-44** (focus lands off-screen). ARIA splitters are correct (`role="separator"`, arrow keys, Enter reset) but only 16px wide with an invisible chevron.

**Jordan (first-timer):** the top bar ends at a half-clipped "Library" (x293–376); Jordan reads "no Export, no theme, no account" and concludes the app is incomplete. The document name renders as an **18px sliver**. The welcome strip promises a preview but the preview is off to the right and the only pointer to it is invisible — Jordan never learns the three-pane model or the collapse gesture. The strip eats 73–113px of a 568–667px screen.

## Minor Observations

- `AdminPage.tsx:54` is the **only** responsive class in the app; responsiveness is not part of the system's vocabulary.
- `PaneDivider.tsx:95` uses `touch-none` — right for drag, but the 16px strip swallows touch scroll; combined with the invisible chevron it is a dead zone.
- No `dvh`/`svh` anywhere; the shell uses `h-full`, so mobile browser chrome will eat the bottom on real phones (zoom pill and toasts sit at `bottom-3`/`bottom-16`).
- `rejectedDrop`/`DeleteToast` (`AppShell.tsx:233`, `DeleteToast.tsx:32`) have no `max-w`/`min-w-0` on long doc names — a fixed toast can exceed a 320px viewport.
- `.pm-pages` (`PaperCanvas.tsx:461`) can scroll horizontally inside `overflow-auto`, but the canvas is itself clipped by the shell, so that inner scroll is unreachable on mobile.

## Questions to Consider

1. "Phone is degraded-but-functional" — which single mobile job is the phone meant to do? If it is "paste markdown, get a PDF", why is Export off-screen at 320/375/390?
2. The shell's minimums are 860px, but iPad portrait is 768–834px. Is "desktop-first, tablet usable" a decision, or an untested sentence no test enforces?
3. DESIGN.md makes the 2px radius, the height ladder, and the crop marks non-negotiable ground truth. Should **responsiveness be a token — a breakpoint ladder with the same authority** — rather than an incidental property of flexbox?
4. The invisible collapse chevron is the only route to the paper on a phone. Would an explicit **Editor · Paper · Page** switcher be a more honest mobile model than a three-pane row sheared by arithmetic?
