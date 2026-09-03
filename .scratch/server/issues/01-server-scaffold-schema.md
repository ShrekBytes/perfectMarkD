# 01 — Server scaffold + schema + settings

Status: ready-for-agent
Blocked by: engine-port/01

Hono app with typed routes, Drizzle + SQLite (WAL) migrations implementing the spec's data model, `settings_kv` seeded with wallets (USDT-TRC20, USDT-BEP20, LTC) and plan prices (3/7 USDT, durations 1/3/6/12, 12 = 10×). Env config (PORT, DB_PATH, SESSION_SECRET, ADMIN_EMAIL bootstrap). Request logging with **no document content ever logged** (privacy posture). Health endpoint. Dockerfile.

**Accepts**: migrations run; settings readable via typed accessor; container builds and serves health check.
