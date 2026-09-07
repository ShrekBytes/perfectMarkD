import { describe, expect, it } from 'vitest';
import { applyOrientation, applyPreset } from './settings-edit';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  type DocumentSettings,
} from '@perfectmarkd/core';

describe('applyPreset', () => {
  it('adopts the preset DocStyle and marks it selected', () => {
    const next = applyPreset(DEFAULT_SETTINGS, 'dark');
    expect(next.preset).toBe('dark');
    expect(next.bodyColor).toBe(PRESETS.dark!.bodyColor);
    expect(next.fontFamily).toBe(PRESETS.dark!.fontFamily);
    expect(next.codeTheme).toBe(PRESETS.dark!.codeTheme);
  });

  it('keeps non-style settings untouched', () => {
    const base: DocumentSettings = {
      ...DEFAULT_SETTINGS,
      pageSize: 'Legal',
      headerText: 'My header',
      showPageNumbers: false,
      frameEnabled: true,
      customPageWidth: 148,
      customPageHeight: 210,
    };
    const next = applyPreset(base, 'academic');
    // A preset is a look, not a document layout.
    expect(next.pageSize).toBe('Legal');
    expect(next.headerText).toBe('My header');
    expect(next.showPageNumbers).toBe(false);
    expect(next.frameEnabled).toBe(true);
    expect(next.customPageWidth).toBe(148);
    expect(next.customPageHeight).toBe(210);
  });

  it('returns the input unchanged for an unknown preset key', () => {
    expect(applyPreset(DEFAULT_SETTINGS, 'spooky')).toBe(DEFAULT_SETTINGS);
  });

  it('replaces per-user tweaks of a previous preset', () => {
    const tweaked: DocumentSettings = {
      ...DEFAULT_SETTINGS,
      fontSize: 20,
      accentColor: '#ff0055',
    };
    const next = applyPreset(tweaked, 'default');
    expect(next.fontSize).toBe(PRESETS.default!.fontSize);
    expect(next.accentColor).toBe(PRESETS.default!.accentColor);
  });
});

describe('applyOrientation', () => {
  it('swaps the custom page dimensions when turning', () => {
    const custom: DocumentSettings = {
      ...DEFAULT_SETTINGS,
      pageSize: 'Custom',
      customPageWidth: 420,
      customPageHeight: 594,
    };
    const landscape = applyOrientation(custom, 'landscape');
    expect(landscape.orientation).toBe('landscape');
    expect(landscape.customPageWidth).toBe(594);
    expect(landscape.customPageHeight).toBe(420);
  });

  it('is a no-op when the orientation already matches', () => {
    const same = applyOrientation(DEFAULT_SETTINGS, 'portrait');
    expect(same).toBe(DEFAULT_SETTINGS);
  });
});
