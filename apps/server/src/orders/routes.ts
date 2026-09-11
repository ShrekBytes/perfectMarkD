import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { isUniqueViolation } from '../db/sqlite-errors.js';
import { asRecord, parseJson } from '../request-body.js';
import { getLtcRate, getPlanPrices, getWallets } from '../db/settings.js';
import {
  DURATION_MONTHS,
  NETWORKS,
  PAYMENT_METHODS,
  PLANS,
  orders,
  type Order,
  type OrderStatus,
} from '../db/schema.js';
import { ltcAmountFor, toCryptoAmount } from './amounts.js';
import {
  METHOD_COIN_NETWORK,
  methodForCoinNetwork,
  networkListForCoin,
  networkValidForCoin,
  TXID_PATTERN,
} from './payment.js';
import { newReferenceCode } from './reference-code.js';

// ─────────────────────────────────────────────────────────────────────────────
// Orders (billing/01): a user's Manual Payment request, pending until the
// Admin verifies or rejects it (billing/02's panel decides; this module only
// creates and amends). All routes require a session — the upgrade flow is the
// first thing an account is for.
// ─────────────────────────────────────────────────────────────────────────────

/** The largest note a submission accepts; it is advisory text, not data. */
const MAX_NOTE_LENGTH = 1000;

export interface OrderView {
  id: number;
  referenceCode: string;
  plan: string;
  durationMonths: number;
  coin: string;
  network: string;
  /** Decimal string, denominated in `coin` (LTC orders in LTC, see amounts.ts). */
  amountExpected: string;
  /** USDT per LTC captured at creation; null for USDT orders. */
  ltcRateUsdt: string | null;
  status: OrderStatus;
  txid: string | null;
  amountClaimed: string | null;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** The receiving address for the Order's method — what payments go to. */
  walletAddress: string | null;
}

interface CreateInput {
  plan: string;
  durationMonths: number;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
}

function parseCreate(body: unknown): CreateInput | { error: string } {
  const record = asRecord(body);
  if (!record) {
    return { error: 'Expected a JSON object.' };
  }
  if (
    typeof record.plan !== 'string' ||
    !(PLANS as readonly string[]).includes(record.plan)
  ) {
    return { error: 'Choose a plan.' };
  }
  if (
    typeof record.durationMonths !== 'number' ||
    !DURATION_MONTHS.includes(record.durationMonths as 1 | 3 | 6 | 12)
  ) {
    return { error: 'Choose a duration.' };
  }
  if (
    typeof record.paymentMethod !== 'string' ||
    !(PAYMENT_METHODS as readonly string[]).includes(record.paymentMethod)
  ) {
    return { error: 'Choose a payment method.' };
  }
  return {
    plan: record.plan,
    durationMonths: record.durationMonths,
    paymentMethod: record.paymentMethod as CreateInput['paymentMethod'],
  };
}

interface SubmissionInput {
  network: string;
  txid: string;
  amount: number;
  note: string | null;
}

function parseSubmission(body: unknown): SubmissionInput | { error: string } {
  const record = asRecord(body);
  if (!record) {
    return { error: 'Expected a JSON object.' };
  }
  if (
    typeof record.network !== 'string' ||
    !(NETWORKS as readonly string[]).includes(record.network)
  ) {
    return { error: 'Choose the network you sent on.' };
  }
  if (
    typeof record.txid !== 'string' ||
    !TXID_PATTERN.test(record.txid.trim())
  ) {
    return {
      error:
        'Enter the transaction ID — the 64-character hexadecimal string your wallet or explorer shows.',
    };
  }
  if (
    typeof record.amount !== 'number' ||
    !Number.isFinite(record.amount) ||
    record.amount <= 0
  ) {
    return { error: 'Enter the amount you sent, greater than 0.' };
  }
  let note: string | null = null;
  if (record.note !== undefined && record.note !== null) {
    if (typeof record.note !== 'string') {
      return { error: 'Notes must be text.' };
    }
    note = record.note.trim();
    if (note.length > MAX_NOTE_LENGTH) {
      return { error: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
    }
    if (note === '') note = null;
  }
  return {
    network: record.network,
    txid: record.txid.trim(),
    amount: record.amount,
    note,
  };
}

/**
 * The client-facing Order view. Exported for the admin panel (billing/02),
 * whose view adds the user's email and Entitlement on top of the same shape.
 */
export function orderView(order: Order, walletAddress: string): OrderView {
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    plan: order.plan,
    durationMonths: order.duration,
    coin: order.coin,
    network: order.network,
    amountExpected: order.amountExpected,
    ltcRateUsdt: order.ltcRateUsdt,
    status: order.status as OrderStatus,
    txid: order.txid,
    amountClaimed: order.amountClaimed,
    note: order.note,
    rejectReason: order.rejectReason,
    createdAt: order.createdAt.toISOString(),
    decidedAt: order.decidedAt?.toISOString() ?? null,
    walletAddress: walletAddress === '' ? null : walletAddress,
  };
}

export function orderRoutes() {
  const app = new Hono<AppEnv>();

  app.post('/', async (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const parsed = parseCreate(parseJson(await c.req.text()));
    if ('error' in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    const { coin, network } = METHOD_COIN_NETWORK[parsed.paymentMethod];
    const wallets = getWallets(c.var.db);
    const walletAddress = wallets[parsed.paymentMethod];
    if (walletAddress.trim() === '') {
      return c.json(
        {
          error:
            'This payment method is not set up yet — please pick another one.',
        },
        503,
      );
    }

    const prices = getPlanPrices(c.var.db);
    const amountUsdt =
      prices[parsed.plan as 'pro' | 'premium'].durations[
        parsed.durationMonths as 1 | 3 | 6 | 12
      ];

    let amountExpected = toCryptoAmount(amountUsdt);
    let ltcRateUsdt: string | null = null;
    if (coin === 'LTC') {
      const rate = getLtcRate(c.var.db);
      if (rate === null) {
        return c.json(
          {
            error:
              'LTC payments are not set up yet — please pick another payment method.',
          },
          503,
        );
      }
      ltcRateUsdt = toCryptoAmount(rate);
      amountExpected = ltcAmountFor(amountUsdt, rate);
    }

    // Reference codes are random; the UNIQUE index arbitrates the (vanishingly
    // unlikely) collision and the insert is retried with a fresh code.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = c.var.db
          .insert(orders)
          .values({
            referenceCode: newReferenceCode(),
            userId: user.id,
            plan: parsed.plan,
            duration: parsed.durationMonths,
            coin,
            network,
            amountExpected,
            ltcRateUsdt,
          })
          .returning()
          .get();
        return c.json({ order: orderView(created, walletAddress) }, 201);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return c.json({ error: 'Could not create the order — try again.' }, 500);
  });

  app.get('/', (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const rows = c.var.db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.id))
      .all();
    const wallets = getWallets(c.var.db);
    return c.json({
      orders: rows.map((order) => {
        const method = methodForCoinNetwork(order.coin, order.network);
        return orderView(order, method ? wallets[method] : '');
      }),
    });
  });

  app.post('/:id/submission', async (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Order not found.' }, 404);
    }

    const parsed = parseSubmission(parseJson(await c.req.text()));
    if ('error' in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    const order = c.var.db.select().from(orders).where(eq(orders.id, id)).get();
    // 404 also covers someone else's Order: its existence is not other
    // users' business.
    if (!order || order.userId !== user.id) {
      return c.json({ error: 'Order not found.' }, 404);
    }
    if (order.status === 'verified') {
      return c.json(
        { error: 'This order is already verified — nothing to amend.' },
        409,
      );
    }
    if (!networkValidForCoin(order.coin, parsed.network)) {
      return c.json(
        {
          error: `This order is paid in ${order.coin} — it can only be submitted on ${networkListForCoin(order.coin)}.`,
        },
        400,
      );
    }

    // First submission and resubmission are the same operation: the details
    // are amended, a rejection reason no longer applies, and the Order is
    // back in the pending queue for the Admin (billing/02).
    const updated = c.var.db
      .update(orders)
      .set({
        network: parsed.network,
        txid: parsed.txid,
        amountClaimed: toCryptoAmount(parsed.amount),
        note: parsed.note,
        status: 'pending',
        rejectReason: null,
        decidedAt: null,
      })
      .where(eq(orders.id, id))
      .returning()
      .get();

    const wallets = getWallets(c.var.db);
    const method = methodForCoinNetwork(updated.coin, updated.network);
    return c.json({
      order: orderView(updated, method ? wallets[method] : ''),
    });
  });

  return app;
}
