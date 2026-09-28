import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { settingsKv } from '../db/schema.js';
import type { AppDatabase } from '../db/database.js';
import {
  AI_PROVIDER_KEY,
  getAiProviderConfig,
  getLtcRateStatus,
  getPlanLimits,
  getPlanPrices,
  getSetting,
  getWallets,
  LIMITS_KEY,
  type LtcRateStatus,
  parseAiProviderConfig,
  parsePlanLimits,
  parsePlanPrices,
  parseWalletAddresses,
  PRICES_KEY,
  WALLETS_KEY,
} from '../db/settings.js';
import type {
  AiProviderConfig,
  PlanLimits,
  PlanPrices,
  WalletAddresses,
} from '../db/schema.js';
import { parseJson } from '../request-body.js';
import type { Clock } from '../auth/sessions.js';
import { resolveAiContext, type AiContext } from '../ai/context.js';
import { testAiConnection } from '../ai/test-connection.js';
import { recordAudit } from './audit.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin settings (billing/03 + ai-transforms/03): wallets, plan prices, plan
// limits, and the AI Provider Config — all in settings_kv, editable in-panel
// so a wallet change or a model swap needs no redeploy. Each key updates (and
// audit-logs) on its own, so the trail shows exactly which setting changed.
// Validation runs through the same parsers the readers use, so a value the
// panel writes is always a value the app accepts.
//
// The Rate is the exception: a job fetches it every twelve hours and the Admin
// cannot set it (ADR-0014), so it is reported here and there is no key to
// write. The settings PUT refuses the key outright rather than ignoring it,
// because "the Admin cannot choose the number a customer is quoted" has to be
// the server's rule and not a convention in the panel.
//
// The AI key is deliberately NOT a setting (ADR-0008): the view reports only
// whether the environment carries one, and Test connection uses the key from
// the app's AI context without ever echoing it.
// ─────────────────────────────────────────────────────────────────────────────

/** The Rate as the panel reads it: the figure, its age, and the last error. */
export interface LtcRateStatusView {
  /** USDT per LTC, or null while no fetch has ever produced one. */
  usdtPerLtc: number | null;
  /** When the Rate was last fetched, ISO 8601. */
  lastFetchedAt: string | null;
  /** Milliseconds since that fetch; null while the age is unknown. */
  ageMs: number | null;
  /** When a fetch was last attempted, successful or not. */
  lastAttemptAt: string | null;
  /** Why the last attempt failed, if it did. */
  lastError: string | null;
}

/** The settings the panel edits, as one view. */
export interface AdminSettingsView {
  wallets: WalletAddresses;
  prices: PlanPrices;
  limits: PlanLimits;
  /** Read-only: the machine-written Rate and how far to trust it. */
  ltcRate: LtcRateStatusView;
  /** The Admin's AI Provider Config (ADR-0008). */
  aiProvider: AiProviderConfig;
  /** Whether the deployment's environment has an AI key — never the key. */
  aiKeyPresent: boolean;
}

/**
 * The stored Rate as the panel reads it, from the accessor's own status shape.
 * One projection, so the settings view and the queue's read cannot drift.
 */
export function ltcRateStatusView(status: LtcRateStatus): LtcRateStatusView {
  return {
    usdtPerLtc: status.rate?.usdtPerLtc ?? null,
    lastFetchedAt: status.rate?.lastSuccessAt ?? null,
    ageMs: status.rate?.ageMs ?? null,
    lastAttemptAt: status.lastAttemptAt,
    lastError: status.lastError,
  };
}

export function settingsView(
  db: AppDatabase,
  aiKeyPresent: boolean,
  now: Clock,
): AdminSettingsView {
  return {
    wallets: getWallets(db),
    prices: getPlanPrices(db),
    limits: getPlanLimits(db),
    ltcRate: ltcRateStatusView(getLtcRateStatus(db, now)),
    aiProvider: getAiProviderConfig(db),
    aiKeyPresent,
  };
}

/** The settings the panel edits, as one view. The Rate is not among them. */
type SettingKey = 'wallets' | 'prices' | 'limits' | 'aiProvider';

/**
 * The panel-facing name the Rate used to be written under, kept only so the
 * PUT can refuse it with a reason instead of calling it unknown.
 */
const LTC_RATE_SETTING_KEY = 'ltcRateUsdt';

interface ParsedSetting {
  ok: true;
  value: unknown;
}
interface RejectedSetting {
  ok: false;
  error: string;
}

const AI_PROVIDER_ERROR =
  'The AI provider config must carry an enabled flag, an http(s) base URL, a model id, a reasoning effort of off/low/medium/high, and whole-number caps with the output cap inside the context window.';

const VALIDATORS: Record<
  SettingKey,
  (value: unknown) => ParsedSetting | RejectedSetting
> = {
  wallets: (value) => {
    const parsed = parseWalletAddresses(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'Wallet addresses must be an object with a string address for each payment method (USDT-TRC20, USDT-BEP20, LTC).',
        };
  },
  prices: (value) => {
    const parsed = parsePlanPrices(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'Plan prices must be an object with a positive monthly amount and per-duration totals for every plan.',
        };
  },
  limits: (value) => {
    const parsed = parsePlanLimits(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'Plan limits must be an object with a whole-number pageCap and quotaMonthly above zero, and a whole-number aiActionsMonthly of zero or more, for every plan.',
        };
  },
  aiProvider: (value) => {
    const parsed = parseAiProviderConfig(value);
    return parsed
      ? { ok: true, value: parsed }
      : { ok: false, error: AI_PROVIDER_ERROR };
  },
};

const KV_KEYS: Record<SettingKey, string> = {
  wallets: WALLETS_KEY,
  prices: PRICES_KEY,
  limits: LIMITS_KEY,
  aiProvider: AI_PROVIDER_KEY,
};

export interface SettingsRoutesOptions {
  /** Injectable clock; the Rate's reported age is measured against it. */
  now?: Clock;
  /** The AI context (key presence + provider seam) for Test connection. */
  ai?: AiContext;
}

export function settingsRoutes({
  now = () => new Date(),
  ai = resolveAiContext(),
}: SettingsRoutesOptions = {}) {
  const app = new Hono<AppEnv>();
  const aiKeyPresent = ai.apiKey !== null;

  app.get('/', (c) => {
    return c.json({ settings: settingsView(c.var.db, aiKeyPresent, now) });
  });

  /**
   * Test connection (ai-transforms/03): tests the draft the panel is editing
   * when it sends one, otherwise the saved config. One minimal completion plus
   * a best-effort metadata lookup; the report never leaves the Admin surface.
   */
  app.post('/ai/test', async (c) => {
    const db = c.var.db;
    const body = parseJson(await c.req.text());
    let config: AiProviderConfig;
    if (body === null) {
      config = getAiProviderConfig(db);
    } else {
      const parsed = parseAiProviderConfig(body);
      if (!parsed) return c.json({ error: AI_PROVIDER_ERROR }, 400);
      config = parsed;
    }
    const report = await testAiConnection({
      config,
      apiKey: ai.apiKey,
      provider: ai.provider,
    });
    return c.json({ report });
  });

  app.put('/:key', async (c) => {
    const key = c.req.param('key');
    // The Rate is a real setting with no write path. It gets its own refusal
    // rather than "Unknown setting", because the operator asking is not
    // confused about the URL — they are told the number is fetched and why.
    if (key === LTC_RATE_SETTING_KEY) {
      return c.json(
        {
          error:
            'The LTC rate is fetched from a public rate feed every twelve hours and cannot be set by hand.',
        },
        403,
      );
    }
    const validator = VALIDATORS[key as SettingKey];
    if (!validator) {
      return c.json({ error: 'Unknown setting.' }, 404);
    }

    const parsed = validator(parseJson(await c.req.text()));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const db = c.var.db;
    const admin = c.var.user!;

    const kvKey = KV_KEYS[key as SettingKey];
    const before = getSetting(db, kvKey) ?? null;
    db.transaction((tx) => {
      // settings_kv values are NOT NULL, so "clear" is a delete: the key
      // returns to absent, which the readers treat as the seeded/unset state.
      if (parsed.value === null) {
        tx.delete(settingsKv).where(eq(settingsKv.key, kvKey)).run();
      } else {
        tx.insert(settingsKv)
          .values({ key: kvKey, value: parsed.value })
          .onConflictDoUpdate({
            target: settingsKv.key,
            set: { value: parsed.value },
          })
          .run();
      }
      recordAudit(tx, admin, {
        action: 'settings.update',
        targetType: 'settings',
        targetId: kvKey,
        before,
        after: parsed.value,
      });
    });

    return c.json({ settings: settingsView(db, aiKeyPresent, now) });
  });

  return app;
}
