---
target: home page (index) responsiveness and mobile view
total_score: 36
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/samy/Documents/GitHub/perfectMarkD/apps/web/src/shell/AppShell.tsx"
target_fingerprint: "sha256:028a793afdddfa39ffa240dc8d840e69a0a83deaedc9d6b74de080520a30d28f"
target_path: /home/samy/Documents/GitHub/perfectMarkD/apps/web/src/shell/AppShell.tsx
timestamp: 2026-09-15T13-11-11Z
slug: src-shell-appshell-tsx
---
# Critique — Home page / editor shell (`apps/web/src/shell/AppShell.tsx`)

Method: dual-agent (A: ses_f5adde9a2ffeP0Wj4vTHt95IwD · B: ses_f5adde9a0ffe8kpAAWPJ3N18KB)
Focus: responsiveness and mobile view. Re-run after the adapt (compact ladder, ShellMenu, Dialog dvh/max-height) and harden (persistent touch affordances) passes and the touch-target polish landed.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Autosave readout, `aria-busy` canvas, shimmer, live page-count status; "Saving…/Saved" relocates correctly to the compact bar |
| 2 | Match System / Real World | 4 | Print-desk vocabulary (crop marks, proof gauge, "Paper") is audience-true |
| 3 | User Control and Freedom | 4 | Escape reverts rename, delete-undo toast, backdrop/Escape on every dialog, panes stay mounted on compact switch |
| 4 | Consistency and Standards | 4 | One Dialog, one BannerStrip, shared AccountMenuItems between dropdown and overflow; token discipline |
| 5 | Error Prevention | 4 | Large-doc guard with "Render anyway", rejected-drop toast names the file, empty rename drafts ignored |
| 6 | Recognition Rather Than Recall | 3 | The ⋯ menu clips off-screen left at 320px (x=−48) — the only route to theme/account below 860px |
| 7 | Flexibility and Efficiency | 3 | Divider keyboard resize is a silent no-op at 860–900px (aria-valuemin=valuenow=valuemax=280) |
| 8 | Aesthetic and Minimalist Design | 4 | Zoom pill recedes at rest with AA-preserving fade; monochrome never wavers |
| 9 | Error Recovery | 4 | Render-failure notice persists with Retry; notices are specific, never generic |
| 10 | Help and Documentation | 3 | Title tooltips + print hint dialog, but no guidance for the mobile print-dialog dance |
| **Total** | | **36/40** | **Excellent (90%)** |

n/a heuristics: none — all ten apply to this surface.

## Design Specificity Verdict

**LLM assessment (A).** Unmistakably authored for a print-production tool: the Light Table world is carried consistently (pure-CSS crop marks, graphite-inversion selection, proofing gauge, IBM Plex Sans/Mono, 2px radii), and the compact ladder is derived from the product's own arithmetic (860 = 280+320+260 in `pane-layout.ts`) rather than device folklore. The few category-default moves (⋯ overflow, segmented switcher) are justified in-code by touch reality. This reads as a designed object, not a scaffold.

**Deterministic scan (B).** `impeccable detect --json src/shell` and `... src` both exit 0 — zero static findings. Runtime overlay (injected `detect.js` at 320/375) found 2 anti-patterns, both documented: `clipped-overflow-container` on `.pm-shell` is a probable false positive (fixed-position overlays are not transform-contained; measured 0px overflow and on-screen dialog geometry at every size), and `cramped-padding` on 14px text at mobile widths — real but unattributable (console referenced a JSHandle@node, not an element).

**Visual overlays.** Injection preflighted and confirmed (title mutation + script tag read-back); detect.js served from the Impeccable live-server (port 8400, stopped after) in the agent's headless Chromium — no [Human] overlay in a visible browser (recorded fallback signal).

## Overall Impression

The sheared-shell problem is gone. Below 860px the app is now a single-pane workspace behind an always-visible switcher with Export anchored in the bar — measured 0px horizontal overflow at 320/375/390, every top-bar control on-screen, the pricing modal full-viewport with its close button at (318, 33), and a 44px touch floor verified across every first-paint control at hover:none. What remains are edge seams at the smallest width (the ⋯ menu's own left edge) and consistency gaps inside overlays (the 44px rule stops at the Dialog boundary). The biggest opportunity is finishing the touch system at the borders it hasn't reached yet.

## What's Working

1. **The touch-target system is architectural, not sprinkled** (global.css:289–302): `hover:none` flips visible controls to a 44px floor so the hit area is the control; verified zero sub-44px controls at first paint on touch, and the divider itself becomes a 44px hit zone with net-zero width via negative margins.
2. **Export never hides.** At 320px the wordmark yields and the primary action (81×44) stays in the bar while secondary controls fold into ⋯ — correct priority inversion, documented in TopBar.tsx:66–89.
3. **One authored breakpoint that proves itself**: the mode flips exactly at 860 where flexbox would start lying; the compact bar still fits at 320 with the whole cluster visible.

## Priority Issues

**[P1] ⋯ overflow menu clips off-screen at phone widths.**
- **What:** At 320px the 224px `right-0` menu sits at x=−48 — "Library" and "Switch to dark theme" start off-viewport; this is the only route to theme/account below 860px (ShellMenu.tsx:82).
- **Why it matters:** The compact bar's whole point is that nothing hides — and the menu itself is half-hidden at the smallest supported width.
- **Fix:** Anchor to the viewport on compact (`fixed right-2 top-[52px]`) or clamp with `max-w-[calc(100vw-1rem)]` plus left-edge fallback; add a test asserting `menu.getBoundingClientRect().left >= 0` at 320.
- **Command:** `$impeccable harden`

**[P2] Touch-floor violations inside overlays.** Menu items 36px tall (ShellMenu.tsx:16–17, AccountMenu.tsx:14–15), shared Dialog close button 24×24 (Dialog.tsx:65–73), pricing "Upgrade" CTAs 28px. The 44px rule silently stops at the overlay boundary — exactly where phone users hit account/pricing. Add `touch-target` to `itemClasses`, the Dialog close button, and audit PricingModal CTAs. Command: `$impeccable harden`.

**[P2] Divider keyboard resize is a dead zone at 860–900px.** `clampPaneWidth` computes max from the state's `inspector.width` (default 320) while flexbox renders the inspector at its 260–280px minimum — `aria-valuemax` reports 280 and Arrow keys silently clamp despite real slack at 900. A focusable ARIA splitter that does nothing reads as broken. Clamp the inspector's rendered width on mode entry or derive `getMaxWidth` from `inspectorRef.offsetWidth`; when min==max, disable the divider or announce the boundary. Command: `$impeccable shape`.

**[P2] Document name field squeezes to 112px at 320px.** The min-w-24 floor holds, but a long title edits inside a ~7-character window against a 181px Export+menu cluster. Below ~400px, promote rename to a full-width sheet from the ⋯ menu (or scroll the field to the caret with the tail visible). Command: `$impeccable layout`.

**[P3] Proof gauge disappears with no compact surrogate.** "A4 · 12 pages" is wide-layout chrome only; "which paper am I on" requires switching views. Surface it in the Inspector's Page tab header or the switcher label ("Paper · A4"). Command: `$impeccable polish`.

## Persona Red Flags

**Casey (distracted mobile):** the ⋯ menu at 320px renders at x=−48 — half its labels off-screen — the single tap path to Library/theme/account. The pricing modal close button is 24×24, a precision target for a distracted thumb (backdrop tap bails out). Doc name edits in a 112px window.

**Sam (accessibility/keyboard):** tab order is exemplary (hidden panes skipped, menu arrow roving, focus restore verified). But at 860–900 the focused separator accepts Arrow keys and silently refuses them (`aria-valuenow=valuemin=valuemax=280`, no announcement), and Dialog's `autoFocus` starts every modal on a 24×24 target.

**Jordan (first-timer):** served well — seeded sample, welcome strip, empty states with next actions, locked gates explain themselves. No red flags beyond the wide-mode six-control right cluster.

## Minor Observations

- Undo/Redo (`ml-auto`) wrap alone to row 2 at the editor minimum, visually severed from their group.
- Zoom pill grows to 54px on touch and sits 12px above the viewport bottom — inside the safe area, but it overlaps the page's bottom crop-mark region at rest.
- `inspectorDefault: 320` vs `inspectorMin: 260` is the root cause of the resize dead zone — the default exceeds what the 860 arithmetic promises.
- Library drawer correctly caps at `calc(100vw-1rem)` (304px at 320) — the one overlay that clamps.
- `roomy:` wordmark variant verified at 375 (hidden) and 768 (shown); `100dvh` verified against the 664px visual viewport on the iPhone 13 profile.
- Menu items are 36px even for fine pointers — fine there, but the only control ladder that never got the touch gate.

## Questions to Consider

1. At 320px the name gets 112px while Export's chevron gets 44px beside a full Export button — is the split button the right compact shape, or should the chevron fold into ⋯ and buy the name 60px back?
2. The 44px floor gates on `hover: none` — touch-capable Windows laptops and iMacs report `hover: hover` and get 24px close buttons. Is the gate for the device or the finger?
3. "Paper" (switcher), "Paper Canvas" (aria-label), "Page" (Inspector tab) — does the switcher's abbreviation teach the model, or cost you the one chance to name the product's core object?
