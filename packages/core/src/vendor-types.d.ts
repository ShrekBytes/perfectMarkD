// Ambient typings for the third-party modules used by render.ts that ship
// without their own type declarations.

declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it';

  const footnote: (md: MarkdownIt) => void;
  export default footnote;
}

declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it';

  export interface MarkdownItTaskListsOptions {
    /** Render checkboxes as disabled (static, print-safe). */
    enabled?: boolean;
    /** Wrap item text in a <label> element. */
    label?: boolean;
  }

  const taskLists: (
    md: MarkdownIt,
    options?: MarkdownItTaskListsOptions,
  ) => void;
  export default taskLists;
}

declare module 'katex/contrib/auto-render' {
  export interface AutoRenderDelimiter {
    left: string;
    right: string;
    display: boolean;
  }

  export interface AutoRenderOptions {
    delimiters?: AutoRenderDelimiter[];
    /** Lower-cased tag names whose subtrees are never scanned for math. */
    ignoredTags?: string[];
    ignoredClasses?: string[];
    throwOnError?: boolean;
    strict?: boolean | 'ignore' | 'warn' | 'error';
    errorCallback?: (message: string, error: Error) => void;
    macros?: Record<string, string>;
  }

  export function renderMathInElement(
    element: HTMLElement,
    options?: AutoRenderOptions,
  ): void;
  export default renderMathInElement;
}
