import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConsoleMailer } from './console.js';

/**
 * The development Mailer. It prints instead of sending, so a local operator can
 * follow a one-time link without a provider account; the trade is that the link
 * lands in the server log, which is why MAIL_MODE=console is the only way in.
 */
describe('the console mailer', () => {
  it('prints one line per email, with the recipient and the link', async () => {
    const lines: string[] = [];

    await createConsoleMailer((line) => lines.push(line)).sendVerification({
      to: 'ada@example.com',
      url: 'https://perfectmarkd.00022000.xyz/verify?token=01HX',
    });
    await createConsoleMailer((line) => lines.push(line)).sendPasswordReset({
      to: 'ada@example.com',
      url: 'https://perfectmarkd.00022000.xyz/reset?token=01HY',
    });
    await createConsoleMailer((line) =>
      lines.push(line),
    ).sendEmailChangedNotice({
      to: 'old@example.com',
    });

    expect(lines).toEqual([
      'console mail: verification link for ada@example.com → https://perfectmarkd.00022000.xyz/verify?token=01HX',
      'console mail: password reset link for ada@example.com → https://perfectmarkd.00022000.xyz/reset?token=01HY',
      'console mail: email-changed notice for old@example.com',
    ]);
  });

  it('sends nothing over the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const lines: string[] = [];

    await createConsoleMailer((line) => lines.push(line)).sendPasswordReset({
      to: 'ada@example.com',
      url: 'https://perfectmarkd.00022000.xyz/reset?token=01HY',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
