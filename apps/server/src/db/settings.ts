import { eq } from 'drizzle-orm';
import type { AppDatabase } from './database.js';
import {
  DURATION_MONTHS,
  PAYMENT_METHODS,
  PLANS,
  REASONING_EFFORTS,
  settingsKv,
  type AiProviderConfig,
  type Plan,
  type PlanLimits,
  type PlanPrices,
  type ReasoningEffort,
  type WalletAddresses,
} from './schema.js';

export const WALLETS_KEY = 'wallets';
export const PRICES_KEY = 'prices';
export const LIMITS_KEY = 'limits';
export const LTC_RATE_KEY = 'ltc_rate_usdt';
export const AI_PROVIDER_KEY = 'ai_provider';

const MONTHLY_PRICE_USDT: Record<Plan, number> = { pro: 3, premium: 7 };
const TWELVE_MONTH_MULTIPLIER = 10;

/** The tier table's quota, page-cap, and AI Action numbers, seeded until the
 *  Admin edits (spec §AI is a paid capability: Pro 100, Premium 300). */
const DEFAULT_LIMITS: PlanLimits = {
  pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
  premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
};

/**
 * The AI Provider Config the Admin edits (spec §AI Provider Config). The API
 * key is not here — it belongs to the deployment's environment (ADR-0008).
 */
export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
  enabled: true,
  baseUrl: 'https://openrouter.ai/api/v1',
  model: '',
  stylesheetModel: null,
  reasoningEffort: 'medium',
  contextWindow: 128_000,
  maxOutputTokens: 16_000,
  maxInputCharacters: 60_000,
  timeoutSeconds: 60,
  burstPerMinute: 10,
};

function defaultWalletAddresses(): WalletAddresses {
  // Addresses go into admin settings at Phase 2 (PLAN §Launch checklist);
  // seeded empty so nothing ships pointing at a placeholder wallet.
  return {
    'USDT-TRC20': '',
    'USDT-BEP20': '',
    LTC: '',
  };
}

function defaultPlanPrices(): PlanPrices {
  return Object.fromEntries(
    PLANS.map((plan) => {
      const monthly = MONTHLY_PRICE_USDT[plan];
      const durations = Object.fromEntries(
        DURATION_MONTHS.map((months) => [
          months,
          months === 12 ? TWELVE_MONTH_MULTIPLIER * monthly : months * monthly,
        ]),
      );
      return [plan, { monthly, durations }];
    }),
  ) as PlanPrices;
}

/**
 * Seeds the default settings if (and only if) their keys are absent, so
 * admin-edited values survive restarts. Called on every database open.
 */
export function seedSettings(db: AppDatabase): void {
  db.insert(settingsKv)
    .values([
      { key: WALLETS_KEY, value: defaultWalletAddresses() },
      { key: PRICES_KEY, value: defaultPlanPrices() },
      { key: LIMITS_KEY, value: DEFAULT_LIMITS },
      { key: AI_PROVIDER_KEY, value: DEFAULT_AI_PROVIDER_CONFIG },
    ])
    .onConflictDoNothing()
    .run();
  repairPlanLimits(db);
}

/**
 * Fills fields the limits setting gained after it was first seeded (an
 * upgrade's row has no `aiActionsMonthly`). Admin edits to the other fields
 * survive; a row that is not otherwise valid is left alone for the validator
 * to reject rather than silently rewritten.
 */
function repairPlanLimits(db: AppDatabase): void {
  const raw = getSetting(db, LIMITS_KEY);
  if (typeof raw !== 'object' || raw === null) return;
  const record = raw as Record<string, unknown>;
  let changed = false;
  const repaired: Record<string, unknown> = { ...record };
  for (const plan of PLANS) {
    const limit = record[plan];
    if (typeof limit !== 'object' || limit === null) continue;
    const row = limit as Record<string, unknown>;
    if (
      row.aiActionsMonthly === undefined &&
      Number.isInteger(row.pageCap) &&
      (row.pageCap as number) > 0 &&
      Number.isInteger(row.quotaMonthly) &&
      (row.quotaMonthly as number) > 0
    ) {
      repaired[plan] = {
        ...row,
        aiActionsMonthly: DEFAULT_LIMITS[plan].aiActionsMonthly,
      };
      changed = true;
    }
  }
  if (changed) setSetting(db, LIMITS_KEY, repaired);
}

/**
 * Raw setting read — unvalidated JSON. Use the typed accessors below, which
 * validate before handing values to callers.
 */
export function getSetting(db: AppDatabase, key: string): unknown {
  const row = db
    .select({ value: settingsKv.value })
    .from(settingsKv)
    .where(eq(settingsKv.key, key))
    .get();
  return row?.value;
}

export function setSetting<T>(db: AppDatabase, key: string, value: T): void {
  db.insert(settingsKv)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsKv.key,
      set: { value, updatedAt: new Date() },
    })
    .run();
}

// ─────────────────────────────────────────────────────────────────────────────
// Validators, shared by the typed accessors below and the admin settings
// routes (billing/03), which must reject malformed values with the same rules
// the readers assume. Each returns the validated value or null.
// ─────────────────────────────────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseWalletAddresses(value: unknown): WalletAddresses | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return PAYMENT_METHODS.every(
    (method) => typeof record[method] === 'string',
  ) && keys.every((key) => (PAYMENT_METHODS as readonly string[]).includes(key))
    ? (value as WalletAddresses)
    : null;
}

export function parsePlanPrices(value: unknown): PlanPrices | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return PLANS.every((plan) => {
    const price = record[plan];
    if (typeof price !== 'object' || price === null) return false;
    const { monthly, durations } = price as Record<string, unknown>;
    if (!isFiniteNumber(monthly) || monthly <= 0) return false;
    if (typeof durations !== 'object' || durations === null) return false;
    const byDuration = durations as Record<string, unknown>;
    return DURATION_MONTHS.every((months) => {
      const amount = byDuration[String(months)];
      return isFiniteNumber(amount) && amount > 0;
    });
  })
    ? (value as PlanPrices)
    : null;
}

export function parsePlanLimits(value: unknown): PlanLimits | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return PLANS.every((plan) => {
    const limit = record[plan];
    if (typeof limit !== 'object' || limit === null) return false;
    const { pageCap, quotaMonthly, aiActionsMonthly } = limit as Record<
      string,
      unknown
    >;
    return (
      Number.isInteger(pageCap) &&
      (pageCap as number) > 0 &&
      Number.isInteger(quotaMonthly) &&
      (quotaMonthly as number) > 0 &&
      // Zero is a legal AI allowance: it disables AI for that plan.
      Number.isInteger(aiActionsMonthly) &&
      (aiActionsMonthly as number) >= 0
    );
  })
    ? (value as PlanLimits)
    : null;
}

/** A positive USDT-per-LTC number, or null when unset. */
export function parseLtcRate(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return isFiniteNumber(value) && value > 0 ? value : null;
}

const AI_PROVIDER_FIELDS = [
  'enabled',
  'baseUrl',
  'model',
  'stylesheetModel',
  'reasoningEffort',
  'contextWindow',
  'maxOutputTokens',
  'maxInputCharacters',
  'timeoutSeconds',
  'burstPerMinute',
] as const;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** An absolute http(s) URL; the provider client appends the API paths. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== ''
    );
  } catch {
    return false;
  }
}

/**
 * The AI Provider Config's validator, shared by the admin settings route and
 * the typed accessor. Unknown fields are rejected so a typo (`maxOutptTokens`)
 * can never look saved while doing nothing, and a trailing slash is trimmed
 * because the client appends `/chat/completions`.
 */
export function parseAiProviderConfig(value: unknown): AiProviderConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    !AI_PROVIDER_FIELDS.every((field) => field in record) ||
    !Object.keys(record).every((key) =>
      (AI_PROVIDER_FIELDS as readonly string[]).includes(key),
    )
  ) {
    return null;
  }
  const {
    enabled,
    baseUrl,
    model,
    stylesheetModel,
    reasoningEffort,
    contextWindow,
    maxOutputTokens,
    maxInputCharacters,
    timeoutSeconds,
    burstPerMinute,
  } = record;
  if (typeof enabled !== 'boolean') return null;
  if (typeof baseUrl !== 'string') return null;
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (!isHttpUrl(normalizedBaseUrl)) return null;
  if (typeof model !== 'string') return null;
  if (
    stylesheetModel !== null &&
    (typeof stylesheetModel !== 'string' || stylesheetModel.trim() === '')
  ) {
    return null;
  }
  const normalizedStylesheetModel =
    typeof stylesheetModel === 'string' ? stylesheetModel.trim() : null;
  if (
    typeof reasoningEffort !== 'string' ||
    !(REASONING_EFFORTS as readonly string[]).includes(reasoningEffort)
  ) {
    return null;
  }
  if (
    !isPositiveInteger(contextWindow) ||
    !isPositiveInteger(maxOutputTokens) ||
    !isPositiveInteger(maxInputCharacters) ||
    !isPositiveInteger(timeoutSeconds) ||
    !isPositiveInteger(burstPerMinute)
  ) {
    return null;
  }
  // The output cap lives inside the window; a config that says otherwise is
  // a request that can never fit, so it is refused rather than warned about.
  if (maxOutputTokens >= contextWindow) return null;
  return {
    enabled,
    baseUrl: normalizedBaseUrl,
    model: model.trim(),
    stylesheetModel: normalizedStylesheetModel,
    reasoningEffort: reasoningEffort as ReasoningEffort,
    contextWindow,
    maxOutputTokens,
    maxInputCharacters,
    timeoutSeconds,
    burstPerMinute,
  };
}

/** Receiving wallet address per payment method (ADR-0005). */
export function getWallets(db: AppDatabase): WalletAddresses {
  const value = parseWalletAddresses(getSetting(db, WALLETS_KEY));
  if (!value) {
    throw new Error(
      'settings_kv: wallets setting is malformed — expected an address string per payment method',
    );
  }
  return value;
}

/** Total USDT per plan and duration option. */
export function getPlanPrices(db: AppDatabase): PlanPrices {
  const value = parsePlanPrices(getSetting(db, PRICES_KEY));
  if (!value) {
    throw new Error(
      'settings_kv: prices setting is malformed — expected monthly and per-duration USDT amounts for every plan',
    );
  }
  return value;
}

/** Page caps and monthly Server Export quotas per paid plan (billing/03). */
export function getPlanLimits(db: AppDatabase): PlanLimits {
  const value = parsePlanLimits(getSetting(db, LIMITS_KEY));
  if (!value) {
    throw new Error(
      'settings_kv: limits setting is malformed — expected a page cap and monthly quota for every plan',
    );
  }
  return value;
}

/**
 * The page cap a Server Export runs under. Planless jobs — comped users
 * exporting without an active Entitlement (`free`, server/04) — have no plan
 * to read a cap from, so they get the smallest paid cap: the safe default
 * for someone the system knows nothing else about.
 */
export function pageCapFor(limits: PlanLimits, plan: string): number {
  const smallest = Math.min(limits.pro.pageCap, limits.premium.pageCap);
  if (plan === 'free') return smallest;
  return limits[plan as Plan]?.pageCap ?? smallest;
}

/**
 * USDT per LTC captured into new Orders (ADR-0005). Absent until the Admin
 * sets it — like wallet addresses, nothing ships pointing at a placeholder
 * rate, and LTC orders are refused while it is unset.
 */
export function getLtcRate(db: AppDatabase): number | null {
  const raw = getSetting(db, LTC_RATE_KEY);
  // Absent and explicitly-null both mean "LTC payments disabled".
  if (raw === undefined || raw === null) return null;
  const value = parseLtcRate(raw);
  if (value === null) {
    throw new Error(
      'settings_kv: ltc_rate_usdt setting is malformed — expected a positive USDT-per-LTC number',
    );
  }
  return value;
}

/** The Admin's AI Provider Config (ADR-0008); seeded with defaults at open. */
export function getAiProviderConfig(db: AppDatabase): AiProviderConfig {
  const value = parseAiProviderConfig(getSetting(db, AI_PROVIDER_KEY));
  if (!value) {
    throw new Error(
      'settings_kv: ai_provider setting is malformed — expected the endpoint, model, reasoning effort, and caps',
    );
  }
  return value;
}
