// @vitest-environment jsdom
// jsdom for the pipeline's DOM run, sessionStorage, and the print iframe.
import '@testing-library/jest-dom/vitest';
import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, putAssets, putFont } from '../documents/db';
import { closeAfterSettle } from '../testing/test-assets';
import { stubIndexedDB } from '../testing/stub-idb';
import { stubPrintIframes } from '../testing/stub-print-iframe';
import {
  buildExportDocument,
  hasShownPrintHint,
  markPrintHintShown,
  printQualityBrowser,
  printViaHiddenIframe,
  setPrintLoadTimeoutForTests,
} from './clientExport';

const settings = (
  overrides: Partial<DocumentSettings> = {},
): DocumentSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

let db: Awaited<ReturnType<typeof openDatabase>> | null = null;

beforeEach(async () => {
  stubIndexedDB();
  sessionStorage.clear();
  // jsdom never parses srcdoc; without this every print waits the full 5 s.
  setPrintLoadTimeoutForTests(10);
  db = await openDatabase();
});

afterEach(async () => {
  if (db) await closeAfterSettle(db);
  db = null;
  setPrintLoadTimeoutForTests(5000);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildExportDocument', () => {
  it('builds the standalone print document from the document state', async () => {
    const html = await buildExportDocument(
      '# Hello\n\nWorld paragraph.',
      settings({ headerText: 'Hi', footerText: 'Bye' }),
      'My essay',
    );

    expect(html).toContain('<title>My essay</title>');
    expect(html).toContain('@page { size: 794px 1123px; margin: 0; }');
    expect(html).toContain('print-color-adjust: exact;');
    expect(html).toContain('class="mpdf-export-page"');
    expect(html).toContain('<h1 id="hello">Hello</h1>');
    // Header/footer text bands ride the shared layout builder.
    expect(html).toContain('>Hi</span>');
    expect(html).toContain('>Bye</span>');
    // Math stylesheet inlined (the export iframe is its own document).
    expect(html).toContain('.katex');
  });

  it('embeds markdown images as data URIs and leaves no asset refs', async () => {
    await putAssets(db!, [
      {
        id: 'a1',
        bytes: new Uint8Array([137, 80, 78, 71]),
        mediaType: 'image/png',
        createdAt: 0,
      },
    ]);

    const html = await buildExportDocument(
      '![photo](asset://a1)',
      settings(),
      'With image',
    );

    expect(html).toContain('data:image/png;base64,iVBORw==');
    expect(html).not.toContain('asset://');
  });

  it('drops a markdown image whose asset is missing from the store', async () => {
    const html = await buildExportDocument(
      '![ghost](asset://ghost)',
      settings(),
      'Ghosted',
    );

    expect(html).not.toContain('<img');
  });

  it('embeds the custom fonts as @font-face data URIs (billing/05)', async () => {
    await putFont(db!, {
      id: 'f1',
      family: 'Inter',
      bytes: new TextEncoder().encode('woff2-bytes'),
      mediaType: 'font/woff2',
      createdAt: 1,
    });
    const html = await buildExportDocument(
      '# Hello',
      settings({ fontFamily: '__custom__', customFontName: 'Inter' }),
      'Fonts',
    );

    expect(html).toContain('@font-face');
    expect(html).toContain('font-family: "Inter"');
    expect(html).toMatch(
      /url\("data:font\/woff2;base64,[^"]+"\) format\("woff2"\)/,
    );
  });

  it('carries the pipeline RTL decision into the print document', async () => {
    const html = await buildExportDocument('مرحبا بالعالم', settings(), 'RTL');

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('direction: rtl;');
  });
});

describe('print via hidden iframe', () => {
  it('prints the document in a hidden iframe and removes it', async () => {
    const stub = stubPrintIframes();
    try {
      const html =
        '<html><body><p class="mpdf-export-page">x</p></body></html>';
      await printViaHiddenIframe(html);

      expect(stub.windows).toHaveLength(1);
      expect(stub.windows[0]!.print).toHaveBeenCalledTimes(1);
      // The print saw a hidden, assistive-tech-flagged iframe carrying the
      // export document (plus the parse sentinel, display:none).
      const iframe = stub.iframesAtPrint[0]!;
      expect(iframe).toBeDefined();
      expect(iframe).toHaveAttribute('aria-hidden', 'true');
      expect(iframe.getAttribute('srcdoc')).toContain('mpdf-export-page');
      expect(iframe.getAttribute('srcdoc')).toContain('data-pm-print-ready');
      // The frame is gone afterwards: no app-adjacent leftovers.
      expect(document.querySelector('iframe')).toBeNull();
    } finally {
      stub.restore();
    }
  });

  it('removes the iframe and surfaces the error when print fails', async () => {
    const stub = stubPrintIframes({
      print: () => {
        throw new Error('no printer');
      },
    });
    try {
      await expect(printViaHiddenIframe('<p>x</p>')).rejects.toThrow(
        'no printer',
      );
      expect(document.querySelector('iframe')).toBeNull();
      expect(stub.iframesAtPrint).toHaveLength(1);
    } finally {
      stub.restore();
    }
  });
});

describe('print quality browser detection', () => {
  it('flags Firefox and Safari, passes Chrome-family through', () => {
    const withUA = (ua: string) => {
      vi.stubGlobal('navigator', { userAgent: ua } as unknown as Navigator);
      return printQualityBrowser();
    };

    expect(
      withUA(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      ),
    ).toBe('firefox');
    expect(
      withUA(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBe('safari');
    expect(
      withUA(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBeNull();
    expect(
      withUA(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      ),
    ).toBeNull();
    // jsdom's own UA carries none of the markers.
    expect(printQualityBrowser()).toBeNull();
  });
});

describe('one-time print hint flag', () => {
  it('starts unset and persists once marked for the session', () => {
    expect(hasShownPrintHint()).toBe(false);
    markPrintHintShown();
    expect(hasShownPrintHint()).toBe(true);
  });
});
