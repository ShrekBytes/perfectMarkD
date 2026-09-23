import { useCallback, useEffect, useState } from 'react';
import { Link } from '../router';
import { errorToMessage } from '../api/client';
import { useTheme } from '../theme/theme';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAccountStore } from '../auth/account-store';
import { listOrders, type Order } from '../billing/api';
import { ErrorBoundary } from '../shell/ErrorBoundary';
import { PlanSummary } from './PlanSummary';
import { AiSection } from './AiSection';
import { OrdersSection } from './OrdersSection';
import { HistorySection } from './HistorySection';
import { ChangePasswordForm } from './ChangePasswordForm';

/**
 * The Account page: everything the account owns in one calm, single-column
 * page — plan and Quota, Orders, Export History, and the inline
 * change-password form. The page composes existing endpoints only; no server
 * or schema changes. Chrome matches the auth pages' minimal header pattern
 * (wordmark linking back to the editor, theme toggle); no footer — the
 * Account page is an app surface, not a marketing surface. Signed out, it
 * offers the sign-in prompt; the data sections render for a signed-in
 * account only.
 */
export function AccountPage() {
  const { theme, toggle } = useTheme();
  const user = useAccountStore((state) => state.user);
  const status = useAccountStore((state) => state.status);
  const entitlement = useAccountStore((state) => state.entitlement);
  const quota = useAccountStore((state) => state.quota);
  const load = useAccountStore((state) => state.load);

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // The session check decides signed-in vs signed-out; until it resolves,
  // render nothing — flashing the wrong state is worse than a beat of nothing.
  useEffect(() => {
    void load();
  }, [load]);

  const refreshOrders = useCallback(async () => {
    setOrdersError(null);
    try {
      setOrders(await listOrders());
    } catch (cause) {
      setOrdersError(errorToMessage(cause));
    }
  }, []);

  const signedIn = status === 'ready' && user !== null;

  // Orders load once the session is known — the Plan summary reads them for
  // the ended plan's date, the Orders section renders the list.
  useEffect(() => {
    if (signedIn) void refreshOrders();
  }, [signedIn, refreshOrders]);

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
        <Link
          to="/"
          aria-label="PerfectMarkD home"
          className="touch-target inline-flex shrink-0 select-none items-center rounded-control px-1 text-sm font-semibold tracking-tight outline-offset-2 outline-accent focus-visible:outline-2"
        >
          Perfect<span className="font-mono">Mark</span>D
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      {status !== 'ready' ? null : !user ? (
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-pane border border-hairline bg-surface p-6">
            <h1 className="text-lg font-semibold tracking-tight">Account</h1>
            <p className="mt-1 text-xs text-ink-soft">
              You're not signed in. Sign in to see your plan, orders, and
              export history.
            </p>
            <Link
              to="/login"
              className="touch-target mt-4 flex h-9 w-full items-center justify-center rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
            >
              Sign in
            </Link>
          </div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="mt-1 text-xs text-ink-soft">{user.email}</p>

          <div className="mt-6 space-y-4">
            {/* Each section is contained: a render error inside one is that
                section's inline failure, not a blank page. */}
            <ErrorBoundary label="The Plan section">
              <PlanSummary
                entitlement={entitlement}
                quota={quota}
                orders={orders}
                ordersError={ordersError}
              />
            </ErrorBoundary>
            <ErrorBoundary label="The AI section">
              <AiSection />
            </ErrorBoundary>
            <ErrorBoundary label="The Orders section">
              <OrdersSection
                orders={orders}
                error={ordersError}
                onRefresh={() => void refreshOrders()}
              />
            </ErrorBoundary>
            <ErrorBoundary label="The Export history section">
              <HistorySection />
            </ErrorBoundary>
            <ErrorBoundary label="The password form">
              <ChangePasswordForm />
            </ErrorBoundary>
          </div>
        </main>
      )}
    </div>
  );
}
