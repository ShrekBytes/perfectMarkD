// ─────────────────────────────────────────────────────────────────────────────
// The visual thumbnails: tiny page previews drawn with plain CSS from a
// DocStyle — deliberately NOT an engine run. Each thumb sketches the
// furniture the style dresses: a heading bar, two body lines, a quote block,
// and a code strip, all colored by the document's own values — never the
// chrome palette, so a dark-styled document reads as a dark sheet on a light
// desk.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocStyle } from '@perfectmarkd/core';

/** Base sketch footprint (A4's aspect); instances scale it to size. */
const BASE_WIDTH = 84;
const BASE_HEIGHT = 112;

interface PresetThumbProps {
  style: DocStyle;
  /** Footprint in px; defaults to the gallery's 84×112. */
  width?: number;
  height?: number;
}

/** One document's look as a CSS sketch. The sketch is drawn once at the base
 *  footprint and scaled to the requested one, so the Library rows and the
 *  preset gallery share a single drawing at any size. */
export function PresetThumb({
  style,
  width = BASE_WIDTH,
  height = BASE_HEIGHT,
}: PresetThumbProps) {
  return (
    <div
      aria-hidden="true"
      className="shrink-0 overflow-hidden rounded-[3px] border border-hairline-strong"
      style={{
        width,
        height,
        background: style.pageBackground,
        fontFamily: style.fontFamily,
      }}
    >
      <div
        className="flex flex-col gap-1.5 px-2 py-2"
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${width / BASE_WIDTH}, ${height / BASE_HEIGHT})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          className="h-2.5 w-3/4 rounded-[2px]"
          style={{
            background: style.headingColor,
            borderBottom: style.h1BorderBottom
              ? `2px solid ${style.accentColor}`
              : undefined,
            marginInline: style.centerH1 ? 'auto' : undefined,
          }}
        />
        <div
          className="h-1 w-full rounded-[2px]"
          style={{ background: style.bodyColor, opacity: 0.55 }}
        />
        <div
          className="h-1 w-5/6 rounded-[2px]"
          style={{ background: style.bodyColor, opacity: 0.4 }}
        />
        <div
          className="h-3.5 w-full rounded-r-[2px]"
          style={{
            background:
              style.blockquoteBg === 'transparent'
                ? 'transparent'
                : style.blockquoteBg,
            borderInlineStart: `3px solid ${style.blockquoteBorderColor}`,
          }}
        />
        <div
          className="h-4 w-full rounded-[2px]"
          style={{ background: style.codeBackground }}
        />
        <div
          className="mt-auto h-1 w-1/3 self-end rounded-[2px]"
          style={{ background: style.accentColor }}
        />
      </div>
    </div>
  );
}
