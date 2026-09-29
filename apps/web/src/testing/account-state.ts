// Account-state fixtures the account/gate tests start from: the flags with
// every gate open (the production default is LOCKED_FLAGS in auth/flags.ts;
// only tests need the paid-tier variant) and the AI block of an instance with
// no provider configured (spec §Gate precedence, step 1). Plain data and no
// `vi` — any suite can use them.

import type { AiAccountState } from '../ai/types';
import type { FeatureFlags } from '../auth/flags';

/** Every gate open — what an active Pro/Premium Entitlement reports. */
export const OPEN_FLAGS: FeatureFlags = { paidTier: true };

/** An instance with no AI provider: the commands do not exist, so every AI
 *  surface reading this renders nothing. */
export const UNCONFIGURED_AI: AiAccountState = {
  configured: false,
  included: false,
  access: true,
  disclosureSeen: false,
  maxInputCharacters: 60_000,
  maxOutputTokens: 16_000,
  contextWindow: 128_000,
  allowance: 0,
  remaining: 0,
  period: '1970-01',
  resetsAt: '1970-01-01T00:00:00.000Z',
};
