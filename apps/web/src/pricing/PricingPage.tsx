import { Link, navigate } from '../router';
import { useTheme } from '../theme/theme';
import { ThemeToggle } from '../theme/ThemeToggle';
import { UpgradeDialog } from '../billing/UpgradeDialog';
import { PlanComparison } from './PlanComparison';
import { DURATION_NOTE } from './plans';
import { useState } from 'react';

// Repo links for the footer. The project's own GitHub org/repo is one of
// PLAN.md §7's open action items — flip these constants when it's decided.
export const GITHUB_URL = 'https://github.com/ShrekBytes/perfectMarkD';
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const PLUGIN_URL = 'https://github.com/ShrekBytes/advanced-pdf-export';

/**
 * The /pricing page: three-column plan comparison whose paid CTAs open the
 * upgrade flow (billing/01), the AGPL note, and the footer's GitHub + license
 * badge links. Static content in the SPA; renders entirely from the shared
 * plans module.
 */
export function PricingPage() {
  const { theme, toggle } = useTheme();
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'premium' | null>(
    null,
  );

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
        <Link
          to="/"
          aria-label="PerfectMarkD home"
          className="touch-target inline-flex shrink-0 select-none items-center px-1 text-sm font-semibold tracking-tight outline-offset-2 outline-accent focus-visible:outline-2"
        >
          Perfect<span className="font-mono">Mark</span>D
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/"
            className="touch-target flex h-8 items-center rounded-control px-2 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Open the editor
          </Link>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Simple pricing
        </h1>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          The editor and Client Export are free — no account needed. Paid plans
          add one-click Server Export and custom page sizes, stylesheets, fonts,
          and images. Premium adds the priority render queue and Export History.
        </p>

        <div className="mt-8 rounded-pane bg-surface px-3 py-5 sm:p-6">
          <PlanComparison
            onOpenEditor={() => navigate('/')}
            onUpgrade={setUpgradePlan}
          />
        </div>

        <section aria-label="Good to know" className="mt-8">
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink-soft">
            <li>
              All core styling is free: presets, typography, colors, code
              themes, header/footer text, page numbers, page frames, Mermaid
              diagrams, math, and the outline. No watermarks anywhere.
            </li>
            <li>{DURATION_NOTE}</li>
            <li>
              PerfectMarkD is free software under AGPL-3.0. The whole app —
              editor, engine, and server — can be self-hosted, and a self-hosted
              instance uses its own wallets and verification.
            </li>
          </ul>
        </section>
      </main>

      <footer className="flex flex-wrap items-center gap-3 border-t border-hairline bg-surface px-4 py-4 text-xs text-ink-soft">
        <a
          href={LICENSE_URL}
          className="rounded-control border border-hairline bg-canvas px-2 py-0.5 font-medium text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
        >
          AGPL-3.0
        </a>
        <a
          href={GITHUB_URL}
          className="transition-colors duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2"
        >
          GitHub
        </a>
        <a
          href={PLUGIN_URL}
          className="ml-auto transition-colors duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2"
        >
          Successor to the Advanced PDF Export plugin
        </a>
      </footer>

      {upgradePlan && (
        <UpgradeDialog
          plan={upgradePlan}
          onClose={() => setUpgradePlan(null)}
        />
      )}
    </div>
  );
}
