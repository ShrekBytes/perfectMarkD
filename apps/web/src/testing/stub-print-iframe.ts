// jsdom does not implement window.print, and the export flow prints from a
// freshly-created iframe's contentWindow — unreachable for spies after the
// fact. This stub replaces the HTMLIFrameElement contentWindow getter with one
// that hands out fake windows recording their print calls, plus the iframe
// each call saw. jsdom's real getter is captured and restored.
import { vi, type Mock } from 'vitest';

export interface StubbedPrintWindow {
  print: Mock;
  focus: () => void;
}

export interface PrintIframeStub {
  windows: StubbedPrintWindow[];
  /** The iframe present in the document at the moment each print ran. */
  iframesAtPrint: HTMLIFrameElement[];
  restore(): void;
}

export function stubPrintIframes(
  options: { print?: () => void } = {},
): PrintIframeStub {
  const windows: StubbedPrintWindow[] = [];
  const iframesAtPrint: HTMLIFrameElement[] = [];
  const original = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    'contentWindow',
  );
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const win: StubbedPrintWindow = {
        print: vi.fn(() => {
          const iframe = document.querySelector('iframe');
          if (iframe) iframesAtPrint.push(iframe);
          options.print?.();
        }),
        focus: () => {},
      };
      windows.push(win);
      return win;
    },
  });
  return {
    windows,
    iframesAtPrint,
    restore() {
      if (original) {
        Object.defineProperty(
          HTMLIFrameElement.prototype,
          'contentWindow',
          original,
        );
      }
    },
  };
}
