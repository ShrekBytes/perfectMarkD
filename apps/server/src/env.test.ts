import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults when nothing is configured', () => {
    expect(loadEnv({})).toEqual({
      port: 3000,
      dbPath: './data/perfectmarkd.db',
      sessionSecret: null,
      adminEmail: null,
      exportOrigin: 'http://localhost:3000',
      exportConcurrency: 2,
      exportBurstPerMinute: 10,
      exportRenderTimeoutMs: 120_000,
    });
  });

  it('reads explicit configuration', () => {
    expect(
      loadEnv({
        PORT: '8080',
        DB_PATH: '/var/lib/pmd/perfectmarkd.db',
        SESSION_SECRET: 's3cret',
        ADMIN_EMAIL: 'owner@example.com',
        EXPORT_ORIGIN: 'http://localhost:5173',
        EXPORT_CONCURRENCY: '4',
        EXPORT_BURST_PER_MINUTE: '30',
        EXPORT_RENDER_TIMEOUT_MS: '60000',
      }),
    ).toEqual({
      port: 8080,
      dbPath: '/var/lib/pmd/perfectmarkd.db',
      sessionSecret: 's3cret',
      adminEmail: 'owner@example.com',
      exportOrigin: 'http://localhost:5173',
      exportConcurrency: 4,
      exportBurstPerMinute: 30,
      exportRenderTimeoutMs: 60_000,
    });
  });

  it('treats blank values as unset', () => {
    expect(loadEnv({ SESSION_SECRET: '  ' }).sessionSecret).toBeNull();
    expect(loadEnv({ PORT: '' }).port).toBe(3000);
    expect(loadEnv({ EXPORT_ORIGIN: '' }).exportOrigin).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects a PORT that is not an integer in range', () => {
    expect(() => loadEnv({ PORT: 'nope' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '3000.5' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '0' })).toThrow(/PORT/);
  });

  it('rejects export tuning that is not a positive integer', () => {
    expect(() => loadEnv({ EXPORT_CONCURRENCY: '0' })).toThrow(
      /EXPORT_CONCURRENCY/,
    );
    expect(() => loadEnv({ EXPORT_BURST_PER_MINUTE: 'x' })).toThrow(
      /EXPORT_BURST_PER_MINUTE/,
    );
    expect(() => loadEnv({ EXPORT_RENDER_TIMEOUT_MS: '-1' })).toThrow(
      /EXPORT_RENDER_TIMEOUT_MS/,
    );
  });
});
