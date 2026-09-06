// jsdom implements DOM Ranges but not their client-rect measurement, which
// CodeMirror's measure pass calls on every frame. Stub it to an empty list so
// measurement degrades to zeros (as in a headless browser) instead of throwing
// midway through CodeMirror's measureTextSize — an aborted measure leaks its
// measuring dummy into the document and corrupts the editor content.

const EMPTY_RECT_LIST = Object.assign([], { item: () => null });

export function stubClientRects(): void {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    value: () => EMPTY_RECT_LIST,
    configurable: true,
  });
  Object.defineProperty(Element.prototype, 'getClientRects', {
    value: () => EMPTY_RECT_LIST,
    configurable: true,
  });
}
