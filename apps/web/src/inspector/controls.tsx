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

/** A field row: label on the left, control on the right. The control names
 *  itself via aria-label; this label is visual. */
export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs font-medium text-ink-soft">
        {label}
      </span>
      {children}
    </div>
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

const inputClass =
  'rounded-control border border-hairline bg-field px-2 py-1 text-xs text-ink transition-colors duration-150 outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50';

/** Small text input. */
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
      className={className ? `${inputClass} ${className}` : inputClass}
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
      // Tabular Numerals Rule).
      className={
        className ? `${inputClass} tabular-nums ${className}` : `${inputClass} tabular-nums`
      }
    />
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Present-but-unselectable entries (e.g. the locked "Custom" page size). */
  disabled?: boolean;
}

/** Compact select. */
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
      className={className ? `${inputClass} ${className}` : inputClass}
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

/** Checkbox with a bound clickable label. */
export function Checkbox({
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
    <span className="flex items-center gap-1.5 py-0.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 cursor-pointer rounded-[4px] accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <label
        htmlFor={id}
        className={`cursor-pointer text-xs ${disabled ? 'text-ink-faint' : 'text-ink'}`}
      >
        {label}
      </label>
    </span>
  );
}

/**
 * The lock glyph on a paid control: inert-but-explaining. Clicking opens the
 *  pricing modal (never a signup wall); the control beside it is disabled so
 *  the gate reads as locked, not broken.
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
      title={`${label} is a paid feature — see plans`}
      className="flex h-6 shrink-0 items-center gap-1 rounded-control px-1.5 text-[11px] font-medium text-ink-faint transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
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
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs font-medium text-ink-soft">
        {label}
      </span>
      <span className="flex items-center gap-2">
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
    <span className="flex flex-col items-end gap-0.5">
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
        <span
          role="alert"
          className="max-w-44 text-right text-[10px] text-danger"
        >
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
 * (custom fonts, custom stylesheet): the lock is gone — the plan includes
 * the feature — and there is nothing to edit here yet.
 */
export function IncludedNote() {
  return (
    <span data-testid="gate-included" className="text-[11px] text-ink-faint">
      Included with your plan
    </span>
  );
}
