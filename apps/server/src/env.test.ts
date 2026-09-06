import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults when nothing is configured', () => {
    expect(loadEnv({})).toEqual({
      port: 3000,
      dbPath: './data/perfectmarkd.db',
      sessionSecret: null,
      adminEmail: null,
    });
  });

  it('reads explicit configuration', () => {
    expect(
      loadEnv({
        PORT: '8080',
        DB_PATH: '/var/lib/pmd/perfectmarkd.db',
        SESSION_SECRET: 's3cret',
        ADMIN_EMAIL: 'owner@example.com',
      }),
    ).toEqual({
      port: 8080,
      dbPath: '/var/lib/pmd/perfectmarkd.db',
      sessionSecret: 's3cret',
      adminEmail: 'owner@example.com',
    });
  });

  it('treats blank values as unset', () => {
    expect(loadEnv({ SESSION_SECRET: '  ' }).sessionSecret).toBeNull();
    expect(loadEnv({ PORT: '' }).port).toBe(3000);
  });

  it('rejects a PORT that is not an integer in range', () => {
    expect(() => loadEnv({ PORT: 'nope' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '3000.5' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '0' })).toThrow(/PORT/);
  });
});
