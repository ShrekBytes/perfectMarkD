// ─────────────────────────────────────────────────────────────────────────────
// Display helpers for the Export History modal (server/05). Kept apart from
// the api module so formatting rules stay testable in isolation — same split
// as billing's api.ts / payment.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** The modal's date column: the ISO date part, like the Orders list. */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Human-sized bytes for the modal's size column. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const round = (value: number): number =>
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  if (bytes < 1024 * 1024) return `${round(bytes / 1024)} KB`;
  return `${round(bytes / (1024 * 1024))} MB`;
}
