// ─────────────────────────────────────────────────────────────────────────────
// The one banner-strip pattern: every full-width notice under the top bar is
// an instance of this component. Slots: wrapping copy, a filled primary
// action, a ghost secondary action (danger-styled where the copy warns of
// loss), and an icon dismiss. An instance fills the slots it needs — the
// conflict strip has no dismiss, the welcome strip has no secondary.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { Link } from '../router';
import { CloseIcon } from './icons';

/** Resting height 40px (min-h-10); copy wraps instead of truncating, so the
 *  strip grows rather than hiding consequences at narrow widths. */
const stripClasses =
  'flex min-h-10 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-3 py-1.5 text-sm text-ink';

/** The 28px action ladder shared by every strip control. `touch-target` lifts
 *  the hit area to the 44px floor under coarse pointers; the strip's own
 *  min-height grows to hold the taller controls. */
const primaryClasses =
  'touch-target flex h-7 shrink-0 items-center rounded-control bg-accent-strong px-2.5 text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2';
const ghostClasses =
  'touch-target flex h-7 shrink-0 items-center rounded-control border border-hairline px-2.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';
const dangerClasses =
  'touch-target flex h-7 shrink-0 items-center rounded-control border border-danger/40 px-2.5 text-sm text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2';

interface BannerButtonProps {
  variant: 'primary' | 'ghost' | 'danger';
  onClick?: () => void;
  /** Renders as the app's router link (the plan-ended strip's "See plans"). */
  to?: string;
  testid?: string;
  children: ReactNode;
}

/** A strip action: the 28px filled primary, ghost secondary, or danger
 *  ghost, rendered as a button — or as a router link when `to` is set. */
export function BannerButton({
  variant,
  onClick,
  to,
  testid,
  children,
}: BannerButtonProps) {
  const className =
    variant === 'primary'
      ? primaryClasses
      : variant === 'ghost'
        ? ghostClasses
        : dangerClasses;
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}

/** The dismiss slot: the icon close needs both the handler and its accessible
 *  label. The union makes offering one without the other a compile error,
 *  so no runtime guard is needed. */
type DismissProps =
  | { onDismiss: () => void; dismissLabel: string }
  | { onDismiss?: undefined; dismissLabel?: undefined };

type BannerStripProps = {
  /** Frozen per instance (stale-banner / plan-ended-banner / welcome-strip). */
  testid: string;
  /** alert for notices the writer must act on, status for FYI notices. */
  role: 'alert' | 'status';
  copy: ReactNode;
  /** Slot content between the copy and the dismiss: BannerButtons. */
  children?: ReactNode;
} & DismissProps;

export function BannerStrip({
  testid,
  role,
  copy,
  children,
  onDismiss,
  dismissLabel,
}: BannerStripProps) {
  return (
    <div role={role} data-testid={testid} className={stripClasses}>
      <p className="min-w-0">{copy}</p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {children}
        {onDismiss && (
          <button
            type="button"
            aria-label={dismissLabel}
            title="Dismiss"
            onClick={onDismiss}
            className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}
