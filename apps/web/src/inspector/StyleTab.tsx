// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Style tab: preset gallery (visual thumbnails), typography,
// colors, and the code-font group (Shiki theme catalog + ligatures).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { CODE_THEMES, PRESETS } from '@perfectmarkd/core';
import { applyPreset, customFontValue, fontChange } from './settings-edit';
import { PresetThumb } from './PresetThumb';
import { BODY_FONTS, CODE_FONTS } from './fonts';
import { useCustomFontStore } from '../fonts/store';
import {
  ColorInput,
  Field,
  FauxUploadButton,
  GateFontPicker,
  IncludedNote,
  LockedRow,
  NumberInput,
  Section,
  Select,
  Subgroup,
  type SelectOption,
  type TabProps,
  ToggleRow,
} from './controls';

/** The options for one font picker: the bundled catalog plus the uploaded
 *  library (locked behind the gate the way the Custom page size is — a
 *  persisted custom choice renders disabled, never blank). */
function fontOptionsWithCustom(
  bundled: { value: string; label: string }[],
  uploaded: { family: string }[],
  active: { isCustom: boolean; name: string },
  gateOpen: boolean,
): SelectOption<string>[] {
  const options: SelectOption<string>[] = bundled.map((font) => ({
    value: font.value,
    label: font.label,
  }));
  for (const font of uploaded) {
    options.push({
      value: customFontValue(font.family),
      label: `Custom — ${font.family}`,
      disabled: !gateOpen,
    });
  }
  // A settings object can name a family the library no longer has (the font
  // was removed, or the gate closed before the library loaded): render it
  // disabled rather than a select that lost its selection.
  if (active.isCustom && !uploaded.some((f) => f.family === active.name)) {
    options.push({
      value: customFontValue(active.name),
      label: `Custom — ${active.name || 'font'}`,
      disabled: true,
    });
  }
  return options;
}

const bodyFontOptions = BODY_FONTS.map((font) => ({
  value: font.css,
  label: `${font.group} — ${font.label}`,
}));
const codeFontOptions = CODE_FONTS.map((font) => ({
  value: font.css,
  label: font.label,
}));
const codeThemeOptions = CODE_THEMES.map((theme) => ({
  value: theme,
  label: theme === 'none' ? 'None (plain code)' : theme,
}));

/** The gallery tile's sketch footprint: 3:4 like the page, small enough that
 *  a 4-across grid of presets is one glance instead of a scroll. */
const TILE_THUMB = { width: 60, height: 80 };

export function StyleTab({ settings, set, onOpenPricing, flags }: TabProps) {
  const fonts = useCustomFontStore((state) => state.fonts);
  const loadFonts = useCustomFontStore((state) => state.load);
  const addFont = useCustomFontStore((state) => state.add);
  const removeFont = useCustomFontStore((state) => state.remove);

  // The library lives in IndexedDB; one read on first mount fills the
  // pickers. Repeated calls are safe (the store guards nothing else).
  useEffect(() => {
    void loadFonts();
  }, [loadFonts]);

  // Trimmed to match the fallback option's synthesis (and the ingest-time
  // sanitization): the select value must never differ from the option values
  // by invisible whitespace.
  const bodyFontValue =
    settings.fontFamily === '__custom__'
      ? customFontValue(settings.customFontName.trim())
      : settings.fontFamily;
  const codeFontValue =
    settings.codeFontFamily === '__custom__'
      ? customFontValue(settings.customCodeFontName.trim())
      : settings.codeFontFamily;

  return (
    <>
      <Section title="Preset">
        {/* auto-fill: the pane is resizable (260px floor), so the grid decides
            its own column count from the room it has — 4 across at the default
            width, 3 at the minimum — instead of leaving a lone preset stranded
            on the last row. */}
        <div
          role="radiogroup"
          aria-label="Preset"
          data-testid="preset-gallery"
          className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5"
        >
          {Object.entries(PRESETS).map(([key, style]) => {
            const active = settings.preset === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                title={style.name}
                onClick={() => set(applyPreset(settings, key))}
                className={`flex flex-col items-center gap-1 rounded-pane border p-1 transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                  active
                    ? 'border-ink bg-canvas'
                    : 'border-hairline hover:border-hairline-strong'
                }`}
              >
                <PresetThumb style={style} {...TILE_THUMB} />
                <span
                  className={`truncate text-[11px] ${active ? 'font-medium text-ink' : 'text-ink-soft'}`}
                >
                  {style.name}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Typography">
        <Field label="Font">
          <Select
            ariaLabel="Body font"
            value={bodyFontValue}
            options={fontOptionsWithCustom(
              bodyFontOptions,
              fonts,
              {
                isCustom: settings.fontFamily === '__custom__',
                name: settings.customFontName.trim(),
              },
              flags.customFonts,
            )}
            onChange={(value) =>
              set(fontChange(value, 'fontFamily', 'customFontName'))
            }
          />
        </Field>
        <Field label="Size (px)">
          <NumberInput
            ariaLabel="Body font size"
            value={settings.fontSize}
            min={1}
            onChange={(fontSize) => set({ fontSize })}
          />
        </Field>
        <Field label="Line height">
          <NumberInput
            ariaLabel="Line height"
            value={settings.lineHeight}
            min={1}
            step={0.05}
            onChange={(lineHeight) => set({ lineHeight })}
          />
        </Field>
        <Field label="Paragraph spacing">
          <NumberInput
            ariaLabel="Paragraph spacing"
            value={settings.paragraphSpacing}
            step={0.05}
            onChange={(paragraphSpacing) => set({ paragraphSpacing })}
          />
        </Field>
        <Field label="Heading scale">
          <NumberInput
            ariaLabel="Heading scale"
            value={settings.headingScale}
            step={0.05}
            onChange={(headingScale) => set({ headingScale })}
          />
        </Field>
      </Section>

      <Section title="Colors">
        {/* Two subgroups, not nine siblings: the text colors and the block
            surfaces are different decisions, and nine identical rows force the
            eye to read every label to find the one it wants. */}
        <Subgroup title="Text">
          <Field label="Accent">
            <ColorInput
              ariaLabel="Accent color"
              value={settings.accentColor}
              onChange={(accentColor) => set({ accentColor })}
            />
          </Field>
          <Field label="Body text">
            <ColorInput
              ariaLabel="Body text color"
              value={settings.bodyColor}
              onChange={(bodyColor) => set({ bodyColor })}
            />
          </Field>
          <Field label="Bold text">
            <ColorInput
              ariaLabel="Bold text color"
              value={settings.boldColor}
              onChange={(boldColor) => set({ boldColor })}
            />
          </Field>
          <Field label="Headings">
            <ColorInput
              ariaLabel="Heading color"
              value={settings.headingColor}
              onChange={(headingColor) => set({ headingColor })}
            />
          </Field>
        </Subgroup>
        <Subgroup title="Blocks & tables">
          <Field label="Quote background">
            <ColorInput
              ariaLabel="Blockquote background"
              value={
                settings.blockquoteBg === 'transparent'
                  ? '#f8f8f8'
                  : settings.blockquoteBg
              }
              onChange={(blockquoteBg) => set({ blockquoteBg })}
            />
          </Field>
          <Field label="Quote border">
            <ColorInput
              ariaLabel="Blockquote border color"
              value={settings.blockquoteBorderColor}
              onChange={(blockquoteBorderColor) =>
                set({ blockquoteBorderColor })
              }
            />
          </Field>
          <Field label="Code background">
            <ColorInput
              ariaLabel="Code background"
              value={settings.codeBackground}
              onChange={(codeBackground) => set({ codeBackground })}
            />
          </Field>
          <Field label="Table header">
            <ColorInput
              ariaLabel="Table header background"
              value={settings.tableHeaderBg}
              onChange={(tableHeaderBg) => set({ tableHeaderBg })}
            />
          </Field>
          <ToggleRow
            checked={settings.tableStriped}
            onChange={(tableStriped) => set({ tableStriped })}
            label="Striped table rows"
          />
        </Subgroup>
      </Section>

      <Section title="Code blocks">
        <Field label="Theme">
          <Select
            ariaLabel="Code theme"
            value={settings.codeTheme}
            options={codeThemeOptions}
            onChange={(codeTheme) => set({ codeTheme })}
          />
        </Field>
        <Field label="Code font">
          <Select
            ariaLabel="Code font"
            value={codeFontValue}
            options={fontOptionsWithCustom(
              codeFontOptions,
              fonts,
              {
                isCustom: settings.codeFontFamily === '__custom__',
                name: settings.customCodeFontName.trim(),
              },
              flags.customFonts,
            )}
            onChange={(value) =>
              set(fontChange(value, 'codeFontFamily', 'customCodeFontName'))
            }
          />
        </Field>
        <ToggleRow
          checked={settings.codeFontLigatures}
          onChange={(codeFontLigatures) => set({ codeFontLigatures })}
          label="Font ligatures"
        />
      </Section>

      <Section title="Custom (Pro)">
        {/* The custom-stylesheet UI is ai-transforms/01's ticket (the engine
            field + Stylesheet Inspector tab live there); until then the
            unlocked state says what the plan includes instead of showing a
            lock a paying user can't act on. Custom fonts (billing/05) are
            live: the library uploads here, the pickers above list it. */}
        {flags.customFonts ? (
          <Field label="Custom fonts">
            <GateFontPicker
              ariaLabel="Upload custom font"
              addFont={addFont}
              fonts={fonts}
              onRemove={(id) => void removeFont(id)}
            />
          </Field>
        ) : (
          <LockedRow
            label="Custom fonts"
            onOpenPricing={onOpenPricing}
            control={<FauxUploadButton label="Upload…" />}
          />
        )}
        {flags.customStylesheet ? (
          <Field label="Custom stylesheet">
            <IncludedNote />
          </Field>
        ) : (
          <LockedRow
            label="Custom stylesheet"
            onOpenPricing={onOpenPricing}
            control={<FauxUploadButton label="Upload…" />}
          />
        )}
      </Section>
    </>
  );
}
