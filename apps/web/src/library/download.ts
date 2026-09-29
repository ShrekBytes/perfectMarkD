// ─────────────────────────────────────────────────────────────────────────────
// Browser download side effect, kept out of the store so tests can mock it.
// ─────────────────────────────────────────────────────────────────────────────

/** Saves a blob under the given filename via an object-URL anchor click. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** The name a PDF download saves under: the title as given, plus the ".pdf"
 *  the browser needs unless the name already carries it. */
export function pdfFileName(fileName: string): string {
  return fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
}

export function downloadMarkdown(fileName: string, markdown: string): void {
  downloadBlob(
    fileName,
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  );
}
