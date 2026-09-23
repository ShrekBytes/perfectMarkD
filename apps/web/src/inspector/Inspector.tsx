// ─────────────────────────────────────────────────────────────────────────────
// The Inspector: the right-hand settings panel with its four tabs (Page /
// Style / Stylesheet / Header-Footer). Every edit flows through updateActive —
// the Paper Canvas re-renders on the settings reference change (debounced
// there), and the store autosaves. The paid-feature gates read the
// entitlement flags from GET /api/me (billing/04): locked controls show a
// lock glyph that opens the pricing modal; open ones are live — expiry
// re-locks them gracefully.
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
import { StylesheetTab } from './StylesheetTab';
import { HeaderFooterTab } from './HeaderFooterTab';
import type { TabProps } from './controls';

const TABS = ['Page', 'Style', 'Stylesheet', 'Header-Footer'] as const;
type TabId = (typeof TABS)[number];

/** Visible label and accessible name per tab. The Stylesheet tab's accessible
 *  name is the feature's glossary name — "Custom stylesheet" — while its
 *  visible label stays one word like its neighbours. */
const TAB_META: Record<TabId, { label: string; name: string }> = {
  Page: { label: 'Page', name: 'Page' },
  Style: { label: 'Style', name: 'Style' },
  Stylesheet: { label: 'Stylesheet', name: 'Custom stylesheet' },
  'Header-Footer': { label: 'Header/Footer', name: 'Header/Footer' },
};

const TAB_PANELS: Record<TabId, (props: TabProps) => React.ReactElement> = {
  Page: PageTab,
  Style: StyleTab,
  Stylesheet: StylesheetTab,
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
        hint="Open a document to tune its page, style, stylesheet, and header/footer."
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
          rendering bug, not a style. The tablist wraps (like the editor
          toolbar) so four tabs stay inside the Inspector's 260px floor
          instead of clipping the last one; the row carries a min-height, not
          a fixed one, so it grows with the wrapped lines. */}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-hairline px-3 py-1">
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="flex flex-wrap items-center gap-1"
        >
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-label={TAB_META[id].name}
              data-testid={`inspector-tab-${id}`}
              onClick={() => setTab(id)}
              className={`touch-target h-7 rounded-control px-2.5 text-xs font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                tab === id
                  ? 'bg-canvas text-ink font-semibold border border-hairline'
                  : 'text-ink-soft hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {TAB_META[id].label}
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
        aria-label={`${TAB_META[tab].name} settings`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <TabPanel
          settings={settings}
          set={set}
          onOpenPricing={() => setPricingOpen(true)}
          onOpenStylesheet={() => setTab('Stylesheet')}
          flags={flags}
          addImage={addAsset}
        />
      </div>

      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
    </div>
  );
}
