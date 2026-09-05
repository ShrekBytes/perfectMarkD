// ─────────────────────────────────────────────────────────────────────────────
// Minimal replacements for the Obsidian DOM helpers the ported engine used.
//
// The package is browser-only by design (render.ts already requires a DOM
// environment), so these resolve against the ambient `document`. They exist so
// the ported engine code keeps its original shape instead of sprinkling
// document.createElement calls through it.
// ─────────────────────────────────────────────────────────────────────────────

/** Obsidian's `createDiv()` — a plain detached `<div>`. */
export function createDiv(): HTMLDivElement {
  return document.createElement('div');
}

/** Obsidian's `createEl(tag)` — a detached element of the given tag. */
export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}

/** Obsidian's `el.setCssStyles(styles)` — direct style-object assignment. */
export function setCssStyles(
  el: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
): void {
  Object.assign(el.style, styles);
}
