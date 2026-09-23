// ─────────────────────────────────────────────────────────────────────────────
// The AI wire types (ai-transforms/05): the account block GET /api/me reports
// and the shapes the two transform routes speak. Kept in one module so the
// store, the API client, and the UI agree, and so nothing in the web app
// invents a second vocabulary for the same state (spec §Data model).
// ─────────────────────────────────────────────────────────────────────────────

/** The two AI Actions (CONTEXT.md): `/ai` edits markdown; `/ss` edits the
 *  Custom Stylesheet. The kind also selects the route and the model. */
export type AiCommand = 'markdown' | 'stylesheet';

/** The `ai` block of GET /api/me — the client's single source of AI state. */
export interface AiAccountState {
  /** The instance has a key, the kill switch is on, and a model is chosen. */
  configured: boolean;
  /** The caller's active plan includes AI Actions. */
  included: boolean;
  /** The caller's own AI Access switch (CONTEXT.md); true by default. */
  access: boolean;
  /** Whether the once-per-account first-use disclosure has been shown. */
  disclosureSeen: boolean;
  /** The character cap one AI Action may send (spec §scope and size). */
  maxInputCharacters: number;
  /** The AI Allowance this period's plan grants; zero without a plan. */
  allowance: number;
  /** AI Actions left this period. */
  remaining: number;
  /** UTC `YYYY-MM` usage period. */
  period: string;
  /** ISO instant the period resets. */
  resetsAt: string;
}

/**
 * The AI state of an instance with no provider configured (spec §Gate
 * precedence, step 1): the commands do not exist, so every AI surface reads
 * this and renders nothing. Also the shape a test fixture starts from.
 */
export const UNCONFIGURED_AI: AiAccountState = {
  configured: false,
  included: false,
  access: true,
  disclosureSeen: false,
  maxInputCharacters: 60_000,
  allowance: 0,
  remaining: 0,
  period: '1970-01',
  resetsAt: '1970-01-01T00:00:00.000Z',
};

/** Whether an AI Action targets a selection or the whole Document. */
export type AiTargetKind = 'document' | 'selection';

/** The document range an AI Action was resolved against, as UTF-16 offsets. */
export interface AiTarget {
  kind: AiTargetKind;
  text: string;
  from: number;
  to: number;
}

/** An anchored edit from a whole-Document reply (packages/core ai.ts). */
export interface AiAnchoredEdit {
  search: string;
  replace: string;
}

/** What a completed AI Action produced, before review. */
export type AiProposal =
  | { kind: 'anchored'; edits: AiAnchoredEdit[] }
  | { kind: 'replace'; text: string };

/** The markdown route's success payload. */
export interface AiMarkdownResult {
  proposal: AiProposal;
  remaining: number;
}

/** The stylesheet route's success payload (always a whole-CSS replacement). */
export interface AiStylesheetResult {
  proposal: { kind: 'replace'; text: string };
  remaining: number;
}
