// ─────────────────────────────────────────────────────────────────────────────
// Period formatting for the AI surfaces (ai-transforms/05): the account block
// reports a UTC `YYYY-MM` period, and this turns it into the words the popup
// and the Account page show, once, so the two agree. (The reset date renders
// through the shared formatDate in documents/text.ts.)
// ─────────────────────────────────────────────────────────────────────────────

/** The AI Allowance period as a month: `2026-09` → `September 2026`. */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-');
  const first = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return first.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
