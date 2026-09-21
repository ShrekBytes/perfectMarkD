// ─────────────────────────────────────────────────────────────────────────────
// Shared Inspector primitives: section headings, field rows, the small inputs,
// the color picker, the checkbox, the paid-feature lock, the unlocked image
// picker, and the TabProps contract every tab receives. Pure presentation —
// controls report edits upward through `set`, and each input carries its own
// accessible name.
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useRef, useState, type ReactNode } from 'react';
import type { DocumentSettings } from '@perfectmarkd/core';
import { LockIcon, UploadIcon } from '../shell/icons';
import { MAX_ASSET_BYTES } from '../assets/ingest';
import {
  FONT_ACCEPT,
  MAX_FONT_BYTES,
  type FontIngestError,
} from '../fonts/ingest';
import type { AddFontResult } from '../fonts/store';
import type { FontRecord } from '../documents/types';
import type { AddAssetResult } from '../documents/store';
import type { FeatureFlags } from '../auth/flags';

/** What every tab receives: the live settings snapshot, the write-back
 *  channel (a partial settings patch the store merges), the pricing-modal
 *  opener for locked controls, the feature flags deciding which gates are
 *  open (billing/04), and the image ingest for the unlocked upload gates. */
export interface TabProps {
  settings: DocumentSettings;
  set: (patch: Partial<DocumentSettings>) => void;
  onOpenPricing: () => void;
  flags: FeatureFlags;
  addImage: (file: File) => Promise<AddAssetResult>;
}

/** The label column: 112px of right-aligned label. */
const LABEL_COLUMN =
  'w-28 shrink-0 text-right text-xs font-medium text-ink-soft';

/** Where every control's left edge lands: the label column plus its 8px
 *  gutter. Fields and checkboxes share this one axis, which is what makes a
 *  260px-wide column of instruments scannable — the eye reads a single column
 *  of values instead of hopping between two edges of a narrow pane. */
const CONTROL_AXIS = 'ml-[120px]';

/** A field row: a right-aligned label, then the control on the shared axis.
 *  The control names itself via aria-label; this label is visual. */
export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={LABEL_COLUMN}>{label}</span>
      {/* Wraps rather than overflows: at the Inspector's 260px minimum a wide
          control (a pair of numeric inputs, an upload button plus Remove) can
          exceed the column, and a horizontal scrollbar inside a settings pane
          is never the right answer. Wrapped items stay on the axis. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {children}
      </span>
    </div>
  );
}

/** A boolean row: the switch sits on the control axis and the whole row is
 *  the label, so the hit target is the full row and there is exactly one
 *  name for the checkbox. A field row's label lives left of the axis; a
 *  toggle's lives right of it, because a switch reads as "control, then
 *  what it turns on". The visual is a rectangular graphite switch — on is a
 *  graphite fill with a light knob (the system's inversion language), off
 *  is a hairline track — never a pill: the world holds 2px radii and no
 *  circles. Semantics stay a native checkbox (role, keyboard, screen-reader
 *  name all unchanged); only the paint is a switch. */
export function ToggleRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`relative flex items-center gap-2 py-1 ${
        disabled ? '' : 'cursor-pointer'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        /* The control covers the whole row: transparent, but directly
           hittable, so pointer, keyboard, and assistive-tech clicks all
           land on the real checkbox. Focus and paint ride below — the
           track carries the peer ring, both spans are pointer-transparent
           so this input is always the hit target. */
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      {/* The track: 32×16 from the spacing scale, on the shared control
          axis. The row itself is the hit target (py-1 + text clears the
          24px floor), so coarse pointers need no visual lift. */}
      <span
        aria-hidden="true"
        className={`${CONTROL_AXIS} pointer-events-none flex h-4 w-8 shrink-0 items-center rounded-control border px-[2px] transition-colors duration-150 outline-offset-2 outline-accent peer-focus-visible:outline-2 ${
          checked
            ? 'border-accent-strong bg-accent-strong'
            : 'border-hairline-strong bg-field'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        {/* The knob: a 12px square, graphite-faint at rest, light ink when
            on. Travel is the inner width minus knob and insets (14px). The
            slide is a composited transform on the single 150ms curve —
            never layout. */}
        <span
          className={`block size-3 rounded-control transition-transform duration-150 ${
            checked
              ? 'translate-x-3.5 bg-accent-ink'
              : 'translate-x-0 bg-ink-faint'
          }`}
        />
      </span>
      <span
        className={`pointer-events-none min-w-0 text-xs ${disabled ? 'text-ink-faint' : 'text-ink'}`}
      >
        {label}
      </span>
    </label>
  );
}

/** A titled group of fields. h2: the workspace h1 is the wordmark, so the
 *  inspector's section headings start at level 2 (no h1→h3 skip). */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-hairline px-3 py-3 first:border-t-0">
      <h2 className="mb-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A named run of fields inside a Section — one step below the section head
 *  in both weight and case, so a long section can be read in groups without
 *  each group becoming a bordered box. */
export function Subgroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <h3 className="mb-0.5 text-[11px] font-medium text-ink-faint">{title}</h3>
      {children}
    </div>
  );
}

/* One field surface for the panel. Spinner chrome is stripped from the number
 * inputs: 15px of arrows inside a 64px field is what clips a "210" at the
 * pane's floor, and stepping a page size by 1mm is not a real interaction —
 * keyboard arrows still step (type=number keeps that), the arrows were noise. */
const inputClass =
  '[appearance:textfield] min-w-0 rounded-control border border-hairline bg-field px-2 py-1 text-xs text-ink transition-colors duration-150 outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Small text input. Fills the control column: a typed value needs the room
 *  more than the row needs a ragged right edge. */
export function TextInput({
  value,
  onChange,
  className,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} w-full ${className ?? ''}`}
    />
  );
}

/** Settled display value: engine presets carry float noise that lives well
 *  below 1e-6, so capping the display there removes it (0.6499999… → 0.65)
 *  while keeping every value a user can meaningfully type intact — 16.5
 *  stays 16.5 even in an integer-step field. The exact value stays in the
 *  store; only the display is rounded. */
function formatSettled(value: number): string {
  return String(parseFloat(value.toFixed(6)));
}

/** Number input. While focused it holds the user's draft verbatim (so
 *  clearing 25 to type 15 doesn't snap back to 25); every finite draft
 *  reports immediately, clamped to `min` so bad values never reach the
 *  store. Blur drops the draft and shows the settled value at the step's
 *  precision. */
export function NumberInput({
  value,
  onChange,
  min = 0,
  step = 1,
  className,
  ariaLabel,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  // Null = not focused; the input renders the store value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? formatSettled(value) : '');

  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={shown}
      min={min}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = Number(raw);
        if (raw !== '' && Number.isFinite(parsed)) {
          onChange(Math.max(min, parsed));
        }
      }}
      onBlur={() => setDraft(null)}
      // In-place-updating numbers read in mono-grade digits (DESIGN.md,
      // Tabular Numerals Rule). 64px is the width of a measurement, not of the
      // row: a numeric field stays narrow on the axis and the white space
      // belongs to the pane.
      className={`${inputClass} w-16 tabular-nums ${className ?? ''}`}
    />
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Present-but-unselectable entries (e.g. the locked "Custom" page size). */
  disabled?: boolean;
}

/** A select: fills the control column, because the option that is currently
 *  chosen is the longest text in the row and must be readable, not clipped to
 *  the width of the shortest one. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      className={`${inputClass} w-full ${className ?? ''}`}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Expands 3-digit hex and falls back to a neutral for non-hex values
 *  ('transparent'), so the native picker always receives a 6-digit hex. */
function pickerHex(value: string): string {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const expanded = value.replace(
    /^#([\da-f])([\da-f])([\da-f])$/i,
    (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`,
  );
  return /^#[\da-f]{6}$/i.test(expanded) ? expanded : '#000000';
}

/** Color picker + raw-value readout. */
export function ColorInput({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={ariaLabel}
        value={pickerHex(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 w-8 cursor-pointer rounded-control border border-hairline bg-field p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="font-mono text-[11px] text-ink-faint tabular-nums select-none">
        {value}
      </span>
    </span>
  );
}

/**
 * The lock tag on a paid control: a small graphite chip — canvas fill,
 * strong hairline, semibold ink — so the paid feature reads as a real,
 * clickable thing rather than faint helper text. Hover inverts to the
 * graphite fill (the system's selection language) to invite the click that
 * opens the pricing modal (never a signup wall); the control beside it is
 * disabled so the gate reads as locked, not broken. No hue: premium here
 * is weight and border, not color.
 */
export function GateLock({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (paid feature)`}
      title={`${label} needs a paid plan — open plans to compare`}
      className="flex h-6 shrink-0 items-center gap-1 rounded-control border border-hairline-strong bg-canvas px-1.5 text-[11px] font-semibold text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:border-accent-strong hover:bg-accent-strong hover:text-accent-ink focus-visible:outline-2"
    >
      <LockIcon />
      Pro
    </button>
  );
}

/** A disabled fake upload button for locked image gates. */
export function FauxUploadButton({ label = 'Upload…' }: { label?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="faux-upload"
      className="flex h-6 items-center gap-1 rounded-control border border-hairline bg-field px-2 text-[11px] text-ink-faint opacity-50"
    >
      <UploadIcon />
      {label}
    </span>
  );
}

/** A locked field row: the gate's name, a disabled preview of its control,
 *  and the lock. Used for every paid control Phase 1 shows. */
export function LockedRow({
  label,
  control,
  onOpenPricing,
}: {
  label: string;
  /** The disabled preview of the control (fake upload button, dimmed inputs). */
  control: ReactNode;
  onOpenPricing: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={LABEL_COLUMN}>{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {control}
        <GateLock onClick={onOpenPricing} label={label} />
      </span>
    </div>
  );
}

const MB = 1024 * 1024;

const INGEST_ERRORS: Record<
  Extract<AddAssetResult, { ok: false }>['error'],
  string
> = {
  'too-large': `That image is over the ${Math.round(MAX_ASSET_BYTES / MB)} MB limit and was not added.`,
  unsupported:
    'That file is not an image — pick PNG, JPEG, WebP, SVG, or similar.',
  'no-document': 'Open a document before adding images.',
};

const pickerButtonClass =
  'flex h-6 items-center gap-1 rounded-control border border-hairline bg-field px-2 text-[11px] text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2 disabled:cursor-default disabled:opacity-50';

/**
 * An unlocked image gate's picker (billing/04): pick an image, store it as a
 * local asset of the active document, and report the `asset://` ref upward —
 * the engine renders the rest. A set image can be replaced or removed; ingest
 * failures surface inline (the same messages the editor's paste path shows).
 */
export function GateImagePicker({
  ariaLabel,
  addImage,
  onRef,
  value,
  onRemove,
  disabled,
}: {
  ariaLabel: string;
  addImage: (file: File) => Promise<AddAssetResult>;
  /** Receives the new asset ref after a successful ingest. */
  onRef: (ref: string) => void;
  /** The current image ref; '' (or any falsy) means none is set. */
  value: string;
  onRemove: () => void;
  /** Inert and dimmed (e.g. when the owning band is switched off). */
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    setBusy(true);
    void addImage(file)
      .then((result) => {
        if (result.ok) onRef(result.ref);
        else setError(INGEST_ERRORS[result.error]);
      })
      .finally(() => setBusy(false));
  };

  return (
    <span className="flex w-full flex-col items-start gap-0.5">
      <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
          className={pickerButtonClass}
        >
          <UploadIcon />
          {value ? 'Replace…' : 'Upload…'}
        </button>
        {value && (
          <button
            type="button"
            aria-label={`Remove ${ariaLabel}`}
            disabled={disabled}
            onClick={onRemove}
            className="h-6 rounded-control px-1.5 text-[11px] text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-danger focus-visible:outline-2"
          >
            Remove
          </button>
        )}
      </span>
      {error && (
        <span role="alert" className="max-w-44 text-left text-xs text-danger">
          {error}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear so picking the same file again fires change.
          event.target.value = '';
          if (file) handleFile(file);
        }}
      />
    </span>
  );
}

/**
 * The unlocked state for gates whose real control billing/05 still builds
 * (custom stylesheet): the lock is gone — the plan includes the feature —
 * and there is nothing to edit here yet.
 */
export function IncludedNote() {
  return (
    <span data-testid="gate-included" className="text-[11px] text-ink-faint">
      Included with your plan
    </span>
  );
}

const FONT_ERRORS: Record<FontIngestError, string> = {
  'too-large': `That font is over the ${Math.round(MAX_FONT_BYTES / MB)} MB limit and was not added.`,
  unsupported: 'That file is not a font — pick TTF, OTF, WOFF, or WOFF2.',
  invalid: 'That file could not be read as a font and was not added.',
};

/**
 * The unlocked font gate (billing/05): pick a font file, store it in the
 * user's font library, and it joins every font picker as a selectable
 * family — the FontFace API registers it on the spot, so the preview
 * renders with no server round-trip. The library lists under the upload
 * button with a remove per entry; ingest failures surface inline (the same
 * pattern the image pickers use).
 */
export function GateFontPicker({
  ariaLabel,
  addFont,
  fonts,
  onRemove,
}: {
  ariaLabel: string;
  addFont: (file: File) => Promise<AddFontResult>;
  fonts: FontRecord[];
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    setBusy(true);
    void addFont(file)
      .then((result) => {
        if (!result.ok) setError(FONT_ERRORS[result.error]);
      })
      .finally(() => setBusy(false));
  };

  return (
    <span className="flex w-full flex-col items-start gap-0.5">
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={pickerButtonClass}
      >
        <UploadIcon />
        Upload font…
      </button>
      {error && (
        <span role="alert" className="max-w-44 text-left text-xs text-danger">
          {error}
        </span>
      )}
      {fonts.length > 0 && (
        <ul
          aria-label="Uploaded fonts"
          className="flex w-full flex-col items-stretch gap-0.5"
        >
          {fonts.map((font) => (
            <li
              key={font.id}
              className="flex min-w-0 items-center gap-1 text-[11px] text-ink"
            >
              <span className="min-w-0 truncate" title={font.family}>
                {font.family}
              </span>
              <button
                type="button"
                aria-label={`Remove font ${font.family}`}
                onClick={() => onRemove(font.id)}
                className="shrink-0 rounded-control px-1.5 py-0.5 text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-danger focus-visible:outline-2"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={FONT_ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear so picking the same file again fires change.
          event.target.value = '';
          if (file) handleFile(file);
        }}
      />
    </span>
  );
}
