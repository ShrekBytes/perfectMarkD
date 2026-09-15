# The workspace collapses to one pane below the three panes' minimum width

The three-pane row has a fixed minimum of 280 (editor) + 320 (canvas) + 260
(Inspector) = 860px, and the shell root clips its overflow. Below 860px the
third pane was not squeezed but amputated, with no scroll path to it: on a
phone the Inspector and the top bar's Export action were unreachable, and
tablet portrait (768–834px) was broken too. The shell now derives its mode from
the container width — the panes' own minimums, not a device size — and below
860px shows one pane at a time (Editor · Paper · Inspector) behind an
always-visible switcher. Every pane stays mounted and the inactive ones are
hidden, so the preview keeps rendering and no editor or canvas state is lost
when the view changes. The desktop layout is untouched at and above 860px, so
the change affects only widths that were already broken.

The same pass folds the secondary top-bar cluster (Library, theme, quota,
account) into an overflow menu below the breakpoint — Export stays in the bar —
and makes the shared dialog a scrollable, top-aligned panel, so a dialog taller
than a phone no longer puts its heading and close button above the viewport.
