// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Header/Footer tab: band show/hide, first-page suppression, text
// + alignment, font size/color, borders, page numbers (position, format
// template, start), and the banner-image gate (live upload per band when the
// entitlement flag is open — billing/04).
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentSettings } from '@perfectmarkd/core';
import {
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
  ToggleRow,
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

const FORMAT_HINT =
  'Example: Page {{current}} of {{total}} — {{title}} is the document name';

/** The per-band rows' differences, table-shaped: settings keys, aria names,
 *  toggle labels, placeholders, and the section title — the two bands render
 *  through one component so the sections cannot drift. The footer's keys and
 *  names are carried verbatim, including the quirks (`footerTextAlignment`,
 *  the "Footer text alignment" aria label, and "Bottom"/"Top border"). */
interface BandConfig {
  title: string;
  showKey: 'showHeader' | 'showFooter';
  showLabel: string;
  firstPageKey: 'showHeaderOnFirstPage' | 'showFooterOnFirstPage';
  firstPageLabel: string;
  textKey: 'headerText' | 'footerText';
  textPlaceholder: string;
  alignKey: 'headerAlignment' | 'footerTextAlignment';
  alignAria: string;
  sizeKey: 'headerFontSize' | 'footerFontSize';
  sizeAria: string;
  colorKey: 'headerFontColor' | 'footerFontColor';
  colorAria: string;
  borderKey: 'showHeaderBorder' | 'showFooterBorder';
  borderLabel: string;
  imageKey: 'headerImageRef' | 'footerImageRef';
}

const HEADER_BAND: BandConfig = {
  title: 'Header',
  showKey: 'showHeader',
  showLabel: 'Show header',
  firstPageKey: 'showHeaderOnFirstPage',
  firstPageLabel: 'Show header on first page',
  textKey: 'headerText',
  textPlaceholder: 'e.g. Quarterly report',
  alignKey: 'headerAlignment',
  alignAria: 'Header alignment',
  sizeKey: 'headerFontSize',
  sizeAria: 'Header font size',
  colorKey: 'headerFontColor',
  colorAria: 'Header font color',
  borderKey: 'showHeaderBorder',
  borderLabel: 'Bottom border',
  imageKey: 'headerImageRef',
};

const FOOTER_BAND: BandConfig = {
  title: 'Footer',
  showKey: 'showFooter',
  showLabel: 'Show footer',
  firstPageKey: 'showFooterOnFirstPage',
  firstPageLabel: 'Show footer on first page',
  textKey: 'footerText',
  textPlaceholder: 'e.g. Acme Inc',
  alignKey: 'footerTextAlignment',
  alignAria: 'Footer text alignment',
  sizeKey: 'footerFontSize',
  sizeAria: 'Footer font size',
  colorKey: 'footerFontColor',
  colorAria: 'Footer font color',
  borderKey: 'showFooterBorder',
  borderLabel: 'Top border',
  imageKey: 'footerImageRef',
};

/** The per-band banner gate: a live picker when the flag is open, the lock
 *  otherwise. One shape for both bands so they can't drift apart. */
function BannerImageField({
  bandLabel,
  imageKey,
  imageRef,
  set,
  onOpenPricing,
  flags,
  addImage,
  disabled,
}: {
  bandLabel: string;
  imageKey: BandConfig['imageKey'];
  imageRef: string;
  set: TabProps['set'];
  onOpenPricing: () => void;
  flags: TabProps['flags'];
  addImage: TabProps['addImage'];
  /** Inert and dimmed when the owning band is switched off. */
  disabled?: boolean;
}) {
  return flags.paidTier ? (
    <Field label="Banner image">
      <GateImagePicker
        ariaLabel={`${bandLabel} banner image`}
        addImage={addImage}
        value={imageRef}
        onRef={(ref) => set({ [imageKey]: ref })}
        onRemove={() => set({ [imageKey]: '' })}
        disabled={disabled}
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

/** One band section — the eight rows every band carries, keyed off its
 *  config; every row but the show/hide toggle is inert while the band is
 *  switched off. */
function BandSection({
  config,
  settings,
  set,
  onOpenPricing,
  flags,
  addImage,
}: {
  config: BandConfig;
  settings: TabProps['settings'];
  set: TabProps['set'];
  onOpenPricing: () => void;
  flags: TabProps['flags'];
  addImage: TabProps['addImage'];
}) {
  const shown = settings[config.showKey];
  return (
    <Section title={config.title}>
      <ToggleRow
        checked={shown}
        onChange={(value) => set({ [config.showKey]: value })}
        label={config.showLabel}
      />
      <ToggleRow
        checked={settings[config.firstPageKey]}
        onChange={(value) => set({ [config.firstPageKey]: value })}
        label={config.firstPageLabel}
        disabled={!shown}
      />
      <Field label="Text">
        <TextInput
          ariaLabel={`${config.title} text`}
          value={settings[config.textKey]}
          onChange={(value) => set({ [config.textKey]: value })}
          placeholder={config.textPlaceholder}
          disabled={!shown}
        />
      </Field>
      <Field label="Alignment">
        <Select<Alignment>
          ariaLabel={config.alignAria}
          value={settings[config.alignKey]}
          options={alignmentOptions}
          onChange={(value) => set({ [config.alignKey]: value })}
          disabled={!shown}
        />
      </Field>
      <Field label="Size (px)">
        <NumberInput
          ariaLabel={config.sizeAria}
          value={settings[config.sizeKey]}
          min={1}
          onChange={(value) => set({ [config.sizeKey]: value })}
          disabled={!shown}
        />
      </Field>
      <Field label="Color">
        <ColorInput
          ariaLabel={config.colorAria}
          value={settings[config.colorKey]}
          onChange={(value) => set({ [config.colorKey]: value })}
          disabled={!shown}
        />
      </Field>
      <ToggleRow
        checked={settings[config.borderKey]}
        onChange={(value) => set({ [config.borderKey]: value })}
        label={config.borderLabel}
        disabled={!shown}
      />
      <BannerImageField
        bandLabel={config.title}
        imageKey={config.imageKey}
        imageRef={settings[config.imageKey]}
        set={set}
        onOpenPricing={onOpenPricing}
        flags={flags}
        addImage={addImage}
        disabled={!shown}
      />
    </Section>
  );
}

export function HeaderFooterTab({
  settings,
  set,
  onOpenPricing,
  flags,
  addImage,
}: TabProps) {
  const bandProps = { settings, set, onOpenPricing, flags, addImage };
  return (
    <>
      <BandSection config={HEADER_BAND} {...bandProps} />
      <BandSection config={FOOTER_BAND} {...bandProps} />

      <Section title="Page numbers">
        <ToggleRow
          checked={settings.showPageNumbers}
          onChange={(showPageNumbers) => set({ showPageNumbers })}
          label="Page numbers"
        />
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
          <span className="flex w-full flex-col items-start gap-0.5">
            <TextInput
              ariaLabel="Page number format"
              value={settings.pageNumberFormat}
              onChange={(pageNumberFormat) => set({ pageNumberFormat })}
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
            disabled={!settings.showPageNumbers}
          />
        </Field>
      </Section>
    </>
  );
}
