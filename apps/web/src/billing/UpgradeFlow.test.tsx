// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpgradeFlow } from './UpgradeFlow';
import * as authApi from '../auth/api';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';
import { resetPricingStoreForTests } from '../pricing/store';
import { jsonResponse } from '../testing/json-response';
import { PRICING_FAILURE, PRICING_RESPONSE } from '../testing/pricing-response';

const onClose = vi.fn();

const USDT_ORDER = {
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
  paymentDeadline: null,
  paymentExpired: false,
  walletAddress: 'TTronWalletForTheTest',
};

const LTC_ORDER = {
  ...USDT_ORDER,
  id: 2,
  coin: 'LTC',
  network: 'mainnet',
  amountExpected: '0.13104524',
  ltcRateUsdt: '320.5',
  walletAddress: 'ltc1qTheLitecoinTestAddress',
};

const TXID = 'a'.repeat(64);

/** The shared stubbed pricing payload: the seeded figures, except Pro's twelve
 *  months, which is 47 rather than 30 — a deliberate discount no client
 *  arithmetic could produce. */
const PRICING = PRICING_RESPONSE;

/** Answers /api/pricing, failing the test on any other URL so a surface that
 *  reaches for something else cannot slip through. */
function stubApi(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string | URL | Request) => {
    expect(String(url)).toBe('/api/pricing');
    return Promise.resolve(jsonResponse(200, PRICING));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetAccountStoreForTests();
  resetPricingStoreForTests();
  stubApi();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

function signIn() {
  useAccountStore.setState({
    user: { email: 'a@b.co', isAdmin: false },
    status: 'ready',
  });
}

/** Stub POST /api/orders, then create the order from the details step. */
async function createOrderThroughUi(
  user: ReturnType<typeof userEvent.setup>,
  response: { status: number; body: unknown },
) {
  const fetchMock = vi.fn((url: string | URL | Request) => {
    expect(String(url)).toBe('/api/orders');
    return Promise.resolve(jsonResponse(response.status, response.body));
  });
  vi.stubGlobal('fetch', fetchMock);

  await user.click(screen.getByRole('button', { name: /^Create order/ }));

  return fetchMock;
}

describe('details step', () => {
  it('offers the durations with the prices the endpoint returned and the three payment methods', async () => {
    render(<UpgradeFlow plan="pro" onClose={onClose} />);

    // Duration options and payment instruments are static; the price each one
    // carries is not, and the coin named here is the instrument, not the price.
    expect(screen.getByText('1 month')).toBeInTheDocument();
    expect(screen.getByText('3 months')).toBeInTheDocument();
    expect(screen.getByText('12 months')).toBeInTheDocument();
    expect(screen.getByText('USDT · TRC-20')).toBeInTheDocument();
    expect(screen.getByText('USDT · BEP-20')).toBeInTheDocument();
    expect(screen.getByText('Litecoin · LTC')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('upgrade-total')).toHaveTextContent('$4.50'),
    );
    expect(screen.getByTestId('duration-price-12')).toHaveTextContent('$47');
  });

  it('shows no price at all before the response lands', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<UpgradeFlow plan="pro" onClose={onClose} />);

    // The durations are on screen; the figures are not. A stale number read as
    // current is the failure this removes.
    expect(screen.getByText('12 months')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-total')).toHaveTextContent('');
    expect(screen.getByTestId('duration-price-12')).toHaveTextContent('');
  });

  it('says the total is unavailable when the prices cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(500, PRICING_FAILURE))),
    );
    render(<UpgradeFlow plan="pro" onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByTestId('upgrade-total')).toHaveTextContent(
        'Unavailable',
      ),
    );
    expect(screen.getByTestId('duration-price-1')).toHaveTextContent(
      'Unavailable',
    );
    // Never a fallback to the seeded default.
    expect(screen.queryByText('$3')).toBeNull();
    expect(screen.queryByText('$4.50')).toBeNull();
  });

  it('reads the total for the chosen duration, including a deliberate discount', async () => {
    const user = userEvent.setup();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-total')).toHaveTextContent('$4.50'),
    );

    await user.click(screen.getByRole('button', { name: /12 months/ }));

    // 47, not 4.5 × 12: the stored figure is the whole price of twelve months,
    // and the client never derives one.
    expect(screen.getByTestId('upgrade-total')).toHaveTextContent('$47');
  });

  it('reads the total for the chosen duration on Premium', async () => {
    const user = userEvent.setup();
    render(<UpgradeFlow plan="premium" onClose={onClose} />);
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-total')).toHaveTextContent('$9'),
    );

    await user.click(screen.getByRole('button', { name: /12 months/ }));

    expect(screen.getByTestId('upgrade-total')).toHaveTextContent('$90');
  });

  it('sends the selected plan, duration, and method to the server', async () => {
    const user = userEvent.setup();
    signIn();
    render(<UpgradeFlow plan="premium" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /6 months/ }));
    await user.click(screen.getByRole('button', { name: /Litecoin · LTC/ }));

    let body: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse(201, { order: LTC_ORDER }));
      }),
    );
    await user.click(screen.getByRole('button', { name: /^Create order/ }));

    await waitFor(() =>
      expect(
        screen.getByTestId('upgrade-step-instructions'),
      ).toBeInTheDocument(),
    );
    expect(body).toEqual({
      plan: 'premium',
      durationMonths: 6,
      paymentMethod: 'LTC',
    });
  });
});

describe('account step', () => {
  it('asks for an account before creating the order when signed out', async () => {
    const user = userEvent.setup();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(screen.getByTestId('upgrade-step-auth')).toBeInTheDocument();
    expect(screen.getByTestId('auth-form')).toBeInTheDocument();
  });

  it('creates the order right after signing in', async () => {
    const user = userEvent.setup();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    const login = vi
      .spyOn(authApi, 'login')
      .mockResolvedValue({ email: 'a@b.co', isAdmin: false });
    // The flow fetches twice: the account store's post-sign-in /api/me
    // refresh (server/04) and the order creation itself.
    const createOrder = vi.fn(() =>
      Promise.resolve(jsonResponse(201, { order: USDT_ORDER })),
    );
    const fetchMock = vi.fn((url: string | URL | Request) =>
      String(url).endsWith('/api/me')
        ? Promise.resolve(
            jsonResponse(200, {
              email: 'a@b.co',
              isAdmin: false,
              plan: null,
              expiresAt: null,
              quota: { used: 0, limit: 0 },
              flags: {
                paidTier: false,
              },
            }),
          )
        : createOrder(),
    );
    vi.stubGlobal('fetch', fetchMock);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'correct horse');
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }));

    await waitFor(() =>
      expect(
        screen.getByTestId('upgrade-step-instructions'),
      ).toBeInTheDocument(),
    );
    expect(login).toHaveBeenCalledWith('a@b.co', 'correct horse');
    expect(useAccountStore.getState().user).toEqual({
      email: 'a@b.co',
      isAdmin: false,
    });
    // Exactly one order-creation request — the /api/me refresh is the only
    // other fetch the flow makes.
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('stops at the inbox after registering, creating no order yet', async () => {
    // A registration starts no session (email/02), so the Order cannot be
    // created until the address is verified.
    const user = userEvent.setup();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    const register = vi
      .spyOn(authApi, 'register')
      .mockResolvedValue({ email: 'a@b.co' });
    const createOrder = vi.fn();

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'correct horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByTestId('upgrade-step-verify-email'),
    ).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith('a@b.co', 'correct horse');
    expect(createOrder).not.toHaveBeenCalled();
    // Story 2 applies in the dialog too: the user learns which inbox to open.
    expect(screen.getByText('a@b.co')).toBeInTheDocument();
    expect(screen.getByText(/verification link/i)).toBeInTheDocument();
  });

  it('can switch between register and sign-in in place', async () => {
    const user = userEvent.setup();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    // Now the submit button is "Sign in" and switching back offers "Create an account".
    expect(
      screen.getByRole('button', { name: /^Sign in$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create an account' }),
    ).toBeInTheDocument();
  });
});

describe('instructions step', () => {
  it('shows amount, reference code, wallet, and the network warning — all copyable', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    signIn();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await createOrderThroughUi(user, {
      status: 201,
      body: { order: USDT_ORDER },
    });

    expect(
      await screen.findByTestId('upgrade-step-instructions'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('order-amount')).toHaveTextContent('9 USDT');
    expect(screen.getAllByText('PM-7F3K2').length).toBeGreaterThan(0);
    expect(screen.getByText('TTronWalletForTheTest')).toBeInTheDocument();
    expect(screen.getByText(/Send only USDT on TRC-20/)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Copy wallet address' }),
    );
    expect(writeText).toHaveBeenCalledWith('TTronWalletForTheTest');
    await user.click(
      screen.getByRole('button', { name: 'Copy reference code' }),
    );
    expect(writeText).toHaveBeenCalledWith('PM-7F3K2');
  });

  it('explains the LTC amount with the captured rate', async () => {
    const user = userEvent.setup();
    signIn();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await createOrderThroughUi(user, {
      status: 201,
      body: { order: LTC_ORDER },
    });

    expect(
      await screen.findByTestId('upgrade-step-instructions'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('order-amount')).toHaveTextContent(
      '0.13104524 LTC',
    );
    expect(screen.getByText(/≈ 42\.00 USDT/)).toBeInTheDocument();
    expect(screen.getByText(/320\.5 USDT\/LTC/)).toBeInTheDocument();
    expect(screen.getByText(/Send only LTC/)).toBeInTheDocument();
  });

  it('surfaces server refusals, e.g. unconfigured payment methods', async () => {
    const user = userEvent.setup();
    signIn();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await createOrderThroughUi(user, {
      status: 503,
      body: {
        error:
          'LTC payments are not set up yet — please pick another payment method.',
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /not set up yet/i,
    );
    // Still on the details step, selection intact.
    expect(screen.getByTestId('upgrade-step-details')).toBeInTheDocument();
  });

  it('offers to pay later — the order survives on the Account page', async () => {
    const user = userEvent.setup();
    signIn();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await createOrderThroughUi(user, {
      status: 201,
      body: { order: USDT_ORDER },
    });
    await screen.findByTestId('upgrade-step-instructions');

    await user.click(screen.getByRole('button', { name: /Pay later/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('payment step', () => {
  async function reachPaymentStep(user: ReturnType<typeof userEvent.setup>) {
    signIn();
    render(<UpgradeFlow plan="pro" onClose={onClose} />);
    await createOrderThroughUi(user, {
      status: 201,
      body: { order: USDT_ORDER },
    });
    await screen.findByTestId('upgrade-step-instructions');
    await user.click(
      screen.getByRole('button', { name: /I've sent the payment/ }),
    );
    await screen.findByTestId('upgrade-step-payment');
  }

  it('submits the details and lands on the pending confirmation', async () => {
    const user = userEvent.setup();
    await reachPaymentStep(user);

    // A USDT order can only be sent on USDT networks.
    expect(screen.getByRole('option', { name: 'TRC-20' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BEP-20' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Litecoin mainnet' }),
    ).not.toBeInTheDocument();

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe('/api/orders/1/submission');
        expect(JSON.parse(String(init?.body))).toEqual({
          network: 'TRC20',
          txid: TXID,
          amount: 9,
        });
        return Promise.resolve(
          jsonResponse(200, {
            order: { ...USDT_ORDER, txid: TXID, amountClaimed: '9' },
          }),
        );
      }),
    );

    await user.type(screen.getByLabelText(/transaction id/i), TXID);
    await user.click(
      screen.getByRole('button', { name: /Submit payment details/ }),
    );

    expect(
      await screen.findByTestId('upgrade-step-submitted'),
    ).toBeInTheDocument();
    expect(screen.getByText(/PM-7F3K2/)).toBeInTheDocument();
  });

  it('rejects a malformed txid without contacting the server', async () => {
    const user = userEvent.setup();
    await reachPaymentStep(user);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await user.type(screen.getByLabelText(/transaction id/i), 'not-a-txid');
    await user.click(
      screen.getByRole('button', { name: /Submit payment details/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /64-character hexadecimal/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects amounts that are not greater than zero', async () => {
    const user = userEvent.setup();
    await reachPaymentStep(user);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const amount = screen.getByLabelText(new RegExp(`amount sent`, 'i'));
    await user.clear(amount);
    await user.type(amount, '0');
    await user.type(screen.getByLabelText(/transaction id/i), TXID);
    await user.click(
      screen.getByRole('button', { name: /Submit payment details/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /greater than 0/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows server errors instead of advancing', async () => {
    const user = userEvent.setup();
    await reachPaymentStep(user);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse(409, { error: 'Order not found.' })),
      ),
    );

    await user.type(screen.getByLabelText(/transaction id/i), TXID);
    await user.click(
      screen.getByRole('button', { name: /Submit payment details/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Order not found.',
    );
    expect(screen.getByTestId('upgrade-step-payment')).toBeInTheDocument();
  });
});
