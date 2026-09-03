# 08 — Engine regression suite (real-Chromium golden tests)

Status: ready-for-agent
Blocked by: engine-port/04, engine-port/05, engine-port/07

Playwright-driven test harness: load a fixture page in Chromium, run the full pipeline (`render → paginate → layouts → exportHTML`) over golden documents — long prose, table-heavy, list-heavy, code-heavy (each theme), math+mermaid, `///` breaks, custom page size, RTL, all 7 presets. Assert page counts, heading→page outline entries, and no-overflow checks (no node extends past content box). These tests protect the moat; plugin behavior is the reference implementation.

**Accepts**: suite runs in CI (headless Chromium), catches a deliberately-introduced pagination regression.
