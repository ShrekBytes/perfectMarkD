import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { exportJobs, exportUsage, users } from '../db/schema.js';
import {
  PayloadStore,
  ResultStore,
  claimNextExportJob,
  failExportJob,
  failStaleExportJobs,
  finishExportJob,
  incrementExportUsage,
  insertExportJob,
} from './queue.js';

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

async function enqueue(
  db: AppDatabase,
  plan: string,
  id: string,
): Promise<number> {
  const userId = await makeUser(db);
  insertExportJob(db, {
    id,
    userId,
    plan: plan as 'pro' | 'premium',
    now: new Date(),
  });
  return userId;
}

describe('claimNextExportJob', () => {
  it('claims FIFO within a plan and re-checks the queued status', async () => {
    const db = makeDb();
    await enqueue(db, 'pro', 'a');
    await enqueue(db, 'pro', 'b');

    const first = claimNextExportJob(db, new Date());
    expect(first?.id).toBe('a');
    expect(first?.status).toBe('running');
    expect(first?.startedAt).toBeTruthy();

    // Claiming again skips the running job.
    expect(claimNextExportJob(db, new Date())?.id).toBe('b');
    expect(claimNextExportJob(db, new Date())).toBeNull();
  });

  it('premium jobs jump the queue', async () => {
    const db = makeDb();
    await enqueue(db, 'pro', 'pro-1');
    await enqueue(db, 'pro', 'pro-2');
    await enqueue(db, 'premium', 'prem-1');

    expect(claimNextExportJob(db, new Date())?.id).toBe('prem-1');
    expect(claimNextExportJob(db, new Date())?.id).toBe('pro-1');
  });
});

describe('finish / fail / stale recovery', () => {
  it('finish records pages and clears failure fields', async () => {
    const db = makeDb();
    await enqueue(db, 'pro', 'a');
    claimNextExportJob(db, new Date());

    const done = finishExportJob(db, 'a', 7, new Date());
    expect(done.status).toBe('done');
    expect(done.pages).toBe(7);
    expect(done.errorCode).toBeNull();
    expect(done.finishedAt).toBeTruthy();
  });

  it('fail records the typed code and message', async () => {
    const db = makeDb();
    await enqueue(db, 'pro', 'a');
    claimNextExportJob(db, new Date());

    const failed = failExportJob(db, 'a', 'render_timeout', 'Too slow.', new Date());
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('render_timeout');
    expect(failed.errorMessage).toBe('Too slow.');
  });

  it('boot recovery fails every non-terminal job as worker_restart', async () => {
    const db = makeDb();
    await enqueue(db, 'pro', 'done-1'); // finishes before the "restart"
    await enqueue(db, 'pro', 'mid-render'); // claimed, so running at restart
    await enqueue(db, 'pro', 'still-queued');
    claimNextExportJob(db, new Date()); // claims done-1 (oldest)
    finishExportJob(db, 'done-1', 1, new Date());
    claimNextExportJob(db, new Date()); // claims mid-render

    const failed = failStaleExportJobs(db, new Date());
    expect(failed).toBe(2);
    expect(db.select().from(exportJobs).where(eq(exportJobs.id, 'done-1')).get()?.status)
      .toBe('done');
    expect(db.select().from(exportJobs).where(eq(exportJobs.id, 'mid-render')).get()?.errorCode)
      .toBe('worker_restart');
    expect(db.select().from(exportJobs).where(eq(exportJobs.id, 'still-queued')).get()?.errorCode)
      .toBe('worker_restart');
  });
});

describe('incrementExportUsage', () => {
  it('creates the period row then increments the same one', async () => {
    const db = makeDb();
    const userId = await makeUser(db);
    const now = new Date('2026-09-11T12:00:00Z');

    incrementExportUsage(db, userId, now);
    incrementExportUsage(db, userId, now);

    const row = db
      .select()
      .from(exportUsage)
      .where(eq(exportUsage.userId, userId))
      .get();
    expect(row?.period).toBe('2026-09');
    expect(row?.count).toBe(2);
    expect(row?.comps).toBe(0);
  });
});

describe('memory stores', () => {
  it('take removes and returns the payload', () => {
    const store = new PayloadStore();
    store.hold('a', { markdown: '# x', pageCount: 1 } as never);
    expect(store.size).toBe(1);
    expect(store.take('a')?.markdown).toBe('# x');
    expect(store.take('a')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('ResultStore round-trips bytes', () => {
    const store = new ResultStore();
    store.put('a', new Uint8Array([1, 2, 3]));
    expect([...(store.get('a') ?? [])]).toEqual([1, 2, 3]);
    expect(store.size).toBe(1);
  });
});
