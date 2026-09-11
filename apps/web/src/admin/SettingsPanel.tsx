import { useEffect, useState } from 'react';
import {
  getAdminSettings,
  updateAdminSetting,
  type AdminSettings,
  type PaymentMethod,
  type PlanLimits,
  type PlanPrices,
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
 * The admin Settings tab (billing/03): wallet addresses, plan prices, plan
 * page caps and quota limits, and the LTC rate — everything the payment flow
 * reads from settings_kv, editable here without a redeploy. Each section
 * saves (and audit-logs) on its own, and the server re-validates every value.
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
    </div>
  );
}

type OnSaved = (settings: AdminSettings) => void;

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
        className="h-8 rounded-control bg-accent px-3 text-xs font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2 disabled:opacity-60"
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
  // The baseline is what this section last saved (or mounted with) — not the
  // prop, so a save in another section never clobbers a draft here.
  const [baseline, setBaseline] = useState(saved);
  const [draft, setDraft] = useState<WalletAddresses>(saved);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const onSave = async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      onSaved(await updateAdminSetting('wallets', draft));
      setBaseline(draft);
      setFlash(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setSaving(false);
    }
  };

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
  const [baseline, setBaseline] = useState<PriceDraft>(() =>
    toPriceDraft(saved),
  );
  const [draft, setDraft] = useState<PriceDraft>(() => toPriceDraft(saved));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const onDraft = (plan: PaidPlan, field: string, value: string) => {
    setDraft((current) => ({
      ...current,
      [plan]: { ...current[plan], [field]: value },
    }));
  };

  const onSave = async () => {
    const prices = toPrices(draft);
    if (prices === null) {
      setError('Every amount must be a number above zero.');
      return;
    }
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      onSaved(await updateAdminSetting('prices', prices));
      setBaseline(toPriceDraft(prices));
      setFlash(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setSaving(false);
    }
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

type LimitsDraft = Record<PaidPlan, { pageCap: string; quotaMonthly: string }>;

function toLimitsDraft(limits: PlanLimits): LimitsDraft {
  return Object.fromEntries(
    PLANS.map((plan) => [
      plan,
      {
        pageCap: String(limits[plan].pageCap),
        quotaMonthly: String(limits[plan].quotaMonthly),
      },
    ]),
  ) as LimitsDraft;
}

function toLimits(draft: LimitsDraft): PlanLimits | null {
  const parse = (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const out = {} as PlanLimits;
  for (const plan of PLANS) {
    const pageCap = parse(draft[plan].pageCap);
    const quotaMonthly = parse(draft[plan].quotaMonthly);
    if (pageCap === null || quotaMonthly === null) return null;
    out[plan] = { pageCap, quotaMonthly };
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
  const [baseline, setBaseline] = useState<LimitsDraft>(() =>
    toLimitsDraft(saved),
  );
  const [draft, setDraft] = useState<LimitsDraft>(() => toLimitsDraft(saved));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const onSave = async () => {
    const limits = toLimits(draft);
    if (limits === null) {
      setError('Page caps and quotas must be whole numbers above zero.');
      return;
    }
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      onSaved(await updateAdminSetting('limits', limits));
      setBaseline(toLimitsDraft(limits));
      setFlash(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-pane border border-hairline bg-surface p-3">
      <h3 className="text-xs font-medium text-ink-soft">
        Plan limits (pages per export / exports per month)
      </h3>
      <div className="mt-2 space-y-3">
        {PLANS.map((plan) => (
          <div key={plan} data-testid={`limits-${plan}`}>
            <p className="text-xs font-medium capitalize text-ink">{plan}</p>
            <div className="mt-1.5 flex gap-2">
              <NumberField
                label="pages per export"
                testId={`limit-${plan}-pageCap`}
                value={draft[plan].pageCap}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    [plan]: { ...current[plan], pageCap: value },
                  }))
                }
              />
              <NumberField
                label="exports per month"
                testId={`limit-${plan}-quotaMonthly`}
                value={draft[plan].quotaMonthly}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    [plan]: { ...current[plan], quotaMonthly: value },
                  }))
                }
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
  const [baseline, setBaseline] = useState(savedText);
  const [draft, setDraft] = useState(savedText);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = draft !== baseline;

  const onSave = async () => {
    if (saving) return;
    const trimmed = draft.trim();
    let value: number | null = null;
    if (trimmed !== '') {
      value = Number(trimmed);
      if (!Number.isFinite(value) || value <= 0) {
        setError('The rate must be a number above zero, or empty to disable.');
        return;
      }
    }
    setError(null);
    setSaving(true);
    try {
      onSaved(await updateAdminSetting('ltcRateUsdt', value));
      setBaseline(trimmed);
      setFlash(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setSaving(false);
    }
  };

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
