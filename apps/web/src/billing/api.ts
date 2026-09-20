// ─────────────────────────────────────────────────────────────────────────────
// Server orders API client (billing/01). Same shape as auth/api.ts: same-origin
// fetches, session in the httpOnly cookie, and errors crossing this boundary
// as ApiError carrying the server's message for display.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, errorFrom, FALLBACK_CODE, postJson } from '../api/client';

export { ApiError };
export type OrderStatus = 'pending' | 'verified' | 'rejected';
export type Coin = 'USDT' | 'LTC';
export type Network = 'TRC20' | 'BEP20' | 'mainnet';
export type PaymentMethod = 'USDT-TRC20' | 'USDT-BEP20' | 'LTC';

/** The server's view of an Order (amounts are decimal strings, not floats). */
export interface Order {
  id: number;
  referenceCode: string;
  plan: string;
  durationMonths: number;
  coin: Coin;
  network: Network;
  /** Denominated in `coin`; LTC orders carry the rate captured at creation. */
  amountExpected: string;
  ltcRateUsdt: string | null;
  status: OrderStatus;
  txid: string | null;
  amountClaimed: string | null;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  walletAddress: string | null;
}

export interface CreateOrderInput {
  plan: 'pro' | 'premium';
  durationMonths: 1 | 3 | 6 | 12;
  paymentMethod: PaymentMethod;
}

export interface PaymentDetailsInput {
  network: Network;
  txid: string;
  amount: number;
  note?: string;
}

async function readOrder(res: Response): Promise<Order> {
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { order: Order }).order;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return readOrder(await postJson('/api/orders', input));
}

/** The user's Orders — validated against the shape the page renders, so a
 *  200 with the wrong envelope (a portal or proxy answering HTML, a truncated
 *  body) becomes an ApiError the sections can render, never `undefined`
 *  reaching a `.length`. */
export async function listOrders(): Promise<Order[]> {
  const res = await fetch('/api/orders', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  const body: unknown = await res.json().catch(() => null);
  const orders =
    typeof body === 'object' && body !== null && Array.isArray((body as {
      orders?: unknown;
    }).orders)
      ? (body as { orders: Order[] }).orders
      : null;
  if (orders === null) {
    throw new ApiError(
      'The orders list came back in a shape this page can’t read.',
      res.status,
      FALLBACK_CODE,
    );
  }
  return orders;
}

export async function submitOrderPayment(
  orderId: number,
  input: PaymentDetailsInput,
): Promise<Order> {
  return readOrder(await postJson(`/api/orders/${orderId}/submission`, input));
}
