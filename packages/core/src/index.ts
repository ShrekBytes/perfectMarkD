// Public API of @perfectmarkd/core.
//
// This file re-exports exactly the public surface — what a host may import,
// and what the built index.d.ts carries. A symbol a module exports that this
// file omits is internal: in-package tests import it from its own module;
// hosts never see it. Grow this list deliberately — one engine serves the
// on-screen preview, Client Export, and Server Export through it (ADR-0002).
export {
  MAX_AI_PLAN_STEPS,
  NO_HEADING_LABEL,
  applyAnchoredEdits,
  buildOutlineDigest,
  checkAiSendSize,
  countOccurrences,
  decideAiLadder,
  extractSections,
  findPlanStepSection,
  parseAiPlan,
  parseAnchoredEdits,
  planBriefText,
  resolveAiScope,
  resolveParagraphRange,
  sectionLabels,
  type AiLadderDecision,
  type AiPlanBrief,
  type AiPlanStep,
  type AiScope,
  type AiSendSizeInput,
  type AiSizeRefusal,
  type AnchoredEdit,
} from './ai.js';
export type { AssetResolver } from './assets.js';
export {
  bannerStyle,
  bgImageLayerStyle,
  buildDocCSS,
  buildFontFaceCSS,
  buildFrameOverlayHTML,
  buildHFInnerHTML,
  customFontFamilies,
  FOOTER_BAND_STYLE,
  HEADER_BAND_STYLE,
  katexLayoutCSS,
  resolvePageDims,
  resolvePageGeometry,
  type FontFaceSource,
  type PageGeometry,
} from './css-builder.js';
export { buildExportHTML } from './export-html.js';
export {
  buildPageLayouts,
  extractOutlineEntries,
  injectPDFOutline,
  paginateElChunked,
  type OutlineEntry,
  type PageLayout,
} from './paginator.js';
export {
  CODE_THEMES,
  isRTLContent,
  renderMarkdown,
  splitMarkdownSections,
  type RenderMermaidHook,
} from './render.js';
export { yieldToBrowser } from './scheduling.js';
export {
  DEFAULT_SETTINGS,
  PAGE_SIZES,
  PRESETS,
  extractDocStyle,
  validate,
  type DocStyle,
  type DocumentSettings,
} from './settings.js';
export {
  STYLING_REFERENCE_ANCHOR,
  buildStylingReferenceMarkdown,
} from './styling-reference.js';
export { buildInfo } from './version.js';
