import { ApiError, errorFrom, postJson } from '../api/client';
import type { Order } from '../billing/api';

export { ApiError };
export type { Order };
export type { OrderStatus } from '../billing/api';

/** The Entitlement state the queue shows alongside each Order. */
export interface EntitlementView {
  plan: string;
  expiresAt: string;
}

/** An Order as the admin panel sees it: the user's own view plus who owns it. */
export interface AdminOrder extends Order {
  userEmail: string;
  entitlement: EntitlementView | null;
}

/** A verify decision: a preset duration (stacked server-side) or an exact date. */
export type VerifyGrant = { durationMonths: number } | { expiresAt: string };

/** One line of the admin audit trail (billing/02). */
export interface AuditEntry {
  id: number;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export async function listAdminOrders(): Promise<AdminOrder[]> {
  const res = await fetch('/api/admin/orders', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { orders: AdminOrder[] }).orders;
}

export async function verifyOrder(
  orderId: number,
  grant: VerifyGrant,
): Promise<EntitlementView> {
  const res = await postJson(`/api/admin/orders/${orderId}/verify`, grant);
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { entitlement: EntitlementView }).entitlement;
}

export async function rejectOrder(
  orderId: number,
  reason: string,
): Promise<AdminOrder> {
  const res = await postJson(`/api/admin/orders/${orderId}/reject`, { reason });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { order: AdminOrder }).order;
}

export async function listAuditEntries(): Promise<AuditEntry[]> {
  const res = await fetch('/api/admin/audit', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { entries: AuditEntry[] }).entries;
}
