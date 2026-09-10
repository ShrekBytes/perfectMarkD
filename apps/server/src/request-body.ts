// ─────────────────────────────────────────────────────────────────────────────
// Request-body parsing shared by the route modules (auth, orders). JSON
// bodies are read as text first, so a malformed body is a plain null rather
// than a thrown parse error.
// ─────────────────────────────────────────────────────────────────────────────

export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** The request body as a plain object, or null when it isn't one. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
