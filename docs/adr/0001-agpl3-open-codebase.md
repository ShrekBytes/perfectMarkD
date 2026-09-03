# The entire codebase is AGPL-3.0, including the server

The ported engine comes from a GPL-3.0 Obsidian plugin that includes external contributors' code, so a proprietary web app would need their permission. We license the whole project (web client, core engine, server, admin panel) under AGPL-3.0 instead: GPLv3 code may be carried into an AGPLv3 work per GPLv3 §13, so no contributor permission is needed. Monetization is the hosted service's convenience — cheap plans, one-click server exports — not code secrecy; self-hosting a full copy is accepted as a consequence (the Excalidraw model).

## Considered Options

- **Proprietary web app**: required tracking down both contributors for relicensing permission; weaker trust signal for a crypto-paying audience.
- **Open-core split** (AGPL client, proprietary server): two licenses to manage for little gain — the server has no secret sauce worth protecting (it's Playwright + our own client).
