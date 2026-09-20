import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createOrder, listOrders, submitOrderPayment } from './api';

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ORDER = {
  id: 1,
  referenceCode: 'PM-7F3K2',
  plan: 'pro',
  durationMonths: 3,
  coin: 'USDT',
  network: 'TRC20',
  amountExpected: '9',
  ltcRateUsdt: null,
  status: 'pending',
  txid: null,
  amountClaimed: null,
  note: null,
  rejectReason: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  decidedAt: null,
  walletAddress: 'TTron',
};

describe('createOrder', () => {
  it('posts the selection and unwraps the order', async () => {
    const fetchMock = stubFetch((url, init) => {
      expect(url).toBe('/api/orders');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      expect(JSON.parse(String(init?.body))).toEqual({
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'USDT-TRC20',
      });
      return jsonResponse(201, { order: ORDER });
    });

    const order = await createOrder({
      plan: 'pro',
      durationMonths: 3,
      paymentMethod: 'USDT-TRC20',
    });

    expect(order).toEqual(ORDER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the server error message with its status', async () => {
    stubFetch(() =>
      jsonResponse(503, {
        error:
          'This payment method is not set up yet — please pick another one.',
      }),
    );

    const error = await createOrder({
      plan: 'pro',
      durationMonths: 1,
      paymentMethod: 'LTC',
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/not set up yet/i);
    expect((error as ApiError).status).toBe(503);
  });
});

describe('listOrders', () => {
  it('unwraps the orders array', async () => {
    stubFetch((url) => {
      expect(url).toBe('/api/orders');
      return jsonResponse(200, { orders: [ORDER] });
    });

    expect(await listOrders()).toEqual([ORDER]);
  });

  it('rejects a 200 with the wrong envelope as an ApiError', async () => {
    // A portal or proxy answering 200 with a non-API body must reach the
    // page as a renderable failure, never `undefined` into a .length.
    stubFetch(() => jsonResponse(200, { nope: true }));

    const error = await listOrders().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/shape this page can’t read/i);
    expect((error as ApiError).code).toBe('fallback');
  });

  it('rejects an empty 200 body as an ApiError', async () => {
    stubFetch(
      () =>
        new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const error = await listOrders().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('submitOrderPayment', () => {
  it('posts the payment details to the order’s submission endpoint', async () => {
    stubFetch((url, init) => {
      expect(url).toBe('/api/orders/1/submission');
      expect(JSON.parse(String(init?.body))).toEqual({
        network: 'TRC20',
        txid: 'a'.repeat(64),
        amount: 9,
        note: 'sent',
      });
      return jsonResponse(200, { order: { ...ORDER, txid: 'a'.repeat(64) } });
    });

    const order = await submitOrderPayment(1, {
      network: 'TRC20',
      txid: 'a'.repeat(64),
      amount: 9,
      note: 'sent',
    });

    expect(order.txid).toBe('a'.repeat(64));
  });
});
