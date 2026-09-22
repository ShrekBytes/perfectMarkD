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
  /** Simultaneous Server Export renders (the ticket's default: 2). */
  exportConcurrency: number;
  /** Max exports one user may enqueue per rolling minute. */
  exportBurstPerMinute: number;
  /** Per-render deadline before a job fails as render_timeout. */
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
}

const DEFAULT_DB_PATH = './data/perfectmarkd.db';
const DEFAULT_HISTORY_DIR = './data/history';
const DEFAULT_EXPORT_CONCURRENCY = 2;
const DEFAULT_EXPORT_BURST_PER_MINUTE = 10;
const DEFAULT_EXPORT_RENDER_TIMEOUT_MS = 120_000;

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
