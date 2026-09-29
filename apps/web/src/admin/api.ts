import {
  ApiError,
  deleteJson,
  errorFrom,
  postJson,
  putJson,
} from '../api/client';
import type { Order, PaymentMethod } from '../billing/api';
// The stored prices/limits are one wire shape read by the pricing surfaces and
// edited by the admin panel — the pricing API owns the types.
import type { PlanLimits, PlanPrices } from '../pricing/api';

export { ApiError };
export type { Order };
export type { OrderStatus, PaymentMethod } from '../billing/api';
export type { PlanLimits, PlanPrices };

/** The Entitlement state the queue shows alongside each Order. */
interface EntitlementView {
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
type VerifyGrant = { durationMonths: number } | { expiresAt: string };

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
interface UsageView {
  period: string;
  used: number;
  /** Admin-granted extra allowance for the period (comp quota). */
  comps: number;
  /** The plan's monthly quota while the Entitlement is active, plus comps. */
  allowance: number;
}

/** This period's AI Action usage, as the panel shows it (03). */
export interface AiUsageView {
  period: string;
  used: number;
  /** The plan's monthly AI Allowance while the Entitlement is active. */
  allowance: number;
  remaining: number;
}

/** A user row in the search list. */
export interface AdminUser {
  id: number;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  entitlement: EntitlementView | null;
  usage: UsageView;
  aiUsage: AiUsageView;
}

/** The detail view: the row plus the user's Order history. */
export interface AdminUserDetail extends AdminUser {
  orders: AdminOrder[];
}

/** A manual Entitlement grant: a plan with a duration or an exact date. */
type ManualGrant = { plan: 'pro' | 'premium' } & VerifyGrant;

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

/**
 * Mails the user a password-reset link; the Admin never sees or sets a password.
 * The reply says which link went out — an account whose email was never verified
 * gets the verification link instead, because a reset link cannot get it in — and
 * how long it lives, so the panel states the server's window rather than a copy
 * of it.
 */
export interface SentResetLink {
  kind: 'password_reset' | 'verification';
  expiresInMinutes: number;
}

export async function sendUserResetLink(
  userId: number,
): Promise<SentResetLink> {
  const res = await postJson(`/api/admin/users/${userId}/password`, {});
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as SentResetLink;
}

/**
 * Mails a link to `email`; the account moves onto it only when that address's
 * owner opens the link. Resolves to the normalized address the server stored, so
 * the confirmation names the inbox that will actually receive it.
 */
export async function changeUserEmail(
  userId: number,
  email: string,
): Promise<string> {
  const res = await postJson(`/api/admin/users/${userId}/email`, { email });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { email: string }).email;
}

export async function deleteAdminUser(userId: number): Promise<void> {
  const res = await deleteJson(`/api/admin/users/${userId}`);
  if (!res.ok) throw await errorFrom(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings (billing/03 + ai-transforms/03): wallets, prices, limits, and the
// AI Provider Config — all in settings_kv on the server, editable without a
// redeploy. The Rate is reported here and cannot be written (ADR-0014). The AI
// key is never part of any payload; the view only says whether the environment
// has one.
// ─────────────────────────────────────────────────────────────────────────────

export type WalletAddresses = Record<PaymentMethod, string>;

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high';

/** The Admin's AI Provider Config; the key lives in the environment only. */
export interface AiProviderConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  stylesheetModel: string | null;
  reasoningEffort: ReasoningEffort;
  contextWindow: number;
  maxOutputTokens: number;
  maxInputCharacters: number;
  timeoutSeconds: number;
  burstPerMinute: number;
}

/** The Rate as the panel reads it. Read-only: a job writes it, not the Admin. */
export interface LtcRateStatus {
  /** USDT per LTC, or null while no fetch has ever produced one. */
  usdtPerLtc: number | null;
  /** When the Rate was last fetched, ISO 8601. */
  lastFetchedAt: string | null;
  /**
   * Milliseconds between that fetch and the read. Reported for the panel's
   * benefit and for anything deciding freshness numerically; the *displayed*
   * age is derived from `lastFetchedAt` in the browser, because a figure
   * frozen at fetch time reads as current on a panel left open all afternoon.
   */
  ageMs: number | null;
  /** When a fetch was last attempted, successful or not. */
  lastAttemptAt: string | null;
  /** Why the last attempt failed, if it did. */
  lastError: string | null;
}

export interface AdminSettings {
  wallets: WalletAddresses;
  prices: PlanPrices;
  limits: PlanLimits;
  ltcRate: LtcRateStatus;
  aiProvider: AiProviderConfig;
  /** Whether the deployment's environment has an AI key — never the key. */
  aiKeyPresent: boolean;
}

/** The keys the panel can write. The Rate is not among them (ADR-0014). */
export type SettingsKey = 'wallets' | 'prices' | 'limits' | 'aiProvider';

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

/** Published model metadata from Test connection. */
interface AiConnectionModel {
  id: string;
  contextLength: number | null;
  maxOutputTokens: number | null;
}

/** Test connection's report — Admin-only, never persisted. */
export interface AiConnectionReport {
  ok: boolean;
  keyPresent: boolean;
  model: AiConnectionModel | null;
  warnings: string[];
  error: string | null;
  detail: string | null;
}

/**
 * Tests the draft the panel is editing; the server re-validates it and uses
 * the environment's key without ever returning it.
 */
export async function testAiConnection(
  config: AiProviderConfig,
): Promise<AiConnectionReport> {
  const res = await postJson('/api/admin/settings/ai/test', config);
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { report: AiConnectionReport }).report;
}
