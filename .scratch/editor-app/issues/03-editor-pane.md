# 03 — Editor pane (CodeMirror 6)

Status: ready-for-agent
Blocked by: editor-app/02, engine-port/04 (for live render wiring)

CodeMirror 6 with markdown language + syntax highlighting, line wrapping, `///` page-break lines visually flagged. Slim toolbar: bold, italic, heading cycle, list, table snippet, image (opens picker), insert Page Break, undo/redo. Shortcuts: Ctrl/Cmd+B/I/K (K = link), Ctrl/Cmd+Enter = render. Word/char count in pane footer. Paste/drop of `.md`/images handled with ticket 08. Scroll sync: approximate proportional sync editor↔canvas (heading-anchor based when possible).

**Accepts**: editing flows into the render pipeline via store; toolbar + shortcuts work; sync feels instant on a 20-page doc.
