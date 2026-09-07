// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Style tab: preset gallery (visual thumbnails), typography,
// colors, and the code-font group (Shiki theme catalog + ligatures).
// ─────────────────────────────────────────────────────────────────────────────

import { CODE_THEMES, PRESETS } from '@perfectmarkd/core';
import { applyPreset } from './settings-edit';
import { PresetThumb } from './PresetThumb';
import { BODY_FONTS, CODE_FONTS } from './fonts';
import {
  Checkbox,
  ColorInput,
  FauxUploadButton,
  Field,
  LockedRow,
  NumberInput,
  Section,
  Select,
  type TabProps,
} from './controls';

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

export function StyleTab({ settings, set, onOpenPricing }: TabProps) {
  return (
    <>
      <Section title="Preset">
        <div
          role="radiogroup"
          aria-label="Style preset"
          data-testid="preset-gallery"
          className="grid grid-cols-3 gap-2"
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
                className={`flex flex-col items-center gap-1.5 rounded-pane border p-2 transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                  active
                    ? 'border-accent bg-accent-soft'
                    : 'border-hairline hover:border-hairline-strong'
                }`}
              >
                <PresetThumb style={style} />
                <span
                  className={`text-[11px] ${active ? 'font-medium text-ink' : 'text-ink-soft'}`}
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
            value={settings.fontFamily}
            options={bodyFontOptions}
            onChange={(fontFamily) => set({ fontFamily })}
            className="w-40"
          />
        </Field>
        <Field label="Size (px)">
          <NumberInput
            ariaLabel="Body font size"
            value={settings.fontSize}
            min={1}
            onChange={(fontSize) => set({ fontSize })}
            className="w-16"
          />
        </Field>
        <Field label="Line height">
          <NumberInput
            ariaLabel="Line height"
            value={settings.lineHeight}
            min={1}
            step={0.05}
            onChange={(lineHeight) => set({ lineHeight })}
            className="w-16"
          />
        </Field>
        <Field label="Paragraph spacing (em)">
          <NumberInput
            ariaLabel="Paragraph spacing"
            value={settings.paragraphSpacing}
            step={0.05}
            onChange={(paragraphSpacing) => set({ paragraphSpacing })}
            className="w-16"
          />
        </Field>
        <Field label="Heading scale">
          <NumberInput
            ariaLabel="Heading scale"
            value={settings.headingScale}
            step={0.05}
            onChange={(headingScale) => set({ headingScale })}
            className="w-16"
          />
        </Field>
      </Section>

      <Section title="Colors">
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
        <Field label="Quote bar">
          <ColorInput
            ariaLabel="Blockquote border color"
            value={settings.blockquoteBorderColor}
            onChange={(blockquoteBorderColor) => set({ blockquoteBorderColor })}
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
        <Field label="Striped tables">
          <Checkbox
            checked={settings.tableStriped}
            onChange={(tableStriped) => set({ tableStriped })}
            label="Striped table rows"
          />
        </Field>
      </Section>

      <Section title="Code blocks">
        <Field label="Theme">
          <Select
            ariaLabel="Code theme"
            value={settings.codeTheme}
            options={codeThemeOptions}
            onChange={(codeTheme) => set({ codeTheme })}
            className="w-40"
          />
        </Field>
        <Field label="Code font">
          <Select
            ariaLabel="Code font"
            value={settings.codeFontFamily}
            options={codeFontOptions}
            onChange={(codeFontFamily) => set({ codeFontFamily })}
            className="w-40"
          />
        </Field>
        <Field label="Ligatures">
          <Checkbox
            checked={settings.codeFontLigatures}
            onChange={(codeFontLigatures) => set({ codeFontLigatures })}
            label="Font ligatures"
          />
        </Field>
      </Section>

      <Section title="Custom (Pro)">
        <LockedRow
          label="Custom fonts"
          onOpenPricing={onOpenPricing}
          control={<FauxUploadButton label="Upload…" />}
        />
        <LockedRow
          label="Custom stylesheet"
          onOpenPricing={onOpenPricing}
          control={<FauxUploadButton label="Upload…" />}
        />
      </Section>
    </>
  );
}
