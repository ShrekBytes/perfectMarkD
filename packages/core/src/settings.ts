// ─────────────────────────────────────────────────────────────────────────────
// Settings schema, style presets, and defaults.
//
// This is the Document data model: the shape of a saved settings object, the
// seven built-in style presets, and the values a fresh Document starts with.
// Pure data + types — no DOM, no rendering logic. Anything that *turns* these
// settings into CSS lives in css-builder.ts; anything that *edits* them lives
// in the apps' Inspector.
// ─────────────────────────────────────────────────────────────────────────────

/** Bump when the shape of DocumentSettings changes; persisted settings carry
 *  the version they were written with so migrations can branch on it. */
export const SETTINGS_VERSION = 1;

export const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 794, h: 1123 },
  A3: { w: 1123, h: 1587 },
  Letter: { w: 816, h: 1056 },
  Legal: { w: 816, h: 1344 },
  A5: { w: 559, h: 794 },
};

export interface DocStyle {
  name: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  headingScale: number;
  accentColor: string;
  bodyColor: string;
  boldColor: string;
  headingColor: string;
  h1BorderBottom: boolean;
  h2BorderBottom: boolean;
  centerH1: boolean;
  blockquoteBg: string;
  blockquoteBorderColor: string;
  codeBackground: string;
  codeFontSize: number;
  codeFontFamily: string;
  codeTheme: string;
  tableHeaderBg: string;
  tableStriped: boolean;
  pageBackground: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

export interface DocumentSettings extends DocStyle {
  /** Schema version of this settings object; see SETTINGS_VERSION. */
  settingsVersion: number;
  pageSize: string;
  orientation: 'portrait' | 'landscape';
  preset: string;
  headerText: string;
  footerText: string;
  showHeader: boolean;
  showFooter: boolean;
  showHeaderBorder: boolean;
  showFooterBorder: boolean;
  showPageNumbers: boolean;
  pageNumberPosition: 'center' | 'left' | 'right';
  pageNumberStart: number;
  /** Template for rendering the page number string. Supports {{current}},
   *  {{total}}, and {{title}} placeholders, e.g. "Page {{current}} of {{total}}". */
  pageNumberFormat: string;
  showHeaderOnFirstPage: boolean;
  showFooterOnFirstPage: boolean;
  headerAlignment: 'left' | 'center' | 'right';
  footerTextAlignment: 'left' | 'center' | 'right';
  headerFontSize: number;
  headerFontColor: string;
  footerFontSize: number;
  footerFontColor: string;
  linkUnderline: boolean;
  frameEnabled: boolean;
  frameColor: string;
  frameThickness: number;
  frameMargin: number;
  frameStyle: 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge';
  hideFrontmatter: boolean;
  customFontName: string;
  /** Used only when codeFontFamily === "__custom__". */
  customCodeFontName: string;
  /** Typographic ligatures (e.g. -> and !=) for fonts that support them, such as Fira Code. */
  codeFontLigatures: boolean;
  autoBreakH1: boolean;
  autoBreakH2: boolean;
  includeFilenameAsTitle: boolean;
  /** Width in mm, used only when pageSize === "Custom". */
  customPageWidth: number;
  /** Height in mm, used only when pageSize === "Custom". */
  customPageHeight: number;

  // ── Header/footer band sizing ─────────────────────────────────────────────
  /** Explicit header band height in px. 0 = auto (derived from headerFontSize). */
  headerHeight: number;
  /** Explicit footer band height in px. 0 = auto (derived from footerFontSize). */
  footerHeight: number;

  // ── Header/footer banner images ───────────────────────────────────────────
  /** Asset ref for a banner image behind the header text, resolved through
   *  the engine's AssetResolver (a data:, blob:, or https: URL). */
  headerImageRef: string;
  /** Left/right gap in px between the banner image and the page edges (0 = edge-to-edge). */
  headerImageMargin: number;
  footerImageRef: string;
  /** Left/right gap in px between the banner image and the page edges. */
  footerImageMargin: number;

  // ── Page background (color OR image — mutually exclusive) ────────────────
  /** When true, backgroundImageRef is used instead of the pageBackground color. */
  backgroundImageEnabled: boolean;
  /** Asset ref for the background image, resolved through the AssetResolver. */
  backgroundImageRef: string;
  /** How the image fills the background zone. */
  backgroundImageSize: 'cover' | 'contain' | 'fill' | 'tile';
  /** "full-page": behind header+content+footer. "content-only": text zone only. */
  backgroundImageScope: 'full-page' | 'content-only';
  /** 0–1 opacity for the background image layer. */
  backgroundImageOpacity: number;
  /** When true, headings H1–H6 are embedded as a bookmark tree in the exported PDF. */
  includeOutline: boolean;
}

// ─── Style Presets ────────────────────────────────────────────────────────────

const defaultStyle: DocStyle = {
  name: 'Default',
  fontFamily: 'Georgia, serif',
  fontSize: 13,
  lineHeight: 1.85,
  paragraphSpacing: 0.65,
  headingScale: 1.0,
  accentColor: '#1c1e21',
  bodyColor: '#1a1a2e',
  boldColor: '#1a1a2e',
  headingColor: '#0d0d1a',
  h1BorderBottom: false,
  h2BorderBottom: true,
  centerH1: false,
  blockquoteBg: 'transparent',
  blockquoteBorderColor: '#1c1e21',
  codeBackground: '#f0f1f2',
  codeFontSize: 0.85,
  codeFontFamily: "'Courier New', monospace",
  codeTheme: 'github-light',
  tableHeaderBg: '#f0f1f2',
  tableStriped: true,
  pageBackground: '#ffffff',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
};

export const PRESETS: Record<string, DocStyle> = {
  default: defaultStyle,
  minimal: {
    name: 'Minimal',
    fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
    fontSize: 12,
    lineHeight: 1.6,
    paragraphSpacing: 0.45,
    headingScale: 0.88,
    accentColor: '#333',
    bodyColor: '#222',
    boldColor: '#222',
    headingColor: '#111',
    h1BorderBottom: false,
    h2BorderBottom: false,
    centerH1: false,
    blockquoteBg: '#f8f8f8',
    blockquoteBorderColor: '#ccc',
    codeBackground: '#f4f4f4',
    codeFontSize: 0.82,
    codeFontFamily: "'Courier New', monospace",
    codeTheme: 'none',
    tableHeaderBg: '#efefef',
    tableStriped: false,
    pageBackground: '#ffffff',
    marginTop: 16,
    marginBottom: 16,
    marginLeft: 20,
    marginRight: 20,
  },
  academic: {
    name: 'Academic',
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: 12,
    lineHeight: 2.0,
    paragraphSpacing: 0.0,
    headingScale: 0.95,
    accentColor: '#1a3a6b',
    bodyColor: '#000',
    boldColor: '#000',
    headingColor: '#000',
    h1BorderBottom: true,
    h2BorderBottom: true,
    centerH1: true,
    blockquoteBg: 'transparent',
    blockquoteBorderColor: '#999',
    codeBackground: '#f9f9f9',
    codeFontSize: 0.88,
    codeFontFamily: "'Courier New', monospace",
    codeTheme: 'solarized-light',
    tableHeaderBg: '#e8e8e8',
    tableStriped: false,
    pageBackground: '#ffffff',
    marginTop: 25,
    marginBottom: 25,
    marginLeft: 30,
    marginRight: 30,
  },
  colorful: {
    name: 'Colorful',
    fontFamily: 'Georgia, serif',
    fontSize: 13,
    lineHeight: 1.85,
    paragraphSpacing: 0.65,
    headingScale: 1.05,
    accentColor: '#e84393',
    bodyColor: '#1a1a2e',
    boldColor: '#1a1a2e',
    headingColor: '#2d0a4e',
    h1BorderBottom: false,
    h2BorderBottom: false,
    centerH1: false,
    blockquoteBg: '#fdf0f8',
    blockquoteBorderColor: '#e84393',
    codeBackground: '#f0eaff',
    codeFontSize: 0.85,
    codeFontFamily: "'Courier New', monospace",
    codeTheme: 'dracula',
    tableHeaderBg: '#2d0a4e',
    tableStriped: true,
    pageBackground: '#ffffff',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
  },
  modern: {
    name: 'Modern',
    fontFamily: 'Arial, sans-serif',
    fontSize: 13,
    lineHeight: 1.75,
    paragraphSpacing: 0.6,
    headingScale: 1.0,
    accentColor: '#0070f3',
    bodyColor: '#111',
    boldColor: '#111',
    headingColor: '#000',
    h1BorderBottom: false,
    h2BorderBottom: false,
    centerH1: false,
    blockquoteBg: '#f0f7ff',
    blockquoteBorderColor: '#0070f3',
    codeBackground: '#f1f5f9',
    codeFontSize: 0.85,
    codeFontFamily: "'Courier New', monospace",
    codeTheme: 'github-dark',
    tableHeaderBg: '#0070f3',
    tableStriped: true,
    pageBackground: '#ffffff',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
  },
  newspaper: {
    name: 'Newspaper',
    fontFamily: 'Georgia, serif',
    fontSize: 12,
    lineHeight: 1.7,
    paragraphSpacing: 0.4,
    headingScale: 1.1,
    accentColor: '#111',
    bodyColor: '#111',
    boldColor: '#111',
    headingColor: '#000',
    h1BorderBottom: true,
    h2BorderBottom: true,
    centerH1: true,
    blockquoteBg: 'transparent',
    blockquoteBorderColor: '#111',
    codeBackground: '#f4f4f4',
    codeFontSize: 0.82,
    codeFontFamily: "'Courier New', monospace",
    codeTheme: 'none',
    tableHeaderBg: '#111',
    tableStriped: false,
    pageBackground: '#ffffff',
    marginTop: 18,
    marginBottom: 18,
    marginLeft: 20,
    marginRight: 20,
  },
  dark: {
    name: 'Dark',
    fontFamily: 'Georgia, serif',
    fontSize: 13,
    lineHeight: 1.85,
    paragraphSpacing: 0.65,
    headingScale: 1.0,
    accentColor: '#818cf8',
    bodyColor: '#d1d5db',
    boldColor: '#d1d5db',
    headingColor: '#f1f5f9',
    h1BorderBottom: false,
    h2BorderBottom: true,
    centerH1: false,
    blockquoteBg: '#1e293b',
    blockquoteBorderColor: '#818cf8',
    codeBackground: '#0f172a',
    codeFontSize: 0.85,
    codeFontFamily: "'Courier New', monospace",
    codeTheme: 'tokyo-night',
    tableHeaderBg: '#1e293b',
    tableStriped: true,
    pageBackground: '#111827',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
  },
};

export const DEFAULT_SETTINGS: DocumentSettings = {
  settingsVersion: SETTINGS_VERSION,
  pageSize: 'A4',
  orientation: 'portrait',
  preset: 'default',
  ...defaultStyle,
  headerText: '',
  footerText: '',
  showHeader: true,
  showFooter: true,
  showHeaderBorder: false,
  showFooterBorder: false,
  showPageNumbers: true,
  pageNumberPosition: 'right',
  pageNumberStart: 1,
  pageNumberFormat: '{{current}} / {{total}}',
  showHeaderOnFirstPage: true,
  showFooterOnFirstPage: true,
  headerAlignment: 'right',
  footerTextAlignment: 'left',
  headerFontSize: 9,
  headerFontColor: '#999999',
  footerFontSize: 9,
  footerFontColor: '#aaaaaa',
  linkUnderline: true,
  frameEnabled: false,
  frameColor: '#1c1e21',
  frameThickness: 4,
  frameMargin: 8,
  frameStyle: 'solid',
  hideFrontmatter: false,
  customFontName: '',
  customCodeFontName: '',
  codeFontLigatures: false,
  autoBreakH1: false,
  autoBreakH2: false,
  includeFilenameAsTitle: false,
  customPageWidth: 210, // A4 width in mm
  customPageHeight: 297, // A4 height in mm
  // Band sizing (0 = auto from font size)
  headerHeight: 0,
  footerHeight: 0,
  // Banner images (header / footer background)
  headerImageRef: '',
  headerImageMargin: 0,
  footerImageRef: '',
  footerImageMargin: 0,
  // Page background
  backgroundImageEnabled: false,
  backgroundImageRef: '',
  backgroundImageSize: 'cover',
  backgroundImageScope: 'full-page',
  backgroundImageOpacity: 1,
  // Outline / bookmarks
  includeOutline: true,
};

/** Color pickers in the Colors settings group. Used to reset only those
 *  fields to the active preset's defaults without touching other DocStyle. */
export const PRESET_COLOR_KEYS = [
  'accentColor',
  'bodyColor',
  'boldColor',
  'headingColor',
  'blockquoteBg',
  'blockquoteBorderColor',
  'tableHeaderBg',
  'codeBackground',
] as const satisfies readonly (keyof DocStyle)[];

/** Extracts only the DocStyle fields from the broader settings object.
 *  Used to snapshot the current look before switching presets, so each
 *  preset can remember per-user tweaks independently. */
export function extractDocStyle(s: DocumentSettings): DocStyle {
  return {
    name: s.name,
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    paragraphSpacing: s.paragraphSpacing,
    headingScale: s.headingScale,
    accentColor: s.accentColor,
    bodyColor: s.bodyColor,
    boldColor: s.boldColor,
    headingColor: s.headingColor,
    h1BorderBottom: s.h1BorderBottom,
    h2BorderBottom: s.h2BorderBottom,
    centerH1: s.centerH1,
    blockquoteBg: s.blockquoteBg,
    blockquoteBorderColor: s.blockquoteBorderColor,
    codeBackground: s.codeBackground,
    codeFontSize: s.codeFontSize,
    codeFontFamily: s.codeFontFamily,
    codeTheme: s.codeTheme,
    tableHeaderBg: s.tableHeaderBg,
    tableStriped: s.tableStriped,
    pageBackground: s.pageBackground,
    marginTop: s.marginTop,
    marginBottom: s.marginBottom,
    marginLeft: s.marginLeft,
    marginRight: s.marginRight,
  };
}

/** Clamps critical numeric settings to safe ranges and repairs invalid
 *  values, returning a repaired copy; the input is not mutated. Run after
 *  loading persisted JSON so corrupt or hand-edited data cannot produce
 *  invisible text, zero-size pages, or bad layout. */
export function validate(settings: DocumentSettings): DocumentSettings {
  const s = { ...settings };

  // Pre-light-table documents carry the old violet identity; graphite is the
  // committed accent now (DESIGN.md rewrite). A migration-scoped repaint, not
  // a general normalization: only the legacy hue is replaced, user-customized
  // colors pass through untouched.
  if (s.accentColor === '#7c6af7') s.accentColor = '#1c1e21';
  if (s.blockquoteBorderColor === '#7c6af7')
    s.blockquoteBorderColor = '#1c1e21';

  // Unknown preset key → fall back to default.
  if (!(s.preset in PRESETS)) {
    s.preset = 'default';
  }

  // Font sizes must be positive to produce visible text.
  s.fontSize = Math.max(1, s.fontSize);
  s.headerFontSize = Math.max(1, s.headerFontSize);
  s.footerFontSize = Math.max(1, s.footerFontSize);

  // Margins must be non-negative; zero is allowed (full-bleed layouts).
  s.marginTop = Math.max(0, s.marginTop);
  s.marginBottom = Math.max(0, s.marginBottom);
  s.marginLeft = Math.max(0, s.marginLeft);
  s.marginRight = Math.max(0, s.marginRight);

  // Custom page dimensions need a printable minimum.
  s.customPageWidth = Math.max(10, s.customPageWidth);
  s.customPageHeight = Math.max(10, s.customPageHeight);

  // Page-number start must be at least 1.
  s.pageNumberStart = Math.max(1, s.pageNumberStart);

  // Page-number format: fall back to default when cleared.
  if (!s.pageNumberFormat || !s.pageNumberFormat.trim()) {
    s.pageNumberFormat = DEFAULT_SETTINGS.pageNumberFormat;
  }

  // Band heights: 0 = auto (derived from font size); negatives are invalid.
  s.headerHeight = Math.max(0, s.headerHeight);
  s.footerHeight = Math.max(0, s.footerHeight);

  // Banner image edge gaps must be non-negative.
  s.headerImageMargin = Math.max(0, s.headerImageMargin);
  s.footerImageMargin = Math.max(0, s.footerImageMargin);

  // Background image opacity is a 0–1 fraction.
  s.backgroundImageOpacity = Math.min(1, Math.max(0, s.backgroundImageOpacity));

  return s;
}
