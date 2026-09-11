import {
  ApiError,
  deleteJson,
  errorFrom,
  postJson,
  putJson,
} from '../api/client';
import type { Order, PaymentMethod } from '../billing/api';

export { ApiError };
export type { Order };
export type { OrderStatus, PaymentMethod } from '../billing/api';

/** The Entitlement state the queue shows alongside each Order. */
export interface EntitlementView {
  plan: string;
  expiresAt: string;
}

/** An Order as the admin panel sees it: the user's own view plus who owns it. */
export interface AdminOrder extends Order {
  /** Null when the Order's account was deleted (anonymized Order). */
  userEmail: string | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// User management (billing/03).
// ─────────────────────────────────────────────────────────────────────────────

/** This period's Server Export usage, as the panel shows it. */
export interface UsageView {
  period: string;
  used: number;
  /** Admin-granted extra allowance for the period (comp quota). */
  comps: number;
  /** The plan's monthly quota while the Entitlement is active, plus comps. */
  allowance: number;
}

/** A user row in the search list. */
export interface AdminUser {
  id: number;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  entitlement: EntitlementView | null;
  usage: UsageView;
}

/** The detail view: the row plus the user's Order history. */
export interface AdminUserDetail extends AdminUser {
  orders: AdminOrder[];
}

/** A manual Entitlement grant: a plan with a duration or an exact date. */
export type ManualGrant = { plan: 'pro' | 'premium' } & VerifyGrant;

export async function listAdminUsers(query = ''): Promise<AdminUser[]> {
  const suffix = query.trim()
    ? `?query=${encodeURIComponent(query.trim())}`
    : '';
  const res = await fetch(`/api/admin/users${suffix}`, {
    credentials: 'include',
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { users: AdminUser[] }).users;
}

export async function getAdminUser(userId: number): Promise<AdminUserDetail> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { user: AdminUserDetail }).user;
}

export async function grantEntitlement(
  userId: number,
  grant: ManualGrant,
): Promise<AdminUser> {
  const res = await postJson(`/api/admin/users/${userId}/entitlement`, grant);
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { user: AdminUser }).user;
}

export async function revokeEntitlement(userId: number): Promise<AdminUser> {
  const res = await deleteJson(`/api/admin/users/${userId}/entitlement`);
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { user: AdminUser }).user;
}

export async function compQuota(
  userId: number,
  amount: number,
): Promise<AdminUser> {
  const res = await postJson(`/api/admin/users/${userId}/quota/comp`, {
    amount,
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { user: AdminUser }).user;
}

/** The one-time temporary password, for out-of-band handoff to the user. */
export async function resetUserPassword(userId: number): Promise<string> {
  const res = await postJson(`/api/admin/users/${userId}/password`, {});
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { temporaryPassword: string })
    .temporaryPassword;
}

export async function deleteAdminUser(userId: number): Promise<void> {
  const res = await deleteJson(`/api/admin/users/${userId}`);
  if (!res.ok) throw await errorFrom(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings (billing/03): wallets, prices, limits, LTC rate — all in
// settings_kv on the server, editable without a redeploy.
// ─────────────────────────────────────────────────────────────────────────────

export type WalletAddresses = Record<PaymentMethod, string>;

export interface PlanPrice {
  monthly: number;
  durations: Record<1 | 3 | 6 | 12, number>;
}
export type PlanPrices = Record<'pro' | 'premium', PlanPrice>;

export interface PlanLimit {
  pageCap: number;
  quotaMonthly: number;
}
export type PlanLimits = Record<'pro' | 'premium', PlanLimit>;

export interface AdminSettings {
  wallets: WalletAddresses;
  prices: PlanPrices;
  limits: PlanLimits;
  /** USDT per LTC captured into new Orders; null disables LTC payments. */
  ltcRateUsdt: number | null;
}

export type SettingsKey = 'wallets' | 'prices' | 'limits' | 'ltcRateUsdt';

export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await fetch('/api/admin/settings', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { settings: AdminSettings }).settings;
}

export async function updateAdminSetting(
  key: SettingsKey,
  value: unknown,
): Promise<AdminSettings> {
  const res = await putJson(`/api/admin/settings/${key}`, value);
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { settings: AdminSettings }).settings;
}
