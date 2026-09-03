# 03 — Port css-builder (minus MathJax/Prism machinery)

Status: ready-for-agent
Blocked by: engine-port/01, engine-port/02

Port `css-builder.ts` into `packages/core`: `buildDocCSS`, `buildCodeBlockCSS` (now theme-agnostic — Shiki emits its own colors at render time, so keep only pre/code base styling: background, font, ligatures), frame helpers, `mmToPx`, `resolvePageDims`, `escapeHTML`, `escapeCSSForStyle`, `bgImageCssProps`, `hexLuminance`, font resolvers. **Delete**: `CODE_THEMES`, `TOKEN_GROUP_CLASSES`, `getMathJaxCSS*`, `stripAtFontFaces`, `waitForMathJaxStylesheetStable`. `resolveImageUrl` becomes the injectable `AssetResolver` interface. Replace the Obsidian callout classes with GFM Alert classes (`markdown-alert-note` etc., per github-markdown rendering) keeping the existing visual design.

**Accepts**: pure functions, no DOM/Obsidian imports; unit tests for page dims + CSS shape.
