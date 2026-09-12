import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';
import { thumbFootprint } from './thumb';

const settingsWith = (over: Partial<DocumentSettings>): DocumentSettings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});

describe('thumbFootprint', () => {
  it('draws A4 portrait at drawer-row scale', () => {
    // 1123/794 at 28px wide → 40px tall.
    expect(thumbFootprint(settingsWith({ pageSize: 'A4' }))).toEqual({
      width: 28,
      height: 40,
    });
  });

  it('follows the document’s own paper size', () => {
    // Legal portrait: 1344/816 at 28px wide → 46px tall.
    expect(thumbFootprint(settingsWith({ pageSize: 'Legal' }))).toEqual({
      width: 28,
      height: 46,
    });
  });

  it('swaps the aspect for landscape documents', () => {
    // Legal landscape: 816/1344 at 28px wide → 17px tall.
    expect(
      thumbFootprint(
        settingsWith({ pageSize: 'Legal', orientation: 'landscape' }),
      ),
    ).toEqual({ width: 28, height: 17 });
  });

  it('derives custom sizes from their mm dimensions', () => {
    // 100×200mm ≈ 378×756px at 96dpi → 28px wide, ~56px tall.
    expect(
      thumbFootprint(
        settingsWith({
          pageSize: 'Custom',
          customPageWidth: 100,
          customPageHeight: 200,
        }),
      ),
    ).toEqual({ width: 28, height: 56 });
  });
});
