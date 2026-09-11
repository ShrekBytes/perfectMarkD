// ─────────────────────────────────────────────────────────────────────────────
// The Server Export client (billing/04): the web side of POST /api/export
// (server/03). The flow is enqueue → poll → download:
//
// - buildServerExportPayload runs the same engine pipeline the Paper Canvas,
//   Client Export, and the /export page run, then resolves every asset:// ref
//   (markdown images and the banner/background settings) to data: URIs so the
//   payload is self-contained — the server's headless Chromium never touches
//   the user's IndexedDB.
// - queueServerExport POSTs it and turns the route's typed gate rejections
//   (402 quota_exceeded, 403 entitlement_required, 413, 429) into ApiErrors
//   carrying `code` — the upgrade prompts match on those.
// - waitForExportJob polls the job row until it renders or fails; the PDF
//   then downloads from the result endpoint.
//
// Client-side flags decide whether the Server Export item is even offered;
// the server remains the enforcement point — this module just surfaces its
// typed verdicts.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentSettings } from '@perfectmarkd/core';
import { errorFrom, postJson, ApiError } from '../api/client';
import { createAssetResolver } from '../assets/resolver';
import { collectAssetRefs, runDocumentPipeline } from '../canvas/pipeline';
import { renderMermaid } from '../canvas/mermaid';
import { openDatabase } from '../documents/db';
import { downloadBlob } from '../library/download';

/** Field-for-field the enqueue route's job view (server/03 queue.ts jobView);
 *  the two sides share names, not code. */
export interface ExportJobView {
  id: string;
  status: string;
  plan: string;
  pages: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** What POST /api/export accepts (server/03 payload.ts). */
export interface ServerExportPayload {
  title: string;
  markdown: string;
  settings: DocumentSettings;
  /** The page count this client's pipeline laid out — the plan's page cap is
   *  enforced against it before any Chromium time is spent. */
  pageCount: number;
  /** Every asset:// ref resolved to a data: URI. */
  assets: Record<string, string>;
}

export type ServerExportErrorCode =
  // Enqueue rejections (export/routes.ts).
  | 'quota_exceeded'
  | 'entitlement_required'
  | 'burst_limit'
  | 'payload_too_large'
  // Terminal job failures (schema.ts EXPORT_JOB_ERROR_CODES).
  | 'page_cap_exceeded'
  | 'render_failed'
  | 'render_timeout'
  | 'worker_restart'
  // Result fetch.
  | 'pdf_gone'
  // No response at all.
  | 'network';

export class ServerExportError extends Error {
  constructor(
    readonly code: ServerExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServerExportError';
  }
}

/** True for the gate rejections whose fix is a better plan. */
export function isUpgradePrompt(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'quota_exceeded' || error.code === 'entitlement_required')
  );
}

/**
 * Runs the engine pipeline over the document and assembles the self-contained
 * payload. Throws when the pipeline fails — the caller surfaces that like any
 * other export failure.
 */
export async function buildServerExportPayload(input: {
  title: string;
  markdown: string;
  settings: DocumentSettings;
}): Promise<ServerExportPayload> {
  const assets = createAssetResolver(await openDatabase(), 'data-uri');
  try {
    const refs = collectAssetRefs(input.markdown, input.settings);
    await assets.warmup(refs);
    const result = await runDocumentPipeline(input.markdown, input.settings, {
      title: input.title,
      renderMermaid,
    });

    // The page swaps refs for these URIs at render time (banner/background
    // included); a ref the store can't resolve is omitted — the export drops
    // the image, matching the Client Export path.
    const resolved: Record<string, string> = {};
    for (const ref of refs) {
      const uri = assets(ref);
      if (uri) resolved[ref] = uri;
    }

    return {
      title: input.title,
      markdown: input.markdown,
      settings: input.settings,
      pageCount: result.layouts.length,
      assets: resolved,
    };
  } finally {
    assets.dispose();
  }
}

/** Enqueues the payload; 202 with the queued job, or a typed rejection. */
export async function queueServerExport(
  payload: ServerExportPayload,
): Promise<ExportJobView> {
  let res: Response;
  try {
    res = await postJson('/api/export', payload);
  } catch {
    throw new ServerExportError(
      'network',
      'Could not reach the server — check your connection and try again.',
    );
  }
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { job: ExportJobView }).job;
}

const DEFAULT_POLL_MS = 1000;
/** Renders can queue behind others; ten minutes is generous headroom before
 *  giving up rather than polling forever. */
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000;

let pollDelayMs = DEFAULT_POLL_MS;
let pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS;

/** Test hooks: keep the suite fast and timeouts reachable. */
export function setPollTimingForTests(
  delayMs: number,
  timeoutMs: number,
): void {
  pollDelayMs = delayMs;
  pollTimeoutMs = timeoutMs;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls the job until it reaches a terminal state. `done` resolves; `failed`
 * throws with the job's typed code and message (the worker writes those for
 * render failures and restart recovery).
 */
export async function waitForExportJob(id: string): Promise<ExportJobView> {
  const deadline = Date.now() + pollTimeoutMs;
  for (;;) {
    const res = await fetch(`/api/export/jobs/${id}`, {
      credentials: 'include',
    });
    if (!res.ok) throw await errorFrom(res);
    const job = ((await res.json()) as { job: ExportJobView }).job;
    if (job.status === 'done') return job;
    if (job.status === 'failed') {
      throw new ServerExportError(
        (job.errorCode as ServerExportErrorCode) ?? 'render_failed',
        job.errorMessage ?? 'The export failed on the server.',
      );
    }
    if (Date.now() >= deadline) {
      throw new ServerExportError(
        'render_failed',
        'The export is taking unusually long — try again shortly.',
      );
    }
    await delay(pollDelayMs);
  }
}

/** Downloads the finished PDF. A result the server can no longer serve (a
 *  restart since the render) throws the typed `pdf_gone`. */
export async function downloadExportPdf(
  job: ExportJobView,
  fileName: string,
): Promise<void> {
  const res = await fetch(`/api/export/jobs/${job.id}/pdf`, {
    credentials: 'include',
  });
  if (!res.ok) throw await errorFrom(res);
  const name = fileName.toLowerCase().endsWith('.pdf')
    ? fileName
    : `${fileName}.pdf`;
  downloadBlob(name, await res.blob());
}
