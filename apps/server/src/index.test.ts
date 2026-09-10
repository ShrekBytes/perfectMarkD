import { afterEach, describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { createApp, type AppType } from './index.js';
import type { LogSink } from './request-logger.js';
import { createTestDatabase, removeTestDatabase } from './db/testing.js';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeApp() {
  const lines: string[] = [];
  const sink: LogSink = (line) => lines.push(line);
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  return {
    app: createApp({ db, sessionSecret: 'test-secret', log: sink }),
    lines,
  };
}

describe('health check', () => {
  it('responds 200 ok', async () => {
    const { app } = makeApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('request logging', () => {
  it('logs method, path, status, and duration', async () => {
    const { app, lines } = makeApp();
    await app.request('/healthz');
    expect(lines).toEqual([expect.stringMatching(/^GET \/healthz 200 \d+ms$/)]);
  });

  it('never logs query strings or request bodies (privacy posture)', async () => {
    const { app, lines } = makeApp();
    await app.request('/healthz?leak=SECRET-MARKDOWN-CONTENT', {
      method: 'POST',
      body: 'SECRET-MARKDOWN-CONTENT',
    });
    expect(lines.join('\n')).not.toContain('SECRET-MARKDOWN-CONTENT');
  });

  it('logs unmatched routes as 404', async () => {
    const { app, lines } = makeApp();
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(lines).toEqual([expect.stringMatching(/^GET \/nope 404 \d+ms$/)]);
  });

  it('logs a 500 when a handler throws', async () => {
    const { app, lines } = makeApp();
    app.get('/boom', () => {
      throw new Error('boom');
    });
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    expect(lines).toEqual([expect.stringMatching(/^GET \/boom 500 \d+ms$/)]);
  });

  it('logs the HTTPException status, not 500', async () => {
    const { app, lines } = makeApp();
    app.get('/teapot', () => {
      throw new HTTPException(418);
    });
    const res = await app.request('/teapot');
    expect(res.status).toBe(418);
    expect(lines).toEqual([expect.stringMatching(/^GET \/teapot 418 \d+ms$/)]);
  });
});

describe('database on context', () => {
  it('exposes the app database to handlers via c.var.db', async () => {
    const lines: string[] = [];
    const { db, dir } = createTestDatabase();
    cleanup = () => removeTestDatabase(dir);
    const app: AppType = createApp({
      db,
      sessionSecret: 'test-secret',
      log: (l) => lines.push(l),
    }).get('/__probe', (c) => c.json({ hasDb: c.var.db === db }));
    const res = await app.request('/__probe');
    expect(await res.json()).toEqual({ hasDb: true });
  });
});
