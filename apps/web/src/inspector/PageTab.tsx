// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Page tab: size (locked Custom), orientation, margins, frame,
// and the locked background-image controls.
// ─────────────────────────────────────────────────────────────────────────────

import { PAGE_SIZES, type DocumentSettings } from '@perfectmarkd/core';
import { applyOrientation } from './settings-edit';
import {
  Checkbox,
  ColorInput,
  Field,
  FauxUploadButton,
  LockedRow,
  NumberInput,
  Section,
  Select,
  type SelectOption,
  type TabProps,
} from './controls';

type PageSize = DocumentSettings['pageSize'];
type Orientation = DocumentSettings['orientation'];
type FrameStyle = DocumentSettings['frameStyle'];

const PAGE_SIZE_OPTIONS: SelectOption<PageSize>[] = [
  ...Object.keys(PAGE_SIZES).map((size) => ({
    value: size as PageSize,
    label: size,
  })),
  { value: 'Custom', label: 'Custom…', disabled: true },
];

const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'double', label: 'Double' },
  { value: 'groove', label: 'Groove' },
  { value: 'ridge', label: 'Ridge' },
];

const orientationOptions: { value: Orientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

export function PageTab({ settings, set, onOpenPricing }: TabProps) {
  return (
    <>
      <Section title="Size">
        <Field label="Page size">
          <Select<PageSize>
            ariaLabel="Page size"
            value={settings.pageSize}
            options={PAGE_SIZE_OPTIONS}
            onChange={(pageSize) => set({ pageSize })}
          />
        </Field>
        <LockedRow
          label="Custom size"
          onOpenPricing={onOpenPricing}
          control={
            <span
              aria-hidden="true"
              className="flex items-center gap-1 opacity-50"
            >
              <NumberInput
                ariaLabel="Custom width"
                value={settings.customPageWidth}
                onChange={() => {}}
                className="w-14"
                disabled
              />
              <span className="text-[11px] text-ink-faint">×</span>
              <NumberInput
                ariaLabel="Custom height"
                value={settings.customPageHeight}
                onChange={() => {}}
                className="w-14"
                disabled
              />
            </span>
          }
        />
        <Field label="Orientation">
          <Select<Orientation>
            ariaLabel="Orientation"
            value={settings.orientation}
            options={orientationOptions}
            onChange={(orientation) =>
              set(applyOrientation(settings, orientation))
            }
          />
        </Field>
      </Section>

      <Section title="Margins (mm)">
        <Field label="Top">
          <NumberInput
            ariaLabel="Top margin"
            value={settings.marginTop}
            onChange={(marginTop) => set({ marginTop })}
            className="w-16"
          />
        </Field>
        <Field label="Bottom">
          <NumberInput
            ariaLabel="Bottom margin"
            value={settings.marginBottom}
            onChange={(marginBottom) => set({ marginBottom })}
            className="w-16"
          />
        </Field>
        <Field label="Left">
          <NumberInput
            ariaLabel="Left margin"
            value={settings.marginLeft}
            onChange={(marginLeft) => set({ marginLeft })}
            className="w-16"
          />
        </Field>
        <Field label="Right">
          <NumberInput
            ariaLabel="Right margin"
            value={settings.marginRight}
            onChange={(marginRight) => set({ marginRight })}
            className="w-16"
          />
        </Field>
      </Section>

      <Section title="Frame">
        <Field label="Enable">
          <Checkbox
            checked={settings.frameEnabled}
            onChange={(frameEnabled) => set({ frameEnabled })}
            label="Page frame"
          />
        </Field>
        <Field label="Style">
          <Select<FrameStyle>
            ariaLabel="Frame style"
            value={settings.frameStyle}
            options={FRAME_STYLES}
            onChange={(frameStyle) => set({ frameStyle })}
            disabled={!settings.frameEnabled}
          />
        </Field>
        <Field label="Color">
          <ColorInput
            ariaLabel="Frame color"
            value={settings.frameColor}
            onChange={(frameColor) => set({ frameColor })}
            disabled={!settings.frameEnabled}
          />
        </Field>
        <Field label="Thickness (px)">
          <NumberInput
            ariaLabel="Frame thickness"
            value={settings.frameThickness}
            min={1}
            onChange={(frameThickness) => set({ frameThickness })}
            className="w-16"
            disabled={!settings.frameEnabled}
          />
        </Field>
        <Field label="Margin (px)">
          <NumberInput
            ariaLabel="Frame margin"
            value={settings.frameMargin}
            onChange={(frameMargin) => set({ frameMargin })}
            className="w-16"
            disabled={!settings.frameEnabled}
          />
        </Field>
      </Section>

      <Section title="Background image">
        <LockedRow
          label="Background image"
          onOpenPricing={onOpenPricing}
          control={<FauxUploadButton />}
        />
        {/* Sub-controls exist (billing/05 unlocks them with the gate) but
            stay disabled until then; the single lock above covers the gate. */}
        <Field label="Fit">
          <Select<DocumentSettings['backgroundImageSize']>
            ariaLabel="Background image fit"
            value={settings.backgroundImageSize}
            options={[
              { value: 'cover', label: 'Cover' },
              { value: 'contain', label: 'Contain' },
              { value: 'fill', label: 'Fill' },
              { value: 'tile', label: 'Tile' },
            ]}
            onChange={() => onOpenPricing()}
            disabled
          />
        </Field>
        <Field label="Scope">
          <Select<DocumentSettings['backgroundImageScope']>
            ariaLabel="Background image scope"
            value={settings.backgroundImageScope}
            options={[
              { value: 'full-page', label: 'Full page' },
              { value: 'content-only', label: 'Content only' },
            ]}
            onChange={() => onOpenPricing()}
            disabled
          />
        </Field>
        <Field label="Opacity (%)">
          <NumberInput
            ariaLabel="Background image opacity"
            value={Math.round(settings.backgroundImageOpacity * 100)}
            min={0}
            onChange={() => onOpenPricing()}
            className="w-16"
            disabled
          />
        </Field>
      </Section>
    </>
  );
}
