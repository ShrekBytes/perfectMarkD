// ─────────────────────────────────────────────────────────────────────────────
// Server Export queue (server/03).
//
// Two layers with deliberately different durability:
//
// - `export_jobs` rows in SQLite are the durable, inspectable part — "queue
//   visible in DB" is the ticket's acceptance. Status, plan snapshot, pages,
//   and typed failures live here.
// - The document payload (≤ 50 MB) and the rendered PDF live only in this
//   process's memory. Payloads are deleted the moment a render settles
//   (success or failure — asserted by tests); results stay until the process
//   exits. Export History (server/05) moves finished PDFs to encrypted disk;
//   until then a restart loses results and the download endpoint says so.
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/database.js';
import {
  exportJobs,
  type ExportJob,
  type ExportJobErrorCode,
  type Plan,
} from '../db/schema.js';
import type { ExportPayload } from './payload.js';

/** Document payloads held in memory between enqueue and render. */
export class PayloadStore {
  private readonly jobs = new Map<string, ExportPayload>();

  hold(id: string, payload: ExportPayload): void {
    this.jobs.set(id, payload);
  }

  /** Removes and returns the payload — the one deletion point the tests
   *  assert on: after this, nothing user-owned remains in memory. */
  take(id: string): ExportPayload | undefined {
    const payload = this.jobs.get(id);
    this.jobs.delete(id);
    return payload;
  }

  get size(): number {
    return this.jobs.size;
  }
}

/** Rendered PDFs kept in memory until their owner fetches them. */
export class ResultStore {
  private readonly results = new Map<string, Uint8Array>();

  put(id: string, pdf: Uint8Array): void {
    this.results.set(id, pdf);
  }

  get(id: string): Uint8Array | undefined {
    return this.results.get(id);
  }

  get size(): number {
    return this.results.size;
  }
}

/**
 * The client-facing job view (GET /api/export/jobs/:id). Timestamps are ISO
 * strings, matching the other API views.
 */
export interface ExportJobView {
  id: string;
  status: string;
  plan: string;
  pages: number | null;
  errorCode: ExportJobErrorCode | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export function jobView(job: ExportJob): ExportJobView {
  return {
    id: job.id,
    status: job.status,
    plan: job.plan,
    pages: job.pages,
    errorCode: (job.errorCode as ExportJobErrorCode | null) ?? null,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export function findExportJob(db: AppDatabase, id: string): ExportJob | null {
  return (
    db.select().from(exportJobs).where(eq(exportJobs.id, id)).get() ?? null
  );
}

/**
 * Creates the queued row. The payload is NOT part of the row — callers hold
 * it in the PayloadStore under the same id. Planless exports (a comped user
 * without an Entitlement, server/04) snapshot 'free': lowest queue priority
 * and the smallest page cap via pageCapFor.
 */
export function insertExportJob(
  db: AppDatabase,
  input: { id: string; userId: number; plan: Plan | 'free'; now: Date },
): ExportJob {
  return db
    .insert(exportJobs)
    .values({
      id: input.id,
      userId: input.userId,
      plan: input.plan,
      status: 'queued',
      createdAt: input.now,
    })
    .returning()
    .get();
}

/**
 * Claims the next queued job: Premium first (jump the queue), FIFO within
 * each class. better-sqlite3 is synchronous, so read-then-write cannot
 * interleave in-process; the UPDATE still re-checks `queued` so a job can
 * never be claimed twice.
 */
export function claimNextExportJob(
  db: AppDatabase,
  now: Date,
): ExportJob | null {
  const next = db
    .select({ id: exportJobs.id })
    .from(exportJobs)
    .where(eq(exportJobs.status, 'queued'))
    .orderBy(
      sql`(case when ${exportJobs.plan} = 'premium' then 0 else 1 end)`,
      asc(exportJobs.createdAt),
    )
    .limit(1)
    .get();
  if (!next) return null;
  return (
    db
      .update(exportJobs)
      .set({ status: 'running', startedAt: now })
      .where(and(eq(exportJobs.id, next.id), eq(exportJobs.status, 'queued')))
      .returning()
      .get() ?? null
  );
}

export function finishExportJob(
  db: AppDatabase,
  id: string,
  pages: number,
  now: Date,
): ExportJob {
  return db
    .update(exportJobs)
    .set({
      status: 'done',
      pages,
      errorCode: null,
      errorMessage: null,
      finishedAt: now,
    })
    .where(eq(exportJobs.id, id))
    .returning()
    .get();
}

export function failExportJob(
  db: AppDatabase,
  id: string,
  code: ExportJobErrorCode,
  message: string,
  now: Date,
): ExportJob {
  return db
    .update(exportJobs)
    .set({
      status: 'failed',
      errorCode: code,
      errorMessage: message,
      finishedAt: now,
    })
    .where(eq(exportJobs.id, id))
    .returning()
    .get();
}

/**
 * Boot recovery: a restart loses every in-memory payload and result, so any
 * job that never reached a terminal state must fail with a typed code —
 * silently re-queuing would hang forever (no payload) and pretending `done`
 * would break downloads.
 */
export function failStaleExportJobs(db: AppDatabase, now: Date): number {
  const failed = db
    .update(exportJobs)
    .set({
      status: 'failed',
      errorCode: 'worker_restart',
      errorMessage: 'The server restarted while this export was in progress.',
      finishedAt: now,
    })
    .where(inArray(exportJobs.status, ['queued', 'running']))
    .returning({ id: exportJobs.id })
    .all();
  return failed.length;
}
