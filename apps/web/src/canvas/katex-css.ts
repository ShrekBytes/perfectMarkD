// KaTeX styles for the Paper Canvas's page shadow roots.
//
// Two imports, two jobs:
// - The plain import lets Vite process the stylesheet: the @font-face rules'
//   url(fonts/…) references are rewritten to hashed assets and the fonts
//   register document-wide — @font-face applies to shadow trees, so the pages'
//   math renders without the shadow roots carrying font URLs at all.
// - The ?raw import is sliced down to the layout rules and adopted into every
//   page's shadow root (the document-level copy can't style across the shadow
//   boundary). Everything before the first `.katex` rule is the @font-face
//   block; dropping it avoids shadow-level copies resolving `url(fonts/…)`
//   against the app root and 404-ing.
import '@perfectmarkd/core/katex.css';
import katexCss from '@perfectmarkd/core/katex.css?raw';

const firstLayoutRule = katexCss.indexOf('.katex{');

export const KATEX_LAYOUT_CSS =
  firstLayoutRule === -1 ? katexCss : katexCss.slice(firstLayoutRule);
