import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { auditLogs, settingsKv } from '../db/schema.js';
import type { AppDatabase } from '../db/database.js';
import {
  AI_PROVIDER_KEY,
  getAiProviderConfig,
  getLtcRate,
  getPlanLimits,
  getPlanPrices,
  getSetting,
  getWallets,
  LIMITS_KEY,
  LTC_RATE_KEY,
  parseAiProviderConfig,
  parseLtcRate,
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
import { resolveAiContext, type AiContext } from '../ai/context.js';
import { testAiConnection } from '../ai/test-connection.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin settings (billing/03 + ai-transforms/03): wallets, plan prices, plan
// limits, the LTC rate, and the AI Provider Config — all in settings_kv,
// editable in-panel so a wallet change or a model swap needs no redeploy.
// Each key updates (and audit-logs) on its own, so the trail shows exactly
// which setting changed. Validation runs through the same parsers the readers
// use, so a value the panel writes is always a value the app accepts.
//
// The AI key is deliberately NOT a setting (ADR-0008): the view reports only
// whether the environment carries one, and Test connection uses the key from
// the app's AI context without ever echoing it.
// ─────────────────────────────────────────────────────────────────────────────

/** The settings the panel edits, as one view. */
export interface AdminSettingsView {
  wallets: WalletAddresses;
  prices: PlanPrices;
  limits: PlanLimits;
  /** USDT per LTC captured into new Orders; null disables LTC payments. */
  ltcRateUsdt: number | null;
  /** The Admin's AI Provider Config (ADR-0008). */
  aiProvider: AiProviderConfig;
  /** Whether the deployment's environment has an AI key — never the key. */
  aiKeyPresent: boolean;
}

export function settingsView(
  db: AppDatabase,
  aiKeyPresent: boolean,
): AdminSettingsView {
  return {
    wallets: getWallets(db),
    prices: getPlanPrices(db),
    limits: getPlanLimits(db),
    ltcRateUsdt: getLtcRate(db),
    aiProvider: getAiProviderConfig(db),
    aiKeyPresent,
  };
}

/** The panel-facing key (URL segment) for each settings_kv key. */
type SettingKey =
  'wallets' | 'prices' | 'limits' | 'ltcRateUsdt' | 'aiProvider';

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
  ltcRateUsdt: (value) => {
    if (value === null) return { ok: true, value: null };
    const parsed = parseLtcRate(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'The LTC rate must be a positive USDT-per-LTC number, or null to disable LTC payments.',
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
  ltcRateUsdt: LTC_RATE_KEY,
  aiProvider: AI_PROVIDER_KEY,
};

export interface SettingsRoutesOptions {
  now?: () => Date;
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
    return c.json({ settings: settingsView(c.var.db, aiKeyPresent) });
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
    const validator = VALIDATORS[key as SettingKey];
    if (!validator) {
      return c.json({ error: 'Unknown setting.' }, 404);
    }

    const parsed = validator(parseJson(await c.req.text()));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const db = c.var.db;
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const kvKey = KV_KEYS[key as SettingKey];
    const before = getSetting(db, kvKey) ?? null;
    const nowDate = now();
    db.transaction((tx) => {
      // settings_kv values are NOT NULL, so "clear" is a delete: the key
      // returns to absent, which the readers treat as the seeded/unset state.
      if (parsed.value === null) {
        tx.delete(settingsKv).where(eq(settingsKv.key, kvKey)).run();
      } else {
        tx.insert(settingsKv)
          .values({ key: kvKey, value: parsed.value, updatedAt: nowDate })
          .onConflictDoUpdate({
            target: settingsKv.key,
            set: { value: parsed.value, updatedAt: nowDate },
          })
          .run();
      }
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'settings.update',
          targetType: 'settings',
          targetId: kvKey,
          before,
          after: parsed.value,
        })
        .run();
    });

    return c.json({ settings: settingsView(db, aiKeyPresent) });
  });

  return app;
}
