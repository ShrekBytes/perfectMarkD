// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Style tab: preset gallery (visual thumbnails), typography,
// colors, and the code-font group (Shiki theme catalog + ligatures).
// ─────────────────────────────────────────────────────────────────────────────

import { CODE_THEMES, PRESETS } from '@perfectmarkd/core';
import { applyPreset } from './settings-edit';
import { PresetThumb } from './PresetThumb';
import { BODY_FONTS, CODE_FONTS } from './fonts';
import {
  ColorInput,
  Field,
  FauxUploadButton,
  IncludedNote,
  LockedRow,
  NumberInput,
  Section,
  Select,
  Subgroup,
  type TabProps,
  ToggleRow,
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

/** The gallery tile's sketch footprint: 3:4 like the page, small enough that
 *  a 4-across grid of presets is one glance instead of a scroll. */
const TILE_THUMB = { width: 60, height: 80 };

export function StyleTab({ settings, set, onOpenPricing, flags }: TabProps) {
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
            value={settings.fontFamily}
            options={bodyFontOptions}
            onChange={(fontFamily) => set({ fontFamily })}
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
            value={settings.codeFontFamily}
            options={codeFontOptions}
            onChange={(codeFontFamily) => set({ codeFontFamily })}
          />
        </Field>
        <ToggleRow
          checked={settings.codeFontLigatures}
          onChange={(codeFontLigatures) => set({ codeFontLigatures })}
          label="Font ligatures"
        />
      </Section>

      <Section title="Custom (Pro)">
        {/* The real gated UIs (font upload + stylesheet textarea) are
            billing/05; until then the unlocked state says what the plan
            includes instead of showing a lock a paying user can't act on. */}
        {flags.customFonts ? (
          <Field label="Custom fonts">
            <IncludedNote />
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
