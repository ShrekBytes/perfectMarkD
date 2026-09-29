import type { ReactNode } from 'react';

interface AccountSectionProps {
  /** Wires the section to its heading — one per page, so the IDs are stable. */
  headingId: string;
  /** The section's own heading text. */
  heading: string;
  children: ReactNode;
}

/**
 * The Account page's section shell: the contained pane, its heading, and the
 * label wiring between them. One implementation so the page's cards cannot
 * drift apart in padding or heading level — the page reads as a column of
 * equal panes, and it only does that while they are equal.
 *
 * Contents are the section's own: this is the shell, not a card with slots.
 */
export function AccountSection({
  headingId,
  heading,
  children,
}: AccountSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-pane border border-hairline bg-surface p-4 sm:p-5"
    >
      <h2
        id={headingId}
        className="text-base font-semibold tracking-tight text-ink"
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}
