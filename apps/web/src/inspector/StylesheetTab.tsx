// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Stylesheet tab (ai-transforms/01): the Custom Stylesheet's home
// — the CSS box (monospace, its own scroll, roughly the top half), the AI
// block below it (ai-transforms/06: the conversation, with its own states,
// because the box works whether or not AI does), and a footer line stating
// that page geometry belongs to the Page tab and linking to the styling
// reference (ai-transforms/02). Without the entitlement the body says what the
// plan includes and opens the pricing modal — never a signup wall.
//
// While a proposal is pending, the box swaps to the proposed-diff view
// (StylesheetBoxDiff): the change is reviewed where the stylesheet lives, and
// Accept writes the box, Reject flips straight back.
// ─────────────────────────────────────────────────────────────────────────────

import { STYLING_REFERENCE_ANCHOR } from '@perfectmarkd/core';
import { Link } from '../router';
import { useDocumentStore } from '../documents/store';
import { GateLock, ToggleRow } from './controls';
import { StylesheetAiBlock } from './StylesheetAiBlock';
import { StylesheetBoxDiff } from './StylesheetBoxDiff';
import { pendingProposal, useStylesheetConversation } from '../ai/conversation';
import {
  applyStylesheetProposal,
  editStylesheet,
  setStylesheetEnabled,
  stylesheetHasCSS,
} from './settings-edit';
import type { TabProps } from './controls';

export function StylesheetTab({
  settings,
  set,
  onOpenPricing,
  flags,
}: TabProps) {
  const docId = useDocumentStore((state) => state.activeId);
  const turns = useStylesheetConversation((state) =>
    docId ? state.turns[docId] : undefined,
  );
  const pending = pendingProposal(turns);

  if (!flags.customStylesheet) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs leading-5 text-ink-soft">
          The Custom Stylesheet is part of Pro and Premium: your own CSS,
          layered over any Preset — in the preview and in every export.
        </p>
        <div className="mt-3">
          {/* The Gate Lock chip (DESIGN.md): the click opens the pricing
              modal, never a signup wall. */}
          <GateLock onClick={onOpenPricing} label="Custom stylesheet" />
        </div>
      </div>
    );
  }

  const hasCSS = stylesheetHasCSS(settings);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {/* Roughly the top half: its own scroll, so a long stylesheet never
          pushes the state row out of view. The box is authoritative, so while
          a proposal is pending it becomes the proposed-diff view — the review
          happens where the stylesheet lives — and flips back on a decision. */}
      {pending ? (
        <StylesheetBoxDiff
          against={pending.against}
          reply={pending.reply}
          stale={pending.against !== settings.customStylesheet}
          onAccept={() => {
            // Accept writes the box through the same settings path a hand
            // edit uses (the layer comes on with the look the paper is
            // already showing), and the turn is decided so the log records it.
            if (!docId) return;
            set(applyStylesheetProposal(pending.reply));
            useStylesheetConversation
              .getState()
              .decide(docId, pending.id, 'accepted');
          }}
          onReject={() => {
            if (!docId) return;
            useStylesheetConversation
              .getState()
              .decide(docId, pending.id, 'rejected');
          }}
        />
      ) : (
        <div className="flex min-h-32 grow basis-1/2 flex-col">
          <textarea
            aria-label="Custom stylesheet"
            data-testid="stylesheet-box"
            value={settings.customStylesheet}
            onChange={(event) =>
              set(editStylesheet(settings, event.target.value))
            }
            spellCheck={false}
            placeholder={'/* Your own CSS, layered over the generated rules */'}
            className="min-h-0 w-full flex-1 resize-y rounded-control border border-hairline bg-field px-2 py-1.5 font-mono text-xs text-ink transition-colors duration-150 outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="shrink-0 pt-1">
        <ToggleRow
          checked={settings.customStylesheetEnabled}
          onChange={(on) => set(setStylesheetEnabled(settings, on))}
          label="Apply to pages"
          disabled={!hasCSS}
        />
      </div>

      {/* The AI conversation (ai-transforms/06). It states its own condition —
          locked, off, exhausted, unavailable, ready — because the box above
          works whether or not AI does. The accept path routes through here
          when the diff view is up. */}
      <StylesheetAiBlock
        docId={docId}
        css={settings.customStylesheet}
        onApply={(css) => set(applyStylesheetProposal(css))}
        onOpenPricing={onOpenPricing}
      />

      <div className="shrink-0 pt-2">
        {/* The guardrail, in the box's own voice: geometry stays a Page-tab
            setting (the sheet restyles the paper, bands, and frame, but never
            moves them), and an obeyed-in-print-only @page rule would silently
            split preview from print — so the engine strips them. The footer
            line also links to the styling reference (ai-transforms/02), the
            Docs page section documenting the stable contract. A router Link,
            so the swap keeps the open Document (it autosaves and survives the
            round trip). */}
        <p className="text-[11px] leading-4 text-ink-faint">
          Page size and margins are Page-tab settings; @page rules are ignored.
          Everything else — colors, typography, paper, header/footer, frame — is
          overridable here.{' '}
          <Link
            to={`/docs#${STYLING_REFERENCE_ANCHOR}`}
            className="font-medium text-ink underline decoration-hairline underline-offset-2 transition-colors duration-150 outline-offset-2 outline-accent hover:decoration-ink focus-visible:outline-2"
          >
            Styling reference
          </Link>
        </p>
      </div>
    </div>
  );
}
