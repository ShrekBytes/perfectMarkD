import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { exportJobs, exportUsage, type Plan, users } from '../db/schema.js';
import { PayloadStore, ResultStore, insertExportJob } from './queue.js';
import type { ExportPayload } from './payload.js';
import { ExportWorker, RenderError, type RenderPdf } from './worker.js';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeDb(): AppDatabase {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  return db;
}

/** Real user rows: export_jobs.user_id has a foreign key. */
let userCounter = 0;
async function makeUser(db: AppDatabase): Promise<number> {
  userCounter += 1;
  const [row] = await db
    .insert(users)
    .values({ email: `u${userCounter}@test.dev`, passwordHash: 'x' })
    .returning();
  return row!.id;
}

const PAYLOAD: ExportPayload = {
  title: 'Doc',
  markdown: '# Hello',
  settings: { preset: 'default' } as ExportPayload['settings'],
  pageCount: 1,
  assets: {},
  fonts: [],
};

function fakePdf(pages: number): Uint8Array {
  return new Uint8Array([0x25, 0x50, pages]); // "%P", page count byte
}

/** A renderer whose renders settle only when the test says so — overlap,
 *  ordering, and failures are all observable. */
function controllableRenderer(): {
  renderPdf: RenderPdf;
  pending: Array<{
    payload: ExportPayload;
    resolve: (r: { pdf: Uint8Array; pages: number }) => void;
    reject: (e: unknown) => void;
  }>;
} {
  const pending: Awaited<ReturnType<typeof controllableRenderer>>['pending'] =
    [];
  const renderPdf: RenderPdf = (payload) =>
    new Promise((resolve, reject) => {
      pending.push({ payload, resolve, reject });
    });
  return { renderPdf, pending };
}

function makeWorker(
  db: AppDatabase,
  renderPdf: RenderPdf,
  options: { concurrency?: number } = {},
) {
  const payloads = new PayloadStore();
  const results = new ResultStore();
  const worker = new ExportWorker({
    db,
    payloads,
    results,
    renderPdf,
    concurrency: options.concurrency,
  });
  worker.start();
  return { payloads, results, worker };
}

/** The same sequence the route performs: row, payload, then a nudge.
 *  `userId` lets a test pin which account the usage lands on. */
async function enqueue(
  db: AppDatabase,
  payloads: PayloadStore,
  id: string,
  plan: Plan = 'pro',
  userId?: number,
): Promise<number> {
  const uid = userId ?? (await makeUser(db));
  insertExportJob(db, { id, userId: uid, plan, now: new Date() });
  payloads.hold(id, PAYLOAD);
  return uid;
}

function job(db: AppDatabase, id: string) {
  return db.select().from(exportJobs).where(eq(exportJobs.id, id)).get();
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

/** Resolves every render the pump has claimed (new ones keep appearing as
 *  earlier ones settle), then waits for the worker to go idle. */
async function drain(
  worker: ExportWorker,
  pending: Awaited<ReturnType<typeof controllableRenderer>>['pending'],
  result: { pdf: Uint8Array; pages: number },
): Promise<void> {
  for (;;) {
    for (const p of pending.splice(0)) p.resolve(result);
    await tick();
    if (pending.length === 0) break;
  }
  await worker.waitIdle();
}

describe('ExportWorker', () => {
  it('renders a queued job: result stored, payload deleted, usage counted, row done', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { payloads, results, worker } = makeWorker(db, renderPdf);

    const userId = await enqueue(db, payloads, 'a');
    worker.notify();
    expect(pending).toHaveLength(1);

    pending[0]!.resolve({ pdf: fakePdf(3), pages: 3 });
    await worker.waitIdle();

    // The ticket's "payload deleted (test asserts)".
    expect(payloads.size).toBe(0);
    expect(results.get('a')).toEqual(fakePdf(3));
    expect(
      db.select().from(exportUsage).where(eq(exportUsage.userId, userId)).get()
        ?.count,
    ).toBe(1);
    const done = job(db, 'a');
    expect(done?.status).toBe('done');
    expect(done?.pages).toBe(3);
  });

  it('a thrown render fails the job with render_failed and deletes the payload', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { payloads, worker } = makeWorker(db, renderPdf);

    await enqueue(db, payloads, 'a');
    worker.notify();
    pending[0]!.reject(new Error('Chromium crashed'));
    await worker.waitIdle();

    expect(payloads.size).toBe(0);
    const failed = job(db, 'a');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('render_failed');
    expect(failed?.errorMessage).toContain('Chromium crashed');
  });

  it('a RenderError keeps its typed code', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { payloads, worker } = makeWorker(db, renderPdf);

    await enqueue(db, payloads, 'a');
    worker.notify();
    pending[0]!.reject(new RenderError('render_timeout', 'Too slow.'));
    await worker.waitIdle();

    expect(job(db, 'a')?.errorCode).toBe('render_timeout');
  });

  it('a render over the plan page cap fails as page_cap_exceeded', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { payloads, worker } = makeWorker(db, renderPdf);

    await enqueue(db, payloads, 'a', 'pro'); // pro cap: 300
    worker.notify();
    pending[0]!.resolve({ pdf: fakePdf(301), pages: 301 });
    await worker.waitIdle();

    const failed = job(db, 'a');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('page_cap_exceeded');
  });

  it('respects the concurrency cap', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { payloads, worker } = makeWorker(db, renderPdf, { concurrency: 2 });

    await enqueue(db, payloads, 'a');
    await enqueue(db, payloads, 'b');
    await enqueue(db, payloads, 'c');
    worker.notify();

    await tick();
    expect(pending).toHaveLength(2);
    expect(job(db, 'c')?.status).toBe('queued');

    // One render settles; the freed slot claims the queued third job.
    pending[0]!.resolve({ pdf: fakePdf(1), pages: 1 });
    await tick();
    expect(pending).toHaveLength(3);
    expect(job(db, 'c')?.status).toBe('running');

    await drain(worker, pending, { pdf: fakePdf(1), pages: 1 });
    expect(job(db, 'c')?.status).toBe('done');
  });

  it('payloads missing at claim time fail the job instead of hanging', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { worker } = makeWorker(db, renderPdf);

    insertExportJob(db, {
      id: 'a',
      userId: await makeUser(db),
      plan: 'pro',
      now: new Date(),
    });
    worker.notify(); // no payload was ever held

    await worker.waitIdle();
    expect(pending).toHaveLength(0);
    const failed = job(db, 'a');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('render_failed');
  });

  it('premium enqueues jump ahead of queued pro jobs', async () => {
    const db = makeDb();
    const { renderPdf, pending } = controllableRenderer();
    const { payloads, worker } = makeWorker(db, renderPdf, { concurrency: 1 });

    await enqueue(db, payloads, 'pro-1');
    worker.notify();
    expect(pending).toHaveLength(1);

    // Two more queue up behind the running render — premium enqueued last.
    await enqueue(db, payloads, 'pro-2');
    worker.notify();
    await enqueue(db, payloads, 'prem-1', 'premium');
    worker.notify();

    pending[0]!.resolve({ pdf: fakePdf(1), pages: 1 });
    await tick();
    expect(pending).toHaveLength(2);
    // The premium row was claimed next; the older pro row still waits.
    expect(job(db, 'prem-1')?.status).toBe('running');
    expect(job(db, 'pro-2')?.status).toBe('queued');

    await drain(worker, pending, { pdf: fakePdf(1), pages: 1 });
    expect(job(db, 'pro-2')?.status).toBe('done');
  });
});
