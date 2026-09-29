// ─────────────────────────────────────────────────────────────────────────────
// The Resend client (ADR-0013): the production Mailer.
//
// One POST to the provider's send endpoint per email. The key is passed in and
// read from the deployment's environment only (the AI provider's precedent) —
// never a setting, never a database row, and never in a message, a log, or an
// error. The from-address arrives as the provider takes it, display name
// included, so a Self-Hosted Instance sends from its own domain.
//
// Every transport and HTTP failure becomes the shared UpstreamError, so callers
// map failures without knowing the wire. This file is an implementation detail
// behind the Mailer seam: nothing but its own error-mapping tests reaches it.
// ─────────────────────────────────────────────────────────────────────────────

import { type Mailer } from './mailer.js';
import {
  UpstreamError,
  fetchWithTimeout,
  readDetail,
  readJson,
} from '../fetch-with-timeout.js';
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
   * One send, mapped onto the one error shape. The body carries the from, the
   * recipient, and the message — the four fields a bare plain-text email
   * needs, and nothing else the provider would accept (no HTML, no metadata,
   * no headers to leak through).
   */
  async function send(to: string, message: OutboundEmail): Promise<void> {
    return fetchWithTimeout({
      url: RESEND_EMAILS_URL,
      init: {
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
      },
      timeoutMs,
      read: async (response) => {
        if (!response.ok) {
          throw new UpstreamError(
            'http',
            `The mail provider answered with HTTP ${response.status}.`,
            response.status,
            await readDetail(response),
          );
        }
        // A 2xx the provider cannot identify is not proof of a send, so it is
        // not reported as one.
        if (!(await readMessageId(response))) {
          throw new UpstreamError(
            'invalid_response',
            'The mail provider accepted the message without an id.',
          );
        }
      },
      errors: {
        timeout: () =>
          new UpstreamError(
            'timeout',
            'The mail provider did not answer in time.',
          ),
        transport: () =>
          new UpstreamError(
            'transport',
            'The mail provider could not be reached.',
          ),
      },
    });
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
  const payload: unknown = await readJson(
    response,
    'The mail provider returned a malformed reply.',
  );
  if (typeof payload !== 'object' || payload === null) return null;
  const id = (payload as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : null;
}
