import type { MailMode } from './mail/config.js';

export interface ServerEnv {
  port: number;
  dbPath: string;
  /** Signs session cookies — auth (server/02) makes it required once used. */
  sessionSecret: string | null;
  /** First registered account with this email becomes the Admin. */
  adminEmail: string | null;
  /**
   * Origin the export worker loads the app's /export route from (server/03):
   * the web dev server in development, the same origin in production once
   * static serving lands (server/06). Defaults to this API's own port.
   */
  exportOrigin: string;
  /**
   * Origin users' browsers reach the instance on (email/02). The absolute
   * one-time links in transactional email are built from it, and nothing in
   * the server can derive it from a request — the Host header is
   * attacker-supplied, and a link sent to an attacker's page from our domain
   * carries our DKIM signature. The composition root (main.ts) requires it: a
   * link nobody can open is an account nobody can verify.
   */
  publicOrigin: string | null;
  /** Simultaneous Server Export renders (the ticket's default: 2). */
  exportConcurrency: number;
  /** Max exports one user may enqueue per rolling minute. */
  exportBurstPerMinute: number;
  /** Deadline for one Server Export job, in milliseconds — the whole render,
   *  print included, before it fails as render_timeout. */
  exportRenderTimeoutMs: number;
  /**
   * Root directory for Export History's encrypted PDFs (server/05) — kept
   * outside any web root; the Compose history volume mounts here (server/06).
   */
  historyDir: string;
  /**
   * Export History master key (server/05): 32 bytes as hex or base64. The
   * composition root (main.ts) requires it — Premium exports are supposed to
   * land in History, so a deployment without the key must not boot quietly.
   */
  historyEncryptionKey: string | null;
  /**
   * The AI provider key (ADR-0008): environment configuration only, never
   * written to settings, never returned by an endpoint, never logged. Absent
   * means AI is not configured — a fresh Self-Hosted Instance has no AI until
   * its operator supplies one. Rotating it needs a restart.
   */
  aiApiKey: string | null;
  /**
   * Transactional email (ADR-0013): the mail provider's API key. Belongs to
   * the deployment, never to a setting, and never leaves it. The composition
   * root (main.ts) requires it — sign-in is blocked until an address is
   * verified, so a deployment that cannot send mail is not a usable one.
   */
  resendApiKey: string | null;
  /** The from-address, as the provider takes it: `Name <local@domain>`. */
  mailFrom: string | null;
  /**
   * `console` prints transactional email to the server log instead of sending
   * it, so a local API needs no provider account. It is the only way past the
   * mail boot gate and has to be asked for by name; any other value is not a
   * mode, so the gate stays shut.
   */
  mailMode: MailMode | null;
}

const DEFAULT_DB_PATH = './data/perfectmarkd.db';
const DEFAULT_HISTORY_DIR = './data/history';
const DEFAULT_EXPORT_CONCURRENCY = 2;
const DEFAULT_EXPORT_BURST_PER_MINUTE = 10;
/** The whole job's deadline (launch/05): handshake, page run, and print. A
 *  300-page document renders in a few seconds, so a job still going after a
 *  minute is stuck, not slow — and the queue slot it holds is the reason the
 *  bound matters more than the exact number. */
const DEFAULT_EXPORT_RENDER_TIMEOUT_MS = 60_000;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const port = parsePort(source.PORT);
  return {
    port,
    dbPath: nonEmpty(source.DB_PATH) ?? DEFAULT_DB_PATH,
    sessionSecret: nonEmpty(source.SESSION_SECRET),
    adminEmail: nonEmpty(source.ADMIN_EMAIL),
    exportOrigin: nonEmpty(source.EXPORT_ORIGIN) ?? `http://localhost:${port}`,
    publicOrigin: parsePublicOrigin(source.PUBLIC_ORIGIN),
    exportConcurrency: parsePositiveInt(
      source.EXPORT_CONCURRENCY,
      DEFAULT_EXPORT_CONCURRENCY,
      'EXPORT_CONCURRENCY',
    ),
    exportBurstPerMinute: parsePositiveInt(
      source.EXPORT_BURST_PER_MINUTE,
      DEFAULT_EXPORT_BURST_PER_MINUTE,
      'EXPORT_BURST_PER_MINUTE',
    ),
    exportRenderTimeoutMs: parsePositiveInt(
      source.EXPORT_RENDER_TIMEOUT_MS,
      DEFAULT_EXPORT_RENDER_TIMEOUT_MS,
      'EXPORT_RENDER_TIMEOUT_MS',
    ),
    historyDir: nonEmpty(source.HISTORY_DIR) ?? DEFAULT_HISTORY_DIR,
    historyEncryptionKey: nonEmpty(source.HISTORY_ENCRYPTION_KEY),
    aiApiKey: nonEmpty(source.AI_API_KEY),
    resendApiKey: nonEmpty(source.RESEND_API_KEY),
    mailFrom: nonEmpty(source.MAIL_FROM),
    // Only the one documented mode counts. A value that is not `console`
    // selects nothing, so a typo (or an attempt at a kill switch) leaves the
    // boot gate shut rather than quietly starting an instance that sends
    // nothing.
    mailMode: nonEmpty(source.MAIL_MODE) === 'console' ? 'console' : null,
  };
}

function nonEmpty(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function parsePort(raw: string | undefined): number {
  if (!nonEmpty(raw)) return 3000;
  const port = Number(raw);
  // 0 (ephemeral) is rejected: a container platform needs a predictable port.
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT: ${JSON.stringify(raw)} — expected an integer 1–65535`,
    );
  }
  return port;
}

function parsePublicOrigin(raw: string | undefined): string | null {
  const value = nonEmpty(raw);
  // Absent is the boot gate's business, not this function's (mail/config.ts):
  // loadEnv reports "unset", it does not decide whether that is fatal.
  if (value === null) return null;
  const invalid = new Error(
    `Invalid PUBLIC_ORIGIN: ${JSON.stringify(raw)} — expected an absolute http(s) URL, e.g. https://perfectmarkd.example.com`,
  );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid;
  // A schemeless value fails here rather than becoming a link no browser can
  // open. The trailing slash goes so joining a path to the origin is
  // unambiguous: origin + '/verify-email', never origin + 'verify-email'.
  return value.replace(/\/+$/, '');
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!nonEmpty(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Invalid ${name}: ${JSON.stringify(raw)} — expected an integer ≥ 1`,
    );
  }
  return value;
}
