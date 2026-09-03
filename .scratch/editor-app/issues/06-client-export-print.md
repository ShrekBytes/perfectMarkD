# 06 — Client Export via print pipeline

Status: ready-for-agent
Blocked by: editor-app/04, engine-port/07

Main Export button = Client Export (ADR-0002): build `exportHTML` via the engine, write it into a hidden iframe, call `iframe.contentWindow.print()`. Before the first print per session, show a one-time hint ("Choose 'Save as PDF' in the dialog — quality is identical to a downloaded PDF"). Ensure `print-color-adjust: exact`, `@page` size, and no app UI in the print output. Browser detection: Firefox/Safari get a "best results in Chrome/Edge" notice. Dropdown menu item "Print…" is the same flow (the dialog is inherent). Disable button during render; busy state.

**Accepts**: exported print output matches Paper Canvas layout (spot-check manual + iframe-content structural test); hint shows once; no app chrome leaks into print.
