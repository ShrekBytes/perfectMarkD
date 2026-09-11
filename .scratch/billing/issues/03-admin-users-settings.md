# 03 — Admin panel: users + settings

Status: claimed
Blocked by: billing/02

**Users**: search by email, detail view (plan, expiry, quota usage, Orders history), actions: grant/extend/revoke Entitlement, comp quota, manual password reset (sets a temp password — no email infra), delete account (GDPR-ish: removes user + history files, anonymizes Orders). **Settings**: wallet addresses per coin, plan prices, plan page caps, quota limits, LTC rate source — all in `settings_kv`, editable in-panel (wallet change without redeploy), audit-logged. Guard: changing a wallet address shows a prominent warning.

**Accepts**: user admin actions apply immediately (gates re-evaluate on next fetch); settings changes live without redeploy; audit entries written.
