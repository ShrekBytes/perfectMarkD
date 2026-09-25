# Admin runbook

The day-to-day jobs of running PerfectMarkD as its Admin: verifying a payment,
resetting a password, and changing a wallet address. Everything here is done in
the `/admin` panel.

Deployment and backups are separate: [README's Deployment
section](../../README.md#deployment) for bringing the stack up,
[hosting.md](hosting.md) for what the host does *not* need, and
[restore.md](restore.md) for getting back from a bad day.

## Getting into the panel

The first account registered with the `ADMIN_EMAIL` address in `.env` becomes
the Admin. That bootstrap only applies while no such user exists — afterwards
`ADMIN_EMAIL` changes nothing, and the flag lives on the user record.

```sh
grep ADMIN_EMAIL .env     # the address that gets the flag
```

If you never registered that address, register it, then restart the api so the
bootstrap re-runs. Every `/api/admin` route checks the flag server-side; the
panel's own gate is client-side convenience only.

The panel has four tabs: **Users**, **Verification** (the default landing tab),
**Settings**, and **Audit log**.

## Verify a payment

Nothing is automatic — there is no payment gateway and no webhook. A paying user
creates an Order, sends crypto themselves, and submits the transaction ID. That
lands in the Verification queue as `pending` and stays there until you act.

1. Open `/admin` → **Verification**. The queue lists pending Orders with the
   plan, the amount, and the reference code the user was shown.
2. **Check the transaction yourself, on the chain.** Open the explorer for the
   coin and network in the order's method — `USDT-TRC20`, `USDT-BEP20`, or
   `LTC` — and confirm three things against what the user submitted:
   - the **amount matches exactly** what the Order specified
   - the **transaction succeeded** and is confirmed
   - the **sender is plausible** for that user

   The reference code is what ties an on-chain payment to an Order. A payment
   with a matching amount but no traceable sender is the fraud case; reject it.
3. Click the order, then **Verify & grant**. Choose a duration (1, 3, 6, or 12
   months) or type an exact expiry date, and confirm the preview line reads
   correctly before submitting. Verifying grants the Entitlement and opens the
   paid gates: Server Export, custom page size, Custom Stylesheet, custom
   fonts, and AI Actions.
4. The decision is written to the **Audit log** with your identity against it.

**Rejecting** takes a reason, and the reason is shown to the user, who can
resubmit corrected details — so write it for them, not for yourself. Use it when
the amount is short, the transaction is still pending, or the sender does not
match. Never reject over a cosmetic discrepancy the user can fix by resubmitting.

Rejections are not the end of an Order: a rejected user can submit again, and
the corrected submission comes back to this queue.

## Reset a password

There is no email infrastructure (a documented non-goal), so a reset is manual
and you are the delivery channel.

1. `/admin` → **Users** → the user → **Reset password**.
2. The panel generates a temporary password and shows it **once**. Copy it
   before closing — the server stores only its argon2id hash, so it cannot be
   displayed again.
3. Send it to the user over a channel you trust, and ask them to change it
   immediately. They can do that from their Account page.
4. Every one of that user's existing sessions was signed out when the reset
   happened. Say so, or they will be surprised by the logouts.

## Change a wallet address

Wallets are the highest-risk setting in the panel: they are where users are told
to send money, and a wrong address takes their funds.

1. `/admin` → **Settings** → **Wallet addresses**. There are exactly three keys
   — `USDT-TRC20`, `USDT-BEP20`, and `LTC` — and all three must be present and
   non-empty to save. The validator rejects the whole save otherwise, rather
   than storing a half-configured set.
2. Paste the new address and save. Confirm it by comparing the first six and
   last four characters against the address in your wallet software — a truncated
   paste is the failure mode here, not a clever attack.
3. **Check the network matches the coin.** A USDT-TRC20 address on the BEP20
   field is a real and irreversible loss. The Order flow shows a network
   warning to the user for this reason.
4. The change is audit-logged.

Prices, per-plan limits (pages per export, exports per month, AI actions per
month), the LTC rate, and the AI provider config are edited in the same Settings
tab, one section each with its own save. Every save is a separate
`settings.update` audit entry.

## What is deliberately not here

**No uptime monitoring.** The stack is expected to be looked at, not paged
about — there is no alert channel, and that is a decision, not an oversight.

**No analytics-history backup.** `ops/backup.sh` dumps the SQLite database and
mirrors Export History. It does not `pg_dump` Umami's Postgres, so the
`umami-db-data` volume is not backed up. Losing it costs page-view history and
nothing else. See the note in the script's header.

**No order deletion.** An Order is a financial record; the trail is the point.
Compensate with a grant or a refund conversation, not an edit.

## The audit log

Every payment decision, entitlement change, password reset, account deletion,
and settings save lands in **Audit log** with the acting admin, the subject, and
a timestamp. It is append-only and there is no delete affordance in the panel.
It covers the operations that move money and the ones that spend provider
budget, which is the reason it exists rather than a nice-to-have.
