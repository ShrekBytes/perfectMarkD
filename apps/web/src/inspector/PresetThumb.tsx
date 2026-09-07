// ─────────────────────────────────────────────────────────────────────────────
// The preset gallery's visual thumbnails: tiny page previews drawn with plain
// CSS from each preset's DocStyle — deliberately NOT an engine run. Each thumb
// sketches the furniture the preset styles: a heading bar, two body lines, a
// quote block, and a code strip, all colored by the preset's own values.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocStyle } from '@perfectmarkd/core';

/** One preset's look as a CSS sketch (84×112px, A4's aspect). */
export function PresetThumb({ style }: { style: DocStyle }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-28 w-[5.25rem] flex-col gap-1.5 overflow-hidden rounded-[3px] border border-hairline-strong px-2 py-2"
      style={{
        background: style.pageBackground,
        fontFamily: style.fontFamily,
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
  );
}
