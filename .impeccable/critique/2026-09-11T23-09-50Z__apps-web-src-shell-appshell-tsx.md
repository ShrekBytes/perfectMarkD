---
target: apps/web/src/shell/AppShell.tsx
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/samy/Documents/GitHub/perfectMarkD/apps/web/src/shell/AppShell.tsx"
target_fingerprint: "sha256:8634d8bd27036af037cdb1a1e702f1fa78874f6848f868c0a6815c2f87eecfe2"
target_path: /home/samy/Documents/GitHub/perfectMarkD/apps/web/src/shell/AppShell.tsx
timestamp: 2026-09-11T23-09-50Z
slug: apps-web-src-shell-appshell-tsx
closed: true
---
# Critique — AppShell (`apps/web/src/shell/AppShell.tsx`)

Method: dual-agent (A: ses_f6d586176ffep4z99aBw7UVolM · B: ses_f6d586174ffeXHNNImPbkRMf4h)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Canvas render failure is caught with `console.error` only (`PaperCanvas.tsx:207-209`) — the preview can silently stop updating; Saving/Saved, shimmer, spinner, quota are otherwise well signaled |
| 2 | Match System / Real World | 3 | Strong print vocabulary (A4, mm margins, "Page 1 of 5"); the Quota chip is a bare `0/300` whose meaning lives only in a hover title |
| 3 | User Control and Freedom | 2 | Undo-delete ✓, Escape everywhere ✓ — but pane resize/reset is mouse-only, dialogs never restore focus, and undoing the last delete doesn't restore your workspace |
| 4 | Consistency and Standards | 3 | Heights/radii/motion rigorous; two toasts dismiss with text `×` glyphs (`ExportSplitButton.tsx:234`, `PaperCanvas.tsx:399`) — a violation of the system's own no-glyph rule |
| 5 | Error Prevention | 2 | "Load changes" in the stale banner — which discards local edits — is the violet primary; delete is unconfirmed (undo mitigates) |
| 6 | Recognition Rather Than Recall | 2 | All three divider powers invisible (drag, hover-revealed chevron, double-click reset); `.md`-only drop discovered by silent failure |
| 7 | Flexibility and Efficiency | 2 | Shortcuts are editor-scoped (Ctrl+B/I, Ctrl+Enter); no keyboard path to any layout operation |
| 8 | Aesthetic and Minimalist Design | 3 | Chrome truly recedes — but first run stacks WelcomeStrip + toolbar + tabs + footer + zoom pill before the user writes a word |
| 9 | Error Recovery | 2 | Dialog errors get `role="alert"` + Retry ✓; canvas render failure shows nothing; a non-.md drop silently does nothing |
| 10 | Help and Documentation | 2 | "The sample teaches" is a decent strategy, plus a hint dialog before print; zero in-shell help |
| **Total** | | **24/40** | **Acceptable (60%) — significant improvements needed** |

## Design Specificity Verdict

**LLM assessment (A).** The token layer is genuinely committed — warm desk `#f1efe9`, one violet, 1px hairlines, the 28/32/36/40/48 chrome scale, 150ms ease-out, paper pinned white in dark mode. But the *composition under critique* — 48px bar with wordmark | document name | Library / theme / Export / account, two 40px banner strips, editor|canvas|inspector with hover-revealed chevrons, a 336px slide-left drawer, bottom-center toasts, a dashed drop overlay — is the industry-default IDE layout. Relabel the paper as a spreadsheet and nothing in the shell would need to change. The proofing-desk idea is carried almost entirely by the Paper Canvas (two-part page shadow, "Page N of M" labels, mm-unit Inspector, zoom pill). The chrome contributes exactly two authored moments: the violet "Mark" in the wordmark and the page frame's 3px violet border against the warm desk. Nothing in the top bar, banners, or Library says *print*, *page*, or *proof* — even Library rows show only name + relative timestamp while the system already owns the 84×112 preset-thumbnail component. Verdict: category-interchangeable shell around a genuinely specific canvas. A defensible reading of "chrome recedes," but the shell spends its character budget on neutrality rather than a few quiet, print-native moments.

**Deterministic scan (B).** `impeccable detect --json apps/web/src/shell`: exit 0, **zero static findings** in shell-owned source. The browser overlay on the rendered DOM tells the other half: **13–15 findings** across 3 states — `low-contrast` ×12–13, `clipped-overflow-container` ×1 (the shell root's own `overflow-hidden`), `flat-type-hierarchy` ×1 (h3 11px / body 12px / h2 14px, page-level), `dark-glow` ×1 (zero-offset `#ffba00` glow, page-level, unverified). The detector caught what a static pass cannot and what the design review under-weighted: computed contrast failures, including white-on-violet (`#ffffff` on `#7c6af7` = 3.99:1 ≈ the reported 4.0:1) at `shell/WelcomeStrip.tsx:40` and `library/LibraryPanel.tsx:101`, and `ink-faint` (`#827e76` on dark surfaces, 3.5–3.9:1) on page labels, the status bar, and Inspector micro-heads. No false positives claimed; source spot-checks corroborated every verified finding.

**Visual overlays.** The detector was injected and ran in the page — but in **headless Chromium**, because no desktop browser is connected to this session. There is no [Human] overlay tab in your browser (the recorded fallback signal); the confirmation screenshot is at `/tmp/opencode/impeccable-headless/overlay-default.png`: LOW-CONTRAST badges on "Start blank", the MARGINS (MM) / FRAME / BACKGROUND IMAGE section heads, the status bar, and a page label — and, independent of any detector, it shows Priority Issue 1 directly: the sample page clipped under the Inspector while the zoom pill reads "100%".

## Overall Impression

The desk metaphor survives contact with the canvas and dies at the edges. What works is the discipline: the chrome is quiet, the paper is the brightest object on screen, and the destructive-action plumbing (undo, flush-before-delete, orphan snapshots, auto-open Library at zero docs) is genuinely thought through. What doesn't: the shell's first frame breaks the product's one promise — the page renders clipped under the Inspector with the pill reading "100%" — and its most-used instrument, the divider, hides all three of its powers while booby-trapping the one everyone tries first. Emotionally, the peak is real (a framed page on a warm desk within a second or two) but the first-run valley cuts it: you meet "what you see is exactly what you get" at 69% visibility. The single biggest opportunity: make the first frame keep the contract, then give the overlay layer the focus and keyboard plumbing the rest of the app already has.

### Cognitive load

5 of 8 checklist items fail — high by the checklist, though the load is concentrated, not diffuse: the top bar's right cluster is a 5-control decision point signed out (7 signed in); three Inspector groups sit at or over the 4-field chunk (Margins, Frame, Background Image); the three divider gestures are pure recall; two violet primaries compete in the first-run viewport; and three 40px-class strips can stack ~128px of pushed chrome before any pane begins. Grouping, single focus, and progressive disclosure pass — the Inspector tabs, gate locks, and menus are exemplary.

## What's Working

1. **The token discipline is real, not aspirational.** Across every shell file the review could not find one ad-hoc gray, one off-scale control height, one second easing curve; `global.css` exposes exactly the DESIGN.md set. That consistency is why the app reads as an instrument.
2. **Collapse is one click and honest.** `CollapsedPaneToggle` buttons are always visible (never hover-gated), correctly labeled ("Show editor pane"), and fullscreen mode emerges naturally from two clicks. Escape discipline (Library, every dialog, every menu) is uniform.
3. **Destructive-action plumbing is thought through.** Delete-undo with a 7s window, flush-before-delete so the toast names the right content (`store.ts:487-491`), an orphaned-asset snapshot for true restore, and the workspace auto-opens the Library at zero documents so the user is never stranded at an empty desk.

## Priority Issues

**[P1] First paint breaks "the preview is the contract" — the page renders clipped with no auto-fit.**
- **Why it matters:** At 1440×900 the default layout gives the canvas ~573px against a 794px A4 at zoom 1.00 — 69% of the page visible, right edge lost under the Inspector (the overlay screenshot shows it). The pill truthfully reads "100%" and is useless at once. `fitToWidth()` exists but only behind a click. The product's single most important claim is falsified in the first second.
- **Fix:** On first render per session — and on canvas resize until the user manually zooms — call the existing `fitToWidth()` and let the pill read the true computed scale ("68%"). Keep 100% as a pill action. Fallback: default the editor pane to a px width (≈480px) instead of 38% so the canvas wins the arithmetic.
- **Suggested command:** `$impeccable polish`

**[P1] The overlay layer has no focus management.**
- **Why it matters:** Opening the Library leaves `document.activeElement` on `<body>` (measured) — no focus move, no announcement, no `aria-modal`, no trap; a screen-reader user tabs through content behind a 25% black scrim. `Dialog.tsx` autoFocuses its Close button (good) but traps nothing and restores nothing on close; AccountMenu and the export menu have no arrow-key roving. All four Escape listeners are uncoordinated `window` handlers — one Escape with a dialog open over the Library closes both.
- **Fix:** One small focus utility: move focus in on open (drawer header / dialog panel), trap Tab while open, restore to the trigger on close, and make Escape resolve the topmost layer only. Give LibraryPanel `aria-modal="true"` to match Dialog.
- **Suggested command:** `$impeccable audit`

**[P1] The divider system is invisible, mouse-only, and booby-trapped.**
- **Why it matters:** `[role="separator"]` elements are `tabIndex -1` (measured) — no keyboard resize, no keyboard reset, missing the ARIA splitter pattern the AA target implies. The 24px collapse chevron is `opacity-0` until hover *and* sits exactly at the divider's vertical center — a pointer-down at the middle of the line you meant to drag toggles collapse instead (proven by press probe). Double-click-to-reset exists nowhere on screen.
- **Fix:** Make the separator focusable (`tabIndex 0`, `aria-valuenow/min/max`, Arrow-key resize per the APG). Move the chevron off center (e.g. `top-6`) so the grab zone at center stays drag. Add `title="Drag · double-click to reset"` and surface reset as a keyboard-reachable divider action.
- **Suggested command:** `$impeccable audit`

**[P1] White-on-violet fails WCAG AA, and `ink-faint` tertiary text sits below AA in both themes.**
- **Why it matters:** PRODUCT.md commits to WCAG 2.2 AA. White on `#7c6af7` computes 3.99:1 at 14px — below the required 4.5:1 — on the "Start blank" primary (`WelcomeStrip.tsx:40`) and "New document" (`LibraryPanel.tsx:101`); the same treatment ships on every primary button app-wide. `ink-faint` runs 3.5–3.9:1 in dark (detector) and ≈3.2:1 in light (computed) on 10–12px page labels, the status bar, and Inspector micro-heads — real text users read, not decoration.
- **Fix:** Deepen the violet under fills — `accent-violet-deep` `#6a55f2` computes ≈4.8:1 (verify in browser) — or lift the fill token used by filled controls; this is a DESIGN.md token decision with shell-level consequences. Lift `ink-faint` toward `ink-soft` for any text under ~14px.
- **Suggested command:** `$impeccable audit` (then update DESIGN.md)

**[P2] Failure and conflict states are silent or mis-weighted.**
- **Why it matters:** Canvas render failure is caught with `console.error` only (`PaperCanvas.tsx:207-209`) — latent (never hit in live runs) but it is the core loop's only failure path, and the user would keep editing against a stale preview: the exact divergence the product exists to prevent. A non-.md drop passes the overlay's confident "Drop .md files to import" and then silently does nothing (`useFileDrop.ts:44-47`). The stale banner gives its violet primary to "Load changes" — which discards local edits — while "Keep mine" is the ghost. The exhausted QuotaChip is a well-styled dead `<span>`.
- **Fix:** Surface render failure as a persistent Tinted Notice with Retry (`role="status"`). Reject non-.md drops with a toast naming the problem and the recovery. Invert the stale banner's weights ("Keep mine" filled, "Load changes" ghost with danger text) and let the copy wrap instead of truncating. Make the exhausted chip open the Export/upgrade path.
- **Suggested command:** `$impeccable harden` (+ `$impeccable clarify` for the banner copy)

## Persona Red Flags

**Alex (impatient power user).** Hits the clipped-page wall in the first second and must *find* "Fit page width" — the desk's most important affordance is the fourth button in a 28px pill. Double-click-to-reset is unknown to him (it lives only in DESIGN.md). No shortcuts for Library, export, or pane collapse; Ctrl+Enter is the only one, advertised only inside the sample document. Hover-gated chevrons cost a mouse pause per collapse. The QuotaChip at "300/300" is a dead end — Server Export hides in the Export dropdown.

**Sam (keyboard / screen reader).** Pane resize and reset don't exist (`tabIndex -1` separators). Opening the Library moves focus nowhere (measured: `<body>`), announces nothing, and Tab then walks content behind the scrim; dialogs trap nothing and restore nothing on close. Menus lack arrow-key navigation; Tab can leave them open and stranded. The delete toast's 7-second window may open unheard (focus never moves; the timer doesn't pause on focus). Sam does get real positives: `aria-live` save state, `role="alert"` banners, labeled icon buttons, uniform 2px violet focus rings, `aria-expanded` on every disclosure.

**Riley (stress tester).** Drops a PDF: the overlay says "Drop .md files to import," she drops, and nothing happens — `useFileDrop` filters non-markdown silently (`useFileDrop.ts:44-47`). One Escape closes dialog + Library together. Renaming to whitespace is correctly refused ✓. Hard divider drags clamp safely (canvas min 320px) ✓. At 620px the top bar breaks — "Sign in" wraps to two lines (measured) — and the 0.35 zoom floor means a 794px page can never fit a ~268px canvas, so narrow viewports are clipped at every zoom. Deleting her last document and undoing restores the file but leaves the canvas staring at "Open a document from the Library" — undo restored the data, not the workspace.

## Minor Observations

- Two toast dismiss buttons are text `×` glyphs (`ExportSplitButton.tsx:234`, `PaperCanvas.tsx:399`) — the system's own no-glyph rule; `CloseIcon` exists and is used everywhere else.
- "Start blank" (WelcomeStrip) and "Export" (top bar) put two violet primaries in one first-run viewport — the Reserved Violet Rule violation, and the detector measured that violet at a failing 4.0:1.
- The document-name input sizes itself to content (`size={Math.max(draft.length, 8)}`), so the top bar's right cluster shifts on every keystroke; the Saving→Saved width change nudges it again. Nothing in the bar is width-stable.
- No `h1` anywhere in the workspace; heading order starts at `h2` inside drawers/dialogs.
- No `prefers-reduced-motion` handling (low severity at 150ms, but the system would want the query).
- Three visually identical 40px accent strips (Welcome / Stale / PlanEnded) with three different button grammars — one strip pattern with slots would prevent drift.
- `DeleteToast` has no dismiss affordance (Undo or wait 7s), its timer ignores hover/focus, and it physically overlaps the zoom pill (measured).
- The Library's zero-document empty state is one faint 12px line — the weakest moment of an otherwise disciplined empty-state system; Library rows carry no page count or thumbnail despite the system owning `PresetThumbnail`.
- Detector, page-level: `flat-type-hierarchy` (h3 11px / body 12px / h2 14px, a 1.17 step) and a zero-offset `#ffba00` `dark-glow` — both outside shell-owned source, unverified. The shell root's own `overflow-hidden` was flagged `clipped-overflow-container` and is worth one look.

## Questions to Consider

1. If "the preview is the contract," why is the contract delivered torn on frame one — and is a pill reading "100%" honest, or is it hiding behind "true pixels" to avoid the fit math the desk owes the user?
2. The divider is the shell's most-used instrument, and all three of its powers are invisible. Would you accept a table saw where the handle, the switch, and the release are the same black line?
3. DESIGN.md forbids glyph icons, competing violets, and ad-hoc grays — the shell ships a text `×`, two simultaneous violet primaries, and three near-identical strips with three button grammars. At what point does "the system" stop being the constraint and become the alibi?
