// ─────────────────────────────────────────────────────────────────────────────
// Date and period formatting for the AI surfaces (ai-transforms/05). The
// account block reports instants and a UTC `YYYY-MM` period; these turn them
// into the words the popup and the Account page show, once, so the two agree.
// ─────────────────────────────────────────────────────────────────────────────

/** The calendar day an ISO instant falls on, `YYYY-MM-DD`. */
export function resetDate(iso: string): string {
  return iso.slice(0, 10);
}

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
