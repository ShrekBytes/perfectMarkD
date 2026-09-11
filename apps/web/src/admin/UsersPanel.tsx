import { useCallback, useEffect, useState } from 'react';
import { listAdminUsers, type AdminUser } from './api';
import { UserDetail } from './UserDetail';
import { planName } from '../pricing/plans';
import { orderDate } from '../billing/payment';

function usageLine(user: AdminUser): string {
  const { used, allowance, comps, period } = user.usage;
  const base = `${used}/${allowance} exports (${period})`;
  return comps > 0 ? `${base} · ${comps} comped` : base;
}

/**
 * The admin Users tab (billing/03): search by email, then a detail view per
 * user — Entitlement, quota usage, Order history, and the actions that need a
 * human. The list is the directory; the detail is where the work happens.
 */
export function UsersPanel() {
  const [query, setQuery] = useState('');
  const [searchNonce, setSearchNonce] = useState(0);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setUsers(await listAdminUsers(query));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    }
  }, [query]);

  // The list loads on mount and refetches when a search is submitted or an
  // action changed a user — not on every keystroke in the search box.
  useEffect(() => {
    void refresh();
  }, [searchNonce]);

  const refreshAll = () => {
    void refresh();
    // UserDetail re-fetches its own data; nothing to mirror here.
  };

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchNonce((n) => n + 1);
  };

  if (selectedId !== null) {
    return (
      <UserDetail
        userId={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={refreshAll}
      />
    );
  }

  return (
    <div>
      {error && (
        <div className="text-sm">
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
          <button
            type="button"
            data-testid="users-retry"
            onClick={() => void refresh()}
            className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Retry
          </button>
        </div>
      )}

      {!error && (
        <form onSubmit={onSearch} className="flex gap-1.5">
          <input
            type="search"
            data-testid="user-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email…"
            aria-label="Search users by email"
            className="h-9 flex-1 rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent placeholder:text-ink-faint focus-visible:outline-2"
          />
          <button
            type="submit"
            data-testid="user-search-submit"
            className="h-9 rounded-control border border-hairline px-3 text-xs font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Search
          </button>
        </form>
      )}

      {!error && users === null && (
        <p className="py-6 text-center text-xs text-ink-faint">
          Loading users…
        </p>
      )}

      {!error && users !== null && users.length === 0 && (
        <p
          data-testid="users-empty"
          className="py-6 text-center text-xs text-ink-soft"
        >
          No users match.
        </p>
      )}

      {!error && users !== null && users.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="user-list">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                data-testid="user-row"
                onClick={() => setSelectedId(user.id)}
                className="block w-full rounded-pane border border-hairline bg-surface p-3 text-left transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium text-ink">
                    {user.email}
                    {user.isAdmin && (
                      <span className="ml-2 rounded-control border border-hairline px-1.5 py-0.5 text-xs font-medium text-ink-soft">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="shrink-0 text-xs text-ink-faint">
                    Joined {orderDate(user.createdAt)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {user.entitlement
                    ? `${planName(user.entitlement.plan as 'pro' | 'premium')} until ${user.entitlement.expiresAt.slice(0, 10)}`
                    : 'Free'}
                  {' · '}
                  {usageLine(user)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
