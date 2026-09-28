import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';
import {
  auditLogs,
  type AuditAction,
  type AuditTargetType,
  type User,
} from '../db/schema.js';

/** The database or the transaction the audit row lands in on. */
export type Executor = BetterSQLite3Database<typeof schema>;

export interface AuditEntry {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  /** The state before the action; null when there is none to record. */
  before: unknown;
  /** The state after the action; null when it does not exist yet. */
  after: unknown;
}

/**
 * The one audit-log insert, shared by every admin route that changes state
 * (billing/02): the acting Admin is snapshotted from the session, and the row
 * lands wherever the caller's transaction does — an action and its trail must
 * commit together, or not at all.
 */
export function recordAudit(
  db: Executor,
  admin: User,
  entry: AuditEntry,
): void {
  db.insert(auditLogs)
    .values({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before,
      after: entry.after,
    })
    .run();
}
