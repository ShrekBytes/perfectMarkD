// ─────────────────────────────────────────────────────────────────────────────
// better-sqlite3 constraint errors, shared by route modules that let the
// UNIQUE index arbitrate races (registration, reference codes).
// ─────────────────────────────────────────────────────────────────────────────

/** SQLite's unique-index violation (better-sqlite3 error code). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
