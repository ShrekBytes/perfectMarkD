// Replaces the canvas's mermaid hook in component tests: the real hook
// lazy-imports the multi-megabyte mermaid bundle and renders against DOM
// timing no test environment honors, so suites that mount the shell or the
// Paper Canvas get a trivial SVG instead. The hook itself is covered in
// canvas/mermaid.test.ts against a mocked mermaid module.
export const stubMermaidModule = {
  renderMermaid: () => Promise.resolve('<svg data-test-mermaid />'),
};
