# Build order

The single view of "what to run after what". The source of truth underneath is each ticket's `Blocked by:` line — a ticket is runnable when every file it lists is resolved. When in doubt, the rule from `docs/agents/issue-tracker.md` applies: scan the issue dirs for tickets that are open, unblocked, and unclaimed; first by number wins.

One `/implement` per ticket, one fresh session per ticket (`/clear` between). Tickets inside a step can run in parallel.

Shorthand: `engine` = `.scratch/engine-port/issues/` · `app` = `.scratch/editor-app/issues/` · `srv` = `.scratch/server/issues/` · `bill` = `.scratch/billing/issues/` · `ops` = `.scratch/launch/issues/`

## Phase 1 — engine + free app

| # | Run | Unlocks |
|---|---|---|
| 1 | **engine/01** scaffold monorepo | everything |
| 2 | ∥ **engine/02** settings+presets · **app/01** app shell · **srv/01** server scaffold · **ops/02** docs page · **ops/03** backups | engine/03, app/02, app/09, srv/02, srv/06, ops/01 |
| 3 | ∥ **engine/03** css-builder · **app/02** document store · **app/09** pricing page · **srv/02** auth · **srv/06** static+compose | engine/04+05, app/03, billing/01 |
| 4 | ∥ **engine/04** markdown renderer · **engine/05** paginator · **ops/01** analytics · **bill/01** upgrade flow UI | engine/06, app/03 |
| 5 | ∥ **engine/06** layouts+outline · **app/03** editor pane · **bill/02** admin payments | engine/07 |
| 6 | ∥ **engine/07** export HTML builder · **app/08** image handling | **app/04** (the big one) |
| 7 | **app/04** Paper Canvas · ∥ **bill/03** admin users+settings | app/05, 06, 07 |
| 8 | ∥ **app/05** Inspector · **app/06** Client Export · **app/07** onboarding | app/10, srv/03 |
| 9 | ∥ **app/10** E2E smoke · **srv/03** server export pipeline · **ops/04** production deploy | 🚀 **free public launch possible** |

## Phase 2 — paid tier

| # | Run | Unlocks |
|---|---|---|
| 10 | ∥ **srv/04** quotas · **srv/05** export history | billing/04 |
| 11 | **bill/04** entitlement enforcement | billing/05, ops/06 |
| 12 | ∥ **bill/05** custom CSS + fonts UI · **ops/06** launch checklist | 💳 **payments live** |

## Phase 3 — polish

Tickets `ops/05` (performance guards) can run any time after app/04 + srv/03 — slot it wherever a session frees up.

## Notes

- `srv/03` ships with a stub plan guard (rejects everything without an entitlement); `bill/04` replaces it with the real check. That's deliberate — it breaks what would otherwise be a circular dependency.
- `engine/08` (regression suite) unblocks nothing but should run before the free launch — it's the moat's safety net. Slot it right after engine/07.
- `ops/02` and `ops/03` are phase-3 tickets that are unblocked early; running them early is fine but optional.
