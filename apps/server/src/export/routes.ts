// ─────────────────────────────────────────────────────────────────────────────
// Server Export API (server/03).
//
// POST /api/export — validates (size, entitlement, monthly quota, burst limit,
// payload shape, page cap), stores the payload in memory, and enqueues the
// job. The response is 202 with the queued job; the client polls
// GET /api/export/jobs/:id and finally fetches GET /api/export/jobs/:id/pdf.
// Errors on the enqueue path carry a `code` the client can match on (billing/04
// builds the upgrade prompts on them); failures after acceptance surface as
// typed job failures on the job row instead.
//
// The plan guard is the minimal server-side gate: an active Entitlement is
// required, and usage is counted against the plan quota + comps (server/04).
// billing/04 wires the client side — the upgrade prompts and the gated
// feature flags from GET /api/me.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import type { Clock } from '../auth/sessions.js';
import type { AppDatabase } from '../db/database.js';
import { entitlements, type ExportJob } from '../db/schema.js';
import { getPlanLimits } from '../db/settings.js';
import { isEntitlementActive, quotaState } from '../quota.js';
import { parseJson } from '../request-body.js';
import { MAX_EXPORT_BODY_BYTES, parseExportPayload } from './payload.js';
import {
  PayloadStore,
  ResultStore,
  findExportJob,
  insertExportJob,
  jobView,
} from './queue.js';
import type { ExportWorker } from './worker.js';

export interface ExportRoutesOptions {
  db: AppDatabase;
  payloads: PayloadStore;
  results: ResultStore;
  worker: ExportWorker;
  /** Max exports a single user may enqueue per rolling minute. */
  burstPerMinute: number;
  now: Clock;
}

/**
 * Rolling 60-second per-user window: at most `max` enqueues, so a runaway
 * client cannot flood the render queue (spec §Security posture). Only
 * accepted enqueues consume the window — rejected requests don't burn quota —
 * and expired windows are dropped on touch, so the map never holds more than
 * the users who exported within the last minute.
 */
class BurstLimiter {
  private readonly hits = new Map<number, number[]>();

  constructor(
    private readonly max: number,
    private readonly now: Clock,
  ) {}

  tryAcquire(userId: number): boolean {
    const now = this.now().getTime();
    const recent = (this.hits.get(userId) ?? []).filter(
      (t) => t > now - 60_000,
    );
    if (recent.length === 0) this.hits.delete(userId);
    if (recent.length >= this.max) return false;
    recent.push(now);
    this.hits.set(userId, recent);
    return true;
  }
}

export function exportRoutes(options: ExportRoutesOptions) {
  const { db, payloads, results, worker } = options;
  const burst = new BurstLimiter(options.burstPerMinute, options.now);
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_EXPORT_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error:
              'This document is too large — Server Export accepts up to 50 MB.',
            code: 'payload_too_large',
          },
          413,
        ),
    }),
  );

  app.post('/', async (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    // Entitlement gate: an active Entitlement unlocks Server Export. Expired
    // attempts are a distinct typed error from over-quota ones (billing/04
    // builds a different prompt for each).
    const entitlement = db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, user.id))
      .get();
    if (!entitlement || !isEntitlementActive(entitlement, options.now())) {
      return c.json(
        {
          error: 'Server Export needs an active paid plan.',
          code: 'entitlement_required',
        },
        403,
      );
    }

    // Monthly quota gate (server/04): the period's successful exports count
    // against the plan quota plus comps. Checked before the burst window and
    // before the payload is read, so a rejected request burns nothing — no
    // burst slot, no job row, no half-parsed document.
    const limits = getPlanLimits(db);
    const quota = quotaState(db, user.id, entitlement, limits, options.now());
    if (quota.used >= quota.limit) {
      return c.json(
        {
          error:
            'You have used all of this period’s Server Exports — it resets next period, or upgrade for a larger quota.',
          code: 'quota_exceeded',
        },
        402,
      );
    }

    // The burst window only counts requests that will actually enqueue: a
    // malformed or over-cap payload never reaches the queue, so it never
    // consumes one of the user's N-per-minute slots.
    const parsed = parseExportPayload(
      parseJson(await c.req.text()),
      limits[entitlement.plan as 'pro' | 'premium'].pageCap,
    );
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    if (!burst.tryAcquire(user.id)) {
      return c.json(
        {
          error: 'Too many exports in a minute — try again shortly.',
          code: 'burst_limit',
        },
        429,
      );
    }

    const id = crypto.randomUUID();
    const job = insertExportJob(db, {
      id,
      userId: user.id,
      plan: entitlement.plan as 'pro' | 'premium',
      now: options.now(),
    });
    payloads.hold(id, parsed.payload);
    worker.notify();
    return c.json({ job: jobView(job) }, 202);
  });

  app.get('/jobs/:id', (c) => {
    const job = ownedJob(db, c);
    if (!job) return c.json({ error: 'Export not found.' }, 404);
    return c.json({ job: jobView(job) });
  });

  app.get('/jobs/:id/pdf', (c) => {
    const job = ownedJob(db, c);
    if (!job) return c.json({ error: 'Export not found.' }, 404);
    if (job.status !== 'done') {
      return c.json({ error: 'The export is not finished yet.' }, 409);
    }
    const pdf = results.get(job.id);
    if (!pdf) {
      // The process restarted after the job finished; results are memory-only
      // until Export History (server/05) persists them.
      return c.json(
        {
          error: 'This export is no longer available — please export again.',
          code: 'pdf_gone',
        },
        410,
      );
    }
    return c.body(new Uint8Array(pdf), 200, {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdfFilename(job.id)}"`,
      'content-length': String(pdf.byteLength),
    });
  });

  return app;
}

/**
 * The job row only when it exists and belongs to the caller — another user's
 * export is a 404, matching how Orders hide their existence.
 */
function ownedJob(
  db: AppDatabase,
  c: { req: { param: (name: string) => string }; var: AppEnv['Variables'] },
): ExportJob | null {
  const user = c.var.user;
  if (!user) return null;
  const job = findExportJob(db, c.req.param('id'));
  return job && job.userId === user.id ? job : null;
}

/** The filename from the job id — stable and safe (the document title rode
 *  the payload, which is deleted by the time a download happens). */
function pdfFilename(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safe || 'export'}.pdf`;
}
