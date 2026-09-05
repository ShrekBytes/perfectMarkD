// ─────────────────────────────────────────────────────────────────────────────
// Browser download side effect, kept out of the store so tests can mock it.
// ─────────────────────────────────────────────────────────────────────────────

export function downloadMarkdown(fileName: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
