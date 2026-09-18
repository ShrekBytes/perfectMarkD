// ─────────────────────────────────────────────────────────────────────────────
// The Inspector: the right-hand settings panel with its three tabs (Page /
// Style / Header-Footer). Every edit flows through updateActive — the Paper
// Canvas re-renders on the settings reference change (debounced there), and
// the store autosaves. The paid-feature gates read the entitlement flags from
// GET /api/me (billing/04): locked controls show a lock glyph that opens the
// pricing modal; open ones are live — expiry re-locks them gracefully.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import type { DocumentSettings } from '@perfectmarkd/core';
import { useDocumentStore } from '../documents/store';
import { useFeatureFlags } from '../auth/account-store';
import { EmptyState } from '../shell/EmptyState';
import { SlidersIcon } from '../shell/icons';
import { PricingModal } from '../pricing/PricingModal';
import { PageTab } from './PageTab';
import { StyleTab } from './StyleTab';
import { HeaderFooterTab } from './HeaderFooterTab';
import type { TabProps } from './controls';

const TABS = ['Page', 'Style', 'Header-Footer'] as const;
type TabId = (typeof TABS)[number];

const TAB_PANELS: Record<TabId, (props: TabProps) => React.ReactElement> = {
  Page: PageTab,
  Style: StyleTab,
  'Header-Footer': HeaderFooterTab,
};

interface InspectorProps {
  /** The compact bar's proof-gauge surrogate ("A4 · 12 pages"): wide layout
   *  keeps the gauge in the top bar, so passing it here is compact-only and
   *  the two never show the same readout twice. */
  gauge?: string | null;
}

export function Inspector({ gauge = null }: InspectorProps) {
  const status = useDocumentStore((state) => state.status);
  const activeId = useDocumentStore((state) => state.activeId);
  const settings = useDocumentStore((state) => state.settings);
  const updateActive = useDocumentStore((state) => state.updateActive);
  const addAsset = useDocumentStore((state) => state.addAsset);
  const flags = useFeatureFlags();

  const [tab, setTab] = useState<TabId>('Page');
  const [pricingOpen, setPricingOpen] = useState(false);

  if (status !== 'ready' || !activeId) {
    return (
      <EmptyState
        icon={<SlidersIcon />}
        title="Inspector"
        hint="Open a document to tune its page, style, and header/footer."
      />
    );
  }

  const set = (patch: Partial<DocumentSettings>) =>
    updateActive({ settings: patch });

  const TabPanel = TAB_PANELS[tab];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* px-3, not px-2: the tabs and the sections below share one left edge
          — a 4px jog between the tab row and the first heading reads as a
          rendering bug, not a style. */}
      <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="flex items-center gap-1"
        >
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`inspector-tab-${id}`}
              onClick={() => setTab(id)}
              className={`touch-target h-7 rounded-control px-2.5 text-xs font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                tab === id
                  ? 'bg-canvas text-ink font-semibold border border-hairline'
                  : 'text-ink-soft hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {id === 'Header-Footer' ? 'Header/Footer' : id}
            </button>
          ))}
        </div>
        {gauge && (
          /* The compact proof gauge: which paper the document is on, in the
             same voice as the wide top bar's readout. min-w-0 + truncate keep
             a "Custom landscape · 999 pages" from pushing the tabs out. */
          <span
            data-testid="inspector-gauge"
            title="Paper size and page count"
            aria-label={`Paper: ${gauge}`}
            className="ml-auto min-w-0 select-none truncate whitespace-nowrap text-xs text-ink-faint tabular-nums"
          >
            {gauge}
          </span>
        )}
      </div>

      <div
        role="tabpanel"
        aria-label={`${tab === 'Header-Footer' ? 'Header/Footer' : tab} settings`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <TabPanel
          settings={settings}
          set={set}
          onOpenPricing={() => setPricingOpen(true)}
          flags={flags}
          addImage={addAsset}
        />
      </div>

      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
    </div>
  );
}
