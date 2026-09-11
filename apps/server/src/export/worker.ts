// ─────────────────────────────────────────────────────────────────────────────
// The in-process Server Export worker (server/03).
//
// Single container, no queue infrastructure: the worker lives inside the API
// process, claims jobs from the `export_jobs` table, and renders them through
// an injected `renderPdf` seam. The default seam (render.ts) drives Chromium
// through the app's /export page; tests inject fakes, so queue semantics are
// verified without a browser.
//
// Concurrency is capped (default 2, configurable). Premium jobs jump the
// queue — claimNextExportJob orders on the plan snapshot taken at enqueue,
// so the priority decision rides the same row the worker claims.
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import type { Clock } from '../auth/sessions.js';
import type { LogSink } from '../request-logger.js';
import type { AppDatabase } from '../db/database.js';
import { exportJobs, type ExportJob, type ExportJobErrorCode } from '../db/schema.js';
import { getPlanLimits } from '../db/settings.js';
import {
  PayloadStore,
  ResultStore,
  claimNextExportJob,
  failExportJob,
  failStaleExportJobs,
  finishExportJob,
  incrementExportUsage,
} from './queue.js';
import type { ExportPayload } from './payload.js';

/** A render turns a payload into finished PDF bytes. The default drives
 *  Chromium through the app's /export page; tests inject fakes. */
export type RenderPdf = (payload: ExportPayload) => Promise<{
  pdf: Uint8Array;
  pages: number;
}>;

/** A render failure carrying the typed code the job row (and the client)
 *  should surface. Anything else a renderer throws becomes render_failed. */
export class RenderError extends Error {
  constructor(
    readonly code: Extract<ExportJobErrorCode, 'render_failed' | 'render_timeout' | 'page_cap_exceeded'>,
    message: string,
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

export interface ExportWorkerOptions {
  db: AppDatabase;
  payloads: PayloadStore;
  results: ResultStore;
  renderPdf: RenderPdf;
  /** Simultaneous renders; the ticket default is 2. */
  concurrency?: number;
  clock?: Clock;
  log?: LogSink;
}

export class ExportWorker {
  private readonly db: AppDatabase;
  private readonly payloads: PayloadStore;
  private readonly results: ResultStore;
  private readonly renderPdf: RenderPdf;
  private readonly concurrency: number;
  private readonly now: Clock;
  private readonly log: LogSink;

  private running = 0;
  private stopped = false;
  private readonly idleResolvers: Array<() => void> = [];

  constructor(options: ExportWorkerOptions) {
    this.db = options.db;
    this.payloads = options.payloads;
    this.results = options.results;
    this.renderPdf = options.renderPdf;
    this.concurrency = Math.max(1, options.concurrency ?? 2);
    this.now = options.clock ?? (() => new Date());
    this.log = options.log ?? (() => {});
  }

  /**
   * Boots the worker: fails every non-terminal row left by a previous
   * process (their payloads are gone), then starts claiming.
   */
  start(): number {
    const recovered = failStaleExportJobs(this.db, this.now());
    if (recovered > 0) {
      this.log(`export worker: failed ${recovered} stale job(s) from a previous process`);
    }
    this.pump();
    return recovered;
  }

  /** Called after a job is enqueued (and after each render settles). */
  notify(): void {
    this.pump();
    this.checkIdle();
  }

  /** Stops claiming new work; in-flight renders settle on their own. */
  stop(): void {
    this.stopped = true;
  }

  /** Resolves once nothing is queued and nothing is running (tests await this). */
  waitIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private isIdle(): boolean {
    if (this.running > 0) return false;
    const queued = this.db
      .select({ id: exportJobs.id })
      .from(exportJobs)
      .where(eq(exportJobs.status, 'queued'))
      .limit(1)
      .get();
    return !queued;
  }

  private checkIdle(): void {
    if (!this.isIdle()) return;
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }

  private pump(): void {
    while (!this.stopped && this.running < this.concurrency) {
      const job = claimNextExportJob(this.db, this.now());
      if (!job) return;
      this.running += 1;
      void this.render(job).finally(() => {
        this.running -= 1;
        this.notify();
      });
    }
  }

  private async render(job: ExportJob): Promise<void> {
    // The deletion point the ticket's acceptance tests assert on: from here
    // the payload lives only in this call frame, so it is gone from memory
    // the moment the render settles — success or failure.
    const payload = this.payloads.take(job.id);
    if (!payload) {
      this.fail(job, 'render_failed', 'Export payload is missing.');
      return;
    }

    try {
      const { pdf, pages } = await this.renderPdf(payload);
      const cap = getPlanLimits(this.db)[job.plan as 'pro' | 'premium'].pageCap;
      if (pages > cap) {
        throw new RenderError(
          'page_cap_exceeded',
          `The rendered document has ${pages} pages — your plan allows up to ${cap}.`,
        );
      }
      this.results.put(job.id, pdf);
      incrementExportUsage(this.db, job.userId, this.now());
      finishExportJob(this.db, job.id, pages, this.now());
    } catch (error) {
      if (error instanceof RenderError) {
        this.fail(job, error.code, error.message);
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Unknown render error.';
      this.fail(job, 'render_failed', message);
    }
  }

  private fail(
    job: ExportJob,
    code: ExportJobErrorCode,
    message: string,
  ): void {
    failExportJob(this.db, job.id, code, message, this.now());
  }
}
