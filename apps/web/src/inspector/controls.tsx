// ─────────────────────────────────────────────────────────────────────────────
// Shared Inspector primitives: section headings, field rows, the small inputs,
// the color picker, the checkbox, the paid-feature lock, and the TabProps
// contract every tab receives. Pure presentation — controls report edits
// upward through `set`, and each input carries its own accessible name.
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useState, type ReactNode } from 'react';
import type { DocumentSettings } from '@perfectmarkd/core';
import { LockIcon, UploadIcon } from '../shell/icons';

/** What every tab receives: the live settings snapshot, the write-back
 *  channel (a partial settings patch the store merges), and the pricing-modal
 *  opener for locked controls. */
export interface TabProps {
  settings: DocumentSettings;
  set: (patch: Partial<DocumentSettings>) => void;
  onOpenPricing: () => void;
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

/** A titled group of fields. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-hairline px-3 py-3 first:border-t-0">
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

const inputClass =
  'rounded-control border border-hairline bg-page px-2 py-1 text-xs text-ink transition-colors duration-150 outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50';

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

/** Number input. While focused it holds the user's draft verbatim (so
 *  clearing 25 to type 15 doesn't snap back to 25); every finite draft
 *  reports immediately, clamped to `min` so bad values never reach the
 *  store. Blur drops the draft and shows the settled value. */
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
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '');

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
      className={className ? `${inputClass} ${className}` : inputClass}
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
        className="h-6 w-8 cursor-pointer rounded-control border border-hairline bg-page p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
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
 * The 🔒 on a paid control: inert-but-explaining. Clicking opens the pricing
 *  modal (never a signup wall); the control beside it is disabled so the gate
 *  reads as locked, not broken.
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
      className="flex h-6 items-center gap-1 rounded-control border border-hairline bg-page px-2 text-[11px] text-ink-faint opacity-50"
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
