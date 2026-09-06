/** Word count for the pane footer: any whitespace run separates words. */
export function countWords(markdown: string): number {
  const matches = markdown.match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Character count as code points, so astral-plane chars count as one. */
export function countCharacters(markdown: string): number {
  return [...markdown].length;
}
