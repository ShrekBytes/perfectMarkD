// ─────────────────────────────────────────────────────────────────────────────
// The golden suite's mermaid renderer (launch/07).
//
// The app has one of these too (`apps/web/src/canvas/mermaid.ts`), and this is
// deliberately not it. The engine takes the renderer as a hook, and a hook's
// output is an *input* to pagination — so the harness pins that input the same
// way it pins fonts.
//
// The app's hook leaves the diagram's typography to mermaid's default stack,
// `"trebuchet ms", verdana, arial, sans-serif`, which is a system stack: the
// same diagram came out a different size on every machine, and the goldens
// that contain one were measuring the host. Mermaid measures its labels to
// size its nodes, so a substituted font moves the whole diagram, not just its
// text. The family arrives as an argument rather than an import so this module
// stays browser-only — the stack lives with the rest of the fonts, which is
// Node-side.
//
// Which family the app's diagrams use stays the app's decision.
// ─────────────────────────────────────────────────────────────────────────────

import mermaid from 'mermaid';

/** Builds a render hook with the diagram's font family pinned. The contract
 *  matches the app's hook: SVG markup, or a rejection the engine turns back
 *  into a code block. */
export function createMermaidRenderer(
  fontFamily: string,
): (code: string) => Promise<string> {
  let diagramSeq = 0;
  const cache = new Map<string, Promise<string>>();

  const renderFresh = async (code: string): Promise<string> => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      themeVariables: { fontFamily },
    });
    const { svg } = await mermaid.render(
      `pm-golden-mermaid-${++diagramSeq}`,
      code,
    );
    return svg;
  };

  return (code: string): Promise<string> => {
    let pending = cache.get(code);
    if (!pending) {
      pending = renderFresh(code);
      cache.set(code, pending);
      // Drop failed diagrams so a later render can retry — the app's hook
      // does the same, and the engine's fallback depends on the rejection.
      pending.catch(() => {
        if (cache.get(code) === pending) cache.delete(code);
      });
    }
    return pending;
  };
}
