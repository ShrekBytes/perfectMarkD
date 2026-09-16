// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Page tab: size (custom unlocked by the entitlement flags,
// billing/04), orientation, margins, frame, and the background-image gate —
// upload + fit/scope/opacity go live when the flag is open.
// ─────────────────────────────────────────────────────────────────────────────

import { PAGE_SIZES, type DocumentSettings } from '@perfectmarkd/core';
import { applyOrientation } from './settings-edit';
import {
  ColorInput,
  Field,
  FauxUploadButton,
  GateImagePicker,
  LockedRow,
  NumberInput,
  Section,
  Select,
  type SelectOption,
  type TabProps,
  ToggleRow,
} from './controls';

type PageSize = DocumentSettings['pageSize'];
type Orientation = DocumentSettings['orientation'];
type FrameStyle = DocumentSettings['frameStyle'];

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

export function PageTab({
  settings,
  set,
  onOpenPricing,
  flags,
  addImage,
}: TabProps) {
  // The Custom entry only appears where it can act: when the gate is open,
  // or when a persisted Custom document must not render a blank select.
  // When the gate is closed it is absent — the locked "Custom size" row
  // below is the single gate, not a dead option in the list.
  const pageSizeOptions: SelectOption<PageSize>[] = [
    ...Object.keys(PAGE_SIZES).map((size) => ({
      value: size as PageSize,
      label: size,
    })),
    ...(flags.customPageSize || settings.pageSize === 'Custom'
      ? [
          {
            value: 'Custom' as PageSize,
            label: 'Custom…',
            disabled: !flags.customPageSize,
          },
        ]
      : []),
  ];

  return (
    <>
      <Section title="Size">
        <Field label="Page size">
          <Select<PageSize>
            ariaLabel="Page size"
            value={settings.pageSize}
            options={pageSizeOptions}
            onChange={(pageSize) => set({ pageSize })}
          />
        </Field>
        {flags.customPageSize ? (
          <Field label="Custom size (mm)">
            {/* The pair fills the control column and shrinks with it: two
                56px inputs plus the separator do not fit the column at the
                pane's 260px minimum, and the value they hold is short. */}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <NumberInput
                ariaLabel="Custom width"
                value={settings.customPageWidth}
                onChange={(customPageWidth) => set({ customPageWidth })}
                className="w-auto min-w-0 flex-1"
              />
              <span className="shrink-0 text-[11px] text-ink-faint">×</span>
              <NumberInput
                ariaLabel="Custom height"
                value={settings.customPageHeight}
                onChange={(customPageHeight) => set({ customPageHeight })}
                className="w-auto min-w-0 flex-1"
              />
            </span>
          </Field>
        ) : (
          <LockedRow
            label="Custom size"
            onOpenPricing={onOpenPricing}
            control={
              <span
                aria-hidden="true"
                className="flex min-w-0 flex-1 items-center gap-2 opacity-50"
              >
                <NumberInput
                  ariaLabel="Custom width"
                  value={settings.customPageWidth}
                  onChange={() => {}}
                  className="w-auto min-w-0 flex-1"
                  disabled
                />
                <span className="shrink-0 text-[11px] text-ink-faint">×</span>
                <NumberInput
                  ariaLabel="Custom height"
                  value={settings.customPageHeight}
                  onChange={() => {}}
                  className="w-auto min-w-0 flex-1"
                  disabled
                />
              </span>
            }
          />
        )}
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
          />
        </Field>
        <Field label="Bottom">
          <NumberInput
            ariaLabel="Bottom margin"
            value={settings.marginBottom}
            onChange={(marginBottom) => set({ marginBottom })}
          />
        </Field>
        <Field label="Left">
          <NumberInput
            ariaLabel="Left margin"
            value={settings.marginLeft}
            onChange={(marginLeft) => set({ marginLeft })}
          />
        </Field>
        <Field label="Right">
          <NumberInput
            ariaLabel="Right margin"
            value={settings.marginRight}
            onChange={(marginRight) => set({ marginRight })}
          />
        </Field>
      </Section>

      <Section title="Frame">
        <ToggleRow
          checked={settings.frameEnabled}
          onChange={(frameEnabled) => set({ frameEnabled })}
          label="Page frame"
        />
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
            disabled={!settings.frameEnabled}
          />
        </Field>
        <Field label="Margin (px)">
          <NumberInput
            ariaLabel="Frame margin"
            value={settings.frameMargin}
            onChange={(frameMargin) => set({ frameMargin })}
            disabled={!settings.frameEnabled}
          />
        </Field>
      </Section>

      <Section title="Background image">
        {flags.backgroundImage ? (
          <Field label="Background image">
            <GateImagePicker
              ariaLabel="Background image"
              addImage={addImage}
              value={settings.backgroundImageRef}
              onRef={(ref) =>
                set({ backgroundImageRef: ref, backgroundImageEnabled: true })
              }
              onRemove={() =>
                set({ backgroundImageRef: '', backgroundImageEnabled: false })
              }
            />
          </Field>
        ) : (
          <LockedRow
            label="Background image"
            onOpenPricing={onOpenPricing}
            control={<FauxUploadButton />}
          />
        )}
        {/* Sub-controls ride the same gate: previews while locked (billing/05
            needs no further UI here), live with the flag open. */}
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
            onChange={(backgroundImageSize) => set({ backgroundImageSize })}
            disabled={!flags.backgroundImage}
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
            onChange={(backgroundImageScope) => set({ backgroundImageScope })}
            disabled={!flags.backgroundImage}
          />
        </Field>
        <Field label="Opacity (%)">
          <NumberInput
            ariaLabel="Background image opacity"
            value={Math.round(settings.backgroundImageOpacity * 100)}
            min={0}
            onChange={(percent) =>
              set({ backgroundImageOpacity: Math.min(100, percent) / 100 })
            }
            disabled={!flags.backgroundImage}
          />
        </Field>
      </Section>
    </>
  );
}
