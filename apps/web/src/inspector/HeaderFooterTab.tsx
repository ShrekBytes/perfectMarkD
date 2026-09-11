// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Header/Footer tab: band show/hide, first-page suppression, text
// + alignment, font size/color, borders, page numbers (position, format
// template, start), and the banner-image gate (live upload per band when the
// entitlement flag is open — billing/04).
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentSettings } from '@perfectmarkd/core';
import {
  Checkbox,
  ColorInput,
  Field,
  FauxUploadButton,
  GateImagePicker,
  LockedRow,
  NumberInput,
  Section,
  Select,
  type TabProps,
  TextInput,
} from './controls';

type Alignment = 'left' | 'center' | 'right';

const alignmentOptions: { value: Alignment; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const pageNumberPositionOptions: {
  value: DocumentSettings['pageNumberPosition'];
  label: string;
}[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const FORMAT_HINT = 'Use {{current}}, {{total}}, {{title}}';

/** The per-band banner gate: a live picker when the flag is open, the lock
 *  otherwise. One shape for both bands so they can't drift apart. */
function BannerImageField({
  band,
  bandLabel,
  imageRef,
  set,
  onOpenPricing,
  flags,
  addImage,
}: {
  band: 'header' | 'footer';
  bandLabel: string;
  imageRef: string;
  set: TabProps['set'];
  onOpenPricing: () => void;
  flags: TabProps['flags'];
  addImage: TabProps['addImage'];
}) {
  const refKey = `${band}ImageRef` as const;
  return flags.bannerImages ? (
    <Field label="Banner image">
      <GateImagePicker
        ariaLabel={`${bandLabel} banner image`}
        addImage={addImage}
        value={imageRef}
        onRef={(ref) => set({ [refKey]: ref })}
        onRemove={() => set({ [refKey]: '' })}
      />
    </Field>
  ) : (
    <LockedRow
      label="Banner image"
      onOpenPricing={onOpenPricing}
      control={<FauxUploadButton label="Upload…" />}
    />
  );
}

export function HeaderFooterTab({
  settings,
  set,
  onOpenPricing,
  flags,
  addImage,
}: TabProps) {
  return (
    <>
      <Section title="Header">
        <Field label="Show">
          <Checkbox
            checked={settings.showHeader}
            onChange={(showHeader) => set({ showHeader })}
            label="Show header"
          />
        </Field>
        <Field label="First page">
          <Checkbox
            checked={settings.showHeaderOnFirstPage}
            onChange={(showHeaderOnFirstPage) => set({ showHeaderOnFirstPage })}
            label="Show header on first page"
          />
        </Field>
        <Field label="Text">
          <TextInput
            ariaLabel="Header text"
            value={settings.headerText}
            onChange={(headerText) => set({ headerText })}
            placeholder="Header text"
            className="w-40"
          />
        </Field>
        <Field label="Alignment">
          <Select<Alignment>
            ariaLabel="Header alignment"
            value={settings.headerAlignment}
            options={alignmentOptions}
            onChange={(headerAlignment) => set({ headerAlignment })}
          />
        </Field>
        <Field label="Font size (px)">
          <NumberInput
            ariaLabel="Header font size"
            value={settings.headerFontSize}
            min={1}
            onChange={(headerFontSize) => set({ headerFontSize })}
            className="w-16"
          />
        </Field>
        <Field label="Color">
          <ColorInput
            ariaLabel="Header font color"
            value={settings.headerFontColor}
            onChange={(headerFontColor) => set({ headerFontColor })}
          />
        </Field>
        <Field label="Border">
          <Checkbox
            checked={settings.showHeaderBorder}
            onChange={(showHeaderBorder) => set({ showHeaderBorder })}
            label="Bottom border"
          />
        </Field>
        <BannerImageField
          band="header"
          bandLabel="Header"
          imageRef={settings.headerImageRef}
          set={set}
          onOpenPricing={onOpenPricing}
          flags={flags}
          addImage={addImage}
        />
      </Section>

      <Section title="Footer">
        <Field label="Show">
          <Checkbox
            checked={settings.showFooter}
            onChange={(showFooter) => set({ showFooter })}
            label="Show footer"
          />
        </Field>
        <Field label="First page">
          <Checkbox
            checked={settings.showFooterOnFirstPage}
            onChange={(showFooterOnFirstPage) => set({ showFooterOnFirstPage })}
            label="Show footer on first page"
          />
        </Field>
        <Field label="Text">
          <TextInput
            ariaLabel="Footer text"
            value={settings.footerText}
            onChange={(footerText) => set({ footerText })}
            placeholder="Footer text"
            className="w-40"
          />
        </Field>
        <Field label="Alignment">
          <Select<Alignment>
            ariaLabel="Footer text alignment"
            value={settings.footerTextAlignment}
            options={alignmentOptions}
            onChange={(footerTextAlignment) => set({ footerTextAlignment })}
          />
        </Field>
        <Field label="Font size (px)">
          <NumberInput
            ariaLabel="Footer font size"
            value={settings.footerFontSize}
            min={1}
            onChange={(footerFontSize) => set({ footerFontSize })}
            className="w-16"
          />
        </Field>
        <Field label="Color">
          <ColorInput
            ariaLabel="Footer font color"
            value={settings.footerFontColor}
            onChange={(footerFontColor) => set({ footerFontColor })}
          />
        </Field>
        <Field label="Border">
          <Checkbox
            checked={settings.showFooterBorder}
            onChange={(showFooterBorder) => set({ showFooterBorder })}
            label="Top border"
          />
        </Field>
        <BannerImageField
          band="footer"
          bandLabel="Footer"
          imageRef={settings.footerImageRef}
          set={set}
          onOpenPricing={onOpenPricing}
          flags={flags}
          addImage={addImage}
        />
      </Section>

      <Section title="Page numbers">
        <Field label="Show">
          <Checkbox
            checked={settings.showPageNumbers}
            onChange={(showPageNumbers) => set({ showPageNumbers })}
            label="Page numbers"
          />
        </Field>
        <Field label="Position">
          <Select<DocumentSettings['pageNumberPosition']>
            ariaLabel="Page number position"
            value={settings.pageNumberPosition}
            options={pageNumberPositionOptions}
            onChange={(pageNumberPosition) => set({ pageNumberPosition })}
            disabled={!settings.showPageNumbers}
          />
        </Field>
        <Field label="Format">
          <span className="flex flex-col items-end gap-0.5">
            <TextInput
              ariaLabel="Page number format"
              value={settings.pageNumberFormat}
              onChange={(pageNumberFormat) => set({ pageNumberFormat })}
              className="w-40"
            />
            <span className="text-[10px] text-ink-faint">{FORMAT_HINT}</span>
          </span>
        </Field>
        <Field label="Start at">
          <NumberInput
            ariaLabel="Page number start"
            value={settings.pageNumberStart}
            min={1}
            onChange={(pageNumberStart) => set({ pageNumberStart })}
            className="w-16"
            disabled={!settings.showPageNumbers}
          />
        </Field>
      </Section>
    </>
  );
}
