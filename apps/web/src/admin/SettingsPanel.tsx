import { useEffect, useState } from 'react';
import { ToggleRow } from '../inspector/controls';
import {
  getAdminSettings,
  testAiConnection,
  updateAdminSetting,
  type AdminSettings,
  type AiConnectionReport,
  type AiProviderConfig,
  type PaymentMethod,
  type PlanLimits,
  type PlanPrices,
  type ReasoningEffort,
  type SettingsKey,
  type WalletAddresses,
} from './api';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'USDT-TRC20': 'USDT — TRC-20 (Tron)',
  'USDT-BEP20': 'USDT — BEP-20 (BNB Smart Chain)',
  LTC: 'Litecoin (mainnet)',
};

const DURATIONS = [1, 3, 6, 12] as const;

const PLANS = ['pro', 'premium'] as const;
type PaidPlan = (typeof PLANS)[number];

/**
 * The admin Settings tab (billing/03 + ai-transforms/03): wallet addresses,
 * plan prices, plan page caps, quota and AI allowances, the LTC rate, and the
 * AI Provider Config — everything the app reads from settings_kv, editable
 * here without a redeploy. Each section saves (and audit-logs) on its own, and
 * the server re-validates every value.
 */
export function SettingsPanel() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSettings()
      .then(setSettings)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : 'Something went wrong.',
        );
      });
  }, []);

  if (error) {
    return (
      <div>
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
        <button
          type="button"
          data-testid="settings-retry"
          onClick={() => window.location.reload()}
          className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!settings) {
    return (
      <p className="py-6 text-center text-xs text-ink-faint">
        Loading settings…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <WalletsSection saved={settings.wallets} onSaved={setSettings} />
      <PricesSection saved={settings.prices} onSaved={setSettings} />
      <LimitsSection saved={settings.limits} onSaved={setSettings} />
      <LtcRateSection saved={settings.ltcRateUsdt} onSaved={setSettings} />
      <AiProviderSection
        saved={settings.aiProvider}
        aiKeyPresent={settings.aiKeyPresent}
        onSaved={setSettings}
      />
    </div>
  );
}

type OnSaved = (settings: AdminSettings) => void;

/**
 * The save loop every settings section shares: a draft edited against a
 * baseline (what this section last saved, not the prop — a save in another
 * section must never clobber a draft here), client validation, the PUT, and
 * the flash/error states around it.
 */
function useSectionSave<D>({
  initialDraft,
  toPayload,
  onSaved,
}: {
  initialDraft: D;
  /** The request to make for the current draft, or why it can't be. */
  toPayload: (
    draft: D,
  ) => { key: SettingsKey; payload: unknown; baseline: D } | { error: string };
  onSaved: OnSaved;
}) {
  const [baseline, setBaseline] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const onSave = async () => {
    if (saving) return;
    const parsed = toPayload(draft);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      onSaved(await updateAdminSetting(parsed.key, parsed.payload));
      setBaseline(parsed.baseline);
      setFlash(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setSaving(false);
    }
  };

  return { draft, setDraft, dirty, saving, flash, error, onSave };
}

/** A save that succeeded; shared button/flash styling for every section. */
function SectionFooter({
  dirty,
  saving,
  saved,
  testId,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  testId: string;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        data-testid={testId}
        disabled={!dirty || saving}
        onClick={onSave}
        className="h-8 rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {saved && !dirty && (
        <span
          role="status"
          data-testid={`${testId}-saved`}
          className="text-xs text-ink-soft"
        >
          Saved — live without a redeploy, recorded in the audit log.
        </span>
      )}
    </div>
  );
}

function WalletsSection({
  saved,
  onSaved,
}: {
  saved: WalletAddresses;
  onSaved: OnSaved;
}) {
  const { draft, setDraft, dirty, saving, flash, error, onSave } =
    useSectionSave<WalletAddresses>({
      initialDraft: saved,
      toPayload: (draft) => ({
        key: 'wallets',
        payload: draft,
        baseline: draft,
      }),
      onSaved,
    });

  return (
    <section className="rounded-pane border border-hairline bg-surface p-3">
      <h3 className="text-xs font-medium text-ink-soft">Wallet addresses</h3>
      {dirty && (
        <div
          role="alert"
          data-testid="wallet-warning"
          className="mt-2 rounded-control border border-danger/40 bg-danger/10 px-2.5 py-2 text-xs text-danger"
        >
          You are changing a wallet address. Every future payment goes to the
          new address and funds sent to a wrong address cannot be recovered —
          verify it character by character before saving.
        </div>
      )}
      <div className="mt-2 space-y-2">
        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
          (method) => (
            <label
              key={method}
              className="block text-xs font-medium text-ink-soft"
            >
              {PAYMENT_METHOD_LABELS[method]}
              <input
                type="text"
                data-testid={`wallet-input-${method}`}
                value={draft[method]}
                onChange={(event) =>
                  setDraft({ ...draft, [method]: event.target.value })
                }
                className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
              />
            </label>
          ),
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <SectionFooter
        dirty={dirty}
        saving={saving}
        saved={flash}
        testId="wallets-save"
        onSave={() => void onSave()}
      />
    </section>
  );
}

type PriceDraft = Record<PaidPlan, Record<string, string>>;

function toPriceDraft(prices: PlanPrices): PriceDraft {
  return Object.fromEntries(
    PLANS.map((plan) => [
      plan,
      Object.fromEntries([
        ['monthly', String(prices[plan].monthly)],
        ...DURATIONS.map((months) => [
          String(months),
          String(prices[plan].durations[months]),
        ]),
      ]),
    ]),
  ) as PriceDraft;
}

function toPrices(draft: PriceDraft): PlanPrices | null {
  const parse = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const out = {} as PlanPrices;
  for (const plan of PLANS) {
    const monthly = parse(draft[plan].monthly ?? '');
    if (monthly === null) return null;
    const durations = {} as PlanPrices['pro']['durations'];
    for (const months of DURATIONS) {
      const total = parse(draft[plan][String(months)] ?? '');
      if (total === null) return null;
      durations[months] = total;
    }
    out[plan] = { monthly, durations };
  }
  return out;
}

function PricesSection({
  saved,
  onSaved,
}: {
  saved: PlanPrices;
  onSaved: OnSaved;
}) {
  const { draft, setDraft, dirty, saving, flash, error, onSave } =
    useSectionSave<PriceDraft>({
      initialDraft: toPriceDraft(saved),
      toPayload: (draft) => {
        const prices = toPrices(draft);
        return prices === null
          ? { error: 'Every amount must be a number above zero.' }
          : { key: 'prices', payload: prices, baseline: toPriceDraft(prices) };
      },
      onSaved,
    });

  const onDraft = (plan: PaidPlan, field: string, value: string) => {
    setDraft((current) => ({
      ...current,
      [plan]: { ...current[plan], [field]: value },
    }));
  };

  return (
    <section className="rounded-pane border border-hairline bg-surface p-3">
      <h3 className="text-xs font-medium text-ink-soft">Plan prices (USDT)</h3>
      <div className="mt-2 space-y-3">
        {PLANS.map((plan) => (
          <div key={plan} data-testid={`prices-${plan}`}>
            <p className="text-xs font-medium capitalize text-ink">{plan}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <NumberField
                label="per month"
                testId={`price-${plan}-monthly`}
                value={draft[plan].monthly ?? ''}
                onChange={(value) => onDraft(plan, 'monthly', value)}
              />
              {DURATIONS.map((months) => (
                <NumberField
                  key={months}
                  label={`${months} ${months === 1 ? 'month' : 'months'} total`}
                  testId={`price-${plan}-${months}`}
                  value={draft[plan][String(months)] ?? ''}
                  onChange={(value) => onDraft(plan, String(months), value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <SectionFooter
        dirty={dirty}
        saving={saving}
        saved={flash}
        testId="prices-save"
        onSave={() => void onSave()}
      />
    </section>
  );
}

type LimitsDraft = Record<
  PaidPlan,
  { pageCap: string; quotaMonthly: string; aiActionsMonthly: string }
>;

function toLimitsDraft(limits: PlanLimits): LimitsDraft {
  return Object.fromEntries(
    PLANS.map((plan) => [
      plan,
      {
        pageCap: String(limits[plan].pageCap),
        quotaMonthly: String(limits[plan].quotaMonthly),
        aiActionsMonthly: String(limits[plan].aiActionsMonthly),
      },
    ]),
  ) as LimitsDraft;
}

function toLimits(draft: LimitsDraft): PlanLimits | { error: string } {
  const parsePositive = (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  // Zero is legal for the AI allowance: it disables AI for that plan.
  const parseAllowance = (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const out = {} as PlanLimits;
  for (const plan of PLANS) {
    const pageCap = parsePositive(draft[plan].pageCap);
    const quotaMonthly = parsePositive(draft[plan].quotaMonthly);
    if (pageCap === null || quotaMonthly === null) {
      return {
        error: 'Page caps and quotas must be whole numbers above zero.',
      };
    }
    const aiActionsMonthly = parseAllowance(draft[plan].aiActionsMonthly);
    if (aiActionsMonthly === null) {
      return {
        error: 'The AI allowance must be zero or a whole number above zero.',
      };
    }
    out[plan] = { pageCap, quotaMonthly, aiActionsMonthly };
  }
  return out;
}

function LimitsSection({
  saved,
  onSaved,
}: {
  saved: PlanLimits;
  onSaved: OnSaved;
}) {
  const { draft, setDraft, dirty, saving, flash, error, onSave } =
    useSectionSave<LimitsDraft>({
      initialDraft: toLimitsDraft(saved),
      toPayload: (draft) => {
        const limits = toLimits(draft);
        return 'error' in limits
          ? { error: limits.error }
          : { key: 'limits', payload: limits, baseline: toLimitsDraft(limits) };
      },
      onSaved,
    });

  const onDraft = (plan: PaidPlan, field: string, value: string) => {
    setDraft((current) => ({
      ...current,
      [plan]: { ...current[plan], [field]: value },
    }));
  };

  return (
    <section className="rounded-pane border border-hairline bg-surface p-3">
      <h3 className="text-xs font-medium text-ink-soft">
        Plan limits (pages per export / exports per month / AI actions per
        month)
      </h3>
      <div className="mt-2 space-y-3">
        {PLANS.map((plan) => (
          <div key={plan} data-testid={`limits-${plan}`}>
            <p className="text-xs font-medium capitalize text-ink">{plan}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <NumberField
                label="pages per export"
                testId={`limit-${plan}-pageCap`}
                value={draft[plan].pageCap}
                onChange={(value) => onDraft(plan, 'pageCap', value)}
              />
              <NumberField
                label="exports per month"
                testId={`limit-${plan}-quotaMonthly`}
                value={draft[plan].quotaMonthly}
                onChange={(value) => onDraft(plan, 'quotaMonthly', value)}
              />
              <NumberField
                label="AI actions per month"
                testId={`limit-${plan}-aiActionsMonthly`}
                value={draft[plan].aiActionsMonthly}
                onChange={(value) => onDraft(plan, 'aiActionsMonthly', value)}
              />
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <SectionFooter
        dirty={dirty}
        saving={saving}
        saved={flash}
        testId="limits-save"
        onSave={() => void onSave()}
      />
    </section>
  );
}

function LtcRateSection({
  saved,
  onSaved,
}: {
  saved: number | null;
  onSaved: OnSaved;
}) {
  const savedText = saved === null ? '' : String(saved);
  const { draft, setDraft, dirty, saving, flash, error, onSave } =
    useSectionSave<string>({
      initialDraft: savedText,
      toPayload: (draft) => {
        const trimmed = draft.trim();
        if (trimmed === '') {
          // Empty clears the key: LTC payments disabled.
          return { key: 'ltcRateUsdt', payload: null, baseline: '' };
        }
        const value = Number(trimmed);
        return Number.isFinite(value) && value > 0
          ? { key: 'ltcRateUsdt', payload: value, baseline: trimmed }
          : {
              error:
                'The rate must be a number above zero, or empty to disable.',
            };
      },
      onSaved,
    });

  return (
    <section className="rounded-pane border border-hairline bg-surface p-3">
      <h3 className="text-xs font-medium text-ink-soft">
        LTC rate (USDT per LTC)
      </h3>
      <p className="mt-1 text-xs text-ink-faint">
        The rate source captured into new LTC Orders at creation. Empty disables
        LTC payments; changing it never affects existing Orders.
      </p>
      <div className="mt-2">
        <NumberField
          label="USDT per LTC"
          testId="ltc-rate-input"
          value={draft}
          onChange={setDraft}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <SectionFooter
        dirty={dirty}
        saving={saving}
        saved={flash}
        testId="ltc-rate-save"
        onSave={() => void onSave()}
      />
    </section>
  );
}

type AiDraft = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  stylesheetModel: string;
  reasoningEffort: ReasoningEffort;
  contextWindow: string;
  maxOutputTokens: string;
  maxInputCharacters: string;
  timeoutSeconds: string;
  burstPerMinute: string;
};

function toAiDraft(config: AiProviderConfig): AiDraft {
  return {
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    model: config.model,
    stylesheetModel: config.stylesheetModel ?? '',
    reasoningEffort: config.reasoningEffort,
    contextWindow: String(config.contextWindow),
    maxOutputTokens: String(config.maxOutputTokens),
    maxInputCharacters: String(config.maxInputCharacters),
    timeoutSeconds: String(config.timeoutSeconds),
    burstPerMinute: String(config.burstPerMinute),
  };
}

/** The draft as the server's validator expects it, or null when the panel
 *  can already see it would be rejected. */
function toAiConfig(draft: AiDraft): AiProviderConfig | null {
  const baseUrl = draft.baseUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const parsePositive = (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const contextWindow = parsePositive(draft.contextWindow);
  const maxOutputTokens = parsePositive(draft.maxOutputTokens);
  const maxInputCharacters = parsePositive(draft.maxInputCharacters);
  const timeoutSeconds = parsePositive(draft.timeoutSeconds);
  const burstPerMinute = parsePositive(draft.burstPerMinute);
  if (
    contextWindow === null ||
    maxOutputTokens === null ||
    maxInputCharacters === null ||
    timeoutSeconds === null ||
    burstPerMinute === null ||
    maxOutputTokens >= contextWindow
  ) {
    return null;
  }
  const stylesheetModel = draft.stylesheetModel.trim();
  return {
    enabled: draft.enabled,
    baseUrl,
    model: draft.model.trim(),
    stylesheetModel: stylesheetModel === '' ? null : stylesheetModel,
    reasoningEffort: draft.reasoningEffort,
    contextWindow,
    maxOutputTokens,
    maxInputCharacters,
    timeoutSeconds,
    burstPerMinute,
  };
}

const AI_DRAFT_ERROR =
  'Check the AI provider values: the URL must be http(s), the caps and limits whole numbers above zero, and the output cap inside the context window.';

/**
 * The AI Provider Config (ADR-0008): one OpenAI-compatible endpoint, a model,
 * a reasoning effort, and the caps the size ladder budgets against. The key
 * is not a field here — the environment has it, and the panel only reports
 * whether it is present.
 */
function AiProviderSection({
  saved,
  aiKeyPresent,
  onSaved,
}: {
  saved: AiProviderConfig;
  aiKeyPresent: boolean;
  onSaved: OnSaved;
}) {
  const { draft, setDraft, dirty, saving, flash, error, onSave } =
    useSectionSave<AiDraft>({
      initialDraft: toAiDraft(saved),
      toPayload: (draft) => {
        const config = toAiConfig(draft);
        return config === null
          ? { error: AI_DRAFT_ERROR }
          : {
              key: 'aiProvider',
              payload: config,
              baseline: toAiDraft(config),
            };
      },
      onSaved,
    });

  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<AiConnectionReport | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const onTest = async () => {
    if (testing) return;
    const config = toAiConfig(draft);
    if (config === null) {
      setReport(null);
      setTestError(AI_DRAFT_ERROR);
      return;
    }
    setTestError(null);
    setTesting(true);
    try {
      setReport(await testAiConnection(config));
    } catch (cause) {
      setReport(null);
      setTestError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setTesting(false);
    }
  };

  const onDraft = (patch: Partial<AiDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <section className="rounded-pane border border-hairline bg-surface p-3">
      <h3 className="text-xs font-medium text-ink-soft">AI Provider Config</h3>
      <p className="mt-1 text-xs text-ink-faint">
        One OpenAI-compatible endpoint serves both AI commands. The key is
        deployment configuration, never a setting: set AI_API_KEY in the
        environment, and restart the API to rotate it.
      </p>
      <p data-testid="ai-key-present" className="mt-1.5 text-xs text-ink-soft">
        {aiKeyPresent
          ? 'API key: set in this instance’s environment.'
          : 'API key: not set. Add AI_API_KEY to the environment and restart the API — without it, AI is unavailable everywhere.'}
      </p>

      <div className="mt-2">
        <ToggleRow
          checked={draft.enabled}
          onChange={(enabled) => onDraft({ enabled })}
          label="AI enabled (the instance's kill switch)"
        />
      </div>

      <div className="mt-1 space-y-2">
        <label className="block text-xs font-medium text-ink-soft">
          Base URL (OpenAI-compatible API root)
          <input
            type="text"
            data-testid="ai-base-url"
            value={draft.baseUrl}
            onChange={(event) => onDraft({ baseUrl: event.target.value })}
            className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="block min-w-0 flex-1 text-xs font-medium text-ink-soft">
            Model
            <input
              type="text"
              data-testid="ai-model"
              value={draft.model}
              onChange={(event) => onDraft({ model: event.target.value })}
              className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
            />
          </label>
          <label className="block min-w-0 flex-1 text-xs font-medium text-ink-soft">
            Stylesheet model override (optional)
            <input
              type="text"
              data-testid="ai-stylesheet-model"
              value={draft.stylesheetModel}
              onChange={(event) =>
                onDraft({ stylesheetModel: event.target.value })
              }
              className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
            />
          </label>
        </div>
        <label className="block text-xs font-medium text-ink-soft">
          Reasoning effort
          <select
            data-testid="ai-reasoning-effort"
            value={draft.reasoningEffort}
            onChange={(event) =>
              onDraft({
                reasoningEffort: event.target.value as ReasoningEffort,
              })
            }
            className="mt-1 block h-9 rounded-control border border-hairline bg-canvas px-2 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          >
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <p className="text-xs text-ink-faint">
          Sent as the unified reasoning effort. Endpoints without support may
          ignore or reject it — Test connection is the way to find out.
        </p>
        <div className="flex flex-wrap gap-2">
          <NumberField
            label="context window (tokens)"
            testId="ai-context-window"
            value={draft.contextWindow}
            onChange={(value) => onDraft({ contextWindow: value })}
          />
          <NumberField
            label="max output tokens"
            testId="ai-max-output-tokens"
            value={draft.maxOutputTokens}
            onChange={(value) => onDraft({ maxOutputTokens: value })}
          />
          <NumberField
            label="max input characters"
            testId="ai-max-input-characters"
            value={draft.maxInputCharacters}
            onChange={(value) => onDraft({ maxInputCharacters: value })}
          />
          <NumberField
            label="timeout (seconds)"
            testId="ai-timeout-seconds"
            value={draft.timeoutSeconds}
            onChange={(value) => onDraft({ timeoutSeconds: value })}
          />
          <NumberField
            label="burst per minute"
            testId="ai-burst-per-minute"
            value={draft.burstPerMinute}
            onChange={(value) => onDraft({ burstPerMinute: value })}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="ai-save-error"
          className="mt-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <div className="mt-3">
        <button
          type="button"
          data-testid="ai-test"
          disabled={testing}
          onClick={() => void onTest()}
          className="h-8 rounded-control border border-hairline px-3 text-xs font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:opacity-60"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {testError && (
        <p
          role="alert"
          data-testid="ai-test-error"
          className="mt-2 text-xs text-danger"
        >
          {testError}
        </p>
      )}
      {report && <AiTestReport report={report} />}

      <SectionFooter
        dirty={dirty}
        saving={saving}
        saved={flash}
        testId="ai-save"
        onSave={() => void onSave()}
      />
    </section>
  );
}

/** Test connection's report: the endpoint's answer, the model's published
 *  numbers, and any cap that cannot fit them. Admin-only. */
function AiTestReport({ report }: { report: AiConnectionReport }) {
  const price = (value: number | null) =>
    value === null ? 'not published' : `$${Number(value.toFixed(4))} / 1M`;
  const published = (value: number | null) =>
    value === null ? 'not published' : `${value} tokens`;
  return (
    <div
      data-testid="ai-test-result"
      role={report.ok ? 'status' : 'alert'}
      className={`mt-2 rounded-control border px-2.5 py-2 text-xs ${
        report.ok
          ? 'border-hairline bg-canvas text-ink'
          : 'border-danger/40 bg-danger/10 text-danger'
      }`}
    >
      <p data-testid="ai-test-status" className="font-medium">
        {report.ok ? 'The endpoint answered.' : 'The endpoint did not answer.'}
      </p>
      {report.error && <p className="mt-1">{report.error}</p>}
      {report.model && (
        <dl
          data-testid="ai-test-model"
          className="mt-1.5 space-y-0.5 text-ink-soft"
        >
          <div className="flex justify-between gap-2">
            <dt>Context window</dt>
            <dd className="font-mono text-ink">
              {published(report.model.contextLength)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Output cap</dt>
            <dd className="font-mono text-ink">
              {published(report.model.maxOutputTokens)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Price (input / output)</dt>
            <dd className="font-mono text-ink">
              {price(report.model.inputPricePerMillion)} /{' '}
              {price(report.model.outputPricePerMillion)}
            </dd>
          </div>
        </dl>
      )}
      {report.model === null && report.keyPresent && (
        <p data-testid="ai-test-model-absent" className="mt-1.5 text-ink-soft">
          The provider published no model details.
        </p>
      )}
      {report.warnings.map((warning) => (
        <p key={warning} data-testid="ai-test-warning" className="mt-1.5">
          {warning}
        </p>
      ))}
      {report.detail && (
        <pre
          data-testid="ai-test-detail"
          className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-control bg-surface p-1.5 font-mono text-[11px] text-ink-soft"
        >
          {report.detail}
        </pre>
      )}
    </div>
  );
}

function NumberField({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-ink-soft">
      {label}
      <input
        type="number"
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block h-9 w-28 rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
      />
    </label>
  );
}
