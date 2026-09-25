// ─────────────────────────────────────────────────────────────────────────────
// The faces the golden suite ships (launch/07).
//
// A golden is a byte-exact snapshot of laid-out shape, so every font that can
// move a measurement has to come from the suite rather than from the host.
// The presets name system fonts — Georgia, Helvetica Neue, Times New Roman,
// Arial, Courier New — and no two machines substitute those the same way.
// That is why this suite passed on the Admin's machine and failed on
// ubuntu-latest: fontconfig picked different stand-ins, the same code block
// wrapped into a different number of lines, and the page splits moved with
// it. Nothing about the engine had changed.
//
// So the golden documents render in these four OFL families instead
// (test-only devDependencies) and the harness serves their files over its
// fictional origin. The KaTeX faces ride along: `katex.css` addresses its
// fonts relatively, so inlined into the golden page every math glyph in the
// feature matrix was resolving to a system fallback too.
//
// Two rules keep the suite honest, and both are load-bearing:
//
//   * A golden stack names no generic family (no trailing `serif` or
//     `sans-serif`). A generic keyword is an invitation to the host's font
//     set, so a glyph no bundled face covers would silently become whatever
//     that machine has.
//   * Every glyph the fixtures use is covered — Latin by the Plex faces,
//     Arabic by Noto Sans Arabic.
//
// Together those make the suite's output a function of the engine and the
// pinned Chromium, and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** …/packages/core/src/ — the same derivation harness.ts uses. */
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));
const NODE_MODULES = join(SRC_DIR, '..', 'node_modules');

// ─── The bundled families ─────────────────────────────────────────────────────

/** Body serif — stands in for the presets' Georgia and Times New Roman. */
export const GOLDEN_SERIF = 'IBM Plex Serif';
/** Body sans — stands in for their Helvetica Neue and Arial. */
export const GOLDEN_SANS = 'IBM Plex Sans';
/** Code, inline and fenced — stands in for Courier New. */
export const GOLDEN_MONO = 'IBM Plex Mono';
/** Arabic — the RTL fixture's script; none of the Plex faces carry it. */
export const GOLDEN_ARABIC = 'Noto Sans Arabic';

/** The weights the doc CSS actually puts to use: 400 body, 600 for h2/h5/h6
 *  and `th`, 700 for h1/h3/h4 and `strong`. The doc CSS does ask for italic
 *  in places — `em`, `i`, `blockquote`, `h5`, `h6` — but no fixture contains
 *  any of them, so no italic face is bundled. Add one here before writing a
 *  fixture that needs it. */
const WEIGHTS = [400, 600, 700];

/** One fontsource package, and the subset of it the goldens need. */
const BUNDLED: { pkg: string; subset: string }[] = [
  { pkg: '@fontsource/ibm-plex-serif', subset: 'latin' },
  { pkg: '@fontsource/ibm-plex-sans', subset: 'latin' },
  { pkg: '@fontsource/ibm-plex-mono', subset: 'latin' },
  { pkg: '@fontsource/noto-sans-arabic', subset: 'arabic' },
];

/** The families `katex.css` declares, in its own order. `installFonts`
 *  checks this list against the package's stylesheet, so a KaTeX upgrade
 *  that adds or renames a family fails loudly rather than quietly letting a
 *  host fallback back in. */
export const KATEX_FAMILIES = [
  'KaTeX_AMS',
  'KaTeX_Caligraphic',
  'KaTeX_Fraktur',
  'KaTeX_Main',
  'KaTeX_Math',
  'KaTeX_SansSerif',
  'KaTeX_Script',
  'KaTeX_Size1',
  'KaTeX_Size2',
  'KaTeX_Size3',
  'KaTeX_Size4',
  'KaTeX_Typewriter',
];

/** The body stacks a golden document renders in: the bundled family, the
 *  Arabic face for the script the Plex faces lack, then KaTeX's families for
 *  the math markup, and no generic fallback. See the header note for why the
 *  trailing keyword is missing on purpose.
 *
 *  KaTeX's families are in the stack because the pagination sandbox has no
 *  `katex.css` — the app's pipeline does not put one there, and the harness
 *  mirrors that pipeline rather than second-guessing it. So the math spans
 *  carry no family of their own inside the sandbox and inherit this stack;
 *  without the KaTeX faces at the end, ∫, √, π and ∞ resolved against
 *  whatever the host had, and the measured math was a different height on
 *  every machine. */
export const GOLDEN_BODY_STACK = {
  serif: bodyStack(GOLDEN_SERIF),
  sans: bodyStack(GOLDEN_SANS),
} as const;

function bodyStack(body: string): string {
  return [body, GOLDEN_ARABIC, ...KATEX_FAMILIES]
    .map((family) => `"${family}"`)
    .join(', ');
}

/** The code stack. Mono alone: no fixture puts non-Latin text or math in a
 *  fence, and the fixtures must stay ASCII for this to hold. */
export const GOLDEN_CODE_STACK = `"${GOLDEN_MONO}"`;

// ─── What the harness serves ──────────────────────────────────────────────────

/** A face the suite serves, as the harness needs it: what to force-load
 *  before measuring, and which file carries it. */
export interface BundledFace {
  family: string;
  weight: number;
  style: string;
  /** woff2 basename — the name it is served under, and the one Chromium
   *  picks from the sheet's src list. */
  file: string;
}

/** What to force-load before measuring, with no file attached: the shape
 *  both the bundled sheets and `katex.css` reduce to. */
export type FaceSpec = Omit<BundledFace, 'file'>;

/** The CSS font shorthand for a face — `style weight size family`, which is
 *  what `document.fonts.load()` takes. */
export function faceSpecCSS(face: FaceSpec, size = 16): string {
  return `${face.style} ${face.weight} ${size}px "${face.family}"`;
}

export interface BundledFonts {
  /** @font-face text for every face, urls pointed at `origin`'s font route. */
  css: string;
  faces: BundledFace[];
  /** Served name → absolute path on disk, for every file that css names. */
  files: Map<string, string>;
}

const FONT_URL = /url\(\.\/files\/([^)]+)\)/g;
const WOFF2_URL = /url\(\.\/files\/([^)]+\.woff2)\)/;

/**
 * Reads the fontsource sheets the suite needs and rewrites their relative
 * font urls onto `origin`'s font route. Everything else in each sheet — the
 * family name, weight, style, `font-display` — is left exactly as the
 * package wrote it, so the faces are described by their own metadata rather
 * than by a second copy of it kept here.
 */
export async function bundledFonts(origin: string): Promise<BundledFonts> {
  const css: string[] = [];
  const faces: BundledFace[] = [];
  const files = new Map<string, string>();

  for (const { pkg, subset } of BUNDLED) {
    for (const weight of WEIGHTS) {
      const sheetName = `${subset}-${weight}.css`;
      const sheet = await readFile(join(NODE_MODULES, pkg, sheetName), 'utf8');

      const family = /font-family:\s*'([^']+)'/.exec(sheet)?.[1];
      const woff2 = WOFF2_URL.exec(sheet)?.[1];
      if (!family || !woff2) {
        throw new Error(
          `${pkg}/${sheetName}: expected a font-family and a woff2 url — ` +
            'the package layout this module reads has changed.',
        );
      }
      faces.push({ family, weight, style: 'normal', file: woff2 });

      css.push(
        sheet
          .replace(FONT_URL, (_match, name: string) => {
            files.set(name, join(NODE_MODULES, pkg, 'files', name));
            return `url(${origin}/fonts/${name})`;
          })
          .trim(),
      );
    }
  }

  return { css: css.join('\n'), faces, files };
}

/**
 * The faces `katex.css` declares, read out of the stylesheet itself: the
 * load list cannot then drift from the package. Families come back
 * unquoted, since `KaTeX_SansSerif` is quoted in the sheet and the rest are
 * not.
 */
export function katexFaces(css: string): FaceSpec[] {
  const faces: FaceSpec[] = [];
  for (const block of css.match(/@font-face\{[^}]*\}/g) ?? []) {
    const family = /font-family:\s*([^;]+)/
      .exec(block)?.[1]
      ?.replace(/['"]/g, '')
      .trim();
    if (!family) continue;
    const weight = Number(/font-weight:\s*([^;]+)/.exec(block)?.[1]?.trim());
    faces.push({
      family,
      weight: Number.isFinite(weight) ? weight : 400,
      style: /font-style:\s*([^;]+)/.exec(block)?.[1]?.trim() ?? 'normal',
    });
  }
  return faces;
}

/**
 * The KaTeX faces, by served name. `katex.css` asks for them as
 * `url(fonts/KaTeX_…)` — relative to whatever document the stylesheet lands
 * in — so inlined into the golden page at `origin` they resolve to that
 * origin's font route. Nothing rewrites the stylesheet; it only has to be
 * there.
 */
export async function katexFonts(): Promise<Map<string, string>> {
  const dir = join(NODE_MODULES, 'katex', 'dist', 'fonts');
  const names = await readdir(dir);
  return new Map(names.map((name) => [name, join(dir, name)]));
}
