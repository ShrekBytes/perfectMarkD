import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { resolveMail } from './config.js';

/**
 * The boot gate (ADR-0013). Sign-in is blocked until an address is verified, so
 * a deployment that cannot send mail cannot be used — it must refuse to start
 * rather than run an instance whose users can neither sign in nor recover.
 */
describe('resolveMail', () => {
  it('refuses to boot without the provider key', () => {
    expect(() => resolveMail({})).toThrow(/RESEND_API_KEY/);
    // The from-address alone is not a configuration.
    expect(() =>
      resolveMail({ from: 'PerfectMarkD <hi@example.com>' }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('refuses to boot with a key but no from-address', () => {
    expect(() => resolveMail({ apiKey: 're_secret-key' })).toThrow(/MAIL_FROM/);
  });

  it('names the local escape in the refusal', () => {
    expect(() => resolveMail({})).toThrow(/MAIL_MODE=console/);
  });

  it('builds the provider client from the key and the from-address', async () => {
    // The provider's own wire is resend.test.ts's business; here the stub only
    // keeps a send off the network, and the assertion is about which mailer the
    // configuration chose.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 }),
        ),
      ),
    );
    const lines: string[] = [];

    const mailer = resolveMail({
      apiKey: 're_secret-key',
      from: 'PerfectMarkD <hello@perfectmarkd.00022000.xyz>',
      log: (line) => lines.push(line),
    });
    await mailer.sendVerification({
      to: 'ada@example.com',
      url: 'https://perfectmarkd.00022000.xyz/verify?token=01HX',
    });

    // The provider was chosen, not the console mailer.
    expect(lines).toEqual([]);
  });

  it('MAIL_MODE=console boots without the provider configuration', async () => {
    const lines: string[] = [];

    const mailer = resolveMail({
      mode: 'console',
      log: (line) => lines.push(line),
    });
    await mailer.sendPasswordReset({
      to: 'ada@example.com',
      url: 'https://perfectmarkd.00022000.xyz/reset?token=01HY',
    });

    expect(lines[0]).toContain('/reset?token=01HY');
  });

  it('prefers console mode over a configured provider', async () => {
    const lines: string[] = [];

    await resolveMail({
      apiKey: 're_secret-key',
      from: 'PerfectMarkD <hello@perfectmarkd.00022000.xyz>',
      mode: 'console',
      log: (line) => lines.push(line),
    }).sendVerification({
      to: 'ada@example.com',
      url: 'https://perfectmarkd.00022000.xyz/verify?token=01HX',
    });

    expect(lines).toHaveLength(1);
  });

  it('boots for no other mode: there is no switch that turns mail off', () => {
    // env.test.ts owns the full list of values; this is the one that matters —
    // a value that looks like an off switch must leave the gate shut.
    for (const raw of ['off', 'CONSOLE']) {
      const { mailMode } = loadEnv({ MAIL_MODE: raw });
      expect(mailMode, `MAIL_MODE=${JSON.stringify(raw)}`).toBeNull();
      expect(() => resolveMail({ mode: mailMode })).toThrow(/RESEND_API_KEY/);
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
