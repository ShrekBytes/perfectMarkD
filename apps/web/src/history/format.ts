// ─────────────────────────────────────────────────────────────────────────────
// Display helpers for the Export History modal (server/05). Kept apart from
// the api module so formatting rules stay testable in isolation — same split
// as billing's api.ts / payment.ts. (The list's date column renders through
// the shared formatDate in documents/text.ts.)
// ─────────────────────────────────────────────────────────────────────────────

/** Human-sized bytes for the modal's size column. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const round = (value: number): number =>
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  if (bytes < 1024 * 1024) return `${round(bytes / 1024)} KB`;
  return `${round(bytes / (1024 * 1024))} MB`;
}
