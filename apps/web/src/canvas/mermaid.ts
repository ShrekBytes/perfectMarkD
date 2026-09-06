// ─────────────────────────────────────────────────────────────────────────────
// The app's RenderMermaidHook: turns ```mermaid fences into SVG markup.
//
// mermaid is big and only needed when a diagram actually appears, so the
// module loads lazily on the first fence and stays a separate bundle chunk.
// Results cache by source — every keystroke re-runs the pipeline, and the
// sample document should not re-render its diagram each time. A failed or
// unsupported render rejects; renderMarkdown falls back to a plain code block
// (the engine's hook contract).
// ─────────────────────────────────────────────────────────────────────────────

import type { RenderMermaidHook } from '@perfectmarkd/core';

let initializeMermaid: (() => void) | null = null;
let diagramSeq = 0;
const cache = new Map<string, Promise<string>>();

async function renderFresh(code: string): Promise<string> {
  const mermaid = (await import('mermaid')).default;
  initializeMermaid ??= () => {
    // Pages are always white paper, even in dark app mode.
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
  };
  initializeMermaid();
  const { svg } = await mermaid.render(`pm-mermaid-${++diagramSeq}`, code);
  return svg;
}

export const renderMermaid: RenderMermaidHook = (code) => {
  let pending = cache.get(code);
  if (!pending) {
    pending = renderFresh(code);
    cache.set(code, pending);
    // Drop failed diagrams from the cache so a later render can retry.
    pending.catch(() => {
      if (cache.get(code) === pending) cache.delete(code);
    });
  }
  return pending;
};

/** Test hook: forgets every cached diagram (and the initialized flag). */
export function resetMermaidForTests(): void {
  cache.clear();
  initializeMermaid = null;
}
