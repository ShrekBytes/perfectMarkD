import { useEffect, useState } from 'react';
import { Link } from '../router';
import { useTheme } from '../theme/theme';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAccountStore } from '../auth/account-store';
import { UsersPanel } from './UsersPanel';
import { VerificationQueue } from './VerificationQueue';
import { SettingsPanel } from './SettingsPanel';
import { AuditLog } from './AuditLog';

type AdminTab = 'users' | 'verification' | 'settings' | 'audit';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'users', label: 'Users' },
  { id: 'verification', label: 'Verification' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit log' },
];

/**
 * `/admin` (billing/02, billing/03): the Admin's panel — user management, the
 * Verification queue, app settings, and the audit trail. Utilitarian on
 * purpose: dense lists, plain tables, the same design tokens as the rest of
 * the app. Gated client-side for a sane experience; every `/api/admin` route
 * enforces the same gate server-side, which is the enforcement that actually
 * counts.
 */ export function AdminPage() {
  const { theme, toggle } = useTheme();
  const { user, status } = useAccountStore();
  const [tab, setTab] = useState<AdminTab>('verification');

  useEffect(() => {
    void useAccountStore.getState().load();
  }, []);

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
        <Link
          to="/"
          aria-label="PerfectMarkD home"
          className="select-none px-1 text-[15px] font-semibold tracking-tight"
        >
          Perfect<span className="text-accent">Mark</span>D
        </Link>
        <span className="rounded-control border border-hairline bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink-soft">
          Admin
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        {status === 'loading' && (
          <p className="py-10 text-center text-xs text-ink-faint">Loading…</p>
        )}

        {status === 'ready' && !user && (
          <div
            data-testid="admin-gate"
            className="mx-auto mt-10 max-w-sm rounded-pane border border-hairline bg-surface p-6 text-center"
          >
            <h1 className="text-sm font-semibold">Admin access</h1>
            <p className="mt-1 text-xs text-ink-soft">
              This panel is for the site&apos;s Admin. Sign in with the admin
              account to verify Orders.
            </p>
            <Link
              to="/login"
              data-testid="admin-signin"
              className="mt-4 inline-flex h-9 items-center rounded-control bg-accent px-4 text-sm font-medium text-accent-ink outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2"
            >
              Sign in
            </Link>
          </div>
        )}

        {status === 'ready' && user && !user.isAdmin && (
          <div
            data-testid="admin-forbidden"
            className="mx-auto mt-10 max-w-sm rounded-pane border border-hairline bg-surface p-6 text-center"
          >
            <h1 className="text-sm font-semibold">Not authorized</h1>
            <p className="mt-1 text-xs text-ink-soft">
              This account does not have admin access.
            </p>
          </div>
        )}

        {status === 'ready' && user && user.isAdmin && (
          <>
            <div
              role="tablist"
              aria-label="Admin sections"
              className="flex gap-1.5 border-b border-hairline pb-2"
            >
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  data-testid={`admin-tab-${id}`}
                  onClick={() => setTab(id)}
                  className={`h-8 rounded-control border px-3 text-xs font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                    tab === id
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-hairline bg-canvas text-ink-soft hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {tab === 'users' && <UsersPanel />}
              {tab === 'verification' && <VerificationQueue />}
              {tab === 'settings' && <SettingsPanel />}
              {tab === 'audit' && <AuditLog />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
