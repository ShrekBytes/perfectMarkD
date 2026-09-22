import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PAGE_SIZES,
  PRESETS,
  SETTINGS_VERSION,
  extractDocStyle,
  validate,
  type DocumentSettings,
  type DocStyle,
} from './settings';

const preset = (key: string): DocStyle => PRESETS[key]!;

const settings = (overrides: Partial<DocumentSettings>): DocumentSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

describe('PAGE_SIZES', () => {
  it('has the five built-in page sizes in px', () => {
    expect(Object.keys(PAGE_SIZES).sort()).toEqual([
      'A3',
      'A4',
      'A5',
      'Legal',
      'Letter',
    ]);
    expect(PAGE_SIZES['A4']).toEqual({ w: 794, h: 1123 });
    expect(PAGE_SIZES['Letter']).toEqual({ w: 816, h: 1056 });
  });
});

describe('PRESETS', () => {
  it('has the seven built-in presets', () => {
    expect(Object.keys(PRESETS)).toEqual([
      'default',
      'minimal',
      'academic',
      'colorful',
      'modern',
      'newspaper',
      'dark',
    ]);
  });

  it('every preset defines the full DocStyle shape', () => {
    const defaultKeys = Object.keys(preset('default'));
    for (const key of Object.keys(PRESETS)) {
      expect(Object.keys(preset(key)), `preset "${key}"`).toEqual(defaultKeys);
    }
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('carries the current settings version', () => {
    expect(SETTINGS_VERSION).toBe(2);
    expect(DEFAULT_SETTINGS.settingsVersion).toBe(2);
  });

  it('adopts the default preset as its style', () => {
    expect(extractDocStyle(DEFAULT_SETTINGS)).toEqual(preset('default'));
  });

  it('keeps the fields the engine needs', () => {
    // Custom page size in mm, outline, header/footer band sizing,
    // banner + background asset refs — all kept by engine-port/02.
    expect(DEFAULT_SETTINGS.customPageWidth).toBe(210);
    expect(DEFAULT_SETTINGS.customPageHeight).toBe(297);
    expect(DEFAULT_SETTINGS.includeOutline).toBe(true);
    expect(DEFAULT_SETTINGS.headerHeight).toBe(0);
    expect(DEFAULT_SETTINGS.footerHeight).toBe(0);
    expect(DEFAULT_SETTINGS.headerImageRef).toBe('');
    expect(DEFAULT_SETTINGS.footerImageRef).toBe('');
    expect(DEFAULT_SETTINGS.backgroundImageRef).toBe('');
    expect(DEFAULT_SETTINGS.backgroundImageOpacity).toBe(1);
    // Custom Stylesheet layer (ai-transforms/01): off and empty for a new
    // document.
    expect(DEFAULT_SETTINGS.customStylesheet).toBe('');
    expect(DEFAULT_SETTINGS.customStylesheetEnabled).toBe(false);
  });

  it('drops previewScale (a UI concern that lives in apps/web)', () => {
    expect('previewScale' in DEFAULT_SETTINGS).toBe(false);
  });
});

describe('validate — clamping', () => {
  it('keeps font sizes positive so text is visible', () => {
    const v = validate(
      settings({ fontSize: 0, headerFontSize: -3, footerFontSize: 0 }),
    );
    expect(v.fontSize).toBe(1);
    expect(v.headerFontSize).toBe(1);
    expect(v.footerFontSize).toBe(1);
  });

  it('keeps margins non-negative (zero = full-bleed)', () => {
    const v = validate(
      settings({
        marginTop: -10,
        marginBottom: -1,
        marginLeft: -0.5,
        marginRight: 25,
      }),
    );
    expect(v.marginTop).toBe(0);
    expect(v.marginBottom).toBe(0);
    expect(v.marginLeft).toBe(0);
    expect(v.marginRight).toBe(25);
  });

  it('gives custom page sizes a printable minimum in mm', () => {
    const v = validate(settings({ customPageWidth: 5, customPageHeight: -20 }));
    expect(v.customPageWidth).toBe(10);
    expect(v.customPageHeight).toBe(10);
  });

  it('starts page numbering at 1', () => {
    expect(validate(settings({ pageNumberStart: 0 })).pageNumberStart).toBe(1);
    expect(validate(settings({ pageNumberStart: 4 })).pageNumberStart).toBe(4);
  });

  it('restores a cleared page-number format', () => {
    expect(validate(settings({ pageNumberFormat: '' })).pageNumberFormat).toBe(
      '{{current}} / {{total}}',
    );
    expect(
      validate(settings({ pageNumberFormat: '   ' })).pageNumberFormat,
    ).toBe('{{current}} / {{total}}');
    expect(
      validate(settings({ pageNumberFormat: 'p. {{current}}' }))
        .pageNumberFormat,
    ).toBe('p. {{current}}');
  });

  it('falls back to the default preset when the saved one is unknown', () => {
    expect(validate(settings({ preset: 'spooky' })).preset).toBe('default');
    expect(validate(settings({ preset: 'dark' })).preset).toBe('dark');
  });

  it('clamps header/footer band heights to non-negative (0 = auto)', () => {
    const v = validate(settings({ headerHeight: -5, footerHeight: 42 }));
    expect(v.headerHeight).toBe(0);
    expect(v.footerHeight).toBe(42);
  });

  it('clamps banner image margins to non-negative', () => {
    const v = validate(
      settings({ headerImageMargin: -1, footerImageMargin: 8 }),
    );
    expect(v.headerImageMargin).toBe(0);
    expect(v.footerImageMargin).toBe(8);
  });

  it('clamps background image opacity into 0–1', () => {
    expect(
      validate(settings({ backgroundImageOpacity: 1.5 }))
        .backgroundImageOpacity,
    ).toBe(1);
    expect(
      validate(settings({ backgroundImageOpacity: -0.2 }))
        .backgroundImageOpacity,
    ).toBe(0);
    expect(
      validate(settings({ backgroundImageOpacity: 0.4 }))
        .backgroundImageOpacity,
    ).toBe(0.4);
  });

  it('fills the Custom Stylesheet fields for a document saved before v2', () => {
    // The pre-v2 shape: the two fields simply don't exist on the persisted
    // object. validate() is the load-time repair — the fields come back
    // filled from the defaults.
    const legacy: Record<string, unknown> = { ...settings({}) };
    delete legacy.customStylesheet;
    delete legacy.customStylesheetEnabled;
    const v = validate(legacy as unknown as DocumentSettings);
    expect(v.customStylesheet).toBe('');
    expect(v.customStylesheetEnabled).toBe(false);
  });

  it('turns the Custom Stylesheet layer off when its CSS is empty', () => {
    expect(
      validate(settings({ customStylesheet: '' })).customStylesheetEnabled,
    ).toBe(false);
    expect(
      validate(settings({ customStylesheet: '   \n  ' }))
        .customStylesheetEnabled,
    ).toBe(false);
    expect(
      validate(
        settings({
          customStylesheet: '.mpdf-doc h2 { color: #123456; }',
          customStylesheetEnabled: true,
        }),
      ).customStylesheetEnabled,
    ).toBe(true);
  });

  it('returns a repaired copy without mutating its input', () => {
    const original = settings({ fontSize: 0, preset: 'spooky' });
    validate(original);
    expect(original.fontSize).toBe(0);
    expect(original.preset).toBe('spooky');
  });

  it('leaves valid settings untouched', () => {
    expect(validate(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});
