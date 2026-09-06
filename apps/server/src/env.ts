export interface ServerEnv {
  port: number;
  dbPath: string;
  /** Signs session cookies — auth (server/02) makes it required once used. */
  sessionSecret: string | null;
  /** First registered account with this email becomes the Admin. */
  adminEmail: string | null;
}

const DEFAULT_DB_PATH = './data/perfectmarkd.db';

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  return {
    port: parsePort(source.PORT),
    dbPath: nonEmpty(source.DB_PATH) ?? DEFAULT_DB_PATH,
    sessionSecret: nonEmpty(source.SESSION_SECRET),
    adminEmail: nonEmpty(source.ADMIN_EMAIL),
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
