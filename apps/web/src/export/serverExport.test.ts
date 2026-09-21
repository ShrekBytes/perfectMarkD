// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { openDatabase, putAssets, putFont } from '../documents/db';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';
import { downloadBlob } from '../library/download';
import * as serverExport from './serverExport';
import {
  buildServerExportPayload,
  downloadExportPdf,
  isUpgradePrompt,
  queueServerExport,
  ServerExportError,
  setPollTimingForTests,
  waitForExportJob,
} from './serverExport';

vi.mock('../library/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();
  setPollTimingForTests(1, 200);
  vi.mocked(downloadBlob).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setPollTimingForTests(1000, 10 * 60 * 1000);
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function queuedJob(id = 'job-1'): { job: Record<string, unknown> } {
  return {
    job: {
      id,
      status: 'queued',
      plan: 'pro',
      pages: null,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-09-12T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    },
  };
}

describe('buildServerExportPayload', () => {
  it('carries the document, the client page count, and no assets when none are used', async () => {
    const payload = await buildServerExportPayload({
      title: 'Report',
      markdown: '# Hello',
      settings: useDocumentStore.getState().settings,
    });

    expect(payload.title).toBe('Report');
    expect(payload.markdown).toBe('# Hello');
    expect(payload.pageCount).toBe(1); // jsdom: every section is one page
    expect(payload.assets).toEqual({});
  });

  it('resolves the banner/background asset refs to data: URIs', async () => {
    // Seed the asset the settings reference, exactly as an upload would.
    const db = await (await import('../documents/db')).openDatabase();
    const bytes = new TextEncoder().encode('png-bytes');
    await putAssets(db, [
      { id: 'banner1', bytes, mediaType: 'image/png', createdAt: 1 },
    ]);
    db.close();

    const settings = {
      ...useDocumentStore.getState().settings,
      headerImageRef: 'asset://banner1',
      backgroundImageRef: 'asset://missing', // unresolvable refs drop out
    };
    const payload = await buildServerExportPayload({
      title: 'Report',
      markdown: '# Hello',
      settings,
    });

    // The markdown image path rides the same map (collectAssetRefs covers
    // banner, background, and inline markdown images).
    expect(Object.keys(payload.assets)).toEqual(['asset://banner1']);
    expect(payload.assets['asset://banner1']).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it('embeds the settings custom fonts as data: URIs (billing/05)', async () => {
    const db = await openDatabase();
    await putFont(db, {
      id: 'f1',
      family: 'Inter',
      bytes: new TextEncoder().encode('woff2-bytes'),
      mediaType: 'font/woff2',
      createdAt: 1,
    });
    db.close();

    const payload = await buildServerExportPayload({
      title: 'Report',
      markdown: '# Hello',
      settings: {
        ...useDocumentStore.getState().settings,
        fontFamily: '__custom__',
        customFontName: 'Inter',
        codeFontFamily: '__custom__',
        customCodeFontName: 'Inter', // same family: one entry, not two
      },
    });

    expect(Object.keys(payload.fonts)).toEqual(['Inter']);
    expect(payload.fonts['Inter']).toMatch(/^data:font\/woff2;base64,/);
  });

  it('carries no fonts when no custom family is in use', async () => {
    const payload = await buildServerExportPayload({
      title: 'Report',
      markdown: '# Hello',
      settings: useDocumentStore.getState().settings,
    });
    expect(payload.fonts).toEqual({});
  });
});

describe('Server Export payload fonts contract', () => {
  it('a custom-font document serializes to the route with its fonts (billing/05)', async () => {
    // Client and server share field names, not code; this pins the wire
    // shape the enqueue route validates (payload.ts parseExportPayload).
    const payload = await buildServerExportPayload({
      title: 'Report',
      markdown: '# Hello',
      settings: {
        ...useDocumentStore.getState().settings,
        fontFamily: '__custom__',
        customFontName: 'Inter',
      },
    });
    expect(Object.keys(payload)).toEqual([
      'title',
      'markdown',
      'settings',
      'pageCount',
      'assets',
      'fonts',
    ]);
    expect(typeof payload.fonts).toBe('object');
  });
});

describe('queueServerExport', () => {
  it('returns the queued job from a 202', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(queuedJob(), 202));
    vi.stubGlobal('fetch', fetchMock);

    const job = await queueServerExport({
      title: 'T',
      markdown: 'md',
      settings: useDocumentStore.getState().settings,
      pageCount: 1,
      assets: {},
      fonts: {},
    });

    expect(job.id).toBe('job-1');
    expect(job.status).toBe('queued');
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/export');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body)).pageCount).toBe(1);
  });

  it('over-quota rejections carry the typed code and the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'You have used all of this period’s Server Exports.',
            code: 'quota_exceeded',
          },
          402,
        ),
      ),
    );

    const error = await queueServerExport({
      title: 'T',
      markdown: 'md',
      settings: useDocumentStore.getState().settings,
      pageCount: 1,
      assets: {},
      fonts: {},
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(402);
    expect((error as ApiError).code).toBe('quota_exceeded');
    expect(isUpgradePrompt(error)).toBe(true);
  });

  it('marks entitlement_required as an upgrade prompt too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Server Export needs an active paid plan.',
            code: 'entitlement_required',
          },
          403,
        ),
      ),
    );

    const error = await queueServerExport({
      title: 'T',
      markdown: 'md',
      settings: useDocumentStore.getState().settings,
      pageCount: 1,
      assets: {},
      fonts: {},
    }).catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('entitlement_required');
    expect(isUpgradePrompt(error)).toBe(true);
    expect(isUpgradePrompt(new Error('nope'))).toBe(false);
  });

  it('a dead network is a typed network error, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const error = await queueServerExport({
      title: 'T',
      markdown: 'md',
      settings: useDocumentStore.getState().settings,
      pageCount: 1,
      assets: {},
      fonts: {},
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServerExportError);
    expect((error as ServerExportError).code).toBe('network');
  });
});

describe('waitForExportJob', () => {
  it('polls until the job is done', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(queuedJob()))
      .mockResolvedValueOnce(
        jsonResponse({
          job: { ...queuedJob().job, status: 'running', startedAt: 'x' },
        }),
      )
      .mockResolvedValue(
        jsonResponse({
          job: {
            ...queuedJob().job,
            status: 'done',
            pages: 2,
            finishedAt: 'y',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const job = await waitForExportJob('job-1');

    expect(job.status).toBe('done');
    expect(job.pages).toBe(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/export/jobs/job-1');
  });

  it('a failed job throws its typed code and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          job: {
            ...queuedJob().job,
            status: 'failed',
            errorCode: 'render_timeout',
            errorMessage: 'The render took too long.',
          },
        }),
      ),
    );

    const error = await waitForExportJob('job-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServerExportError);
    expect((error as ServerExportError).code).toBe('render_timeout');
    expect((error as ServerExportError).message).toBe(
      'The render took too long.',
    );
  });

  it('gives up after the poll timeout instead of polling forever', async () => {
    setPollTimingForTests(1, 20);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(queuedJob())),
    );

    const error = await waitForExportJob('job-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServerExportError);
    expect((error as ServerExportError).message).toMatch(/unusually long/i);
  });
});

describe('downloadExportPdf', () => {
  it('saves the PDF under the document name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: () =>
          Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
      } as unknown as Response),
    );

    await downloadExportPdf(
      { ...queuedJob().job, status: 'done' } as serverExport.ExportJobView,
      'My Report',
    );

    expect(vi.mocked(downloadBlob)).toHaveBeenCalledWith(
      'My Report.pdf',
      expect.any(Blob),
    );
  });

  it('a vanished result surfaces the typed pdf_gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'This export is no longer available.', code: 'pdf_gone' },
            410,
          ),
        ),
    );

    const error = await downloadExportPdf(
      { ...queuedJob().job, status: 'done' } as serverExport.ExportJobView,
      'My Report',
    ).catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('pdf_gone');
    expect(vi.mocked(downloadBlob)).not.toHaveBeenCalled();
  });
});
