// ─────────────────────────────────────────────────────────────────────────────
// The Resend client (ADR-0013): the production Mailer.
//
// One POST to the provider's send endpoint per email. The key is passed in and
// read from the deployment's environment only (the AI provider's precedent) —
// never a setting, never a database row, and never in a message, a log, or an
// error. The from-address arrives as the provider takes it, display name
// included, so a Self-Hosted Instance sends from its own domain.
//
// Every transport and HTTP failure becomes one MailerError shape, so callers
// map failures without knowing the wire. This file is an implementation detail
// behind the Mailer seam: nothing but its own error-mapping tests reaches it.
// ─────────────────────────────────────────────────────────────────────────────

import { MailerError, type Mailer } from './mailer.js';
import {
  emailChangeMessage,
  emailChangedNoticeMessage,
  passwordResetMessage,
  verificationMessage,
  type OutboundEmail,
} from './messages.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

/** A send that has not answered in this long has failed. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Bound on what an upstream error body can hold (log detail). */
const MAX_DETAIL_LENGTH = 2_000;

export interface ResendMailerOptions {
  /** The deployment's provider key. */
  apiKey: string;
  /** From-address as the provider takes it: `Name <local@domain>`. */
  from: string;
  /** Per-send deadline in milliseconds (default 10s). */
  timeoutMs?: number;
}

export function createResendMailer({
  apiKey,
  from,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ResendMailerOptions): Mailer {
  /**
   * One send. The body carries the from, the recipient, and the message — the
   * four fields a bare plain-text email needs, and nothing else the provider
   * would accept (no HTML, no metadata, no headers to leak through).
   */
  async function send(to: string, message: OutboundEmail): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: message.subject,
          text: message.text,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new MailerError(
          'http',
          `The mail provider answered with HTTP ${response.status}.`,
          response.status,
          await readDetail(response),
        );
      }
      // A 2xx the provider cannot identify is not proof of a send, so it is not
      // reported as one.
      if (!(await readMessageId(response))) {
        throw new MailerError(
          'invalid_response',
          'The mail provider accepted the message without an id.',
        );
      }
    } catch (error) {
      // A MailerError already carries the right shape (http/invalid_response).
      if (error instanceof MailerError) throw error;
      if (isAbortError(error)) {
        throw new MailerError(
          'timeout',
          'The mail provider did not answer in time.',
        );
      }
      throw new MailerError(
        'transport',
        'The mail provider could not be reached.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async sendVerification({ to, url }) {
      await send(to, verificationMessage(to, url));
    },
    async sendPasswordReset({ to, url }) {
      await send(to, passwordResetMessage(to, url));
    },
    async sendEmailChange({ to, url }) {
      await send(to, emailChangeMessage(to, url));
    },
    async sendEmailChangedNotice({ to }) {
      await send(to, emailChangedNoticeMessage(to));
    },
  };
}

/** The provider's message id, or null when the reply carries none. */
async function readMessageId(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return null;
    const id = (payload as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  } catch (error) {
    // An aborted body read is a timeout, not a malformed reply.
    if (isAbortError(error)) throw error;
    return null;
  }
}

/** The upstream body, bounded and best-effort — it is log detail. */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, MAX_DETAIL_LENGTH) || null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}
