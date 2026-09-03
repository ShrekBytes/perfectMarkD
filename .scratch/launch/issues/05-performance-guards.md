# 05 — Performance guards for large documents

Status: ready-for-agent
Blocked by: editor-app/04, server/03

Client: chunked rendering with yields between sections so 200+ page docs don't freeze the tab (progress indicator), mermaid SVG cache keyed by source, Shiki highlighter reuse (singleton) + lazy theme loading, editor debounced render tuned (400ms idle, cancel on keystroke). Server: render timeout per job (60s) → typed failure; payload streaming parse to avoid double memory; chromium single-instance reuse (browser context pool).

**Accepts**: 300-page golden doc renders client-side without tab freeze (test with CDP throttling); server job times out cleanly with typed error.
