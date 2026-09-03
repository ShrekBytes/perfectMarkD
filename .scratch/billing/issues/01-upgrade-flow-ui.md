# 01 — Upgrade flow UI (plan → Order → submitted)

Status: ready-for-agent
Blocked by: editor-app/09, server/02

Wire the pricing page/modal CTAs to the real flow: plan + duration select → register/login if needed → `POST /api/orders` → instructions view: amount, Reference Code, wallet address (copy buttons), network warning ("send only USDT-TRC20 to this address"), LTC rate note → "I've sent the payment" form (network, txid, amount, optional note) → pending state. "Upgrade status" entry point (top-bar user menu) lists the user's Orders with statuses + reject reasons; resubmission amends a pending/rejected Order. Replace the Phase-1 "coming soon" state.

**Accepts**: full happy path to a pending Order; copy buttons; validation (txid format, amount > 0); statuses display.
